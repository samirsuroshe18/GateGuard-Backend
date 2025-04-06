import asyncHandler from '../utils/asynchandler.js';
import ApiError from '../utils/ApiError.js';
import ApiResponse from '../utils/ApiResponse.js';
import { DeliveryEntry } from '../models/deliveryEntry.model.js';
import { ProfileVerification } from '../models/profileVerification.model.js';
import { sendNotification, sendNotificationCancel } from '../utils/sendResidentNotification.js';
import { User } from '../models/user.model.js';
import mongoose from 'mongoose'
import { generateNotificationId } from '../utils/generateCheckInCode.js';
import { PreApproved } from '../models/preApproved.model.js';
import { uploadOnCloudinary } from '../utils/cloudinary.js';

const addDeliveryEntry = asyncHandler(async (req, res) => {
    const { name, mobNumber, companyName, companyLogo, serviceName, serviceLogo, accompanyingGuest, vehicleDetails, entryType, societyDetails } = req.body;

    if (!req.file) {
        throw new ApiError(400, "File is missing");
    }

    const profileImg = await uploadOnCloudinary(req.file.path);

    if (!profileImg.secure_url) {
        throw new ApiError(400, "Error while uploading on avatar");
    }

    const results = await ProfileVerification.find({
        residentStatus: 'approve',
        societyName: JSON.parse(societyDetails).societyName,
        $or: JSON.parse(societyDetails).societyApartments
    }).populate('user', 'FCMToken');

    const fcmToken = results
        .map(item => item.user?.FCMToken) // Use optional chaining in case user is null
        .filter(token => !!token); // Remove undefined/null tokens

    if (fcmToken.length <= 0) {
        throw new ApiError(500, "No resident found or apartment is vacant");
    }

    // Iterate through societyApartments and add members
    const updatedApartments = await Promise.all(
        JSON.parse(societyDetails)?.societyApartments.map(async (apartment) => {
            // Query ProfileVerification model to find members matching the criteria
            const members = await ProfileVerification.find({
                societyName: JSON.parse(societyDetails).societyName,
                societyBlock: apartment.societyBlock,
                apartment: apartment.apartment,
            }).populate('user');

            const filteredData = members.map(item => {
                return {
                    _id: item.user._id,
                    email: item.user.email,
                    userName: item.user.userName,
                    phoneNo: item.user.phoneNo,
                    profile: item.user.profile
                };
            });

            // Return updated apartment object
            return {
                ...apartment,
                members: filteredData,
            };
        })
    );

    // Update societyDetails with the modified societyApartments array
    JSON.parse(societyDetails).societyApartments = updatedApartments;

    const deliveryEntry = await DeliveryEntry.create({
        name,
        mobNumber,
        profileImg: profileImg?.secure_url || '',
        companyName,
        companyLogo,
        serviceName,
        serviceLogo,
        accompanyingGuest,
        entryType,
        vehicleDetails: JSON.parse(vehicleDetails),
        societyDetails: JSON.parse(societyDetails),
        notificationId: generateNotificationId(),
        guardStatus: {
            guard: req.user._id,
        },
    });

    const createddeliveryEntry = await DeliveryEntry.findById(deliveryEntry._id);

    if (!createddeliveryEntry) {
        throw new ApiError(500, "Something went wrong");
    }

    var payload = {
        id: createddeliveryEntry._id,
        name,
        mobNumber,
        profileImg: createddeliveryEntry.profileImg,
        companyName,
        companyLogo,
        serviceName,
        serviceLogo,
        accompanyingGuest,
        entryType,
        vehicleDetails: createddeliveryEntry.vehicleDetails,
        societyDetails: createddeliveryEntry.societyDetails,
        notificationId: createddeliveryEntry.notificationId,
        action: 'VERIFY_DELIVERY_ENTRY'
    };

    fcmToken.forEach(token => {
        sendNotification(token, payload.action, JSON.stringify(payload));
    });

    return res.status(200).json(
        new ApiResponse(200, {}, "Delivery Approval request send successfully.")
    );
});

const addDeliveryEntryStringImg = asyncHandler(async (req, res) => {
    const { name, mobNumber, profileImg, companyName, companyLogo, serviceName, serviceLogo, accompanyingGuest, vehicleDetails, entryType, societyDetails } = req.body;

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

    // Iterate through societyApartments and add members
    const updatedApartments = await Promise.all(
        societyDetails?.societyApartments.map(async (apartment) => {
            // Query ProfileVerification model to find members matching the criteria
            const members = await ProfileVerification.find({
                societyName: societyDetails.societyName,
                societyBlock: apartment.societyBlock,
                apartment: apartment.apartment,
            }).populate('user');

            const filteredData = members.map(item => {
                return {
                    _id: item.user._id,
                    email: item.user.email,
                    userName: item.user.userName,
                    phoneNo: item.user.phoneNo,
                    profile: item.user.profile
                };
            });
            // Return updated apartment object
            return {
                ...apartment,
                members: filteredData,
            };
        })
    );

    // Update societyDetails with the modified societyApartments array
    societyDetails.societyApartments = updatedApartments;

    const deliveryEntry = await DeliveryEntry.create({
        name,
        mobNumber,
        profileImg,
        companyName,
        companyLogo,
        serviceName,
        serviceLogo,
        accompanyingGuest,
        entryType,
        vehicleDetails,
        societyDetails,
        notificationId: generateNotificationId(),
        guardStatus: {
            guard: req.user._id,
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
        companyName,
        companyLogo,
        serviceName,
        serviceLogo,
        accompanyingGuest,
        entryType,
        vehicleDetails,
        societyDetails,
        notificationId: createddeliveryEntry.notificationId,
        action: 'VERIFY_DELIVERY_ENTRY'
    };

    FCMTokens.forEach((token) => {
        sendNotification(token, payload.action, JSON.stringify(payload));
    });

    return res.status(200).json(
        new ApiResponse(200, {}, "Delivery Approval request send successfully.")
    );
});

const waitingForResidentApprovalEntries = asyncHandler(async (req, res) => {
    const society = await ProfileVerification.findOne({ user: req.user._id, profileType: 'Security' });

    if (!society) {
        throw new ApiError(500, "You are not security guard");
    }

    const deliveryEntry = await DeliveryEntry.aggregate([
        {
            $match: {
                'societyDetails.societyName': society.societyName,
                'guardStatus.guard': req.user._id,
                'guardStatus.status': 'pending'
            }
        },
        {
            $lookup: {
                from: "users",
                let: { userId: "$guardStatus.guard" },
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
                        }
                    }
                ],
                as: "guardStatus.guard"
            }
        },
        {
            $unwind: {
                path: "$guardStatus.guard",
                preserveNullAndEmptyArrays: true
            }
        },
        // Unwind the societyApartments array
        {
            $unwind: {
                path: "$societyDetails.societyApartments",
                preserveNullAndEmptyArrays: true
            }
        },
        // Ensure that members field is projected correctly
        {
            $project: {
                _id: 1,
                name: 1,
                mobNumber: 1,
                profileImg: 1,
                companyName: 1,
                companyLogo: 1,
                serviceName: 1,
                serviceLogo: 1,
                vehicleDetails: 1,
                entryType: 1,
                guardStatus: 1,
                societyDetails: {
                    societyName: "$societyDetails.societyName",
                    societyGates: "$societyDetails.societyGates",
                    societyApartments: {
                        societyBlock: "$societyDetails.societyApartments.societyBlock",
                        apartment: "$societyDetails.societyApartments.apartment",
                        entryStatus: "$societyDetails.societyApartments.entryStatus",
                        members: "$societyDetails.societyApartments.members", // Ensure members field is included
                    }
                },
            }
        },
        {
            $lookup: {
                from: "users",
                let: { approvedById: "$societyDetails.societyApartments.entryStatus.approvedBy" },
                pipeline: [
                    {
                        $match: {
                            $expr: { $eq: ["$_id", "$$approvedById"] }
                        }
                    },
                    {
                        $project: {
                            _id: 1,
                            userName: 1,
                            email: 1
                        }
                    }
                ],
                as: "societyDetails.societyApartments.entryStatus.approvedBy"
            }
        },
        {
            $unwind: {
                path: "$societyDetails.societyApartments.entryStatus.approvedBy",
                preserveNullAndEmptyArrays: true
            }
        },
        {
            $lookup: {
                from: "users",
                let: { rejectedById: "$societyDetails.societyApartments.entryStatus.rejectedBy" },
                pipeline: [
                    {
                        $match: {
                            $expr: { $eq: ["$_id", "$$rejectedById"] }
                        }
                    },
                    {
                        $project: {
                            _id: 1,
                            userName: 1,
                            email: 1
                        }
                    }
                ],
                as: "societyDetails.societyApartments.entryStatus.rejectedBy"
            }
        },
        {
            $unwind: {
                path: "$societyDetails.societyApartments.entryStatus.rejectedBy",
                preserveNullAndEmptyArrays: true
            }
        },
        {
            $group: {
                _id: {
                    id: "$_id",
                    societyName: "$societyDetails.societyName",
                    societyGates: "$societyDetails.societyGates"
                },
                societyApartments: { $push: "$societyDetails.societyApartments" },
                name: { $first: "$name" },
                mobNumber: { $first: "$mobNumber" },
                profileImg: { $first: "$profileImg" },
                companyName: { $first: "$companyName" },
                companyLogo: { $first: "$companyLogo" },
                serviceName: { $first: "$serviceName" },
                serviceLogo: { $first: "$serviceLogo" },
                vehicleDetails: { $first: "$vehicleDetails" },
                entryType: { $first: "$entryType" },
                guardStatus: { $first: "$guardStatus" },
                entryTime: { $first: "$entryTime" },
                exitTime: { $first: "$exitTime" },
                notificationId: { $first: "$notificationId" },
                hasExited: { $first: "$hasExited" }
            }
        },
        {
            $project: {
                _id: "$_id.id",
                name: 1,
                mobNumber: 1,
                profileImg: 1,
                companyName: 1,
                companyLogo: 1,
                serviceName: 1,
                serviceLogo: 1,
                vehicleDetails: 1,
                entryType: 1,
                guardStatus: 1,
                entryTime: 1,
                exitTime: 1,
                notificationId: 1,
                hasExited: 1,
                societyDetails: {
                    societyName: "$_id.societyName",
                    societyGates: "$_id.societyGates",
                    societyApartments: "$societyApartments"
                },
            }
        }
    ]);

    if (deliveryEntry.length <= 0) {
        throw new ApiError(500, "There is no waiting requests.");
    }

    return res.status(200).json(
        new ApiResponse(200, deliveryEntry, "Delivery waiting request fetched successfully.")
    );
});

const getDeliveryServiceRequest = asyncHandler(async (req, res) => {
    const user = await ProfileVerification.findOne({ user: req.user._id });

    const result = await DeliveryEntry.aggregate([
        {
            $match: {
                "societyDetails.societyName": user.societyName,
                'societyDetails.societyApartments': {
                    $elemMatch: {
                        societyBlock: user.societyBlock,
                        apartment: user.apartment,
                        'entryStatus.status': 'pending'
                    }
                },
            },
        },
        {
            $lookup: {
                from: "users",
                let: { userId: "$guardStatus.guard" },
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
                        }
                    }
                ],
                as: "guardStatus.guard"
            }
        },
        {
            $unwind: {
                path: "$guardStatus.guard",
                preserveNullAndEmptyArrays: true
            }
        },
        // Unwind the societyApartments array
        {
            $unwind: {
                path: "$societyDetails.societyApartments",
                preserveNullAndEmptyArrays: true
            }
        },
        {
            $lookup: {
                from: "users",
                let: { approvedById: "$societyDetails.societyApartments.entryStatus.approvedBy" },
                pipeline: [
                    {
                        $match: {
                            $expr: { $eq: ["$_id", "$$approvedById"] }
                        }
                    },
                    {
                        $project: {
                            _id: 1,
                            userName: 1,
                            email: 1
                        }
                    }
                ],
                as: "societyDetails.societyApartments.entryStatus.approvedBy"
            }
        },
        {
            $unwind: {
                path: "$societyDetails.societyApartments.entryStatus.approvedBy",
                preserveNullAndEmptyArrays: true
            }
        },
        {
            $lookup: {
                from: "users",
                let: { rejectedById: "$societyDetails.societyApartments.entryStatus.rejectedBy" },
                pipeline: [
                    {
                        $match: {
                            $expr: { $eq: ["$_id", "$$rejectedById"] }
                        }
                    },
                    {
                        $project: {
                            _id: 1,
                            userName: 1,
                            email: 1
                        }
                    }
                ],
                as: "societyDetails.societyApartments.entryStatus.rejectedBy"
            }
        },
        {
            $unwind: {
                path: "$societyDetails.societyApartments.entryStatus.rejectedBy",
                preserveNullAndEmptyArrays: true
            }
        },
        // Rebuild societyApartments array
        {
            $group: {
                _id: {
                    id: "$_id", // group by document ID
                    societyName: "$societyDetails.societyName",
                    societyGates: "$societyDetails.societyGates"
                },
                societyApartments: { $push: "$societyDetails.societyApartments" }, // rebuild the array
                name: { $first: "$name" },
                mobNumber: { $first: "$mobNumber" },
                profileImg: { $first: "$profileImg" },
                companyName: { $first: "$companyName" },
                companyLogo: { $first: "$companyLogo" },
                serviceName: { $first: "$serviceName" },
                serviceLogo: { $first: "$serviceLogo" },
                vehicleDetails: { $first: "$vehicleDetails" },
                entryType: { $first: "$entryType" },
                guardStatus: { $first: "$guardStatus" },
                entryTime: { $first: "$entryTime" },
                exitTime: { $first: "$exitTime" },
                notificationId: { $first: "$notificationId" },
                hasExited: { $first: "$hasExited" }
            }
        },
        // Rebuild societyDetails field
        {
            $project: {
                _id: "$_id.id",
                name: 1,
                mobNumber: 1,
                profileImg: 1,
                companyName: 1,
                companyLogo: 1,
                serviceName: 1,
                serviceLogo: 1,
                vehicleDetails: 1,
                entryType: 1,
                guardStatus: 1,
                societyDetails: {
                    societyName: "$_id.societyName",
                    societyGates: "$_id.societyGates",
                    societyApartments: "$societyApartments"
                },
                entryTime: 1,
                exitTime: 1,
                notificationId: 1,
                hasExited: 1
            }
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
                serviceName: 1,
                serviceLogo: 1,
                vehicleDetails: 1,
                entryType: 1,
                entryTime: 1,
                exitTime: 1,
                hasExited: 1,
                notificationId: 1,
                societyDetails: {
                    societyName: "$societyDetails.societyName",
                    societyGates: "$societyDetails.societyGates",
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

    if (result.length <= 0) {
        throw new ApiError(500, "No entry is arrived");
    }

    return res.status(200).json(
        new ApiResponse(200, result[0], "You got an entry")
    );
});

const getDeliveryAllowedEntries = asyncHandler(async (req, res) => {
    const user = await ProfileVerification.findOne({ user: req.user._id });

    if (!user) {
        throw new ApiError(500, "No resident found");
    }

    const deliveryEntry = await DeliveryEntry.aggregate([
        {
            $match: {
                "societyDetails.societyName": user.societyName,
                'guardStatus.status': 'approve',
                hasExited: false,
            },
        },
        {
            $lookup: {
                from: "users",
                let: { userId: "$guardStatus.guard" },
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
                        }
                    }
                ],
                as: "guardStatus.guard"
            }
        },
        {
            $unwind: {
                path: "$guardStatus.guard",
                preserveNullAndEmptyArrays: true
            }
        },
        // Unwind the societyApartments array
        {
            $unwind: {
                path: "$societyDetails.societyApartments",
                preserveNullAndEmptyArrays: true
            }
        },
        {
            $lookup: {
                from: "users",
                let: { approvedById: "$societyDetails.societyApartments.entryStatus.approvedBy" },
                pipeline: [
                    {
                        $match: {
                            $expr: { $eq: ["$_id", "$$approvedById"] }
                        }
                    },
                    {
                        $project: {
                            _id: 1,
                            userName: 1,
                            email: 1
                        }
                    }
                ],
                as: "societyDetails.societyApartments.entryStatus.approvedBy"
            }
        },
        {
            $unwind: {
                path: "$societyDetails.societyApartments.entryStatus.approvedBy",
                preserveNullAndEmptyArrays: true
            }
        },
        {
            $lookup: {
                from: "users",
                let: { rejectedById: "$societyDetails.societyApartments.entryStatus.rejectedBy" },
                pipeline: [
                    {
                        $match: {
                            $expr: { $eq: ["$_id", "$$rejectedById"] }
                        }
                    },
                    {
                        $project: {
                            _id: 1,
                            userName: 1,
                            email: 1
                        }
                    }
                ],
                as: "societyDetails.societyApartments.entryStatus.rejectedBy"
            }
        },
        {
            $unwind: {
                path: "$societyDetails.societyApartments.entryStatus.rejectedBy",
                preserveNullAndEmptyArrays: true
            }
        },
        // Rebuild societyApartments array
        {
            $group: {
                _id: {
                    id: "$_id", // group by document ID
                    societyName: "$societyDetails.societyName",
                    societyGates: "$societyDetails.societyGates"
                },
                societyApartments: { $push: "$societyDetails.societyApartments" }, // rebuild the array
                name: { $first: "$name" },
                mobNumber: { $first: "$mobNumber" },
                profileImg: { $first: "$profileImg" },
                companyName: { $first: "$companyName" },
                companyLogo: { $first: "$companyLogo" },
                vehicleDetails: { $first: "$vehicleDetails" },
                entryType: { $first: "$entryType" },
                guardStatus: { $first: "$guardStatus" },
                entryTime: { $first: "$entryTime" },
                exitTime: { $first: "$exitTime" },
                notificationId: { $first: "$notificationId" },
                hasExited: { $first: "$hasExited" }
            }
        },
        // Rebuild societyDetails field
        {
            $project: {
                _id: "$_id.id",
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
                    societyName: "$_id.societyName",
                    societyGates: "$_id.societyGates",
                    societyApartments: "$societyApartments"
                },
            },
        },
    ]);

    const preApprovedEntry = await PreApproved.aggregate([
        {
            $match: {
                'allowedBy.status': 'approve',
                hasExited: false,
                societyName: user.societyName,
            },
        },
        {
            $lookup: {
                from: "users",
                let: { userId: "$approvedBy.user" },
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
                        }
                    }
                ],
                as: "approvedBy.user"
            }
        },
        {
            $unwind: {
                path: "$approvedBy.user",
                preserveNullAndEmptyArrays: true
            }
        },
        {
            $lookup: {
                from: "users",
                let: { userId: "$allowedBy.user" },
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
                        }
                    }
                ],
                as: "allowedBy.user"
            }
        },
        {
            $unwind: {
                path: "$allowedBy.user",
                preserveNullAndEmptyArrays: true
            }
        },
        {
            $project: {
                allowedBy: 1,
                approvedBy: 1,
                name: 1,
                mobNumber: 1,
                profileImg: 1,
                companyName: 1,
                companyLogo: 1,
                serviceName: 1,
                serviceLogo: 1,
                vehicleDetails: 1,
                profileType: 1,
                entryType: 1,
                societyName: 1,
                blockName: 1,
                apartment: 1,
                gatepassAptDetails: 1,
                gateName: 1,
                entryTime: 1,
                exitTime: 1,
                hasExited: 1,
            },
        },
    ]);

    const response = [...deliveryEntry, ...preApprovedEntry];

    if (response.length <= 0) {
        throw new ApiError(500, "There is no entry");
    }

    return res.status(200).json(
        new ApiResponse(200, response, "Allowed delivery fetched successfully.")
    );
});

const approveDelivery = asyncHandler(async (req, res) => {
    const { id } = req.body;
    const user = await User.findById(req.user._id);
    const deliveryId = mongoose.Types.ObjectId.createFromHexString(id);
    const delivery = await DeliveryEntry.findById(deliveryId).populate('guardStatus.guard', 'FCMToken');

    if (!delivery) {
        throw new ApiError(500, "Invalid id");
    }

    const society = await ProfileVerification.findOne({ user: req.user._id });

    if (!society) {
        throw new ApiError(500, "Invalid user");
    }

    const profile = await ProfileVerification.aggregate([
        {
            $match: {
                residentStatus: 'approve',
                societyName: society.societyName,
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
                "societyDetails.societyApartments.$[elem].entryStatus.approvedBy": req.user._id,
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

    FCMTokens.forEach((token) => {
        sendNotificationCancel(token, JSON.stringify(cancelPayload));
    });

    let payload = {
        userName: user.userName,
        deliveryName: delivery.name,
        companyName: delivery.companyName,
        action: 'DELIVERY_ENTRY_APPROVE'
    };

    let payload2 = {
        userName: user.userName,
        deliveryName: delivery.name,
        companyName: delivery.companyName,
        action: 'NOTIFY_GUARD_APPROVE'
    };

    FCMTokens.forEach((token) => {
        sendNotification(token, payload.action, JSON.stringify(payload));
    });

    sendNotification(delivery.guardStatus.guard.FCMToken, payload2.action, JSON.stringify(payload2));

    return res.status(200).json(
        new ApiResponse(200, {}, "Delivery Approved successfully.")
    );
});

const rejectDelivery = asyncHandler(async (req, res) => {
    const { id } = req.body;
    const user = await User.findById(req.user._id);
    const deliveryId = mongoose.Types.ObjectId.createFromHexString(id);
    const delivery = await DeliveryEntry.findById(deliveryId).populate('guardStatus.guard', 'FCMToken');

    if (!delivery) {
        throw new ApiError(500, "Invalid id");
    }

    const society = await ProfileVerification.findOne({ user: req.user._id });

    if (!society) {
        throw new ApiError(500, "Invalid user");
    }

    const profile = await ProfileVerification.aggregate([
        {
            $match: {
                residentStatus: 'approve',
                societyName: society.societyName,
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
                "societyDetails.societyApartments.$[elem].entryStatus.rejectedBy": req.user._id,
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

    let payload2 = {
        userName: user.userName,
        deliveryName: delivery.name,
        companyName: delivery.companyName,
        action: 'NOTIFY_GUARD_REJECTED'
    };

    FCMTokens.forEach(token => {
        sendNotification(token, payload.action, JSON.stringify(payload));
    });

    sendNotification(delivery.guardStatus.guard.FCMToken, payload2.action, JSON.stringify(payload2));

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

    const pendingApartments = delivery.societyDetails.societyApartments.filter((apartment) => apartment.entryStatus.status === 'approve' || apartment.entryStatus.status === 'rejected');

    if (pendingApartments.length <= 0) {
        throw new ApiError(500, "Wait for resident response");
    }

    delivery.guardStatus.status = 'approve';
    delivery.guardStatus.guard = req.user._id;
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
    delivery.guardStatus.guard = req.user._id;
    delivery.hasExited = true;
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
    const delivery = await DeliveryEntry.findById(deliveryId).populate({
        path: 'societyDetails.societyApartments.entryStatus.approvedBy',
        select: 'FCMToken',
    });

    if (!delivery) {
        throw new ApiError(500, "Invalid id");
    }

    delivery.hasExited = true;
    delivery.exitTime = new Date();
    const result = await delivery.save({ validateBeforeSave: false });

    if (!result) {
        throw new ApiError(500, "Something went wrong");
    }

    const fcm = delivery.societyDetails.societyApartments.filter(item => item.entryStatus.status === 'approve').map(item => item.entryStatus.approvedBy.FCMToken);

    let payload = {
        deliveryName: delivery.name,
        companyName: delivery.companyName,
        action: 'NOTIFY_EXIT_ENTRY'
    };

    fcm.forEach(token => {
        sendNotification(token, payload.action, JSON.stringify(payload));
    });

    return res.status(200).json(
        new ApiResponse(200, {}, "Delivery exited successfully.")
    );
});

// For Security 

const getGuestEntries = asyncHandler(async (req, res) => {
    const user = await ProfileVerification.findOne({ user: req.user._id });

    if (!user) {
        throw new ApiError(500, "No resident found");
    }

    const deliveryEntry = await DeliveryEntry.aggregate([
        {
            $match: {
                "societyDetails.societyName": user.societyName,
                'guardStatus.status': 'approve',
                entryType: 'guest',
                hasExited: false,
            },
        },
        {
            $lookup: {
                from: "users",
                let: { userId: "$guardStatus.guard" },
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
                        }
                    }
                ],
                as: "guardStatus.guard"
            }
        },
        {
            $unwind: {
                path: "$guardStatus.guard",
                preserveNullAndEmptyArrays: true
            }
        },
        // Unwind the societyApartments array
        {
            $unwind: {
                path: "$societyDetails.societyApartments",
                preserveNullAndEmptyArrays: true
            }
        },
        {
            $lookup: {
                from: "users",
                let: { approvedById: "$societyDetails.societyApartments.entryStatus.approvedBy" },
                pipeline: [
                    {
                        $match: {
                            $expr: { $eq: ["$_id", "$$approvedById"] }
                        }
                    },
                    {
                        $project: {
                            _id: 1,
                            userName: 1,
                            email: 1
                        }
                    }
                ],
                as: "societyDetails.societyApartments.entryStatus.approvedBy"
            }
        },
        {
            $unwind: {
                path: "$societyDetails.societyApartments.entryStatus.approvedBy",
                preserveNullAndEmptyArrays: true
            }
        },
        {
            $lookup: {
                from: "users",
                let: { rejectedById: "$societyDetails.societyApartments.entryStatus.rejectedBy" },
                pipeline: [
                    {
                        $match: {
                            $expr: { $eq: ["$_id", "$$rejectedById"] }
                        }
                    },
                    {
                        $project: {
                            _id: 1,
                            userName: 1,
                            email: 1
                        }
                    }
                ],
                as: "societyDetails.societyApartments.entryStatus.rejectedBy"
            }
        },
        {
            $unwind: {
                path: "$societyDetails.societyApartments.entryStatus.rejectedBy",
                preserveNullAndEmptyArrays: true
            }
        },
        // Rebuild societyApartments array
        {
            $group: {
                _id: {
                    id: "$_id", // group by document ID
                    societyName: "$societyDetails.societyName",
                    societyGates: "$societyDetails.societyGates"
                },
                societyApartments: { $push: "$societyDetails.societyApartments" }, // rebuild the array
                name: { $first: "$name" },
                mobNumber: { $first: "$mobNumber" },
                profileImg: { $first: "$profileImg" },
                companyName: { $first: "$companyName" },
                companyLogo: { $first: "$companyLogo" },
                vehicleDetails: { $first: "$vehicleDetails" },
                entryType: { $first: "$entryType" },
                guardStatus: { $first: "$guardStatus" },
                entryTime: { $first: "$entryTime" },
                exitTime: { $first: "$exitTime" },
                notificationId: { $first: "$notificationId" },
                hasExited: { $first: "$hasExited" }
            }
        },
        // Rebuild societyDetails field
        {
            $project: {
                _id: "$_id.id",
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
                    societyName: "$_id.societyName",
                    societyGates: "$_id.societyGates",
                    societyApartments: "$societyApartments"
                },
            },
        },
    ]);

    const preApprovedEntry = await PreApproved.aggregate([
        {
            $match: {
                'allowedBy.status': 'approve',
                hasExited: false,
                entryType: 'guest',
                societyName: user.societyName,
            },
        },
        {
            $lookup: {
                from: "users",
                let: { userId: "$approvedBy.user" },
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
                        }
                    }
                ],
                as: "approvedBy.user"
            }
        },
        {
            $unwind: {
                path: "$approvedBy.user",
                preserveNullAndEmptyArrays: true
            }
        },
        {
            $lookup: {
                from: "users",
                let: { userId: "$allowedBy.user" },
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
                        }
                    }
                ],
                as: "allowedBy.user"
            }
        },
        {
            $unwind: {
                path: "$allowedBy.user",
                preserveNullAndEmptyArrays: true
            }
        },
        {
            $project: {
                allowedBy: 1,
                approvedBy: 1,
                name: 1,
                mobNumber: 1,
                profileImg: 1,
                companyName: 1,
                companyLogo: 1,
                serviceName: 1,
                serviceLogo: 1,
                vehicleDetails: 1,
                profileType: 1,
                entryType: 1,
                societyName: 1,
                blockName: 1,
                apartment: 1,
                gateName: 1,
                entryTime: 1,
                exitTime: 1,
                hasExited: 1,
            },
        },
    ]);

    const response = [...deliveryEntry, ...preApprovedEntry];

    if (response.length <= 0) {
        throw new ApiError(500, "There is no entry");
    }

    return res.status(200).json(
        new ApiResponse(200, response, "Allowed delivery fetched successfully.")
    );
});

const getDeliveryEntries = asyncHandler(async (req, res) => {
    const user = await ProfileVerification.findOne({ user: req.user._id });

    if (!user) {
        throw new ApiError(500, "No resident found");
    }

    const deliveryEntry = await DeliveryEntry.aggregate([
        {
            $match: {
                "societyDetails.societyName": user.societyName,
                'guardStatus.status': 'approve',
                entryType: 'delivery',
                hasExited: false,
            },
        },
        {
            $lookup: {
                from: "users",
                let: { userId: "$guardStatus.guard" },
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
                        }
                    }
                ],
                as: "guardStatus.guard"
            }
        },
        {
            $unwind: {
                path: "$guardStatus.guard",
                preserveNullAndEmptyArrays: true
            }
        },
        // Unwind the societyApartments array
        {
            $unwind: {
                path: "$societyDetails.societyApartments",
                preserveNullAndEmptyArrays: true
            }
        },
        {
            $lookup: {
                from: "users",
                let: { approvedById: "$societyDetails.societyApartments.entryStatus.approvedBy" },
                pipeline: [
                    {
                        $match: {
                            $expr: { $eq: ["$_id", "$$approvedById"] }
                        }
                    },
                    {
                        $project: {
                            _id: 1,
                            userName: 1,
                            email: 1
                        }
                    }
                ],
                as: "societyDetails.societyApartments.entryStatus.approvedBy"
            }
        },
        {
            $unwind: {
                path: "$societyDetails.societyApartments.entryStatus.approvedBy",
                preserveNullAndEmptyArrays: true
            }
        },
        {
            $lookup: {
                from: "users",
                let: { rejectedById: "$societyDetails.societyApartments.entryStatus.rejectedBy" },
                pipeline: [
                    {
                        $match: {
                            $expr: { $eq: ["$_id", "$$rejectedById"] }
                        }
                    },
                    {
                        $project: {
                            _id: 1,
                            userName: 1,
                            email: 1
                        }
                    }
                ],
                as: "societyDetails.societyApartments.entryStatus.rejectedBy"
            }
        },
        {
            $unwind: {
                path: "$societyDetails.societyApartments.entryStatus.rejectedBy",
                preserveNullAndEmptyArrays: true
            }
        },
        // Rebuild societyApartments array
        {
            $group: {
                _id: {
                    id: "$_id", // group by document ID
                    societyName: "$societyDetails.societyName",
                    societyGates: "$societyDetails.societyGates"
                },
                societyApartments: { $push: "$societyDetails.societyApartments" }, // rebuild the array
                name: { $first: "$name" },
                mobNumber: { $first: "$mobNumber" },
                profileImg: { $first: "$profileImg" },
                companyName: { $first: "$companyName" },
                companyLogo: { $first: "$companyLogo" },
                vehicleDetails: { $first: "$vehicleDetails" },
                entryType: { $first: "$entryType" },
                guardStatus: { $first: "$guardStatus" },
                entryTime: { $first: "$entryTime" },
                exitTime: { $first: "$exitTime" },
                notificationId: { $first: "$notificationId" },
                hasExited: { $first: "$hasExited" }
            }
        },
        // Rebuild societyDetails field
        {
            $project: {
                _id: "$_id.id",
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
                    societyName: "$_id.societyName",
                    societyGates: "$_id.societyGates",
                    societyApartments: "$societyApartments"
                },
            },
        },
    ]);

    const preApprovedEntry = await PreApproved.aggregate([
        {
            $match: {
                'allowedBy.status': 'approve',
                hasExited: false,
                entryType: 'delivery',
                societyName: user.societyName,
            },
        },
        {
            $lookup: {
                from: "users",
                let: { userId: "$approvedBy.user" },
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
                        }
                    }
                ],
                as: "approvedBy.user"
            }
        },
        {
            $unwind: {
                path: "$approvedBy.user",
                preserveNullAndEmptyArrays: true
            }
        },
        {
            $lookup: {
                from: "users",
                let: { userId: "$allowedBy.user" },
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
                        }
                    }
                ],
                as: "allowedBy.user"
            }
        },
        {
            $unwind: {
                path: "$allowedBy.user",
                preserveNullAndEmptyArrays: true
            }
        },
        {
            $project: {
                allowedBy: 1,
                approvedBy: 1,
                name: 1,
                mobNumber: 1,
                profileImg: 1,
                companyName: 1,
                companyLogo: 1,
                serviceName: 1,
                serviceLogo: 1,
                vehicleDetails: 1,
                profileType: 1,
                entryType: 1,
                societyName: 1,
                blockName: 1,
                apartment: 1,
                gateName: 1,
                entryTime: 1,
                exitTime: 1,
                hasExited: 1,
            },
        },
    ]);

    const response = [...deliveryEntry, ...preApprovedEntry];

    if (response.length <= 0) {
        throw new ApiError(500, "There is no entry");
    }

    return res.status(200).json(
        new ApiResponse(200, response, "Allowed delivery fetched successfully.")
    );
});

const getCabEntries = asyncHandler(async (req, res) => {
    const user = await ProfileVerification.findOne({ user: req.user._id });

    if (!user) {
        throw new ApiError(500, "No resident found");
    }

    const deliveryEntry = await DeliveryEntry.aggregate([
        {
            $match: {
                "societyDetails.societyName": user.societyName,
                'guardStatus.status': 'approve',
                entryType: 'cab',
                hasExited: false,
            },
        },
        {
            $lookup: {
                from: "users",
                let: { userId: "$guardStatus.guard" },
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
                        }
                    }
                ],
                as: "guardStatus.guard"
            }
        },
        {
            $unwind: {
                path: "$guardStatus.guard",
                preserveNullAndEmptyArrays: true
            }
        },
        // Unwind the societyApartments array
        {
            $unwind: {
                path: "$societyDetails.societyApartments",
                preserveNullAndEmptyArrays: true
            }
        },
        {
            $lookup: {
                from: "users",
                let: { approvedById: "$societyDetails.societyApartments.entryStatus.approvedBy" },
                pipeline: [
                    {
                        $match: {
                            $expr: { $eq: ["$_id", "$$approvedById"] }
                        }
                    },
                    {
                        $project: {
                            _id: 1,
                            userName: 1,
                            email: 1
                        }
                    }
                ],
                as: "societyDetails.societyApartments.entryStatus.approvedBy"
            }
        },
        {
            $unwind: {
                path: "$societyDetails.societyApartments.entryStatus.approvedBy",
                preserveNullAndEmptyArrays: true
            }
        },
        {
            $lookup: {
                from: "users",
                let: { rejectedById: "$societyDetails.societyApartments.entryStatus.rejectedBy" },
                pipeline: [
                    {
                        $match: {
                            $expr: { $eq: ["$_id", "$$rejectedById"] }
                        }
                    },
                    {
                        $project: {
                            _id: 1,
                            userName: 1,
                            email: 1
                        }
                    }
                ],
                as: "societyDetails.societyApartments.entryStatus.rejectedBy"
            }
        },
        {
            $unwind: {
                path: "$societyDetails.societyApartments.entryStatus.rejectedBy",
                preserveNullAndEmptyArrays: true
            }
        },
        // Rebuild societyApartments array
        {
            $group: {
                _id: {
                    id: "$_id", // group by document ID
                    societyName: "$societyDetails.societyName",
                    societyGates: "$societyDetails.societyGates"
                },
                societyApartments: { $push: "$societyDetails.societyApartments" }, // rebuild the array
                name: { $first: "$name" },
                mobNumber: { $first: "$mobNumber" },
                profileImg: { $first: "$profileImg" },
                companyName: { $first: "$companyName" },
                companyLogo: { $first: "$companyLogo" },
                vehicleDetails: { $first: "$vehicleDetails" },
                entryType: { $first: "$entryType" },
                guardStatus: { $first: "$guardStatus" },
                entryTime: { $first: "$entryTime" },
                exitTime: { $first: "$exitTime" },
                notificationId: { $first: "$notificationId" },
                hasExited: { $first: "$hasExited" }
            }
        },
        // Rebuild societyDetails field
        {
            $project: {
                _id: "$_id.id",
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
                    societyName: "$_id.societyName",
                    societyGates: "$_id.societyGates",
                    societyApartments: "$societyApartments"
                },
            },
        },
    ]);

    const preApprovedEntry = await PreApproved.aggregate([
        {
            $match: {
                'allowedBy.status': 'approve',
                hasExited: false,
                entryType: 'cab',
                societyName: user.societyName,
            },
        },
        {
            $lookup: {
                from: "users",
                let: { userId: "$approvedBy.user" },
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
                        }
                    }
                ],
                as: "approvedBy.user"
            }
        },
        {
            $unwind: {
                path: "$approvedBy.user",
                preserveNullAndEmptyArrays: true
            }
        },
        {
            $lookup: {
                from: "users",
                let: { userId: "$allowedBy.user" },
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
                        }
                    }
                ],
                as: "allowedBy.user"
            }
        },
        {
            $unwind: {
                path: "$allowedBy.user",
                preserveNullAndEmptyArrays: true
            }
        },
        {
            $project: {
                allowedBy: 1,
                approvedBy: 1,
                name: 1,
                mobNumber: 1,
                profileImg: 1,
                companyName: 1,
                companyLogo: 1,
                serviceName: 1,
                serviceLogo: 1,
                vehicleDetails: 1,
                profileType: 1,
                entryType: 1,
                societyName: 1,
                blockName: 1,
                apartment: 1,
                gateName: 1,
                entryTime: 1,
                exitTime: 1,
                hasExited: 1,
            },
        },
    ]);

    const response = [...deliveryEntry, ...preApprovedEntry];

    if (response.length <= 0) {
        throw new ApiError(500, "There is no entry");
    }

    return res.status(200).json(
        new ApiResponse(200, response, "Allowed delivery fetched successfully.")
    );
});

const getOtherEntries = asyncHandler(async (req, res) => {
    const user = await ProfileVerification.findOne({ user: req.user._id });

    if (!user) {
        throw new ApiError(500, "No resident found");
    }

    const deliveryEntry = await DeliveryEntry.aggregate([
        {
            $match: {
                "societyDetails.societyName": user.societyName,
                'guardStatus.status': 'approve',
                entryType: 'other',
                hasExited: false,
            },
        },
        {
            $lookup: {
                from: "users",
                let: { userId: "$guardStatus.guard" },
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
                        }
                    }
                ],
                as: "guardStatus.guard"
            }
        },
        {
            $unwind: {
                path: "$guardStatus.guard",
                preserveNullAndEmptyArrays: true
            }
        },
        // Unwind the societyApartments array
        {
            $unwind: {
                path: "$societyDetails.societyApartments",
                preserveNullAndEmptyArrays: true
            }
        },
        {
            $lookup: {
                from: "users",
                let: { approvedById: "$societyDetails.societyApartments.entryStatus.approvedBy" },
                pipeline: [
                    {
                        $match: {
                            $expr: { $eq: ["$_id", "$$approvedById"] }
                        }
                    },
                    {
                        $project: {
                            _id: 1,
                            userName: 1,
                            email: 1
                        }
                    }
                ],
                as: "societyDetails.societyApartments.entryStatus.approvedBy"
            }
        },
        {
            $unwind: {
                path: "$societyDetails.societyApartments.entryStatus.approvedBy",
                preserveNullAndEmptyArrays: true
            }
        },
        {
            $lookup: {
                from: "users",
                let: { rejectedById: "$societyDetails.societyApartments.entryStatus.rejectedBy" },
                pipeline: [
                    {
                        $match: {
                            $expr: { $eq: ["$_id", "$$rejectedById"] }
                        }
                    },
                    {
                        $project: {
                            _id: 1,
                            userName: 1,
                            email: 1
                        }
                    }
                ],
                as: "societyDetails.societyApartments.entryStatus.rejectedBy"
            }
        },
        {
            $unwind: {
                path: "$societyDetails.societyApartments.entryStatus.rejectedBy",
                preserveNullAndEmptyArrays: true
            }
        },
        // Rebuild societyApartments array
        {
            $group: {
                _id: {
                    id: "$_id", // group by document ID
                    societyName: "$societyDetails.societyName",
                    societyGates: "$societyDetails.societyGates"
                },
                societyApartments: { $push: "$societyDetails.societyApartments" }, // rebuild the array
                name: { $first: "$name" },
                mobNumber: { $first: "$mobNumber" },
                profileImg: { $first: "$profileImg" },
                companyName: { $first: "$companyName" },
                companyLogo: { $first: "$companyLogo" },
                vehicleDetails: { $first: "$vehicleDetails" },
                entryType: { $first: "$entryType" },
                guardStatus: { $first: "$guardStatus" },
                entryTime: { $first: "$entryTime" },
                exitTime: { $first: "$exitTime" },
                notificationId: { $first: "$notificationId" },
                hasExited: { $first: "$hasExited" }
            }
        },
        // Rebuild societyDetails field
        {
            $project: {
                _id: "$_id.id",
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
                    societyName: "$_id.societyName",
                    societyGates: "$_id.societyGates",
                    societyApartments: "$societyApartments"
                },
            },
        },
    ]);

    const preApprovedEntry = await PreApproved.aggregate([
        {
            $match: {
                'allowedBy.status': 'approve',
                hasExited: false,
                entryType: 'other',
                societyName: user.societyName,
            },
        },
        {
            $lookup: {
                from: "users",
                let: { userId: "$approvedBy.user" },
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
                        }
                    }
                ],
                as: "approvedBy.user"
            }
        },
        {
            $unwind: {
                path: "$approvedBy.user",
                preserveNullAndEmptyArrays: true
            }
        },
        {
            $lookup: {
                from: "users",
                let: { userId: "$allowedBy.user" },
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
                        }
                    }
                ],
                as: "allowedBy.user"
            }
        },
        {
            $unwind: {
                path: "$allowedBy.user",
                preserveNullAndEmptyArrays: true
            }
        },
        {
            $project: {
                allowedBy: 1,
                approvedBy: 1,
                name: 1,
                mobNumber: 1,
                profileImg: 1,
                companyName: 1,
                companyLogo: 1,
                serviceName: 1,
                serviceLogo: 1,
                vehicleDetails: 1,
                profileType: 1,
                entryType: 1,
                societyName: 1,
                blockName: 1,
                apartment: 1,
                gateName: 1,
                entryTime: 1,
                exitTime: 1,
                hasExited: 1,
            },
        },
    ]);

    const response = [...deliveryEntry, ...preApprovedEntry];

    if (response.length <= 0) {
        throw new ApiError(500, "There is no entry");
    }

    return res.status(200).json(
        new ApiResponse(200, response, "Allowed delivery fetched successfully.")
    );
});

const getCheckoutHistroy = asyncHandler(async (req, res) => {
    const user = await ProfileVerification.findOne({ user: req.user._id });

    const deliveryEntry = await DeliveryEntry.aggregate([
        {
            $match: {
                "societyDetails.societyName": user.societyName,
                hasExited: true,
            },
        },
        {
            $lookup: {
                from: "users",
                let: { userId: "$guardStatus.guard" },
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
                        }
                    }
                ],
                as: "guardStatus.guard"
            }
        },
        {
            $unwind: {
                path: "$guardStatus.guard",
                preserveNullAndEmptyArrays: true
            }
        },
        // Unwind the societyApartments array
        {
            $unwind: {
                path: "$societyDetails.societyApartments",
                preserveNullAndEmptyArrays: true
            }
        },
        {
            $lookup: {
                from: "users",
                let: { approvedById: "$societyDetails.societyApartments.entryStatus.approvedBy" },
                pipeline: [
                    {
                        $match: {
                            $expr: { $eq: ["$_id", "$$approvedById"] }
                        }
                    },
                    {
                        $project: {
                            _id: 1,
                            userName: 1,
                            email: 1
                        }
                    }
                ],
                as: "societyDetails.societyApartments.entryStatus.approvedBy"
            }
        },
        {
            $unwind: {
                path: "$societyDetails.societyApartments.entryStatus.approvedBy",
                preserveNullAndEmptyArrays: true
            }
        },
        {
            $lookup: {
                from: "users",
                let: { rejectedById: "$societyDetails.societyApartments.entryStatus.rejectedBy" },
                pipeline: [
                    {
                        $match: {
                            $expr: { $eq: ["$_id", "$$rejectedById"] }
                        }
                    },
                    {
                        $project: {
                            _id: 1,
                            userName: 1,
                            email: 1
                        }
                    }
                ],
                as: "societyDetails.societyApartments.entryStatus.rejectedBy"
            }
        },
        {
            $unwind: {
                path: "$societyDetails.societyApartments.entryStatus.rejectedBy",
                preserveNullAndEmptyArrays: true
            }
        },
        // Rebuild societyApartments array
        {
            $group: {
                _id: {
                    id: "$_id", // group by document ID
                    societyName: "$societyDetails.societyName",
                    societyGates: "$societyDetails.societyGates"
                },
                societyApartments: { $push: "$societyDetails.societyApartments" }, // rebuild the array
                name: { $first: "$name" },
                mobNumber: { $first: "$mobNumber" },
                profileImg: { $first: "$profileImg" },
                companyName: { $first: "$companyName" },
                companyLogo: { $first: "$companyLogo" },
                vehicleDetails: { $first: "$vehicleDetails" },
                entryType: { $first: "$entryType" },
                guardStatus: { $first: "$guardStatus" },
                entryTime: { $first: "$entryTime" },
                exitTime: { $first: "$exitTime" },
                notificationId: { $first: "$notificationId" },
                hasExited: { $first: "$hasExited" }
            }
        },
        // Rebuild societyDetails field
        {
            $project: {
                _id: "$_id.id",
                name: 1,
                mobNumber: 1,
                profileImg: 1,
                companyName: 1,
                companyLogo: 1,
                vehicleDetails: 1,
                entryType: 1,
                guardStatus: 1,
                societyDetails: {
                    societyName: "$_id.societyName",
                    societyGates: "$_id.societyGates",
                    societyApartments: "$societyApartments"
                },
                entryTime: 1,
                exitTime: 1,
                notificationId: 1,
                hasExited: 1
            }
        },
    ]);

    const preApprovedEntry = await PreApproved.aggregate([
        {
            $match: {
                'allowedBy.status': 'approve',
                hasExited: true,
                societyName: user.societyName,
                blockName: user.societyBlock,
                apartment: user.apartment,
            },
        },
        {
            $lookup: {
                from: "users",
                let: { userId: "$approvedBy.user" },
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
                        }
                    }
                ],
                as: "approvedBy.user"
            }
        },
        {
            $unwind: {
                path: "$approvedBy.user",
                preserveNullAndEmptyArrays: true
            }
        },
        {
            $lookup: {
                from: "users",
                let: { userId: "$allowedBy.user" },
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
                        }
                    }
                ],
                as: "allowedBy.user"
            }
        },
        {
            $unwind: {
                path: "$allowedBy.user",
                preserveNullAndEmptyArrays: true
            }
        },
        {
            $project: {
                allowedBy: 1,
                approvedBy: 1,
                name: 1,
                mobNumber: 1,
                profileImg: 1,
                companyName: 1,
                companyLogo: 1,
                serviceName: 1,
                serviceLogo: 1,
                vehicleDetails: 1,
                profileType: 1,
                entryType: 1,
                societyName: 1,
                blockName: 1,
                apartment: 1,
                entryTime: 1,
                exitTime: 1,
                hasExited: 1,
            },
        },
    ]);

    const response = [...deliveryEntry, ...preApprovedEntry];

    if (response.length <= 0) {
        throw new ApiError(500, "There is no entry");
    }

    return res.status(200).json(
        new ApiResponse(200, response, "Past entries fetched successfully.")
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
                'societyDetails.societyApartments': {
                    $elemMatch: {
                        societyBlock: user.societyBlock,
                        apartment: user.apartment,
                        'entryStatus.status': 'approve'
                    }
                },
                'guardStatus.status': 'approve',
                hasExited: false,
            },
        },
        {
            $lookup: {
                from: "users",
                let: { userId: "$guardStatus.guard" },
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
                        }
                    }
                ],
                as: "guardStatus.guard"
            }
        },
        {
            $unwind: {
                path: "$guardStatus.guard",
                preserveNullAndEmptyArrays: true
            }
        },
        // Unwind the societyApartments array
        {
            $unwind: {
                path: "$societyDetails.societyApartments",
                preserveNullAndEmptyArrays: true
            }
        },
        {
            $lookup: {
                from: "users",
                let: { approvedById: "$societyDetails.societyApartments.entryStatus.approvedBy" },
                pipeline: [
                    {
                        $match: {
                            $expr: { $eq: ["$_id", "$$approvedById"] }
                        }
                    },
                    {
                        $project: {
                            _id: 1,
                            userName: 1,
                            email: 1
                        }
                    }
                ],
                as: "societyDetails.societyApartments.entryStatus.approvedBy"
            }
        },
        {
            $unwind: {
                path: "$societyDetails.societyApartments.entryStatus.approvedBy",
                preserveNullAndEmptyArrays: true
            }
        },
        {
            $lookup: {
                from: "users",
                let: { rejectedById: "$societyDetails.societyApartments.entryStatus.rejectedBy" },
                pipeline: [
                    {
                        $match: {
                            $expr: { $eq: ["$_id", "$$rejectedById"] }
                        }
                    },
                    {
                        $project: {
                            _id: 1,
                            userName: 1,
                            email: 1
                        }
                    }
                ],
                as: "societyDetails.societyApartments.entryStatus.rejectedBy"
            }
        },
        {
            $unwind: {
                path: "$societyDetails.societyApartments.entryStatus.rejectedBy",
                preserveNullAndEmptyArrays: true
            }
        },
        // Rebuild societyApartments array
        {
            $group: {
                _id: {
                    id: "$_id", // group by document ID
                    societyName: "$societyDetails.societyName",
                    societyGates: "$societyDetails.societyGates"
                },
                societyApartments: { $push: "$societyDetails.societyApartments" }, // rebuild the array
                name: { $first: "$name" },
                mobNumber: { $first: "$mobNumber" },
                profileImg: { $first: "$profileImg" },
                companyName: { $first: "$companyName" },
                companyLogo: { $first: "$companyLogo" },
                vehicleDetails: { $first: "$vehicleDetails" },
                entryType: { $first: "$entryType" },
                guardStatus: { $first: "$guardStatus" },
                entryTime: { $first: "$entryTime" },
                exitTime: { $first: "$exitTime" },
                notificationId: { $first: "$notificationId" },
                hasExited: { $first: "$hasExited" }
            }
        },
        // Rebuild societyDetails field
        {
            $project: {
                _id: "$_id.id",
                name: 1,
                mobNumber: 1,
                profileImg: 1,
                companyName: 1,
                companyLogo: 1,
                vehicleDetails: 1,
                entryType: 1,
                guardStatus: 1,
                societyDetails: {
                    societyName: "$_id.societyName",
                    societyGates: "$_id.societyGates",
                    societyApartments: "$societyApartments"
                },
                entryTime: 1,
                exitTime: 1,
                notificationId: 1,
                hasExited: 1
            }
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
                    societyGates: "$societyDetails.societyGates",
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

    const preApprovedEntry = await PreApproved.aggregate([
        {
            $match: {
                'allowedBy.status': 'approve',
                hasExited: false,
                societyName: user.societyName,
                blockName: user.societyBlock,
                apartment: user.apartment,
            },
        },
        {
            $lookup: {
                from: "users",
                let: { userId: "$approvedBy.user" },
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
                        }
                    }
                ],
                as: "approvedBy.user"
            }
        },
        {
            $unwind: {
                path: "$approvedBy.user",
                preserveNullAndEmptyArrays: true
            }
        },
        {
            $lookup: {
                from: "users",
                let: { userId: "$allowedBy.user" },
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
                        }
                    }
                ],
                as: "allowedBy.user"
            }
        },
        {
            $unwind: {
                path: "$allowedBy.user",
                preserveNullAndEmptyArrays: true
            }
        },
        {
            $project: {
                allowedBy: 1,
                approvedBy: 1,
                name: 1,
                mobNumber: 1,
                profileImg: 1,
                companyName: 1,
                companyLogo: 1,
                serviceName: 1,
                serviceLogo: 1,
                vehicleDetails: 1,
                profileType: 1,
                entryType: 1,
                societyName: 1,
                blockName: 1,
                apartment: 1,
                entryTime: 1,
                exitTime: 1,
                hasExited: 1,
            },
        },
    ]);

    const preApprovedServiceEntry = await PreApproved.aggregate([
        
        {
            $match: {
                'allowedBy.status': 'approve',
                hasExited: false,
                societyName: user.societyName,
                "gatepassAptDetails.societyApartments": {
                    $elemMatch: {
                        $or: [
                            {
                                "societyBlock": user.societyBlock,
                                "apartment": user.apartment
                            }
                        ]
                    }
                }
            }
        },
        {
            $lookup: {
                from: "users",
                let: { userId: "$approvedBy.user" },
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
                        }
                    }
                ],
                as: "approvedBy.user"
            }
        },
        {
            $unwind: {
                path: "$approvedBy.user",
                preserveNullAndEmptyArrays: true
            }
        },
        {
            $lookup: {
                from: "users",
                let: { userId: "$allowedBy.user" },
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
                        }
                    }
                ],
                as: "allowedBy.user"
            }
        },
        {
            $unwind: {
                path: "$allowedBy.user",
                preserveNullAndEmptyArrays: true
            }
        },
        {
            $project: {
                allowedBy: 1,
                approvedBy: 1,
                name: 1,
                mobNumber: 1,
                profileImg: 1,
                companyName: 1,
                companyLogo: 1,
                serviceName: 1,
                serviceLogo: 1,
                vehicleDetails: 1,
                profileType: 1,
                entryType: 1,
                societyName: 1,
                blockName: 1,
                apartment: 1,
                entryTime: 1,
                exitTime: 1,
                hasExited: 1,
            },
        },
    ]);

    const response = [...deliveryEntry, ...preApprovedEntry, ...preApprovedServiceEntry];

    if (response.length <= 0) {
        throw new ApiError(500, "There is no entry");
    }

    return res.status(200).json(
        new ApiResponse(200, response, "Current entries fetched successfully.")
    );
});

const getPastDeliveryEntries = asyncHandler(async (req, res) => {
    const user = await ProfileVerification.findOne({ user: req.user._id });
    if (!user) {
        throw new ApiError(500, "No resident found");
    }

    const deliveryEntry = await DeliveryEntry.aggregate([
        {
            $match: {
                "societyDetails.societyName": user.societyName,
                'guardStatus.status': 'approve',
                hasExited: true,
            },
        },
        {
            $lookup: {
                from: "users",
                let: { userId: "$guardStatus.guard" },
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
                        }
                    }
                ],
                as: "guardStatus.guard"
            }
        },
        {
            $unwind: {
                path: "$guardStatus.guard",
                preserveNullAndEmptyArrays: true
            }
        },
        // Unwind the societyApartments array
        {
            $unwind: {
                path: "$societyDetails.societyApartments",
                preserveNullAndEmptyArrays: true
            }
        },
        {
            $lookup: {
                from: "users",
                let: { approvedById: "$societyDetails.societyApartments.entryStatus.approvedBy" },
                pipeline: [
                    {
                        $match: {
                            $expr: { $eq: ["$_id", "$$approvedById"] }
                        }
                    },
                    {
                        $project: {
                            _id: 1,
                            userName: 1,
                            email: 1
                        }
                    }
                ],
                as: "societyDetails.societyApartments.entryStatus.approvedBy"
            }
        },
        {
            $unwind: {
                path: "$societyDetails.societyApartments.entryStatus.approvedBy",
                preserveNullAndEmptyArrays: true
            }
        },
        {
            $lookup: {
                from: "users",
                let: { rejectedById: "$societyDetails.societyApartments.entryStatus.rejectedBy" },
                pipeline: [
                    {
                        $match: {
                            $expr: { $eq: ["$_id", "$$rejectedById"] }
                        }
                    },
                    {
                        $project: {
                            _id: 1,
                            userName: 1,
                            email: 1
                        }
                    }
                ],
                as: "societyDetails.societyApartments.entryStatus.rejectedBy"
            }
        },
        {
            $unwind: {
                path: "$societyDetails.societyApartments.entryStatus.rejectedBy",
                preserveNullAndEmptyArrays: true
            }
        },
        // Rebuild societyApartments array
        {
            $group: {
                _id: {
                    id: "$_id", // group by document ID
                    societyName: "$societyDetails.societyName",
                    societyGates: "$societyDetails.societyGates"
                },
                societyApartments: { $push: "$societyDetails.societyApartments" }, // rebuild the array
                name: { $first: "$name" },
                mobNumber: { $first: "$mobNumber" },
                profileImg: { $first: "$profileImg" },
                companyName: { $first: "$companyName" },
                companyLogo: { $first: "$companyLogo" },
                vehicleDetails: { $first: "$vehicleDetails" },
                entryType: { $first: "$entryType" },
                guardStatus: { $first: "$guardStatus" },
                entryTime: { $first: "$entryTime" },
                exitTime: { $first: "$exitTime" },
                notificationId: { $first: "$notificationId" },
                hasExited: { $first: "$hasExited" }
            }
        },
        // Rebuild societyDetails field
        {
            $project: {
                _id: "$_id.id",
                name: 1,
                mobNumber: 1,
                profileImg: 1,
                companyName: 1,
                companyLogo: 1,
                vehicleDetails: 1,
                entryType: 1,
                guardStatus: 1,
                societyDetails: {
                    societyName: "$_id.societyName",
                    societyGates: "$_id.societyGates",
                    societyApartments: "$societyApartments"
                },
                entryTime: 1,
                exitTime: 1,
                notificationId: 1,
                hasExited: 1
            }
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
                    societyGates: "$societyDetails.societyGates",
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

    const preApprovedEntry = await PreApproved.aggregate([
        {
            $match: {
                'allowedBy.status': 'approve',
                hasExited: true,
                societyName: user.societyName,
                blockName: user.societyBlock,
                apartment: user.apartment,
            },
        },
        {
            $lookup: {
                from: "users",
                let: { userId: "$approvedBy.user" },
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
                        }
                    }
                ],
                as: "approvedBy.user"
            }
        },
        {
            $unwind: {
                path: "$approvedBy.user",
                preserveNullAndEmptyArrays: true
            }
        },
        {
            $lookup: {
                from: "users",
                let: { userId: "$allowedBy.user" },
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
                        }
                    }
                ],
                as: "allowedBy.user"
            }
        },
        {
            $unwind: {
                path: "$allowedBy.user",
                preserveNullAndEmptyArrays: true
            }
        },
        {
            $project: {
                allowedBy: 1,
                approvedBy: 1,
                name: 1,
                mobNumber: 1,
                profileImg: 1,
                companyName: 1,
                companyLogo: 1,
                serviceName: 1,
                serviceLogo: 1,
                vehicleDetails: 1,
                profileType: 1,
                entryType: 1,
                societyName: 1,
                blockName: 1,
                apartment: 1,
                entryTime: 1,
                exitTime: 1,
                hasExited: 1,
            },
        },
    ]);

    const preApprovedServiceEntry = await PreApproved.aggregate([
        {
            $match: {
                'allowedBy.status': 'approve',
                hasExited: true,
                societyName: user.societyName,
                "gatepassAptDetails.societyApartments": {
                    $elemMatch: {
                        $or: [
                            {
                                "societyBlock": user.societyBlock,
                                "apartment": user.apartment
                            }
                        ]
                    }
                }
            }
        },
        {
            $lookup: {
                from: "users",
                let: { userId: "$approvedBy.user" },
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
                        }
                    }
                ],
                as: "approvedBy.user"
            }
        },
        {
            $unwind: {
                path: "$approvedBy.user",
                preserveNullAndEmptyArrays: true
            }
        },
        {
            $lookup: {
                from: "users",
                let: { userId: "$allowedBy.user" },
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
                        }
                    }
                ],
                as: "allowedBy.user"
            }
        },
        {
            $unwind: {
                path: "$allowedBy.user",
                preserveNullAndEmptyArrays: true
            }
        },
        {
            $project: {
                allowedBy: 1,
                approvedBy: 1,
                name: 1,
                mobNumber: 1,
                profileImg: 1,
                companyName: 1,
                companyLogo: 1,
                serviceName: 1,
                serviceLogo: 1,
                vehicleDetails: 1,
                profileType: 1,
                entryType: 1,
                societyName: 1,
                blockName: 1,
                apartment: 1,
                entryTime: 1,
                exitTime: 1,
                hasExited: 1,
            },
        },
    ]);

    const response = [...deliveryEntry, ...preApprovedEntry, ...preApprovedServiceEntry];

    if (response.length <= 0) {
        throw new ApiError(500, "There is no entry");
    }

    return res.status(200).json(
        new ApiResponse(200, response, "Past entries fetched successfully.")
    );
});

const getDeniedDeliveryEntries = asyncHandler(async (req, res) => {
    const user = await ProfileVerification.findOne({ user: req.user._id });
    if (!user) {
        throw new ApiError(500, "No resident found");
    }

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
            $lookup: {
                from: "users",
                let: { userId: "$guardStatus.guard" },
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
                        }
                    }
                ],
                as: "guardStatus.guard"
            }
        },
        {
            $unwind: {
                path: "$guardStatus.guard",
                preserveNullAndEmptyArrays: true
            }
        },
        // Unwind the societyApartments array
        {
            $unwind: {
                path: "$societyDetails.societyApartments",
                preserveNullAndEmptyArrays: true
            }
        },
        {
            $lookup: {
                from: "users",
                let: { approvedById: "$societyDetails.societyApartments.entryStatus.approvedBy" },
                pipeline: [
                    {
                        $match: {
                            $expr: { $eq: ["$_id", "$$approvedById"] }
                        }
                    },
                    {
                        $project: {
                            _id: 1,
                            userName: 1,
                            email: 1
                        }
                    }
                ],
                as: "societyDetails.societyApartments.entryStatus.approvedBy"
            }
        },
        {
            $unwind: {
                path: "$societyDetails.societyApartments.entryStatus.approvedBy",
                preserveNullAndEmptyArrays: true
            }
        },
        {
            $lookup: {
                from: "users",
                let: { rejectedById: "$societyDetails.societyApartments.entryStatus.rejectedBy" },
                pipeline: [
                    {
                        $match: {
                            $expr: { $eq: ["$_id", "$$rejectedById"] }
                        }
                    },
                    {
                        $project: {
                            _id: 1,
                            userName: 1,
                            email: 1
                        }
                    }
                ],
                as: "societyDetails.societyApartments.entryStatus.rejectedBy"
            }
        },
        {
            $unwind: {
                path: "$societyDetails.societyApartments.entryStatus.rejectedBy",
                preserveNullAndEmptyArrays: true
            }
        },
        // Rebuild societyApartments array
        {
            $group: {
                _id: {
                    id: "$_id", // group by document ID
                    societyName: "$societyDetails.societyName",
                    societyGates: "$societyDetails.societyGates"
                },
                societyApartments: { $push: "$societyDetails.societyApartments" }, // rebuild the array
                name: { $first: "$name" },
                mobNumber: { $first: "$mobNumber" },
                profileImg: { $first: "$profileImg" },
                companyName: { $first: "$companyName" },
                companyLogo: { $first: "$companyLogo" },
                vehicleDetails: { $first: "$vehicleDetails" },
                entryType: { $first: "$entryType" },
                guardStatus: { $first: "$guardStatus" },
                entryTime: { $first: "$entryTime" },
                exitTime: { $first: "$exitTime" },
                notificationId: { $first: "$notificationId" },
                hasExited: { $first: "$hasExited" }
            }
        },
        // Rebuild societyDetails field
        {
            $project: {
                _id: "$_id.id",
                name: 1,
                mobNumber: 1,
                profileImg: 1,
                companyName: 1,
                companyLogo: 1,
                vehicleDetails: 1,
                entryType: 1,
                guardStatus: 1,
                societyDetails: {
                    societyName: "$_id.societyName",
                    societyGates: "$_id.societyGates",
                    societyApartments: "$societyApartments"
                },
                entryTime: 1,
                exitTime: 1,
                notificationId: 1,
                hasExited: 1
            }
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
    const targetApartment = apartments.find((apartmentInfo) => apartmentInfo.societyBlock === societyBlock && apartmentInfo.apartment === apartment);

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
    getGuestEntries,
    getDeliveryEntries,
    getCabEntries,
    getOtherEntries,
    getCheckoutHistroy
}