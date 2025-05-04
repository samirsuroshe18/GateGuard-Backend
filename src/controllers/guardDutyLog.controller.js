import ApiResponse from '../utils/ApiResponse.js';
import ApiError from '../utils/ApiError.js';
import asyncHandler from '../utils/asynchandler.js';
import { GuardDutyLog } from '../models/guardDutyLog.model.js';
import { User } from '../models/user.model.js';
import { ProfileVerification } from '../models/profileVerification.model.js';
import { CheckInCode } from '../models/checkInCode.model.js';
import { sendNotification } from '../utils/sendResidentNotification.js';
import mongoose from 'mongoose';

const guardDutyCheckin = asyncHandler(async (req, res) => {
    const { gate, checkinReason, shift } = req.body;

    if (!gate?.trim() || !checkinReason?.trim()) {
        throw new ApiError(400, "All fields are required");
    }

    const guardlog = await GuardDutyLog.create({
        guardId: req.user._id,
        gate,
        checkinReason,
        shift,
        date: new Date(),
        checkinTime: new Date(),
    });

    const updateGuardProfile = await ProfileVerification.findOneAndUpdate(
        { user: req.user._id },
        { $set: { gateAssign: gate } },
        { new: true }
    );

    if (!updateGuardProfile) {
        throw new ApiError(404, "Guard profile not found");
    }

    const updateUser = await User.findByIdAndUpdate(
        req.user._id,
        { $set: { isOnDuty: true } },
        { new: true }
    );

    if (!updateUser) {
        throw new ApiError(404, "User not found");
    }

    const createdGuardLog = await GuardDutyLog.findById(guardlog._id);

    if (!createdGuardLog) {
        throw new ApiError(500, "Something went wrong");
    }

    const users = await ProfileVerification.find({ societyName: updateGuardProfile.societyName })
        .populate("user", "FCMToken role");

    const FCMTokens = users
        .filter((item) => item.user?.role === "admin" && item.user?.FCMToken)
        .map((item) => item.user.FCMToken);


    let payload = {
        guardName: req.user.userName,
        guardGate: req.guard.gateAssign,
        action: 'GUARD_DUTY_CHECKIN',
    };

    FCMTokens.forEach(token => {
        sendNotification(token, payload.action, JSON.stringify(payload));
    });

    return res.status(200).json(
        new ApiResponse(200, createdGuardLog, "Guard duty log created successfully",)
    );
});

const guardDutyCheckout = asyncHandler(async (req, res) => {
    const { checkoutReason } = req.body;

    if (!checkoutReason?.trim()) {
        throw new ApiError(400, "checkoutReason field is required");
    }

    const guardlog = await GuardDutyLog.findOneAndUpdate(
        { guardId: req.user._id, checkoutTime: null },
        { checkoutTime: new Date(), checkoutReason },
        {
            new: true,
            sort: { createdAt: -1 }
        }
    );

    if (!guardlog) {
        throw new ApiError(404, "No active guard duty log found for checkout");
    }

    const updateUser = await User.findByIdAndUpdate(
        req.user._id,
        { $set: { isOnDuty: false } },
        { new: true }
    );

    if (!updateUser) {
        throw new ApiError(404, "User not found");
    }

    const users = await ProfileVerification.find({ societyName: req.guard.societyName })
        .populate("user", "FCMToken role");

    const FCMTokens = users
        .filter((item) => item.user?.role === "admin" && item.user?.FCMToken)
        .map((item) => item.user.FCMToken);


    let payload = {
        guardName: req.user.userName,
        guardGate: req.guard.gateAssign,
        action: 'GUARD_DUTY_CHECKOUT',
    };

    FCMTokens.forEach(token => {
        sendNotification(token, payload.action, JSON.stringify(payload));
    });

    return res.status(200).json(
        new ApiResponse(200, guardlog, "Guard duty log updated successfully")
    );
});

const guardDutyStatus = asyncHandler(async (req, res) => {
    const guardlog = await GuardDutyLog.findOne({
        guardId: req.user._id,
        checkoutTime: null
    }).sort({ createdAt: -1 });

    if (!guardlog) {
        throw new ApiError(404, "No active guard duty log found for checkout");
    }

    return res.status(200).json(
        new ApiResponse(200, guardlog, "Guard duty log fetched successfully")
    );
});

const getGuardReport = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const guardId = mongoose.Types.ObjectId.createFromHexString(id);
    const guardInfo = await ProfileVerification.findOne({ user: guardId, guardStatus: "approve" })
        .populate("user", "userName profile")
        .select("user gateAssign societyName");
    if (!guardInfo) {
        throw new ApiError(404, "Guard not found");
    }
    const checkInCode = await CheckInCode.findOne({ user: guardId }).select("checkInCode");
    if (!checkInCode) {
        throw new ApiError(404, "CheckInCode not found");
    }

    return res.status(200).json(
        new ApiResponse(200, { ...guardInfo.toObject(), ...checkInCode.toObject() }, "Guard report fetched successfully")
    );
});

const getGuardLogs = asyncHandler(async (req, res) => {
    const { id } = req.query;
    const guardId = mongoose.Types.ObjectId.createFromHexString(id);

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

        filters.checkinTime = {
            $gte: startDate,
            $lte: endDate
        };
    }

    // Shift filter
    if (req.query.shift) {
        filters.shift = req.query.shift;
    }

    // Gate filter
    if (req.query.gate) {
        filters.gate = req.query.gate;
    }

    // Base match conditions for Guard Duty log
    const guardlogMatch = {
        guardId,
        ...filters
    };

    const totalCount = await GuardDutyLog.countDocuments(guardlogMatch);
    const totalPages = Math.ceil(totalCount / limit);

    const guardlog = await GuardDutyLog.find(guardlogMatch)
        .populate("guardId", "userName profile")
        .sort({ createdAt: -1 });

    if (!guardlog) {
        throw new ApiError(404, "No guard duty log found for this guard");
    }

    const response = guardlog.slice(skip, skip + limit);

    if (response.length <= 0) {
        throw new ApiError(500, "There is no entry");
    }

    const data = {
        guard_log_entries: response,
        pagination: {
            totalEntries: totalCount,
            entriesPerPage: limit,
            currentPage: page,
            totalPages: totalPages,
            hasMore: page < totalPages
        }
    }

    return res.status(200).json(
        new ApiResponse(200, data, "Delivery log fetched successfully")
    )

});

export { guardDutyCheckin, guardDutyCheckout, guardDutyStatus, getGuardReport, getGuardLogs };    