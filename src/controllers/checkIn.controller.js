import asyncHandler from '../utils/asynchandler.js';
import ApiError from '../utils/ApiError.js';
import ApiResponse from '../utils/ApiResponse.js';
import { ProfileVerification } from '../models/profileVerification.model.js';
import { Society } from '../models/society.model.js';
import { DeliveryEntry } from '../models/deliveryEntry.model.js';

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

    const deliveryEntry = await DeliveryEntry.findOne({ mobNumber }).select("-__v -vehicleDetails -entryType -societyDetails -createdAt -updatedAt");

    if (!deliveryEntry) {
        return res.status(200).json(
            new ApiResponse(200, {}, "delivery profile not found.")
        );
    }

    return res.status(200).json(
        new ApiResponse(200, deliveryEntry, "delivery profile found successfully.")
    );
});


export {
    getGuardSocietyBlocks,
    getGuardSocietyApartments,
    getMobileNumber
}