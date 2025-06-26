import ApiResponse from '../utils/ApiResponse.js';
import ApiError from '../utils/ApiError.js';
import asyncHandler from '../utils/asynchandler.js';
import { ProfileVerification } from '../models/profileVerification.model.js';
import { User } from '../models/user.model.js';
import { CheckInCode } from '../models/checkInCode.model.js';
import { generateCheckInCode } from '../utils/generateCheckInCode.js';
import mongoose from 'mongoose';
import { Complaint } from '../models/complaint.model.js';
import { generatePassword } from '../utils/generatePassword.js';
import mailSender from '../utils/mailSender.js';
import { sendNotification } from '../utils/sendResidentNotification.js';

const getAllResidents = asyncHandler(async (req, res) => {
    const admin = await ProfileVerification.findOne({ user: req.admin._id });

    if (!admin) {
        throw new ApiError(500, "You are not admin");
    }

    // Pagination parameters
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    // Base match conditions for ProfileVerification
    const membersMatch = {
        societyName: admin.societyName,
        residentStatus: "approve",
        profileType: "Resident"
    };

    // Pipeline to search for residents
    const pipeline = [
        {
            $match: membersMatch
        },
        {
            $lookup: {
                from: "users",
                let: { userId: "$user" },
                pipeline: [
                    {
                        $match: {
                            $expr: { $eq: ["$_id", "$$userId"] }
                        }
                    },
                    {
                        $project: {
                            _id: 1,
                            userName: 1,
                            email: 1,
                            profile: 1,
                            role: 1,
                            phoneNo: 1
                        }
                    }
                ],
                as: "userData"
            }
        },
        {
            $unwind: {
                path: "$userData",
                preserveNullAndEmptyArrays: true
            }
        }
    ];

    // Apply search filter if search query exists
    if (req.query.search) {
        // Add search match stage after the lookup and unwind
        pipeline.push({
            $match: {
                $or: [
                    { "userData.userName": { $regex: req.query.search, $options: 'i' } },
                    { "userData.phoneNo": { $regex: req.query.search, $options: 'i' } }
                ]
            }
        });
    }

    // Project the data to match the expected frontend structure
    pipeline.push({
        $project: {
            _id: 1,
            user: {
                _id: "$userData._id",
                userName: "$userData.userName",
                email: "$userData.email",
                phoneNo: "$userData.phoneNo",
                profile: "$userData.profile",
                role: "$userData.role"
            },
            profileType: 1,
            societyName: 1,
            societyBlock: 1,
            apartment: 1,
            ownership: 1,
            residentStatus: 1
        }
    });

    // Count total matching documents for pagination
    const countPipeline = [...pipeline.slice(0, pipeline.findIndex(stage => stage.$project))];
    countPipeline.push({ $count: "total" });

    const countResult = await ProfileVerification.aggregate(countPipeline);
    const totalCount = countResult.length > 0 ? countResult[0].total : 0;
    const totalPages = Math.ceil(totalCount / limit);

    // Add pagination stages
    pipeline.push(
        { $skip: skip },
        { $limit: limit }
    );

    // Execute the final aggregation pipeline
    const members = await ProfileVerification.aggregate(pipeline);

    if (members.length <= 0) {
        throw new ApiError(404, "No entries found matching your criteria");
    }

    return res.status(200).json(
        new ApiResponse(200, {
            societyMembers: members,
            pagination: {
                totalEntries: totalCount,
                entriesPerPage: limit,
                currentPage: page,
                totalPages: totalPages,
                hasMore: page < totalPages
            }
        }, "Society members fetched successfully.")
    );
});

const getAllGuards = asyncHandler(async (req, res) => {
    const admin = await ProfileVerification.findOne({ user: req.admin._id });

    if (!admin) {
        throw new ApiError(500, "You are not admin");
    }

    const members = await ProfileVerification.aggregate([
        {
            $match: {
                societyName: admin.societyName,
                guardStatus: "approve",
                profileType: "Security",
            },
        },
        {
            $lookup: {
                from: "users",
                let: { userId: "$user" },
                pipeline: [
                    {
                        $match: {
                            $expr: { $eq: ["$_id", "$$userId"] }
                        }
                    },
                    {
                        $project: {
                            _id: 1,
                            userName: 1,
                            profile: 1,
                            email: 1,
                            role: 1,
                            phoneNo: 1,
                        }
                    }
                ],
                as: "user"
            }
        },
        {
            $unwind: {
                path: "$user",
                preserveNullAndEmptyArrays: true
            }
        },
        {
            $project: {
                user: 1,
                profileType: 1,
                societyName: 1,
                societyBlock: 1,
                apartment: 1,
                ownership: 1,
                residentStatus: 1,
            }
        }
    ]);

    return res.status(200).json(
        new ApiResponse(200, members, "Society guards fetched successfully")
    );
});

const removeResident = asyncHandler(async (req, res) => {
    const { id } = req.body;
    const userId = mongoose.Types.ObjectId.createFromHexString(id);

    const isDeleteProfileVerification = await ProfileVerification.deleteOne({ user: userId });
    if (!isDeleteProfileVerification) {
        throw new ApiError(500, "something went wrong");
    }

    const isDeleteCheckInCode = await CheckInCode.deleteOne({ user: userId });
    if (!isDeleteCheckInCode) {
        throw new ApiError(500, "something went wrong");
    }

    const updatedDocument = await User.findOneAndUpdate(
        { _id: userId },
        { $set: { isUserTypeVerified: false, role: "user" }, $unset: { phoneNo: 1, } },
        { new: true }
    );

    if (!updatedDocument) {
        throw new ApiError(500, "something went wrong");
    }

    return res.status(200).json(
        new ApiResponse(200, {}, "Resident deleted successfully.")
    );
});

const removeGuard = asyncHandler(async (req, res) => {
    const { id } = req.body;
    const userId = mongoose.Types.ObjectId.createFromHexString(id);

    const isDeleteProfileVerification = await ProfileVerification.deleteOne({ user: userId });
    if (!isDeleteProfileVerification) {
        throw new ApiError(500, "something went wrong");
    }

    const isDeleteCheckInCode = await CheckInCode.deleteOne({ user: userId });
    if (!isDeleteCheckInCode) {
        throw new ApiError(500, "something went wrong");
    }

    const updatedDocument = await User.findOneAndUpdate(
        { _id: userId },
        { $set: { isUserTypeVerified: false }, $unset: { phoneNo: 1, } },
        { new: true }
    );

    if (!updatedDocument) {
        throw new ApiError(500, "something went wrong");
    }

    return res.status(200).json(
        new ApiResponse(200, {}, "Guard deleted successfully.")
    );
});

const getAllAdmin = asyncHandler(async (req, res) => {
    const admin = await ProfileVerification.findOne({ user: req.admin._id });

    if (!admin) {
        throw new ApiError(500, "You are not admin");
    }

    const members = await ProfileVerification.find({
        societyName: admin.societyName
    })
        .populate({
            path: "user",
            match: { role: "admin" }, // Filtering based on the user's role
            select: "_id role userName email profile phoneNo"
        })

    // Filter out any documents where user is null (because populate might return null for unmatched users)
    const filteredMembers = members.filter(member => member.user !== null);

    return res.status(200).json(
        new ApiResponse(200, filteredMembers, "Society guards fetched successfully")
    );
})

const makeAdmin = asyncHandler(async (req, res) => {
    const { email } = req.body;
    const user = await User.findOne({ email });

    if (!user) {
        throw new ApiError(401, "Invalid email");
    }

    const requestExists = await ProfileVerification.findOne({ user: user._id });

    if (!requestExists) {
        throw new ApiError(500, "user does not exists");
    }

    user.role = 'admin'
    requestExists.residentStatus = 'approve';
    user.isUserTypeVerified = true;

    const checkInCode = await CheckInCode.findOne({ user: user._id });

    if (checkInCode) {
        await requestExists.save({ validateBeforeSave: false });
        await user.save({ validateBeforeSave: false });
        return res.status(200).json(
            new ApiResponse(200, {}, "Admin created successfully")
        );
    }
    const code = await CheckInCode.create({
        user: user._id,
        name: user.userName,
        mobNumber: user.phoneNo,
        profileType: 'Resident',
        societyName: requestExists.societyName,
        blockName: requestExists.societyBlock,
        apartment: requestExists.apartment,
        checkInCode: await generateCheckInCode(requestExists.societyName),
        checkInCodeStart: new Date(),
        checkInCodeExpiry: null,
        checkInCodeStartDate: new Date(),
        checkInCodeExpiryDate: null,
    });

    if (!code) {
        throw new ApiError(500, "something went wrong");
    }

    await requestExists.save({ validateBeforeSave: false });
    await user.save({ validateBeforeSave: false });

    return res.status(200).json(
        new ApiResponse(200, {}, "Admin created successfully")
    );
});

const removeAdmin = asyncHandler(async (req, res) => {
    const { email } = req.body;
    const user = await User.findOne({ email });

    if (!user) {
        throw new ApiError(401, "Invalid email");
    }

    user.role = 'user';

    const isSaved = await user.save({ validateBeforeSave: false });

    if (!isSaved) {
        throw new ApiError(500, "something went wrong");
    }

    return res.status(200).json(
        new ApiResponse(200, {}, "Admin removed successfully")
    );
});

const getComplaints = asyncHandler(async (req, res) => {
    const society = await ProfileVerification.findOne({ user: req.user._id });

    // Pagination parameters
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    // Filter parameters
    const filters = {};

    // Date range filter
    if (req.query.startDate && req.query.endDate) {
        const startDate = new Date(req.query.startDate);
        const endDate = new Date(req.query.endDate);
        endDate.setHours(23, 59, 59, 999); // Set to end of day

        filters.entryTime = {
            $gte: startDate,
            $lte: endDate
        };
    }

    // Entry type filter
    if (req.query.entryType) {
        filters.entryType = req.query.entryType;
    }

    // Name/keyword search
    if (req.query.search) {
        filters.$or = [
            { name: { $regex: req.query.search, $options: 'i' } },
            { companyName: { $regex: req.query.search, $options: 'i' } },
            { serviceName: { $regex: req.query.search, $options: 'i' } },
            { mobNumber: { $regex: req.query.search, $options: 'i' } }
        ];
    }

    // Base match conditions for DeliveryEntry
    const complaintMatch = {
        societyName: society.societyName,
        ...filters
    };

    // Count total documents for pagination
    const totalCount = await Complaint.countDocuments(complaintMatch);
    const totalPages = Math.ceil(totalCount / limit);

    if (!society) {
        throw new ApiError(404, "Profile is not found");
    }

    let updatedComplaint = await Complaint.find(complaintMatch)
        .sort({ createdAt: -1 }) // Sort by newest complaint first
        .populate("responses.responseBy", "userName email profile role phoneNo")
        .populate("raisedBy", "userName email profile role phoneNo");

    // Apply pagination on combined results
    updatedComplaint = updatedComplaint.slice(skip, skip + limit);

    if (updatedComplaint.length <= 0) {
        throw new ApiError(404, "No entries found matching your criteria");
    }

    return res.status(200).json(
        new ApiResponse(200, {
            complaints: updatedComplaint,
            user: req.user,
            pagination: {
                totalEntries: totalCount,
                entriesPerPage: limit,
                currentPage: page,
                totalPages: totalPages,
                hasMore: page < totalPages
            }
        }, "Complaints fetched successfully.")
    );
});

const getPendingComplaints = asyncHandler(async (req, res) => {
    const society = await ProfileVerification.findOne({ user: req.user._id });

    // Pagination parameters
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    // Filter parameters
    const filters = {};

    // Date range filter
    if (req.query.startDate && req.query.endDate) {
        const startDate = new Date(req.query.startDate);
        const endDate = new Date(req.query.endDate);
        endDate.setHours(23, 59, 59, 999); // Set to end of day

        filters.createdAt = {
            $gte: startDate,
            $lte: endDate
        };
    }

    // Name/keyword search
    if (req.query.search) {
        filters.$or = [
            { complaintId: { $regex: req.query.search, $options: 'i' } },
            { category: { $regex: req.query.search, $options: 'i' } },
            { subCategory: { $regex: req.query.search, $options: 'i' } },
        ];
    }

    // Base match conditions for DeliveryEntry
    const complaintMatch = {
        societyName: society.societyName,
        status: "pending",
        ...filters
    };

    // Count total documents for pagination
    const totalCount = await Complaint.countDocuments(complaintMatch);
    const totalPages = Math.ceil(totalCount / limit);

    if (!society) {
        throw new ApiError(404, "Profile is not found");
    }

    let updatedComplaint = await Complaint.find(complaintMatch)
        .sort({ createdAt: -1 }) // Sort by newest complaint first
        .populate("responses.responseBy", "userName email profile role phoneNo")
        .populate("raisedBy", "userName email profile role phoneNo")
        .populate("technicianId", "userName email profile role phoneNo")
        .populate("assignedBy", "userName email profile role phoneNo")
        .populate({
            path: 'resolution',
            populate: [
                { path: 'resolvedBy', select: 'userName email profile role phoneNo' },
                { path: 'approvedBy', select: 'userName email profile role phoneNo' },
                { path: 'rejectedBy', select: 'userName email profile role phoneNo' }
            ]
        });

    // Apply pagination on combined results
    updatedComplaint = updatedComplaint.slice(skip, skip + limit);

    if (updatedComplaint.length <= 0) {
        throw new ApiError(404, "No entries found matching your criteria");
    }

    return res.status(200).json(
        new ApiResponse(200, {
            complaints: updatedComplaint,
            user: req.user,
            pagination: {
                totalEntries: totalCount,
                entriesPerPage: limit,
                currentPage: page,
                totalPages: totalPages,
                hasMore: page < totalPages
            }
        }, "Complaints fetched successfully.")
    );
});

const getResolvedComplaints = asyncHandler(async (req, res) => {
    const society = await ProfileVerification.findOne({ user: req.user._id });

    // Pagination parameters
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    // Filter parameters
    const filters = {};

    // Date range filter
    if (req.query.startDate && req.query.endDate) {
        const startDate = new Date(req.query.startDate);
        const endDate = new Date(req.query.endDate);
        endDate.setHours(23, 59, 59, 999); // Set to end of day

        filters.createdAt = {
            $gte: startDate,
            $lte: endDate
        };
    }

    // Name/keyword search
    if (req.query.search) {
        filters.$or = [
            { complaintId: { $regex: req.query.search, $options: 'i' } },
            { category: { $regex: req.query.search, $options: 'i' } },
            { subCategory: { $regex: req.query.search, $options: 'i' } },
        ];
    }

    // Base match conditions for DeliveryEntry
    const complaintMatch = {
        societyName: society.societyName,
        status: "resolved",
        ...filters
    };

    // Count total documents for pagination
    const totalCount = await Complaint.countDocuments(complaintMatch);
    const totalPages = Math.ceil(totalCount / limit);

    if (!society) {
        throw new ApiError(404, "Profile is not found");
    }

    let updatedComplaint = await Complaint.find(complaintMatch)
        .sort({ createdAt: -1 }) // Sort by newest complaint first
        .populate("responses.responseBy", "userName email profile role phoneNo")
        .populate("raisedBy", "userName email profile role phoneNo")
        .populate("technicianId", "userName email profile role phoneNo")
        .populate("assignedBy", "userName email profile role phoneNo")
        .populate({
            path: 'resolution',
            populate: [
                { path: 'resolvedBy', select: 'userName email profile role phoneNo' },
                { path: 'approvedBy', select: 'userName email profile role phoneNo' },
                { path: 'rejectedBy', select: 'userName email profile role phoneNo' }
            ]
        });

    // Apply pagination on combined results
    updatedComplaint = updatedComplaint.slice(skip, skip + limit);

    if (updatedComplaint.length <= 0) {
        throw new ApiError(404, "No entries found matching your criteria");
    }

    return res.status(200).json(
        new ApiResponse(200, {
            complaints: updatedComplaint,
            user: req.user,
            pagination: {
                totalEntries: totalCount,
                entriesPerPage: limit,
                currentPage: page,
                totalPages: totalPages,
                hasMore: page < totalPages
            }
        }, "Complaints fetched successfully.")
    );
});

const createTechnician = asyncHandler(async (req, res) => {
    const { userName, email, phoneNo, role } = req.body;
    const technicianPassword = generatePassword();

    const user = await User.create({
        userName,
        email,
        technicianPassword,
        phoneNo,
        userType: "Technician",
        role,
        isUserTypeVerified: true,
        isVerified: true
    });

    const createdUser = await User.findById(user._id).select("_id userName email profile phoneNo role technicianPassword");

    if (!createdUser) {
        throw new ApiError(500, "Something went wrong");
    }

    const technicianProfile = await ProfileVerification.create({
        user: createdUser._id,
        profileType: 'Technician',
        societyName: req.member.societyName,
        residentStatus: 'approve',
    });
    
    if (!technicianProfile) {
        throw new ApiError(500, "Something went wrong");
    }

    const mailResponse = await mailSender(email, createdUser._id, "VERIFY_TECHNICIAN", technicianPassword);

    if (mailResponse) {
        return res.status(200).json(
            new ApiResponse(200, createdUser, "Technician created successfully. An email has been sent to the technician's account with the credentials.")
        );
    }

    throw new ApiError(500, "Something went wrong!! An email couldn't sent to your account");
})

const getAllTechnicians = asyncHandler(async (req, res) => {
    // Pagination parameters
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    // Filter parameters
    const filters = {};

    // Name/keyword search
    if (req.query.search) {
        filters.$or = [
            { userName: { $regex: req.query.search, $options: 'i' } },
            { phoneNo: { $regex: req.query.search, $options: 'i' } },
            { role: { $regex: req.query.search, $options: 'i' } },
        ];
    }

    // Base match conditions for DeliveryEntry
    const techniciansMatch = {
        userType: "Technician",
        ...filters
    };

    // Count total documents for pagination
    const totalCount = await Complaint.countDocuments(techniciansMatch);
    const totalPages = Math.ceil(totalCount / limit);

    const technicians = await User.find(techniciansMatch).select("_id userName email profile phoneNo role technicianPassword");
    if (technicians.length <= 0) {
        throw new ApiError(404, "No technicians found");
    }
    const response = technicians.slice(skip, skip + limit);

    if (response.length <= 0) {
        throw new ApiError(500, "There is no entry");
    }

    const data = {
        technicians: response,
        pagination: {
            totalEntries: totalCount,
            entriesPerPage: limit,
            currentPage: page,
            totalPages: totalPages,
            hasMore: page < totalPages
        }
    }

    return res.status(200).json(
        new ApiResponse(200, data, "Technicians fetched successfully")
    );
});

const removeTechnician = asyncHandler(async (req, res) => {
    const { id } = req.body;
    const userId = mongoose.Types.ObjectId.createFromHexString(id);

    const isDeleteTechnician = await User.deleteOne({ _id: userId, userType: "Technician" });

    if (!isDeleteTechnician) {
        throw new ApiError(500, "something went wrong");
    }
    
    return res.status(200).json(
        new ApiResponse(200, {}, "Technician deleted successfully.")
    );
});

const assignedTechnician = asyncHandler(async (req, res) => {
    const { complaintId, technicianId } = req.body;
    const complaintObjectId = mongoose.Types.ObjectId.createFromHexString(complaintId);
    const technicianObjectId = mongoose.Types.ObjectId.createFromHexString(technicianId);

    const complaint = await Complaint.findById(complaintObjectId);
    if (!complaint) {
        throw new ApiError(404, "Complaint not found");
    }

    const technician = await User.findById(technicianObjectId);
    if (!technician || technician.userType !== "Technician") {
        throw new ApiError(404, "Technician not found");
    }

    complaint.technicianId = technician._id;
    complaint.assignStatus = "assigned";
    complaint.assignedBy = req.admin._id;
    complaint.assignedAt = new Date();

    const updatedComplaint = await complaint.save({ validateBeforeSave: false });
    
    if (!updatedComplaint) {
        throw new ApiError(500, "Failed to assign technician to complaint");
    }

    const response = await Complaint.findById(updatedComplaint._id)
        .populate("responses.responseBy", "userName email profile role phoneNo")
        .populate("raisedBy", "userName email profile role phoneNo")
        .populate("technicianId", "userName email profile role phoneNo")
        .populate("assignedBy", "userName email profile role phoneNo")
        .populate({
            path: 'resolution',
            populate: [
                { path: 'resolvedBy', select: 'userName email profile role phoneNo' },
                { path: 'approvedBy', select: 'userName email profile role phoneNo' },
                { path: 'rejectedBy', select: 'userName email profile role phoneNo' }
            ]
        });

    if (!response) {
        throw new ApiError(500, "Failed to fetch updated complaint details");
    }

    let payload = {
        id: response._id,
        title: 'New Complaint Assigned',
        message: 'You have been assigned a new complaint. Please review the details, address the issue, and submit your resolution promptly.',
        action: 'ASSIGN_COMPLAINT',
    };

    if( technician?.FCMToken) {
        sendNotification(technician.FCMToken, payload.action, JSON.stringify(payload));
    }

    return res.status(200).json(
        new ApiResponse(200, response, "Technician assigned to complaint successfully")
    );
});

export {
    getAllResidents,
    getAllGuards,
    removeResident,
    removeGuard,
    getAllAdmin,
    makeAdmin,
    removeAdmin,
    getComplaints,
    getPendingComplaints,
    getResolvedComplaints,
    createTechnician,
    getAllTechnicians,
    removeTechnician,
    assignedTechnician
};