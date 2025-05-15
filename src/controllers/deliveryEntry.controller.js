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

    const parsedSocietyDetails = JSON.parse(societyDetails);

    const results = await ProfileVerification.find({
        residentStatus: 'approve',
        societyName: parsedSocietyDetails.societyName,
        $or: parsedSocietyDetails.societyApartments
    }).populate('user', 'FCMToken');

    const fcmToken = results
        .map(item => item.user?.FCMToken) // Use optional chaining in case user is null
        .filter(token => !!token); // Remove undefined/null tokens

    if (fcmToken.length <= 0) {
        throw new ApiError(500, "No resident found or apartment is vacant");
    }

    // Iterate through societyApartments and add members for all entry types
    const updatedApartments = await Promise.all(
        parsedSocietyDetails.societyApartments.map(async (apartment) => {
            // Query ProfileVerification model to find members matching the criteria
            const members = await ProfileVerification.find({
                societyName: parsedSocietyDetails.societyName,
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

            // Return updated apartment object with members included regardless of entryType
            return {
                ...apartment,
                members: filteredData,
            };
        })
    );

    // Update societyDetails with the modified societyApartments array
    parsedSocietyDetails.societyApartments = updatedApartments;

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
        societyDetails: parsedSocietyDetails,
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

    // Clone the societyDetails object to avoid direct mutation
    const parsedSocietyDetails = { ...societyDetails };

    const profile = await ProfileVerification.aggregate([
        {
            $match: {
                residentStatus: 'approve',
                societyName: parsedSocietyDetails.societyName,
                $or: parsedSocietyDetails.societyApartments
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

    // Iterate through societyApartments and add members for all entry types
    const updatedApartments = await Promise.all(
        parsedSocietyDetails.societyApartments.map(async (apartment) => {
            // Query ProfileVerification model to find members matching the criteria
            const members = await ProfileVerification.find({
                societyName: parsedSocietyDetails.societyName,
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

            // Return updated apartment object with members for all entry types
            return {
                ...apartment,
                members: filteredData,
            };
        })
    );

    // Update societyDetails with the modified societyApartments array
    parsedSocietyDetails.societyApartments = updatedApartments;

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
        societyDetails: parsedSocietyDetails,
        notificationId: generateNotificationId(),
        guardStatus: {
            guard: req.user._id,
        },
    });

    const createddeliveryEntry = await DeliveryEntry.findById(deliveryEntry._id);

    if (!createddeliveryEntry) {
        throw new ApiError(500, "Something went wrong");
    }

    const FCMTokens = profile.map((item) => item.user.FCMToken).filter(token => !!token);

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
        societyDetails: createddeliveryEntry.societyDetails,
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
        // Lookup for members for all entry types
        {
            $lookup: {
                from: "users",
                let: { memberIds: "$societyDetails.societyApartments.members" },
                pipeline: [
                    {
                        $match: {
                            $expr: {
                                $cond: {
                                    if: { $isArray: "$$memberIds" },
                                    then: { $in: ["$_id", "$$memberIds"] },
                                    else: false
                                }
                            }
                        }
                    },
                    {
                        $project: {
                            _id: 1,
                            email: 1,
                            userName: 1,
                            phoneNo: 1,
                            profile: 1
                        }
                    }
                ],
                as: "memberDetails"
            }
        },
        // Project stage to ensure consistent structure
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
                entryTime: 1,
                exitTime: 1,
                notificationId: 1,
                hasExited: 1,
                societyDetails: {
                    societyName: "$societyDetails.societyName",
                    societyGates: "$societyDetails.societyGates",
                    societyApartments: {
                        societyBlock: "$societyDetails.societyApartments.societyBlock",
                        apartment: "$societyDetails.societyApartments.apartment",
                        entryStatus: "$societyDetails.societyApartments.entryStatus",
                        // Ensure members is always an array (either from lookup or empty)
                        members: {
                            $cond: {
                                if: { $eq: [{ $size: "$memberDetails" }, 0] },
                                then: {
                                    $cond: {
                                        if: { $isArray: "$societyDetails.societyApartments.members" },
                                        then: "$societyDetails.societyApartments.members",
                                        else: []
                                    }
                                },
                                else: "$memberDetails"
                            }
                        }
                    }
                },
                createdAt: 1
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
                hasExited: { $first: "$hasExited" },
                createdAt: { $first: "$createdAt" }
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
        },
        {
            $sort: {
                "createdAt": -1 // Sort by createdAt field in descending order
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

const getWaitingEntry = asyncHandler(async (req, res) => {
    const userId = mongoose.Types.ObjectId.createFromHexString(req.params.id);

    const society = await ProfileVerification.findOne({ user: req.user._id, profileType: 'Security' });

    if (!society) {
        throw new ApiError(500, "You are not security guard");
    }

    const deliveryEntry = await DeliveryEntry.aggregate([
        {
            $match: {
                _id: userId,
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
        // Lookup for members for all entry types
        {
            $lookup: {
                from: "users",
                let: { memberIds: "$societyDetails.societyApartments.members" },
                pipeline: [
                    {
                        $match: {
                            $expr: {
                                $cond: {
                                    if: { $isArray: "$$memberIds" },
                                    then: { $in: ["$_id", "$$memberIds"] },
                                    else: false
                                }
                            }
                        }
                    },
                    {
                        $project: {
                            _id: 1,
                            email: 1,
                            userName: 1,
                            phoneNo: 1,
                            profile: 1
                        }
                    }
                ],
                as: "memberDetails"
            }
        },
        // Project stage to ensure consistent structure
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
                entryTime: 1,
                exitTime: 1,
                notificationId: 1,
                hasExited: 1,
                societyDetails: {
                    societyName: "$societyDetails.societyName",
                    societyGates: "$societyDetails.societyGates",
                    societyApartments: {
                        societyBlock: "$societyDetails.societyApartments.societyBlock",
                        apartment: "$societyDetails.societyApartments.apartment",
                        entryStatus: "$societyDetails.societyApartments.entryStatus",
                        // Ensure members is always an array (either from lookup or empty)
                        members: {
                            $cond: {
                                if: { $eq: [{ $size: "$memberDetails" }, 0] },
                                then: {
                                    $cond: {
                                        if: { $isArray: "$societyDetails.societyApartments.members" },
                                        then: "$societyDetails.societyApartments.members",
                                        else: []
                                    }
                                },
                                else: "$memberDetails"
                            }
                        }
                    }
                },
                createdAt: 1
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
                hasExited: { $first: "$hasExited" },
                createdAt: { $first: "$createdAt" }
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
        },
    ]);

    if (deliveryEntry.length <= 0) {
        throw new ApiError(500, "There is no waiting request.");
    }

    return res.status(200).json(
        new ApiResponse(200, deliveryEntry[0], "Delivery waiting request fetched successfully.")
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

    const sortedResponse = response.sort((a, b) => {
        const timeA = new Date(a.entryTime || 0).getTime();
        const timeB = new Date(b.entryTime || 0).getTime();
        return timeB - timeA;
    });

    if (sortedResponse.length === 0) {
        throw new ApiError(500, "There is no entry");
    }

    return res.status(200).json(
        new ApiResponse(200, sortedResponse, "Allowed delivery fetched successfully.")
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
        entryType: delivery.entryType,
        userName: user.userName,
        visitorName: delivery.name,
        companyName: delivery.companyName,
        serviceName: delivery.serviceName,
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
        entryType: delivery.entryType,
        userName: user.userName,
        visitorName: delivery.name,
        companyName: delivery.companyName,
        serviceName: delivery.serviceName,
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

    delivery.guardStatus.status =  'approve';
    delivery.guardStatus.guard = req.user._id;
    delivery.entryTime = new Date();
    const result = await delivery.save({ validateBeforeSave: false });

    if (!result) {
        throw new ApiError(500, "Something went wrong");
    }

    let userIds = [];

    // Step 1: Extract userIds from members inside societyApartments
    result.societyDetails.societyApartments.forEach(apartment => {
        apartment.members.forEach(member => {
            if (member._id) {
                userIds.push(member._id);
            }
        });
    });

    // Step 2 (Optional): Ensure unique IDs
    userIds = [...new Set(userIds.map(id => id.toString()))];

    // Step 3: Fetch users with only FCM tokens
    const fcmToken = await User.find(
        { _id: { $in: userIds } },
        { FCMToken: 1, _id: 0 } // Only get fcmToken field
    );

    const fcmTokens = fcmToken
        .map(user => user.FCMToken)
        .filter(token => typeof token === 'string' && token.length > 0);

    let payload = {
        name: result.name,
        action: 'NOTIFY_CHECKED_IN'
    };

    fcmTokens.forEach(token => {
        sendNotification(token, payload.action, JSON.stringify(payload));
    });

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

    // Sort in descending order by entryTime
    const sortedResponse = response.sort((a, b) => {
        const timeA = new Date(a.entryTime || 0).getTime();
        const timeB = new Date(b.entryTime || 0).getTime();
        return timeB - timeA;
    });

    if (sortedResponse.length === 0) {
        throw new ApiError(500, "There is no entry");
    }

    return res.status(200).json(
        new ApiResponse(200, sortedResponse, "Allowed guest entries fetched successfully.")
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

    // Sort entries by entryTime in descending order
    const sortedResponse = response.sort((a, b) => {
        const timeA = new Date(a.entryTime || 0).getTime();
        const timeB = new Date(b.entryTime || 0).getTime();
        return timeB - timeA;
    });

    if (sortedResponse.length <= 0) {
        throw new ApiError(500, "There is no entry");
    }

    return res.status(200).json(
        new ApiResponse(200, sortedResponse, "Allowed delivery fetched successfully.")
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

    const sortedResponse = response.sort((a, b) => {
        const timeA = new Date(a.entryTime || 0).getTime();
        const timeB = new Date(b.entryTime || 0).getTime();
        return timeB - timeA;
    });

    if (sortedResponse.length <= 0) {
        throw new ApiError(500, "There is no entry");
    }

    return res.status(200).json(
        new ApiResponse(200, sortedResponse, "Allowed cab entries fetched successfully.")
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
                entryType: { $in: ['other', 'service'] },
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

    const sortedResponse = response.sort((a, b) => {
        const timeA = new Date(a.entryTime || 0).getTime();
        const timeB = new Date(b.entryTime || 0).getTime();
        return timeB - timeA;
    });

    if (sortedResponse.length <= 0) {
        throw new ApiError(500, "There is no entry");
    }

    return res.status(200).json(
        new ApiResponse(200, sortedResponse, "Allowed other entries fetched successfully.")
    );
});

const getCheckoutHistroy = asyncHandler(async (req, res) => {
    const user = await ProfileVerification.findOne({ user: req.user._id });

    // Pagination parameters
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    // Filter parameters
    const filters = {};

    // Date range filter
    if (req.query.startDate && req.query.endDate) {
        const startDate = new Date(req.query.startDate);
        const endDate = new Date(req.query.endDate);
        endDate.setHours(23, 59, 59, 999); // Set to end of day

        filters.entryTime = {
            $gte: startDate,
            $lte: endDate
        };
    }

    if (req.query.checkinTime) {
        const startDate = new Date(req.query.checkinTime);
        startDate.setHours(0, 0, 0, 0); // Set to start of day
        const endDate = new Date(req.query.checkinTime);
        endDate.setHours(23, 59, 59, 999); // Set to end of day

        filters.entryTime = {
            $gte: startDate,
            $lte: endDate
        };
    }

    // Entry type filter
    if (req.query.entryType) {
        filters.entryType = req.query.entryType;
    }

    // Name/keyword search
    if (req.query.search) {
        filters.$or = [
            { name: { $regex: req.query.search, $options: 'i' } },
            { companyName: { $regex: req.query.search, $options: 'i' } },
            { serviceName: { $regex: req.query.search, $options: 'i' } },
            { mobNumber: { $regex: req.query.search, $options: 'i' } }
        ];
    }

    // Base match conditions for DeliveryEntry
    let deliveryEntryMatch = {
        "societyDetails.societyName": user.societyName,
        hasExited: true,
        ...filters
    };

    // Base match conditions for PreApproved (regular)
    let preApprovedMatch = {
        'allowedBy.status': 'approve',
        hasExited: true,
        societyName: user.societyName,
        blockName: user.societyBlock,
        apartment: user.apartment,
        ...filters
    };

    // Count total documents for pagination
    const [deliveryCount, preApprovedCount] = await Promise.all([
        DeliveryEntry.countDocuments(deliveryEntryMatch),
        PreApproved.countDocuments(preApprovedMatch),
    ]);

    const totalCount = deliveryCount + preApprovedCount;
    const totalPages = Math.ceil(totalCount / limit);

    const deliveryEntry = await DeliveryEntry.aggregate([
        {
            $match: deliveryEntryMatch,
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
            $match: preApprovedMatch,
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

    let response = [...deliveryEntry, ...preApprovedEntry];

    // Sort by exitTime in descending order (fallback to entryTime if exitTime is missing)
    response.sort((a, b) => {
        const timeA = new Date(a.exitTime || a.entryTime || 0).getTime();
        const timeB = new Date(b.exitTime || b.entryTime || 0).getTime();
        return timeB - timeA;
    });

    // Apply pagination on combined results
    response = response.slice(skip, skip + limit);

    if (response.length <= 0) {
        throw new ApiError(404, "No entries found matching your criteria");
    }

    return res.status(200).json(
        new ApiResponse(200, {
            checkoutEntries: response,
            pagination: {
                totalEntries: totalCount,
                entriesPerPage: limit,
                currentPage: page,
                totalPages: totalPages,
                hasMore: page < totalPages
            }
        }, "Past entries fetched successfully.")
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

    // Sort by entryTime in descending order
    const sortedResponse = response.sort((a, b) => new Date(b.entryTime ?? 0) - new Date(a.entryTime ?? 0));

    if (sortedResponse.length <= 0) {
        throw new ApiError(500, "There is no entry");
    }

    return res.status(200).json(
        new ApiResponse(200, sortedResponse, "Current entries fetched successfully.")
    );
});

const getDeniedDeliveryEntries = asyncHandler(async (req, res) => {
    const user = await ProfileVerification.findOne({ user: req.user._id });
    if (!user) {
        throw new ApiError(500, "No resident found");
    }

    // Pagination parameters
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    // Filter parameters
    const filters = {};

    // Date range filter
    if (req.query.startDate && req.query.endDate) {
        const startDate = new Date(req.query.startDate);
        const endDate = new Date(req.query.endDate);
        endDate.setHours(23, 59, 59, 999); // Set to end of day

        filters.entryTime = {
            $gte: startDate,
            $lte: endDate
        };
    }

    // Entry type filter
    if (req.query.entryType) {
        filters.entryType = req.query.entryType;
    }

    // Name/keyword search
    if (req.query.search) {
        filters.$or = [
            { name: { $regex: req.query.search, $options: 'i' } },
            { companyName: { $regex: req.query.search, $options: 'i' } },
            { serviceName: { $regex: req.query.search, $options: 'i' } },
            { mobNumber: { $regex: req.query.search, $options: 'i' } }
        ];
    }

    // Base match conditions for DeliveryEntry
    const deliveryEntryMatch = {
        'societyDetails.societyName': user.societyName,
        'societyDetails.societyApartments': {
            $elemMatch: {
                societyBlock: user.societyBlock,
                apartment: user.apartment,
                'entryStatus.status': 'rejected'
            }
        },
        'guardStatus.status': { $in: ['approve', 'rejected'] },
        ...filters
    };

    const totalCount = await DeliveryEntry.countDocuments(deliveryEntryMatch);
    const totalPages = Math.ceil(totalCount / limit);

    let deliveryEntry = await DeliveryEntry.aggregate([
        {
            $match: deliveryEntryMatch,
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
            $sort: {
                entryTime: -1
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
                createdAt: 1,
                updatedAt: 1,
            },
        },
    ]);

    // Apply pagination on combined results
    deliveryEntry = deliveryEntry.slice(skip, skip + limit);

    if (deliveryEntry.length <= 0) {
        throw new ApiError(500, "There is no entry");
    }

    return res.status(200).json(
        new ApiResponse(200, {
            entries: deliveryEntry,
            pagination: {
                totalEntries: totalCount,
                entriesPerPage: limit,
                currentPage: page,
                totalPages: totalPages,
                hasMore: page < totalPages
            }
        }, "Denied entries fetched successfully.")
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

const getPastDeliveryEntries = asyncHandler(async (req, res) => {
    const user = await ProfileVerification.findOne({ user: req.user._id });
    if (!user) {
        throw new ApiError(500, "No resident found");
    }

    // Pagination parameters
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    // Filter parameters
    const filters = {};

    // Date range filter
    if (req.query.startDate && req.query.endDate) {
        const startDate = new Date(req.query.startDate);
        const endDate = new Date(req.query.endDate);
        endDate.setHours(23, 59, 59, 999); // Set to end of day

        filters.entryTime = {
            $gte: startDate,
            $lte: endDate
        };
    }

    // Entry type filter
    if (req.query.entryType) {
        filters.entryType = req.query.entryType;
    }

    // Name/keyword search
    if (req.query.search) {
        filters.$or = [
            { name: { $regex: req.query.search, $options: 'i' } },
            { companyName: { $regex: req.query.search, $options: 'i' } },
            { serviceName: { $regex: req.query.search, $options: 'i' } },
            { mobNumber: { $regex: req.query.search, $options: 'i' } }
        ];
    }

    // Base match conditions for DeliveryEntry
    const deliveryEntryMatch = {
        "societyDetails.societyName": user.societyName,
        'guardStatus.status': 'approve',
        hasExited: true,
        ...filters
    };

    // Base match conditions for PreApproved (regular)
    const preApprovedMatch = {
        'allowedBy.status': 'approve',
        hasExited: true,
        societyName: user.societyName,
        blockName: user.societyBlock,
        apartment: user.apartment,
        ...filters
    };

    // Base match conditions for PreApproved service
    const preApprovedServiceMatch = {
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
        },
        ...filters
    };

    // Count total documents for pagination
    const [deliveryCount, preApprovedCount, serviceCount] = await Promise.all([
        DeliveryEntry.countDocuments(deliveryEntryMatch),
        PreApproved.countDocuments(preApprovedMatch),
        PreApproved.countDocuments(preApprovedServiceMatch)
    ]);

    const totalCount = deliveryCount + preApprovedCount + serviceCount;
    const totalPages = Math.ceil(totalCount / limit);

    // Aggregation for delivery entries with pagination
    const deliveryEntry = await DeliveryEntry.aggregate([
        { $match: deliveryEntryMatch },
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
        // Add source field to identify the collection
        { $addFields: { source: "delivery" } },
        { $sort: { entryTime: -1 } }, // Sort by entry time descending
    ]);

    // Aggregation for pre-approved entries
    const preApprovedEntry = await PreApproved.aggregate([
        { $match: preApprovedMatch },
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
        // Add source field to identify the collection
        { $addFields: { source: "preApproved" } },
        { $sort: { entryTime: -1 } }, // Sort by entry time descending
    ]);

    // Aggregation for pre-approved service entries
    const preApprovedServiceEntry = await PreApproved.aggregate([
        { $match: preApprovedServiceMatch },
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
        // Add source field to identify the collection
        { $addFields: { source: "preApprovedService" } },
        { $sort: { entryTime: -1 } }, // Sort by entry time descending
    ]);

    // Combine all entries
    let response = [...deliveryEntry, ...preApprovedEntry, ...preApprovedServiceEntry];

    // Sort by entryTime in descending order
    response.sort((a, b) => new Date(b.entryTime) - new Date(a.entryTime));

    // Apply pagination on combined results
    response = response.slice(skip, skip + limit);

    if (response.length <= 0) {
        throw new ApiError(404, "No entries found matching your criteria");
    }

    return res.status(200).json(
        new ApiResponse(200, {
            entries: response,
            pagination: {
                totalEntries: totalCount,
                entriesPerPage: limit,
                currentPage: page,
                totalPages: totalPages,
                hasMore: page < totalPages
            }
        }, "Past entries fetched successfully.")
    );
});

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
    getCheckoutHistroy,
    getWaitingEntry
}