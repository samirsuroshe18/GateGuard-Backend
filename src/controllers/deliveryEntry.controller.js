import asyncHandler from '../utils/asynchandler.js';
import ApiError from '../utils/ApiError.js';
import ApiResponse from '../utils/ApiResponse.js';
import { DeliveryEntry } from '../models/deliveryEntry.model.js';
import { ProfileVerification } from '../models/profileVerification.model.js';
import { sendNotification, sendNotificationCancel } from '../utils/sendResidentNotification.js';
import { User } from '../models/user.model.js';
import mongoose from 'mongoose'
import { generateNotificationId } from '../utils/generateCheckInCode.js';

const addDeliveryEntry = asyncHandler(async (req, res) => {
    const { name, mobNumber, vehicleDetails, entryType, societyDetails, companyName, companyLogo } = req.body;
    const profileImg = `${process.env.SMARTDWELL_DOMAIN}${req.file.filename}`;

    const profile = await ProfileVerification.aggregate([
        {
            $match: {
                residentStatus: 'approve',
                societyName: JSON.parse(societyDetails).societyName,
                $or: JSON.parse(societyDetails).societyApartments
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
            $unwind: {
                path: "$user",
                preserveNullAndEmptyArrays: true
            }
        },
        {
            $project: {
                user: 1
            }
        }
    ]);

    if (profile.length <= 0) {
        throw new ApiError(500, "No resident found or apartment is vacant");
    }

    const deliveryEntry = await DeliveryEntry.create({
        name,
        mobNumber,
        profileImg,
        vehicleDetails: JSON.parse(vehicleDetails),
        entryType,
        societyDetails: JSON.parse(societyDetails),
        companyName,
        companyLogo,
        notificationId: generateNotificationId(),
        guardStatus: {
            guard: {
                userId: req.user._id,
                name: req.user.userName
            }
        },
    });

    const createddeliveryEntry = await DeliveryEntry.findById(deliveryEntry._id);

    if (!createddeliveryEntry) {
        throw new ApiError(500, "Something went wrong");
    }

    const FCMTokens = profile.map((item) => item.user.FCMToken);
    var payload = {
        id: createddeliveryEntry._id,
        name,
        mobNumber,
        profileImg,
        entryType,
        companyName,
        companyLogo,
        notificationId: createddeliveryEntry.notificationId,
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
                residentStatus: 'approve',
                societyName: societyDetails.societyName,
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
            $unwind: {
                path: "$user",
                preserveNullAndEmptyArrays: true
            }
        },
        {
            $project: {
                user: 1
            }
        }
    ]);

    if (profile.length <= 0) {
        throw new ApiError(500, "No resident found or apartment is vacant");
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
        notificationId: generateNotificationId(),
        guardStatus: {
            guard: {
                userId: req.user._id,
                name: req.user.userName
            }
        },
    });

    const createddeliveryEntry = await DeliveryEntry.findById(deliveryEntry._id);

    if (!createddeliveryEntry) {
        throw new ApiError(500, "Something went wrong");
    }

    const FCMTokens = profile.map((item) => item.user.FCMToken);
    var payload = {
        id: createddeliveryEntry._id,
        name,
        mobNumber,
        profileImg,
        entryType,
        companyName,
        companyLogo,
        notificationId: createddeliveryEntry.notificationId,
        action: 'VERIFY_DELIVERY_ENTRY'
    };

    FCMTokens.forEach(token => {
        sendNotification(token, payload.action, JSON.stringify(payload));
    });

    return res.status(200).json(
        new ApiResponse(200, {}, "Delivery Approval request send successfully.")
    );
});

const waitingForResidentApprovalEntries = asyncHandler(async (req, res) => {
    const society = await ProfileVerification.findOne({ user: req.user._id });
    if (!society) {
        throw new ApiError(500, "No resident found");
    }

    const deliveryEntry = await DeliveryEntry.find({
        'societyDetails.societyName': society.societyName,
        'guardStatus.guard.userId': req.user._id,
        'guardStatus.status': 'pending'
    });

    if (deliveryEntry.length <= 0) {
        throw new ApiError(500, "There is no waiting requests.");
    }

    return res.status(200).json(
        new ApiResponse(200, deliveryEntry, "Delivery waiting request fetched successfully.")
    );
});

const getDeliveryServiceRequest = asyncHandler(async (req, res) => {
    const user = await ProfileVerification.findOne({ user: req.user._id });

    const result = await DeliveryEntry.findOne({
        'societyDetails.societyName': user.societyName,
        'societyDetails.societyApartments': {
            $elemMatch: {
                societyBlock: user.societyBlock,
                apartment: user.apartment,
                'entryStatus.status': 'pending'
            }
        }
    });

    if (!result) {
        throw new ApiError(500, "No entry is arrived");
    }

    return res.status(200).json(
        new ApiResponse(200, result, "You got an entry")
    );
});

const getDeliveryAllowedEntries = asyncHandler(async (req, res) => {
    const society = await ProfileVerification.findOne({ user: req.user._id });
    if (!society) {
        throw new ApiError(500, "No resident found");
    }

    const deliveryEntry = await DeliveryEntry.find({
        'societyDetails.societyName': society.societyName,
        'guardStatus.status': 'approve',
        hasExited: false
    });

    if (deliveryEntry.length <= 0) {
        throw new ApiError(500, "There is no entry");
    }

    return res.status(200).json(
        new ApiResponse(200, deliveryEntry, "Allowed delivery fetched successfully.")
    );
});

const approveDelivery = asyncHandler(async (req, res) => {
    const { id } = req.body;
    const deliveryId = mongoose.Types.ObjectId.createFromHexString(id);
    const delivery = await DeliveryEntry.findById(deliveryId);
    const user = await User.findById(req.user._id);
    const society = await ProfileVerification.findOne({ user: req.user._id });

    const profile = await ProfileVerification.aggregate([
        {
            $match: {
                residentStatus: 'approve',
                societyName: society.societyName, // Replace with actual society name
                societyBlock: society.societyBlock,
                apartment: society.apartment
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
            $unwind: {
                path: "$user",
                preserveNullAndEmptyArrays: true
            }
        },
        {
            $project: {
                user: 1
            }
        }
    ]);

    if (!delivery) {
        throw new ApiError(500, "Invalid id");
    }

    const status = getEntryStatus(delivery.toObject(), society.societyBlock, society.apartment)

    if (status == 'rejected' || status == 'approve') {
        throw new ApiError(500, "A response has already been submitted. Only one response is allowed per entry.");
    }

    // delivery.residentStatus = 'approve';
    const result = await DeliveryEntry.updateOne(
        {
            _id: delivery._id,
            "societyDetails.societyApartments.societyBlock": society.societyBlock,
            "societyDetails.societyApartments.apartment": society.apartment
        },
        {
            $set: {
                "societyDetails.societyApartments.$[elem].entryStatus.status": "approve",
                "societyDetails.societyApartments.$[elem].entryStatus.approvedBy.userId": req.user._id,
                "societyDetails.societyApartments.$[elem].entryStatus.approvedBy.name": req.user.userName
            }
        },
        {
            arrayFilters: [{ "elem.societyBlock": society.societyBlock, "elem.apartment": society.apartment }]
        }
    );

    if (!result) {
        throw new ApiError(500, "Something went wrong");
    }

    const FCMTokens = profile.map((item) => item.user.FCMToken);

    let cancelPayload = {
        notificationId: delivery.notificationId,
    };

    FCMTokens.forEach(token => {
        sendNotificationCancel(token, JSON.stringify(cancelPayload));
    });

    let payload = {
        userName: user.userName,
        deliveryName: delivery.name,
        companyName: delivery.companyName,
        action: 'DELIVERY_ENTRY_APPROVE'
    };

    FCMTokens.forEach(token => {
        sendNotification(token, payload.action, JSON.stringify(payload));
    });

    return res.status(200).json(
        new ApiResponse(200, {}, "Delivery Approved successfully.")
    );
});

const rejectDelivery = asyncHandler(async (req, res) => {
    const { id } = req.body;
    const deliveryId = mongoose.Types.ObjectId.createFromHexString(id);
    const delivery = await DeliveryEntry.findById(deliveryId);
    const user = await User.findById(req.user._id);
    const society = await ProfileVerification.findOne({ user: req.user._id });

    const profile = await ProfileVerification.aggregate([
        {
            $match: {
                residentStatus: 'approve',
                societyName: society.societyName, // Replace with actual society name
                societyBlock: society.societyBlock,
                apartment: society.apartment
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

    if (!delivery) {
        throw new ApiError(500, "Invalid id");
    }

    const status = getEntryStatus(delivery.toObject(), society.societyBlock, society.apartment)

    if (status == 'rejected' || status == 'approve') {
        throw new ApiError(500, "A response has already been submitted. Only one response is allowed per entry.");
    }

    const result = await DeliveryEntry.updateOne(
        {
            _id: delivery._id,
            "societyDetails.societyApartments.societyBlock": society.societyBlock,
            "societyDetails.societyApartments.apartment": society.apartment
        },
        {
            $set: {
                "societyDetails.societyApartments.$[elem].entryStatus.status": "rejected",
                "societyDetails.societyApartments.$[elem].entryStatus.rejectedBy.userId": req.user._id,
                "societyDetails.societyApartments.$[elem].entryStatus.rejectedBy.name": req.user.userName,
                exitTime: new Date()
            }
        },
        {
            arrayFilters: [{ "elem.societyBlock": society.societyBlock, "elem.apartment": society.apartment }]
        }
    );

    if (!result) {
        throw new ApiError(500, "Something went wrong");
    }

    const FCMTokens = profile.map((item) => item.user.FCMToken);

    let cancelPayload = {
        notificationId: delivery.notificationId,
    };

    FCMTokens.forEach(token => {
        sendNotificationCancel(token, JSON.stringify(cancelPayload));
    });

    let payload = {
        userName: user.userName,
        deliveryName: delivery.name,
        companyName: delivery.companyName,
        action: 'DELIVERY_ENTRY_REJECTED'
    };

    FCMTokens.forEach(token => {
        sendNotification(token, payload.action, JSON.stringify(payload));
    });

    return res.status(200).json(
        new ApiResponse(200, {}, "Delivery rejected successfully.")
    );
});

const allowDeliveryBySecurity = asyncHandler(async (req, res) => {
    const { id } = req.body;
    const deliveryId = mongoose.Types.ObjectId.createFromHexString(id);
    const delivery = await DeliveryEntry.findById(deliveryId);

    if (!delivery) {
        throw new ApiError(500, "Invalid id");
    }

    const pendingApartments = delivery.societyDetails.societyApartments.filter(apartment => apartment.entryStatus.status === 'approve' || apartment.entryStatus.status === 'rejected');

    if (pendingApartments.length <= 0) {
        throw new ApiError(500, "Wait for resident response");
    }

    delivery.guardStatus.status = 'approve';
    delivery.guardStatus.guard.userId = req.user._id;
    delivery.guardStatus.guard.name = req.user.userName;
    delivery.entryTime = new Date();
    const result = await delivery.save({ validateBeforeSave: false });

    if (!result) {
        throw new ApiError(500, "Something went wrong");
    }

    return res.status(200).json(
        new ApiResponse(200, {}, "Delivery Allowed successfully.")
    );
});

const denyDeliveryBySecurity = asyncHandler(async (req, res) => {
    const { id } = req.body;
    const deliveryId = mongoose.Types.ObjectId.createFromHexString(id);
    const delivery = await DeliveryEntry.findById(deliveryId);

    if (!delivery) {
        throw new ApiError(500, "Invalid id");
    }

    const pendingApartments = delivery.societyDetails.societyApartments.filter(apartment => apartment.entryStatus.status === 'approve' || apartment.entryStatus.status === 'rejected');

    if (pendingApartments.length <= 0) {
        throw new ApiError(500, "Wait for resident response");
    }

    delivery.guardStatus.status = 'rejected';
    delivery.guardStatus.guard.userId = req.user._id;
    delivery.guardStatus.guard.name = req.user.userName;
    const result = await delivery.save({ validateBeforeSave: false });

    if (!result) {
        throw new ApiError(500, "Something went wrong");
    }

    return res.status(200).json(
        new ApiResponse(200, {}, "Delivery Denied successfully.")
    );
});

const exitEntry = asyncHandler(async (req, res) => {
    const { id } = req.body;
    const deliveryId = mongoose.Types.ObjectId.createFromHexString(id);
    const delivery = await DeliveryEntry.findById(deliveryId);

    if (!delivery) {
        throw new ApiError(500, "Invalid id");
    }

    delivery.hasExited = true;
    delivery.exitTime = new Date();
    const result = await delivery.save({ validateBeforeSave: false });

    if (!result) {
        throw new ApiError(500, "Something went wrong");
    }

    return res.status(200).json(
        new ApiResponse(200, {}, "Delivery exited successfully.")
    );
});

//For Residents

const getCurrentDeliveryEntries = asyncHandler(async (req, res) => {
    const user = await ProfileVerification.findOne({ user: req.user._id });
    if (!user) {
        throw new ApiError(500, "No resident found");
    }

    const deliveryEntry = await DeliveryEntry.aggregate([
        {
            $match: {
                "societyDetails.societyName": user.societyName,
                'guardStatus.status': 'approve',  // Condition for guard status
                hasExited: false,                 // Condition for exit status
            },
        },
        {
            $project: {
                // Include all fields of the document
                _id: 1,  // or just exclude fields you don't want to show
                guardStatus: 1,
                name: 1,
                mobNumber: 1,
                profileImg: 1,
                companyName: 1,
                companyLogo: 1,
                vehicleDetails: 1,
                entryType: 1,
                entryTime: 1,
                exitTime: 1,
                hasExited: 1,
                notificationId: 1,
                societyDetails: {
                    societyName: "$societyDetails.societyName",
                    societyApartments: {
                        $filter: {
                            input: "$societyDetails.societyApartments",
                            as: "apartment",
                            cond: {
                                $and: [
                                    { $eq: ["$$apartment.societyBlock", user.societyBlock] },
                                    { $eq: ["$$apartment.apartment", user.apartment] },
                                ],
                            },
                        },
                    },
                },
            },
        },
    ]);


    if (deliveryEntry.length <= 0) {
        throw new ApiError(500, "There is no entry");
    }

    return res.status(200).json(
        new ApiResponse(200, deliveryEntry, "Current entries fetched successfully.")
    );
});

const getPastDeliveryEntries = asyncHandler(async (req, res) => {
    const user = await ProfileVerification.findOne({ user: req.user._id });

    const deliveryEntry = await DeliveryEntry.aggregate([
        {
            $match: {
                "societyDetails.societyName": user.societyName,
                'guardStatus.status': 'approve',
                hasExited: true,
            },
        },
        {
            $project: {
                _id: 1,
                guardStatus: 1,
                name: 1,
                mobNumber: 1,
                profileImg: 1,
                companyName: 1,
                companyLogo: 1,
                vehicleDetails: 1,
                entryType: 1,
                entryTime: 1,
                exitTime: 1,
                hasExited: 1,
                notificationId: 1,
                societyDetails: {
                    societyName: "$societyDetails.societyName",
                    societyApartments: {
                        $filter: {
                            input: "$societyDetails.societyApartments",
                            as: "apartment",
                            cond: {
                                $and: [
                                    { $eq: ["$$apartment.societyBlock", user.societyBlock] },
                                    { $eq: ["$$apartment.apartment", user.apartment] },
                                ],
                            },
                        },
                    },
                },
            },
        },
    ]);

    if (deliveryEntry.length <= 0) {
        throw new ApiError(500, "There is no entry");
    }

    return res.status(200).json(
        new ApiResponse(200, deliveryEntry, "Past entries fetched successfully.")
    );
});

const getDeniedDeliveryEntries = asyncHandler(async (req, res) => {
    const user = await ProfileVerification.findOne({ user: req.user._id });

    const deliveryEntry = await DeliveryEntry.aggregate([
        {
            $match: {
                'societyDetails.societyName': user.societyName,
                'societyDetails.societyApartments': {
                    $elemMatch: {
                        societyBlock: user.societyBlock,
                        apartment: user.apartment,
                        'entryStatus.status': 'rejected'
                    }
                },
            },
        },
        {
            $project: {
                _id: 1,
                guardStatus: 1,
                name: 1,
                mobNumber: 1,
                profileImg: 1,
                companyName: 1,
                companyLogo: 1,
                vehicleDetails: 1,
                entryType: 1,
                entryTime: 1,
                exitTime: 1,
                hasExited: 1,
                notificationId: 1,
                societyDetails: {
                    societyName: 1,
                    societyApartments: {
                        $filter: {
                            input: "$societyDetails.societyApartments",
                            as: "apartment",
                            cond: {
                                $and: [
                                    { $eq: ["$$apartment.societyBlock", user.societyBlock] },
                                    { $eq: ["$$apartment.apartment", user.apartment] },
                                    { $eq: ["$$apartment.entryStatus.status", 'rejected'] },
                                ],
                            },
                        },
                    },
                },
            },
        },
    ]);


    if (deliveryEntry.length <= 0) {
        throw new ApiError(500, "There is no entry");
    }

    return res.status(200).json(
        new ApiResponse(200, deliveryEntry, "Denied entries fetched successfully.")
    );
});

function getEntryStatus(data, societyBlock, apartment) {
    const apartments = data.societyDetails.societyApartments;
    const targetApartment = apartments.find(
        (apartmentInfo) =>
            apartmentInfo.societyBlock === societyBlock &&
            apartmentInfo.apartment === apartment
    );

    if (targetApartment) {
        return targetApartment.entryStatus.status;
    } else {
        return "Not found";
    }
}

export {
    addDeliveryEntry,
    addDeliveryEntryStringImg,
    approveDelivery,
    rejectDelivery,
    waitingForResidentApprovalEntries,
    allowDeliveryBySecurity,
    denyDeliveryBySecurity,
    getDeliveryAllowedEntries,
    exitEntry,
    getDeliveryServiceRequest,
    getCurrentDeliveryEntries,
    getPastDeliveryEntries,
    getDeniedDeliveryEntries,
}