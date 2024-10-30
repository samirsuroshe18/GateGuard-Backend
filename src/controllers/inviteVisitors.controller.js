import asyncHandler from '../utils/asynchandler.js';
import ApiError from '../utils/ApiError.js';
import ApiResponse from '../utils/ApiResponse.js';
import { CheckInCode } from '../models/checkInCode.model.js';
import { ProfileVerification } from '../models/profileVerification.model.js';
import { generateCheckInCode } from '../utils/generateCheckInCode.js';
import { PreApproved } from '../models/preApproved.model.js';
import mongoose from 'mongoose';

const addPreApproval = asyncHandler(async (req, res) => {
    const { name, mobNumber, profileImg, companyName, companyLogo, serviceName, serviceLogo, vehicleNo, entryType, checkInCodeStart, checkInCodeExpiry, checkInCodeStartDate, checkInCodeExpiryDate, } = req.body;
    const user = await ProfileVerification.findOne({ user: req.user._id });

    if (!user) {
        throw new ApiError(404, "User not found");
    }

    const preApprovalEntry = await CheckInCode.create({
        approvedBy: req.user._id,
        name: name,
        mobNumber: mobNumber,
        profileImg: profileImg,
        companyName: companyName,
        companyLogo: companyLogo,
        serviceName: serviceName,
        serviceLogo: serviceLogo,
        vehicleNo: vehicleNo,
        entryType: entryType,
        societyName: user.societyName,
        blockName: user.societyBlock,
        apartment: user.apartment,
        checkInCode: await generateCheckInCode(user.societyName),
        checkInCodeStart: new Date(checkInCodeStart).toISOString(),
        checkInCodeExpiry: new Date(checkInCodeExpiry).toISOString(),
        checkInCodeStartDate: new Date(checkInCodeStartDate).toISOString(),
        checkInCodeExpiryDate: new Date(checkInCodeExpiryDate).toISOString(),
        isPreApproved: true
    });

    if (!preApprovalEntry) {
        throw new ApiError(500, "Something went wrong");
    }

    const checkInCode = await CheckInCode.aggregate([
        {
            $match: {
                _id: preApprovalEntry._id
            },
        },
        {
            $lookup: {
                from: "users",
                let: { userId: "$approvedBy" },
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
                as: "approvedBy"
            }
        },
        {
            $unwind: {
                path: "$approvedBy",
                preserveNullAndEmptyArrays: true
            }
        },
        {
            $project: {
                approvedBy: 1,
                name: 1,
                mobNumber: 1,
                profileImg: 1,
                companyName: 1,
                companyLogo: 1,
                serviceName: 1,
                serviceLogo: 1,
                vehicleNo: 1,
                profileType: 1,
                entryType: 1,
                societyName: 1,
                blockName: 1,
                apartment: 1,
                checkInCode: 1,
                checkInCodeStartDate: 1,
                checkInCodeExpiryDate: 1,
                checkInCodeStart: 1,
                checkInCodeExpiry: 1,
                isPreApproved: 1,
            },
        },
    ]);

    return res.status(200).json(
        new ApiResponse(200, checkInCode, "Pre-approval entry added successfully")
    );
});

const exitEntry = asyncHandler(async (req, res) => {
    const { id } = req.body;
    const preApprovalId = mongoose.Types.ObjectId.createFromHexString(id);
    const preApproved = await PreApproved.findById(preApprovalId);

    if (!preApproved) {
        throw new ApiError(500, "Invalid id");
    }

    preApproved.hasExited = true;
    preApproved.exitTime = new Date();
    const result = await preApproved.save({ validateBeforeSave: false });

    if (!result) {
        throw new ApiError(500, "Something went wrong");
    }

    return res.status(200).json(
        new ApiResponse(200, {}, "Delivery exited successfully.")
    );
});

const reSchedule = asyncHandler(async (req, res) => {
    const { id, checkInCodeStart, checkInCodeExpiry } = req.body;
    const checkInId = mongoose.Types.ObjectId.createFromHexString(id);

    const existedCheckInCode = await CheckInCode.findByIdAndUpdate(
        checkInId,
        {
            checkInCodeStart: checkInCodeStart, // Update with the new checkInCode value
            checkInCodeExpiry: checkInCodeExpiry // Update with the new checkInCodeExpiry value
        },
        {
            new: true
        }
    )

    if (!existedCheckInCode) {
        throw new ApiError(500, "Something went wrong");
    }

    return res.status(200).json(
        new ApiResponse(200, existedCheckInCode, "Pre-approval re-schedule successfully")
    );
});

const getExpectedEntry = asyncHandler(async (req, res) => {
    const user = await ProfileVerification.findOne({ user: req.user._id });

    const checkInCode = await CheckInCode.aggregate([
        {
            $match: {
                isPreApproved: true,
                societyName: user.societyName,
                blockName: user.societyBlock,
                apartment: user.apartment,
                checkInCodeExpiryDate: { $gt: new Date() }
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
            $lookup: {
                from: "users",
                let: { userId: "$approvedBy" },
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
                as: "approvedBy"
            }
        },
        {
            $unwind: {
                path: "$approvedBy",
                preserveNullAndEmptyArrays: true
            }
        },
        {
            $project: {
                user: 1,
                approvedBy: 1,
                name: 1,
                mobNumber: 1,
                profileImg: 1,
                companyName: 1,
                companyLogo: 1,
                serviceName: 1,
                serviceLogo: 1,
                vehicleNo: 1,
                profileType: 1,
                entryType: 1,
                societyName: 1,
                blockName: 1,
                apartment: 1,
                checkInCode: 1,
                checkInCodeStartDate: 1,
                checkInCodeExpiryDate: 1,
                checkInCodeStart: 1,
                checkInCodeExpiry: 1,
                isPreApproved: 1,
            },
        },
    ]);

    if (!checkInCode || checkInCode.length <= 0) {
        throw new ApiError(500, "There is no expected entry");
    }

    return res.status(200).json(
        new ApiResponse(200, checkInCode, "expected entry fetched successfully")
    );
});

const getCurrentEntry = asyncHandler(async (req, res) => {
    const user = await ProfileVerification.findOne({ user: req.user._id });

    const delivery = await PreApproved.aggregate([
        {
            $match: {
                'allowedBy.status': 'approve',
                hasExited: false,
                societyName: user.societyName,
                blockName: user.societyBlock,
                apartment: user.apartment,
            },
        },
        {
            $lookup: {
                from: "users",
                let: { userId: "$approvedBy.user" },
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
                as: "approvedBy.user"
            }
        },
        {
            $unwind: {
                path: "$approvedBy.user",
                preserveNullAndEmptyArrays: true
            }
        },
        {
            $lookup: {
                from: "users",
                let: { userId: "$allowedBy.user" },
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
                as: "allowedBy.user"
            }
        },
        {
            $unwind: {
                path: "$allowedBy.user",
                preserveNullAndEmptyArrays: true
            }
        },
        {
            $project: {
                allowedBy: 1,
                approvedBy: 1,
                name: 1,
                mobNumber: 1,
                profileImg: 1,
                companyName: 1,
                companyLogo: 1,
                serviceName: 1,
                serviceLogo: 1,
                vehicleDetails: 1,
                profileType: 1,
                entryType: 1,
                societyName: 1,
                blockName: 1,
                apartment: 1,
                entryTime: 1,
                exitTime: 1,
                hasExited: 1,
            },
        },
    ]);

    if (!delivery || delivery.length <= 0) {
        throw new ApiError(500, "There is no current entry");
    }

    return res.status(200).json(
        new ApiResponse(200, delivery, "expected entry fetched successfully")
    );
});

const getPastEntry = asyncHandler(async (req, res) => {
    const user = await ProfileVerification.findOne({ user: req.user._id });

    const preApproved = await PreApproved.aggregate([
        {
            $match: {
                'allowedBy.status': 'approve',
                hasExited: true,
                societyName: user.societyName,
                blockName: user.societyBlock,
                apartment: user.apartment,
            }
        },
        {
            $lookup: {
                from: "users",
                let: { userId: "$approvedBy.user" },
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
                as: "approvedBy.user"
            }
        },
        {
            $unwind: {
                path: "$approvedBy.user",
                preserveNullAndEmptyArrays: true
            }
        },
        {
            $lookup: {
                from: "users",
                let: { userId: "$allowedBy.user" },
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
                as: "allowedBy.user"
            }
        },
        {
            $unwind: {
                path: "$allowedBy.user",
                preserveNullAndEmptyArrays: true
            }
        },
        {
            $project: {
                allowedBy: 1,
                approvedBy: 1,
                name: 1,
                mobNumber: 1,
                profileImg: 1,
                companyName: 1,
                companyLogo: 1,
                serviceName: 1,
                serviceLogo: 1,
                vehicleDetails: 1,
                profileType: 1,
                entryType: 1,
                societyName: 1,
                blockName: 1,
                apartment: 1,
                entryTime: 1,
                exitTime: 1,
                hasExited: 1,
            }
        }
    ]);

    if (!preApproved || preApproved.length <= 0) {
        throw new ApiError(500, "There is no past entry");
    }

    return res.status(200).json(
        new ApiResponse(200, preApproved, "expected entry fetched successfully")
    );
});

export {
    addPreApproval,
    reSchedule,
    getExpectedEntry,
    exitEntry,
    getCurrentEntry,
    getPastEntry
}