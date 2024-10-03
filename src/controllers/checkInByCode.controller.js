import asyncHandler from '../utils/asynchandler.js';
import ApiError from '../utils/ApiError.js';
import ApiResponse from '../utils/ApiResponse.js';
import { CheckInCode } from '../models/checkInCode.model.js';
import { PreApproved } from '../models/preApproved.model.js';
import { ProfileVerification } from '../models/profileVerification.model.js';


const checkInByCodeEntry = asyncHandler(async (req, res) => {
    const { checkInCode } = req.body;
    const security = await ProfileVerification.findOne({ user: req.user._id, profileType: 'Security' });

    const checkInCodeEarly = await CheckInCode.findOne({
        checkInCode,
        societyName: security.societyName,
        checkInCodeStart: { $gt: Date.now() },
        checkInCodeExpiry: { $gt: Date.now() }
    });

    if (checkInCodeEarly) {
        throw new ApiError(500, "Please check your pre-approval time. You're early.");
    }

    const checkInCodeExist = await CheckInCode.findOne({
        checkInCode,
        societyName: security.societyName,
        checkInCodeStart: { $lt: Date.now() },
        $or: [
            { checkInCodeExpiry: { $gt: Date.now() } },
            { checkInCodeExpiry: null }
        ]
    });

    if (!checkInCodeExist) {
        throw new ApiError(500, "CheckIn code is invalid or expired.");
    }

    checkInCodeExist.isPreApproved = true;
    await checkInCodeExist.save({ validateBeforeSave: false });

    const checkInCodeEntry = await PreApproved.create({
        name: checkInCodeExist.name,
        mobNumber: checkInCodeExist.mobNumber,
        profileType: checkInCodeExist.profileType,
        approvedBy: checkInCodeExist.approvedBy,
        allowedBy: req.user._id,
        entryTime: Date.now(),
    });

    if (!checkInCodeEntry) {
        throw new ApiError(500, "Something went wrong");
    }

    return res.status(200).json(
        new ApiResponse(200, {}, "CheckInCode entry added successfully")
    );
});

export {
    checkInByCodeEntry,
}