import asyncHandler from '../utils/asynchandler.js';
import ApiError from '../utils/ApiError.js';
import ApiResponse from '../utils/ApiResponse.js';
import { CheckInCode } from '../models/checkInCode.model.js';
import { ProfileVerification } from '../models/profileVerification.model.js';
import { generateCheckInCode } from '../utils/generateCheckInCode.js';
import { DeliveryEntry } from '../models/deliveryEntry.model.js';

const addPreApproval = asyncHandler(async (req, res) => {
    const { name, mobNumber, profileType, checkInCodeStart, checkInCodeExpiry, checkInCodeStartDate, checkInCodeExpiryDate, profileImg } = req.body;
    const user = await ProfileVerification.findOne({ user: req.user._id });

    const preApprovalEntry = await CheckInCode.create({
        approvedBy: req.user._id,
        name: name,
        mobNumber: mobNumber,
        profileImg: profileImg,
        profileType: profileType,
        societyName: user.societyName,
        blockName: user.societyBlock,
        apartment: user.apartment,
        checkInCode: await generateCheckInCode(user.societyName),
        checkInCodeStart: new Date(checkInCodeStart),
        checkInCodeExpiry: new Date(checkInCodeExpiry),
        checkInCodeStartDate: new Date(checkInCodeStartDate),
        checkInCodeExpiryDate: new Date(checkInCodeExpiryDate),
        isPreApproved: true
    });

    if (!preApprovalEntry) {
        throw new ApiError(500, "Something went wrong");
    }

    return res.status(200).json(
        new ApiResponse(200, { ...preApprovalEntry.toObject(), ownerName: req.user.userName, }, "Pre-approval entry added successfully")
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

    const checkInCode = await CheckInCode.find({
        isPreApproved: true,
        societyName: user.societyName,
        blockName: user.societyBlock,
        apartment: user.apartment,
        checkInCodeExpiryDate: { $gt: Date.now() }
    });

    if (!checkInCode || checkInCode.length <= 0) {
        throw new ApiError(500, "There is no expected entry");
    }

    const responseData = checkInCode.map((code) => ({
        ...code.toObject(),
        ownerName: req.user.userName,
        blockName: user.societyBlock,
        apartmentName: user.apartment,
    }));

    return res.status(200).json(
        new ApiResponse(200, responseData, "expected entry fetched successfully")
    );
});

const getCurrentEntry = asyncHandler(async (req, res) => {
    const user = await ProfileVerification.findOne({ user: req.user._id });

    const delivery = await DeliveryEntry.find({
        'guardStatus.status': 'approve',
        hasExited: false,
        'societyDetails.societyName': user.societyName,
        'societyDetails.societyApartments': {
            $elemMatch: {
                'entryStatus.status': 'approve',
                societyBlock: user.societyBlock,
                apartment: user.apartment,
            },
        },
    });

    if (!delivery || delivery.length <= 0) {
        throw new ApiError(500, "There is no expected entry");
    }

    const responseData = checkInCode.map((code) => ({
        ...code.toObject(),
        ownerName: req.user.userName,
        blockName: user.societyBlock,
        apartmentName: user.apartment,
    }));

    return res.status(200).json(
        new ApiResponse(200, responseData, "expected entry fetched successfully")
    );
});

const getPastEntry = asyncHandler(async (req, res) => {
    const user = await ProfileVerification.findOne({ user: req.user._id });

    const checkInCode = await CheckInCode.find({
        approvedBy: req.user._id,
        isPreApproved: false,
    });

    if (!checkInCode || checkInCode.length <= 0) {
        throw new ApiError(500, "There is no expected entry");
    }

    const responseData = checkInCode.map((code) => ({
        ...code.toObject(),
        ownerName: req.user.userName,
        blockName: user.societyBlock,
        apartmentName: user.apartment,
    }));

    return res.status(200).json(
        new ApiResponse(200, responseData, "expected entry fetched successfully")
    );
});

const getDeniedEntry = asyncHandler(async (req, res) => {
    const user = await ProfileVerification.findOne({ user: req.user._id });

    const checkInCode = await CheckInCode.find({
        approvedBy: req.user._id,
        isPreApproved: false,
    });

    if (!checkInCode || checkInCode.length <= 0) {
        throw new ApiError(500, "There is no expected entry");
    }

    const responseData = checkInCode.map((code) => ({
        ...code.toObject(),
        ownerName: req.user.userName,
        blockName: user.societyBlock,
        apartmentName: user.apartment,
    }));

    return res.status(200).json(
        new ApiResponse(200, responseData, "expected entry fetched successfully")
    );
});

export {
    addPreApproval,
    reSchedule,
    getExpectedEntry
}