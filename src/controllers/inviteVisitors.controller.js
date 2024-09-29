import asyncHandler from '../utils/asynchandler.js';
import ApiError from '../utils/ApiError.js';
import ApiResponse from '../utils/ApiResponse.js';
import { CheckInCode } from '../models/checkInCode.model.js';
import { ProfileVerification } from '../models/profileVerification.model.js';

const preApproval = asyncHandler(async (req, res) => {
    const { name, mobNumber, profileType, checkInCodeStart, checkInCodeExpiry } = req.body;
    const user = await ProfileVerification.findOne({ user: req.user._id });
    const societyName = user.societyName;
    const checkInCode = await CheckInCode.find({
        societyName,
        checkInCodeStart: { $lt: Date.now() },
        checkInCodeExpiry: { $gt: Date.now() }
    });
    const checkInCodeOnly = checkInCode.map(doc => doc.checkInCode);

    let newCode;
    do {
        newCode = Math.floor(100000 + Math.random() * 900000).toString();
    } while (checkInCodeOnly.includes(newCode));

    const preApprovalEntry = await CheckInCode.create({
        name: name,
        mobNumber: mobNumber,
        profileType: profileType,
        societyName: societyName,
        checkInCode: generateCheckInCode(societyName),
        checkInCodeStart: checkInCodeStart,
        checkInCodeExpiry: checkInCodeExpiry,
        isIn: 'pending'
    });

    if (!preApprovalEntry) {
        throw new ApiError(500, "Something went wrong");
    }

    return res.status(200).json(
        new ApiResponse(200, preApprovalEntry, "Pre-approval entry added successfully")
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

    const checkInCode = await CheckInCode.find({
        approvedBy: req.user._id,
        isIn: 'pending',
    });

    if (!checkInCode) {
        throw new ApiError(500, "There is no expected entry");
    }

    return res.status(200).json(
        new ApiResponse(200, checkInCode, "expected entry fetched successfully")
    );
});

export {
    preApproval,
    reSchedule,
    getExpectedEntry
}