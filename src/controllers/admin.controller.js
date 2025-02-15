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

    const members = await ProfileVerification.aggregate([
        {
            $match: {
                societyName: admin.societyName,
                residentStatus: "approve",
                profileType: "Resident",
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
        new ApiResponse(200, members, "Society members fetched successfully")
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

    if (!society) {
        throw new ApiError(404, "Profile is not found");
    }

    const updatedComplaint = await Complaint.find({ societyName: society.societyName })
    .populate("responses.responseBy", "userName email profile role phoneNo") 
    .populate("raisedBy", "userName email profile role phoneNo"); 


    return res.status(200).json(
        new ApiResponse(200, {complaints:updatedComplaint, user:req.user}, "Complaint submitted successfully")
    );
});

export { getAllResidents, getAllGuards, removeResident, removeGuard, getAllAdmin, makeAdmin, removeAdmin, getComplaints }