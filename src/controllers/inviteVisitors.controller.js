import asyncHandler from '../utils/asynchandler.js';
import ApiError from '../utils/ApiError.js';
import ApiResponse from '../utils/ApiResponse.js';
import { CheckInCode } from '../models/checkInCode.model.js';
import { ProfileVerification } from '../models/profileVerification.model.js';
import { generateCheckInCode } from '../utils/generateCheckInCode.js';
import { PreApproved } from '../models/preApproved.model.js';
import mongoose from 'mongoose';
import { sendNotification } from '../utils/sendResidentNotification.js';
import { uploadOnCloudinary } from '../utils/cloudinary.js';

const addPreApproval = asyncHandler(async (req, res) => {
    const { name, mobNumber, profileImg, companyName, companyLogo, serviceName, serviceLogo, vehicleNo, entryType, checkInCodeStart, checkInCodeExpiry, checkInCodeStartDate, checkInCodeExpiryDate, } = req.body;
    const user = await ProfileVerification.findOne({ user: req.user._id });

    if (!user) {
        throw new ApiError(404, "Access Denied: You are no longer a registered resident of this society");
    }

    const preApprovalEntry = await CheckInCode.create({
        approvedBy: req.user._id,
        name: name,
        mobNumber: mobNumber,
        profileImg: profileImg,
        companyName: companyName,
        companyLogo: companyLogo,
        serviceName: serviceName,
        serviceLogo: serviceLogo,
        vehicleNo: vehicleNo,
        entryType: entryType,
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

    const checkInCode = await CheckInCode.aggregate([
        {
            $match: {
                _id: preApprovalEntry._id
            },
        },
        {
            $lookup: {
                from: "users",
                let: { userId: "$approvedBy" },
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
                as: "approvedBy"
            }
        },
        {
            $unwind: {
                path: "$approvedBy",
                preserveNullAndEmptyArrays: true
            }
        },
        {
            $project: {
                approvedBy: 1,
                name: 1,
                mobNumber: 1,
                profileImg: 1,
                companyName: 1,
                companyLogo: 1,
                serviceName: 1,
                serviceLogo: 1,
                vehicleNo: 1,
                profileType: 1,
                entryType: 1,
                societyName: 1,
                blockName: 1,
                apartment: 1,
                checkInCode: 1,
                checkInCodeStartDate: 1,
                checkInCodeExpiryDate: 1,
                checkInCodeStart: 1,
                checkInCodeExpiry: 1,
                isPreApproved: 1,
            },
        },
    ]);

    return res.status(200).json(
        new ApiResponse(200, checkInCode, "Pre-approval entry added successfully")
    );
});

const exitEntry = asyncHandler(async (req, res) => {
    const { id } = req.body;
    const preApprovalId = mongoose.Types.ObjectId.createFromHexString(id);
    const preApproved = await PreApproved.findById(preApprovalId);

    if (!preApproved) {
        throw new ApiError(500, "Invalid id");
    }

    preApproved.hasExited = true;
    preApproved.exitTime = new Date();
    const result = await preApproved.save({ validateBeforeSave: false });

    if (!result) {
        throw new ApiError(500, "Something went wrong");
    }

    const members = await ProfileVerification.find({
        societyName: result.societyName,
        societyBlock: result.blockName,
        apartment: result.apartment,
    }).populate('user');

    const fcm = members.map(item => item.user.FCMToken);

    let profile;

    if (result.entryType == 'service') {
        profile = await ProfileVerification.aggregate([
            {
                $match: {
                    residentStatus: 'approve',
                    societyName: result.societyName,
                    $or: result.gatepassAptDetails.societyApartments.map(apartment => ({
                        societyBlock: apartment.societyBlock,
                        apartment: apartment.apartment,
                    })),
                },
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
    } else {
        profile = await ProfileVerification.aggregate([
            {
                $match: {
                    societyName: result.societyName,
                    societyBlock: result.blockName,
                    apartment: result.apartment,
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
    }

    const FCMTokens = profile
        .map((item) => item.user?.FCMToken)
        .filter((token) => token != null);
    console.log(FCMTokens);

    let payload = {
        deliveryName: result.name,
        companyName: result?.companyName || result?.serviceName,
        action: 'NOTIFY_EXIT_ENTRY'
    };

    FCMTokens.forEach(token => {
        sendNotification(token, payload.action, JSON.stringify(payload));
    });

    return res.status(200).json(
        new ApiResponse(200, {}, "Delivery exited successfully.")
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
    if (!user) {
        throw new ApiError(500, "No resident found");
    }

    const checkInCode = await CheckInCode.aggregate([
        {
            $match: {
                isPreApproved: true,
                societyName: user.societyName,
                blockName: user.societyBlock,
                apartment: user.apartment,
                checkInCodeExpiryDate: { $gt: new Date() }
            },
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
            $lookup: {
                from: "users",
                let: { userId: "$approvedBy" },
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
                as: "approvedBy"
            }
        },
        {
            $unwind: {
                path: "$approvedBy",
                preserveNullAndEmptyArrays: true
            }
        },
        {
            $project: {
                user: 1,
                approvedBy: 1,
                name: 1,
                mobNumber: 1,
                profileImg: 1,
                companyName: 1,
                companyLogo: 1,
                serviceName: 1,
                serviceLogo: 1,
                vehicleNo: 1,
                profileType: 1,
                entryType: 1,
                societyName: 1,
                blockName: 1,
                apartment: 1,
                checkInCode: 1,
                checkInCodeStartDate: 1,
                checkInCodeExpiryDate: 1,
                checkInCodeStart: 1,
                checkInCodeExpiry: 1,
                isPreApproved: 1,
            },
        },
    ]);

    if (!checkInCode || checkInCode.length <= 0) {
        throw new ApiError(500, "There is no expected entry");
    }

    return res.status(200).json(
        new ApiResponse(200, checkInCode, "expected entry fetched successfully")
    );
});

const getCurrentEntry = asyncHandler(async (req, res) => {
    const user = await ProfileVerification.findOne({ user: req.user._id });

    const delivery = await PreApproved.aggregate([
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

    if (!delivery || delivery.length <= 0) {
        throw new ApiError(500, "There is no current entry");
    }

    return res.status(200).json(
        new ApiResponse(200, delivery, "expected entry fetched successfully")
    );
});

const getPastEntry = asyncHandler(async (req, res) => {
    const user = await ProfileVerification.findOne({ user: req.user._id });

    const preApproved = await PreApproved.aggregate([
        {
            $match: {
                'allowedBy.status': 'approve',
                hasExited: true,
                societyName: user.societyName,
                blockName: user.societyBlock,
                apartment: user.apartment,
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
            }
        }
    ]);

    if (!preApproved || preApproved.length <= 0) {
        throw new ApiError(500, "There is no past entry");
    }

    return res.status(200).json(
        new ApiResponse(200, preApproved, "expected entry fetched successfully")
    );
});

const addGatePass = asyncHandler(async (req, res) => {
    const { name, mobNumber, serviceName, gender, serviceLogo, address, entryType, gatepassApiDetails, checkInCodeStart, checkInCodeExpiry, checkInCodeStartDate, checkInCodeExpiryDate } = req.body;
    const user = await ProfileVerification.findOne({ user: req.user._id });
    console.log(JSON.parse(gatepassApiDetails));

    if (!user) {
        throw new ApiError(404, "Access Denied: You are no longer a registered resident of this society");
    }

    const uploadedFiles = [];

    // Upload files to Cloudinary
    for (let file of req.files) {
        const document = await uploadOnCloudinary(file.path);

        uploadedFiles.push({
            url: document.url,
        });
    }

    const preApprovalEntry = await CheckInCode.create({
        approvedBy: req.user._id,
        name: name,
        mobNumber: mobNumber,
        profileImg: uploadedFiles[0].url,
        serviceName: serviceName,
        serviceLogo: serviceLogo,
        gender: gender,
        entryType: entryType,
        address: address,
        addressProof: uploadedFiles[1].url,
        gatepassAptDetails: {
            societyName: user.societyName,
            societyApartments: JSON.parse(gatepassApiDetails),
        },
        societyName: user.societyName,
        checkInCode: await generateCheckInCode(user.societyName),
        checkInCodeStart: new Date(checkInCodeStart),
        checkInCodeExpiry: new Date(checkInCodeExpiry),
        checkInCodeStartDate: new Date(checkInCodeStartDate),
        checkInCodeExpiryDate: new Date(checkInCodeExpiryDate),
    });

    if (!preApprovalEntry) {
        throw new ApiError(500, "Something went wrong");
    }

    const checkInCode = await CheckInCode.aggregate([
        {
            $match: {
                _id: preApprovalEntry._id
            },
        },
        {
            $lookup: {
                from: "users",
                let: { userId: "$approvedBy" },
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
                as: "approvedBy"
            }
        },
        {
            $unwind: {
                path: "$approvedBy",
                preserveNullAndEmptyArrays: true
            }
        },
        {
            $project: {
                approvedBy: 1,
                name: 1,
                mobNumber: 1,
                profileImg: 1,
                serviceName: 1,
                serviceLogo: 1,
                gender: 1,
                entryType: 1,
                address: 1,
                addressProof: 1,
                societyName: 1,
                gatepassAptDetails: 1,
                checkInCode: 1,
                checkInCodeStart: 1,
                checkInCodeExpiry: 1,
                checkInCodeStartDate: 1,
                checkInCodeExpiryDate: 1,
            },
        },
    ]);

    return res.status(200).json(
        new ApiResponse(200, checkInCode[0], "Service added successfully")
    );
});

const getGatePass = asyncHandler(async (req, res) => {
    const user = await ProfileVerification.findOne({ user: req.user._id });
    if (!user) {
        throw new ApiError(404, "Access Denied: You are no longer a registered resident of this society");
    }

    const checkInCode = await CheckInCode.aggregate([
        {
            $match: {
                societyName: user.societyName,
                entryType: 'service',
            },
        },
        {
            $lookup: {
                from: "users",
                let: { userId: "$approvedBy" },
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
                as: "approvedBy"
            }
        },
        {
            $unwind: {
                path: "$approvedBy",
                preserveNullAndEmptyArrays: true
            }
        },
        {
            $project: {
                approvedBy: 1,
                name: 1,
                mobNumber: 1,
                profileImg: 1,
                serviceName: 1,
                serviceLogo: 1,
                gender: 1,
                entryType: 1,
                address: 1,
                addressProof: 1,
                societyName: 1,
                gatepassAptDetails: 1,
                checkInCode: 1,
                checkInCodeStart: 1,
                checkInCodeExpiry: 1,
                checkInCodeStartDate: 1,
                checkInCodeExpiryDate: 1,
            },
        },
    ]);

    return res.status(200).json(
        new ApiResponse(200, checkInCode, "Gatepass entry fetched successfully")
    );
});

export {
    addPreApproval,
    reSchedule,
    getExpectedEntry,
    exitEntry,
    getCurrentEntry,
    getPastEntry,
    addGatePass,
    getGatePass,
}