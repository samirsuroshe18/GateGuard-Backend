import ApiResponse from '../utils/ApiResponse.js';
import ApiError from '../utils/ApiError.js';
import asyncHandler from '../utils/asynchandler.js';
import { ProfileVerification } from '../models/profileVerification.model.js';
import { User } from '../models/user.model.js';
import { CheckInCode } from '../models/checkInCode.model.js';
import { generateCheckInCode } from '../utils/generateCheckInCode.js';
import mongoose from 'mongoose';
import { Complaint } from '../models/complaint.model.js';

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

export { getAllResidents, getAllGuards, removeResident, removeGuard, getAllAdmin, makeAdmin, removeAdmin, getComplaints, getPendingComplaints, getResolvedComplaints };