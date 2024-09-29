import asyncHandler from '../utils/asynchandler.js';
import ApiError from '../utils/ApiError.js';
import ApiResponse from '../utils/ApiResponse.js';
import { ProfileVerification } from '../models/profileVerification.model.js';
import mongoose from 'mongoose';
import { CheckInCode } from '../models/checkInCode.model.js';
import { generateCheckInCode } from '../utils/generateCheckInCode.js';
import { User } from '../models/user.model.js';

const getPendingResidentRequest = asyncHandler(async (req, res) => {

    const pendingResidentRequest = await ProfileVerification.aggregate([
        {
            $match: {
                residentStatus: 'pending'
            }
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
                            phoneNo: 1
                        }
                    }
                ],
                as: "user"
            }
        },
        {
            $unwind: {
                path: "$user",
                preserveNullAndEmptyArrays: true // Optional: keeps the document if user is not found
            }
        },
        {
            $project: {
                _id: 1,
                user: 1,
                profileType: 1,
                societyName: 1,
                societyBlock: 1,
                apartment: 1,
                ownership: 1,
                residentStatus: 1,
                createdAt: 1,
                updatedAt: 1
            }
        }
    ]);


    if (!pendingResidentRequest) {
        throw new ApiError(500, "Something went wrong");
    }

    return res.status(200).json(
        new ApiResponse(200, pendingResidentRequest, "Pending requests fetched successfully.")
    );
});

const getPendingSecurityRequest = asyncHandler(async (req, res) => {
    // const pendingSecurityRequest = await ProfileVerification.find({ guardStatus: "pending" }).select('-__v');
    const pendingSecurityRequest = await ProfileVerification.aggregate([
        {
            $match: {
                guardStatus: 'pending'
            }
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
                            phoneNo: 1
                        }
                    }
                ],
                as: "user"
            }
        },
        {
            $unwind: {
                path: "$user",
                preserveNullAndEmptyArrays: true // Optional: keeps the document if user is not found
            }
        },
        {
            $project: {
                _id: 1,
                user: 1,
                profileType: 1,
                societyName: 1,
                gateAssign: 1,
                guardStatus: 1,
                createdAt: 1,
                updatedAt: 1
            }
        }
    ]);


    if (!pendingSecurityRequest) {
        throw new ApiError(500, "Something went wrong");
    }

    return res.status(200).json(
        new ApiResponse(200, pendingSecurityRequest, "Pending requests fetched successfully.")
    );
});

const verifyResidentRequest = asyncHandler(async (req, res) => {
    const { residentStatus, user } = req.body;
    const userId = mongoose.Types.ObjectId.createFromHexString(user);
    const residentUser = await User.findById(userId);

    const requestExists = await ProfileVerification.findOne({
        user: userId,
        residentStatus: 'pending'
    });

    if (!requestExists) {
        throw new ApiError(500, "Resident request does not exists");
    }

    if (residentStatus === 'approve') {
        requestExists.residentStatus = 'approve';

        const checkInCode = await CheckInCode.create({
            user: residentUser._id,
            name: residentUser.userName,
            mobNumber: residentUser.phoneNo,
            profileType: 'Resident',
            societyName: requestExists.societyName,
            checkInCode: generateCheckInCode(requestExists.societyName),
            checkInCodeStart: Date.now(),
            checkInCodeExpiry: null,
        });

    } else {
        requestExists.residentStatus = 'rejected'
    }

    const isUpdate = await requestExists.save({ validateBeforeSave: false });

    if (!isUpdate) {
        throw new ApiError(500, "Something went wrong");
    }

    return res.status(200).json(
        new ApiResponse(200, {}, "Request verified successfully")
    );
});

const verifySecurityRequest = asyncHandler(async (req, res) => {
    const { guardStatus, user } = req.body;
    const userId = mongoose.Types.ObjectId.createFromHexString(user);

    const requestExists = await ProfileVerification.findOne({
        user: userId,
        guardStatus: 'pending'
    });

    if (!requestExists) {
        throw new ApiError(500, "Guard request does not exists");
    }

    if (guardStatus === 'approve') {
        requestExists.guardStatus = 'approve'
    } else {
        requestExists.guardStatus = 'rejected'
    }

    const isUpdate = await requestExists.save({ validateBeforeSave: false });

    if (!isUpdate) {
        throw new ApiError(500, "Something went wrong");
    }

    return res.status(200).json(
        new ApiResponse(200, {}, "Request verified successfully")
    );
});

export {
    getPendingResidentRequest,
    getPendingSecurityRequest,
    verifyResidentRequest,
    verifySecurityRequest
}