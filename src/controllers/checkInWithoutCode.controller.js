import asyncHandler from '../utils/asynchandler.js';
import ApiError from '../utils/ApiError.js';
import ApiResponse from '../utils/ApiResponse.js';
import { ProfileVerification } from '../models/profileVerification.model.js';
import { Society } from '../models/society.model.js';
import { DeliveryEntry } from '../models/deliveryEntry.model.js';
import { CheckInCode } from '../models/checkInCode.model.js';
import { generateCheckInCode } from '../utils/generateCheckInCode.js';
import { PreApproved } from '../models/preApproved.model.js';

const getGuardSocietyBlocks = asyncHandler(async (req, res) => {
    const userId = req.user._id;
    console.log(userId);

    const security = await ProfileVerification.findOne({ user: userId });
    console.log("security data : ", security);
    const society = await Society.findOne({ societyName: security.societyName });

    if (!society) {
        throw new ApiError(500, "Society not found.");
    }

    return res.status(200).json(
        new ApiResponse(200, society.societyBlocks, "Society blocks fetched successfully.")
    );
});

const getGuardSocietyApartments = asyncHandler(async (req, res) => {
    const { blockName } = req.body;
    const userId = req.user._id;

    const security = await ProfileVerification.findOne({ user: userId });
    const society = await Society.findOne({ societyName: security.societyName });

    if (!society) {
        throw new ApiError(500, "Society not found.");
    }

    const apartmentsInBlock = society.societyApartments.filter(
        apartment => apartment.societyBlock === blockName
    );

    if (apartmentsInBlock.length <= 0) {
        throw new ApiError(500, "Apartments not found.");
    }

    // Extract only apartmentName values
    const apartmentNames = apartmentsInBlock.map(
        apartment => apartment.apartmentName
    );

    if (apartmentNames.length <= 0) {
        throw new ApiError(500, "Apartments not found.");
    }

    return res.status(200).json(
        new ApiResponse(200, apartmentNames, "Society apartment fetched successfully.")
    );
});

const getMobileNumber = asyncHandler(async (req, res) => {
    const { mobNumber } = req.body;

    const security = await ProfileVerification.findOne({ user: req.user._id, profileType: 'Security' });
    const deliveryEntry = await DeliveryEntry.findOne({ mobNumber }).select("-__v -vehicleDetails -entryType -societyDetails -createdAt -updatedAt");

    if (!deliveryEntry) {
        return res.status(200).json(
            new ApiResponse(200, { societyName: security.societyName, gateName: security.gateAssign }, "delivery profile not found.")
        );
    }

    return res.status(200).json(
        new ApiResponse(200, { ...deliveryEntry.toObject(), societyName: security.societyName, gateName: security.gateAssign }, "delivery profile found successfully.")
    );
});

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

export {
    getGuardSocietyBlocks,
    getGuardSocietyApartments,
    getMobileNumber
}