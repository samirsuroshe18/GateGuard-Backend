import asyncHandler from '../utils/asynchandler.js';
import ApiError from '../utils/ApiError.js';
import ApiResponse from '../utils/ApiResponse.js';
import { DeliveryEntry } from '../models/deliveryEntry.model.js';
import { ProfileVerification } from '../models/profileVerification.model.js';
import { sendNotification } from '../utils/sendResidentNotification.js';

const addDeliveryEntry = asyncHandler(async (req, res) => {
    const { name, mobNumber, vehicleDetails, entryType, societyDetails, companyName, companyLogo } = req.body;
    const profileImg = `${process.env.DOMAIN}/images/${req.file.filename}`;

    const profile = await ProfileVerification.aggregate([
        {
            $match: {
                societyName: societyDetails.societyName, // Replace with actual society name
                $or: societyDetails.societyApartments
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
                            phoneNo: 1,
                            FCMToken: 1
                        }
                    }
                ],
                as: "user"
            }
        },
        {
            // Unwind the user array so that we only get the user object, not an array
            $unwind: {
                path: "$user",
                preserveNullAndEmptyArrays: true  // This ensures documents without a matching user are kept
            }
        },
        {
            $project: {
                user: 1
            }
        }
    ]);

    if (profile.length <= 0) {
        throw new ApiError(500, "No resident found");
    }

    const deliveryEntry = await DeliveryEntry.create({
        name,
        mobNumber,
        profileImg,
        vehicleDetails,
        entryType,
        societyDetails,
        companyName,
        companyLogo,
    });

    const createddeliveryEntry = await DeliveryEntry.findById(deliveryEntry._id);

    if (!createddeliveryEntry) {
        throw new ApiError(500, "Something went wrong");
    }

    const FCMTokens = profile.map((item) => item.user.FCMToken);
    var payload = {
        name,
        mobNumber,
        profileImg,
        entryType,
        companyName,
        companyLogo,
        action: 'VERIFY_DELIVERY_ENTRY'
    };

    FCMTokens.forEach(token => {
        sendNotification(token, payload.action, JSON.stringify(payload));
    });

    return res.status(200).json(
        new ApiResponse(200, {}, "Delivery Approval request send successfully.")
    );
});

const addDeliveryEntryStringImg = asyncHandler(async (req, res) => {
    const { name, mobNumber, profileImg, vehicleDetails, entryType, societyDetails, companyName, companyLogo } = req.body;

    const profile = await ProfileVerification.aggregate([
        {
            $match: {
                societyName: societyDetails.societyName, // Replace with actual society name
                $or: societyDetails.societyApartments
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
                            phoneNo: 1,
                            FCMToken: 1
                        }
                    }
                ],
                as: "user"
            }
        },
        {
            // Unwind the user array so that we only get the user object, not an array
            $unwind: {
                path: "$user",
                preserveNullAndEmptyArrays: true  // This ensures documents without a matching user are kept
            }
        },
        {
            $project: {
                user: 1
            }
        }
    ]);

    if (profile.length <= 0) {
        throw new ApiError(500, "No resident found");
    }

    const deliveryEntry = await DeliveryEntry.create({
        name,
        mobNumber,
        profileImg,
        vehicleDetails,
        entryType,
        societyDetails,
        companyName,
        companyLogo
    });

    const createddeliveryEntry = await DeliveryEntry.findById(deliveryEntry._id);

    if (!createddeliveryEntry) {
        throw new ApiError(500, "Something went wrong");
    }

    const FCMTokens = profile.map((item) => item.user.FCMToken);
    var payload = {
        name,
        mobNumber,
        profileImg,
        entryType,
        companyName,
        companyLogo,
        action: 'VERIFY_DELIVERY_ENTRY'
    };

    FCMTokens.forEach(token => {
        sendNotification(token, payload.action, JSON.stringify(payload));
    });

    return res.status(200).json(
        new ApiResponse(200, {}, "Delivery Approval request send successfully.")
    );
});

export {
    addDeliveryEntry,
    addDeliveryEntryStringImg
}