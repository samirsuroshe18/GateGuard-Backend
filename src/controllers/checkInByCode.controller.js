import asyncHandler from '../utils/asynchandler.js';
import ApiError from '../utils/ApiError.js';
import ApiResponse from '../utils/ApiResponse.js';
import { CheckInCode } from '../models/checkInCode.model.js';
import { PreApproved } from '../models/preApproved.model.js';


const checkInCodeEntry = asyncHandler(async (req, res) => {
    const { checkInCode } = req.body;

    const checkInCodeEarly = await CheckInCode.find({
        checkInCode,
        checkInCodeStart: { $gt: Date.now() },
        checkInCodeExpiry: { $gt: Date.now() }
    });

    if (checkInCodeEarly) {
        throw new ApiError(500, "Please check your pre-approval time. You're erly.");
    }

    const checkInCodeExist = await CheckInCode.find({
        checkInCode,
        checkInCodeStart: { $lt: Date.now() },
        checkInCodeExpiry: { $gt: Date.now() }
    });

    if (!checkInCodeExist) {
        throw new ApiError(500, "CheckIn code is invalid or expired.");
    }

    checkInCodeExist.isIn = 'yes'

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
    checkInCodeEntry,
}