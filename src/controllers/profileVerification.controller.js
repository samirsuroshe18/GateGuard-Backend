import asyncHandler from '../utils/asynchandler.js';
import ApiError from '../utils/ApiError.js';
import ApiResponse from '../utils/ApiResponse.js';
import { ProfileVerification } from '../models/profileVerification.model.js';
import mongoose from 'mongoose';
import { CheckInCode } from '../models/checkInCode.model.js';
import { generateCheckInCode } from '../utils/generateCheckInCode.js';
import { User } from '../models/user.model.js';
import { sendNotification } from '../utils/sendResidentNotification.js';

const getPendingResidentRequest = asyncHandler(async (req, res) => {
    const adminSociety = await ProfileVerification.findOne({ user: req.user._id });

    if (!adminSociety) {
        throw new ApiError(404, "Profile is not found");
    }

    const pendingResidentRequest = await ProfileVerification.aggregate([
        {
            $match: {
                residentStatus: 'pending',
                societyName: adminSociety.societyName
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
                startDate: 1,
                endDate: 1,
                tenantAgreement: 1,
                ownershipDocument: 1,
                residentStatus: 1,
                createdAt: 1,
                updatedAt: 1
            }
        }
    ]);


    if (pendingResidentRequest.length <= 0) {
        throw new ApiError(500, "No resident request");
    }

    return res.status(200).json(
        new ApiResponse(200, pendingResidentRequest, "Pending requests fetched successfully.")
    );
});

const getPendingSecurityRequest = asyncHandler(async (req, res) => {
    const adminSociety = await ProfileVerification.findOne({ user: req.user._id });

    if (!adminSociety) {
        throw new ApiError(404, "Profile is not found");
    }

    const pendingSecurityRequest = await ProfileVerification.aggregate([
        {
            $match: {
                guardStatus: 'pending',
                societyName: adminSociety.societyName
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


    if (pendingSecurityRequest.length <= 0) {
        throw new ApiError(500, "No security request");
    }

    return res.status(200).json(
        new ApiResponse(200, pendingSecurityRequest, "Pending requests fetched successfully.")
    );
});

const verifyResidentRequest = asyncHandler(async (req, res) => {
    const { residentStatus, user, requestId } = req.body;
    const userId = mongoose.Types.ObjectId.createFromHexString(user);
    const id = mongoose.Types.ObjectId.createFromHexString(requestId);
    const residentUser = await User.findById(userId);

    const requestExists = await ProfileVerification.findOne({
        _id: id,
        residentStatus: 'pending'
    });

    if (!requestExists) {
        throw new ApiError(500, "Resident request does not exists");
    }

    if (residentStatus === 'approve') {
        requestExists.residentStatus = 'approve';
        residentUser.isUserTypeVerified = true;

        const checkInCode = await CheckInCode.create({
            user: residentUser._id,
            name: residentUser.userName,
            mobNumber: residentUser.phoneNo,
            profileType: 'Resident',
            societyName: requestExists.societyName,
            blockName: requestExists.societyBlock,
            apartment: requestExists.apartment,
            checkInCode: await generateCheckInCode(requestExists.societyName),
            checkInCodeStart: new Date(),
            checkInCodeExpiry: null,
            checkInCodeStartDate: new Date(),
            checkInCodeExpiryDate: null
        });

        if (!checkInCode) {
            throw new ApiError(500, "Something went wrong");
        }

    } else {
        requestExists.residentStatus = 'rejected'
    }

    const isUpdate = await requestExists.save({ validateBeforeSave: false });
    const isUpdateUser = await residentUser.save({ validateBeforeSave: false });

    if (!isUpdate) {
        throw new ApiError(500, "Something went wrong");
    }

    if (!isUpdateUser) {
        throw new ApiError(500, "Something went wrong");
    }

    const token = isUpdateUser.FCMToken;
    const action = residentStatus === 'approve' ? 'RESIDENT_APPROVE' : 'RESIDENT_REJECT';
    let payload = {
        action: action
    };
    sendNotification(token, action, JSON.stringify(payload));

    return res.status(200).json(
        new ApiResponse(200, {}, "Request verified successfully")
    );
});

const verifySecurityRequest = asyncHandler(async (req, res) => {
    const { guardStatus, user, requestId } = req.body;
    const userId = mongoose.Types.ObjectId.createFromHexString(user);
    const id = mongoose.Types.ObjectId.createFromHexString(requestId);
    const residentUser = await User.findById(userId);

    const requestExists = await ProfileVerification.findOne({
        _id: id,
        guardStatus: 'pending'
    });

    if (!requestExists) {
        throw new ApiError(500, "Guard request does not exists");
    }

    if (guardStatus === 'approve') {
        requestExists.guardStatus = 'approve'
        residentUser.isUserTypeVerified = true;

        const checkInCode = await CheckInCode.create({
            user: residentUser._id,
            name: residentUser.userName,
            mobNumber: residentUser.phoneNo,
            profileType: 'Security',
            societyName: requestExists.societyName,
            blockName: requestExists.societyBlock,
            apartment: requestExists.apartment,
            checkInCode: await generateCheckInCode(requestExists.societyName),
            checkInCodeStart: new Date(),
            checkInCodeExpiry: null,
            checkInCodeStartDate: new Date(),
            checkInCodeExpiryDate: null,
        });

        if (!checkInCode) {
            throw new ApiError(500, "Something went wrong");
        }
        
    } else {
        requestExists.guardStatus = 'rejected'
    }

    const isUpdate = await requestExists.save({ validateBeforeSave: false });
    const isUpdateUser = await residentUser.save({ validateBeforeSave: false });

    if (!isUpdate) {
        throw new ApiError(500, "Something went wrong");
    }

    if (!isUpdateUser) {
        throw new ApiError(500, "Something went wrong");
    }

    const token = isUpdateUser.FCMToken;
    const action = guardStatus === 'approve' ? 'GUARD_APPROVE' : 'GUARD_REJECT';
    let payload = {
        action: action
    };
    sendNotification(token, action, JSON.stringify(payload));

    return res.status(200).json(
        new ApiResponse(200, {}, "Request verified successfully")
    );
});

const makeAdmin = asyncHandler(async (req, res) => {
    const { email } = req.body;
    const user = await User.findOne({ email });

    if (!user) {
        throw new ApiError(401, "Invalid email");
    }

    user.role = 'admin'
    await user.save({ validateBeforeSave: false })

    const requestExists = await ProfileVerification.findOne({ user: user._id });

    if (!requestExists) {
        throw new ApiError(500, "user does not exists");
    }

    requestExists.residentStatus = 'approve';
    user.isUserTypeVerified = true;
    await requestExists.save({ validateBeforeSave: false });
    await user.save({ validateBeforeSave: false });

    const checkInCode = await CheckInCode.create({
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

    if (!checkInCode) {
        throw new ApiError(500, "something went wrong");
    }

    return res.status(200).json(
        new ApiResponse(200, {}, "Admin created successfully")
    );
});

export {
    getPendingResidentRequest,
    getPendingSecurityRequest,
    verifyResidentRequest,
    verifySecurityRequest,
    makeAdmin
}