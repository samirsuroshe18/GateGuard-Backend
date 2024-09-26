import asyncHandler from '../utils/asynchandler.js';
import ApiError from '../utils/ApiError.js';
import ApiResponse from '../utils/ApiResponse.js';
import { Society } from '../models/society.model.js';

const addSocietyDetails = asyncHandler(async (req, res) => {
    const { societyName, societyBlocks, societyApartments, societyGates } = req.body;

    const society = await Society.create({
        societyName,
        societyBlocks,
        societyApartments,
        societyGates
    });

    const createdSociety = await Society.findById(society._id);

    if (!createdSociety) {
        throw new ApiError(500, "Something went wrong");
    }

    return res.status(200).json(
        new ApiResponse(200, {}, "Society Details added successfully.")
    );
});

const addSocietyBlocks = asyncHandler(async (req, res) => {
    const { societyName, societyBlocks } = req.body;

    const updatedSociety = await Society.findOneAndUpdate(
        { societyName },
        {
            $push: {
                societyBlocks: { $each: societyBlocks } // Use $each to push an array
            }
        },
        { new: true }
    );

    if (!updatedSociety) {
        throw new ApiError(500, "Something went wrong");
    }

    return res.status(200).json(
        new ApiResponse(200, {}, "Society blocks added successfully.")
    );
});

const addSocietyApartments = asyncHandler(async (req, res) => {
    const { societyName, societyApartments } = req.body;

    const updatedSociety = await Society.findOneAndUpdate(
        { societyName },
        {
            $push: {
                societyApartments: { $each: societyApartments } // Use $each to push an array
            }
        },
        { new: true }
    );

    if (!updatedSociety) {
        throw new ApiError(500, "Something went wrong");
    }

    return res.status(200).json(
        new ApiResponse(200, {}, "Society apartments added successfully.")
    );
});

const addSocietyGates = asyncHandler(async (req, res) => {
    const { societyName, societyGates } = req.body;

    const updatedSociety = await Society.findOneAndUpdate(
        { societyName },
        {
            $push: {
                societyGates: { $each: societyGates } // Use $each to push an array
            }
        },
        { new: true }
    );

    if (!updatedSociety) {
        throw new ApiError(500, "Something went wrong");
    }

    return res.status(200).json(
        new ApiResponse(200, {}, "Society gates added successfully.")
    );
});

const getAllSocieties = asyncHandler(async (req, res) => {
    const societies = await Society.find();

    if (!societies) {
        throw new ApiError(500, "Society not found");
    }

    return res.status(200).json(
        new ApiResponse(200, societies, "Society data fetched successfully.")
    );
});

const getSocietyBlocks = asyncHandler(async (req, res) => {
    const { societyName } = req.body;  // Use req.params if societyName is in the URL

    const society = await Society.findOne({ societyName });

    if (!society) {
        throw new ApiError(500, "Society not found.");
    }

    return res.status(200).json(
        new ApiResponse(200, society.societyBlocks, "Society blocks fetched successfully.")
    );
});

const getAllSocietyApartments = asyncHandler(async (req, res) => {
    const { societyName } = req.body;

    const society = await Society.findOne({ societyName });
    if (!society) {
        throw new ApiError(500, "Society not found.");
    }

    // Extract only apartmentName values
    const apartmentNames = society.societyApartments.map(
        apartment => apartment.apartmentName
    );

    if (!apartmentNames) {
        throw new ApiError(500, "Apartments not found.");
    }

    return res.status(200).json(
        new ApiResponse(200, apartmentNames, "Society apartment fetched successfully.")
    );
});

const getSocietyApartments = asyncHandler(async (req, res) => {
    const { societyName, blockName } = req.body;

    const society = await Society.findOne({ societyName });

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

const getSocietyGates = asyncHandler(async (req, res) => {
    const { societyName } = req.body;  // Use req.params if societyName is in the URL

    const society = await Society.findOne({ societyName });

    if (!society) {
        throw new ApiError(500, "Society not found.");
    }

    return res.status(200).json(
        new ApiResponse(200, society.societyGates, "Society gates fetched successfully.")
    );
});

const removeSociety = asyncHandler(async (req, res) => {
    const { societyName } = req.body;

    const deletedSociety = await Society.findOneAndDelete({ societyName });

    if (!deletedSociety) {
        throw new ApiError(404, "Society not found");
    }

    return res.status(200).json(
        new ApiResponse(200, {}, "Society removed successfully")
    );
});

const removeSocietyBlock = asyncHandler(async (req, res) => {
    const { societyName, societyBlock } = req.body;

    const updatedBlock = await Society.findOneAndUpdate(
        { societyName },
        {
            $pull: {
                societyBlocks: societyBlock,
                societyApartments: { societyBlock }
            }
        },
        { new: true }
    );

    if (!updatedBlock) {
        throw new ApiError(404, "Block not found");
    }

    return res.status(200).json(new ApiResponse(200, {}, "Block removed successfully"));
});

const removeSocietyApartment = asyncHandler(async (req, res) => {
    const { societyName, apartmentName } = req.body;

    const updatedApartment = await Society.findOneAndUpdate(
        { societyName },
        {
            $pull: {
                societyApartments: { apartmentName }
            }
        },
        { new: true }
    );

    if (!updatedApartment) {
        throw new ApiError(404, "Apartment not found");
    }

    return res.status(200).json(new ApiResponse(200, updatedApartment, "Apartment removed successfully"));
});

const removeSocietyGate = asyncHandler(async (req, res) => {
    const { societyName, gateName } = req.body;

    const updatedGate = await Society.findOneAndUpdate(
        { societyName },
        {
            $pull: {
                societyGates: gateName,
            }
        },
        { new: true }
    );

    if (!updatedGate) {
        throw new ApiError(404, "Gate not found");
    }

    return res.status(200).json(new ApiResponse(200, {}, "Gate removed successfully"));
});

export {
    addSocietyDetails,
    addSocietyBlocks,
    addSocietyApartments,
    addSocietyGates,
    getAllSocieties,
    getSocietyBlocks,
    getAllSocietyApartments,
    getSocietyApartments,
    getSocietyGates,
    removeSociety,
    removeSocietyBlock,
    removeSocietyApartment,
    removeSocietyGate
}