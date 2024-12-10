import ApiResponse from '../utils/ApiResponse.js';
import ApiError from '../utils/ApiError.js';
import asyncHandler from '../utils/asynchandler.js';
import { ProfileVerification } from '../models/profileVerification.model.js';

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
})

export { getAllResidents, getAllGuards,}