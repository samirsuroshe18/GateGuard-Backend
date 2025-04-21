import ApiResponse from '../utils/ApiResponse.js';
import ApiError from '../utils/ApiError.js';
import asyncHandler from '../utils/asynchandler.js';
import { GuardDutyLog } from '../models/guardDutyLog.model.js';
import { User } from '../models/user.model.js';
import { ProfileVerification } from '../models/profileVerification.model.js';
import { sendNotification} from '../utils/sendResidentNotification.js';

const guardDutyCheckin = asyncHandler(async (req, res) => {
    const { gate, checkinReason } = req.body;

    if (!gate?.trim() || !checkinReason?.trim()) {
        throw new ApiError(400, "All fields are required");
    }

    const guardlog = await GuardDutyLog.create({
        guardId: req.user._id,
        gate,
        checkinReason,
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

export { guardDutyCheckin, guardDutyCheckout, guardDutyStatus };    