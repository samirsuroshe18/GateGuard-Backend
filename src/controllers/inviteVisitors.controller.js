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
import { User } from '../models/user.model.js';

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
        {
            $sort: {
                checkInCodeStartDate: -1
            }
        }
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
    const { name, mobNumber, serviceName, gender, serviceLogo, address, entryType, aptDetails, checkInCodeStart, checkInCodeExpiry, checkInCodeStartDate, checkInCodeExpiryDate } = req.body;
    const user = await ProfileVerification.findOne({ user: req.user._id });

    if (!user) {
        throw new ApiError(404, "Access Denied: You are no longer a registered security of this society");
    }

    const uploadedFiles = [];
    let parsedAptDetails = JSON.parse(aptDetails);

    const results = await ProfileVerification.find({
        residentStatus: 'approve',
        societyName: user.societyName,
        $or: parsedAptDetails
    }).populate('user', 'FCMToken');

    const fcmToken = results
        .map(item => item.user?.FCMToken)
        .filter(token => !!token);

    if (fcmToken.length <= 0) {
        throw new ApiError(500, "No resident found or apartment is vacant");
    }

    for (let file of req.files) {
        const document = await uploadOnCloudinary(file.path);

        uploadedFiles.push({
            url: document.secure_url,
        });
    }

    const updatedApartments = await Promise.all(
        parsedAptDetails.map(async (apartment) => {
            const members = await ProfileVerification.find({
                societyName: user.societyName,
                societyBlock: apartment.societyBlock,
                apartment: apartment.apartment,
            }).populate('user');

            const filteredData = members.map(item => {
                return {
                    _id: item.user._id,
                    email: item.user.email,
                    userName: item.user.userName,
                    phoneNo: item.user.phoneNo,
                    profile: item.user.profile,
                    FCMToken: item.user.FCMToken,
                };
            });

            return {
                ...apartment,
                members: filteredData,
            };
        })
    );

    parsedAptDetails = updatedApartments;

    const preApprovalEntry = await CheckInCode.create({
        approvedBy: req.user._id,
        name: name,
        mobNumber: mobNumber,
        profileImg: uploadedFiles[0]?.url || '',
        serviceName: serviceName,
        serviceLogo: serviceLogo,
        gender: gender,
        entryType: entryType,
        address: address,
        addressProof: uploadedFiles[1]?.url || '',
        gatepassAptDetails: {
            societyName: user.societyName,
            societyApartments: parsedAptDetails,
            societyGates: user.gateAssign || "",
        },
        societyName: user.societyName,
        guardStatus: {
            guard: req.user._id,
        },
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

    const payload = {
        gatePassId: checkInCode[0]._id,
        title: 'Approve Visitor Gate Pass Within 20 Minutes',
        message: "Security has sent a gate pass request for a visitor to your apartment. Please review and approve within 20 min.",
        action: 'NOTIFY_GATE_PASS_RESIDENT',
    };

    fcmToken.forEach(token => {
        sendNotification(token, payload.action, JSON.stringify(payload));
    });

    // Schedule expiry check (using setTimeout or job queue)
    setTimeout(() => {
        handleRequestExpiry(checkInCode[0]._id);
    }, 20 * 60 * 1000); // 20 minutes

    return res.status(200).json(
        new ApiResponse(200, checkInCode[0], "Service added successfully")
    );
});

const handleRequestExpiry = async (checkInCodeId) => {
    const checkInEntry = await CheckInCode.findById(checkInCodeId).populate({
        path: 'gatepassAptDetails.societyApartments.members._id',
        model: 'User',
        select: 'FCMToken userName'
    }).populate('guardStatus.guard', 'FCMToken userName');

    if (!checkInEntry) {
        return;
    }

    const approved = [];
    const rejected = [];
    const pending = [];

    const apartments = checkInEntry.gatepassAptDetails.societyApartments;

    apartments.forEach(apartment => {
        const { members, entryStatus } = apartment;

        const status = entryStatus?.status || 'pending';

        members.forEach(member => {
            const memberId = member._id;
            const fcmToken = member.FCMToken;

            if (!fcmToken) return;

            const memberInfo = {
                id: memberId,
                fcmToken,
                userName: member.userName,
                apartment: `${apartment.societyBlock} - ${apartment.apartment}`
            };

            if (status === 'approve') {
                approved.push(memberInfo);
            } else if (status === 'rejected') {
                rejected.push(memberInfo);
            } else {
                pending.push(memberInfo);
            }
        });
    });

    // Notify each category
    const notifyUsers = (users, message, action, title) => {
        const payload = {
            action: action,
            title: title,
            message: message,
        }
        users.forEach(user => {
            sendNotification(user.fcmToken, payload.action, JSON.stringify(payload));
        });
    };

    if (approved.length <= 0) {
        checkInEntry.guardStatus.status = 'rejected';
        const result = await checkInEntry.save({ validateBeforeSave: false });

        if (!result) {
            throw new ApiError(500, "Something went wrong");
        }

        const payload = {
            action: 'NOTIFY_GUARD_PASS_EXPIRED',
            title: 'Gate Pass Expired',
            message: 'Gate pass request expired due to no approval from any resident.',
        }
        sendNotification(checkInEntry.guardStatus.guard.FCMToken, payload.action, JSON.stringify(payload));
        notifyUsers(pending, 'Gate pass expired due to no response from you.', 'NOTIFY_RESIDENT_PASS_EXPIRED', 'Gate Pass Expired');
        return;
    }

    checkInEntry.guardStatus.status = 'approve';
    const result = await checkInEntry.save({ validateBeforeSave: false });

    if (!result) {
        throw new ApiError(500, "Something went wrong");
    }

    notifyUsers(approved, `Your apartment is now approved for ${checkInEntry.name} gate pass entry.`, 'NOTIFY_GATE_PASS_APPROVED', 'Gate Pass Approved');
    notifyUsers(pending, 'Gate pass expired due to no response from you.', 'NOTIFY_RESIDENT_PASS_EXPIRED', 'Gate Pass Expired');

    const payload = {
        action: 'NOTIFY_GATE_PASS_ACTIVATED',
        title: `${checkInEntry.name}'s Gate Pass is Active`,
        message: `Gate pass for ${checkInEntry.name} has been activated.`,
    }
    sendNotification(checkInEntry.guardStatus.guard.FCMToken, payload.action, JSON.stringify(payload));
};

const approveGatePass = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const gatePassId = mongoose.Types.ObjectId.createFromHexString(id);
    const gatePass = await CheckInCode.findById(gatePassId);

    if (!gatePass) {
        throw new ApiError(404, "Gate pass not found");
    }

    const status = getEntryStatus(gatePass.toObject(), req.resident.societyBlock, req.resident.apartment)

    if (gatePass.guardStatus.status !== 'pending') {
        throw new ApiError(500, "This gate pass time has expired.");
    }

    if (status == 'rejected' || status == 'approve') {
        throw new ApiError(500, "A response has already been submitted. Only one response is allowed per entry.");
    }

    // delivery.residentStatus = 'approve';
    const result = await CheckInCode.updateOne(
        {
            _id: gatePass._id,
            'guardStatus.status': 'pending',
            "gatepassAptDetails.societyApartments.societyBlock": req.resident.societyBlock,
            "gatepassAptDetails.societyApartments.apartment": req.resident.apartment
        },
        {
            $set: {
                "gatepassAptDetails.societyApartments.$[elem].entryStatus.status": "approve",
                "gatepassAptDetails.societyApartments.$[elem].entryStatus.approvedBy": req.user._id,
            }
        },
        {
            arrayFilters: [{ "elem.societyBlock": req.resident.societyBlock, "elem.apartment": req.resident.apartment }]
        }
    );

    if (!result) {
        throw new ApiError(500, "Something went wrong");
    }

    return res.status(200).json(
        new ApiResponse(200, {}, "Gate pass entry status updated successfully")
    );
});

const rejectGatePass = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const gatePassId = mongoose.Types.ObjectId.createFromHexString(id);
    const gatePass = await CheckInCode.findById(gatePassId);

    if (!gatePass) {
        throw new ApiError(404, "Gate pass not found");
    }

    const status = getEntryStatus(gatePass.toObject(), req.resident.societyBlock, req.resident.apartment)

    if (gatePass.guardStatus.status !== 'pending') {
        throw new ApiError(500, "This gate pass time has expired.");
    }

    if (status == 'rejected' || status == 'approve') {
        throw new ApiError(500, "A response has already been submitted. Only one response is allowed per entry.");
    }

    // delivery.residentStatus = 'approve';
    const result = await CheckInCode.updateOne(
        {
            _id: gatePass._id,
            "gatepassAptDetails.societyApartments.societyBlock": req.resident.societyBlock,
            "gatepassAptDetails.societyApartments.apartment": req.resident.apartment
        },
        {
            $set: {
                "gatepassAptDetails.societyApartments.$[elem].entryStatus.status": "rejected",
                "gatepassAptDetails.societyApartments.$[elem].entryStatus.approvedBy": req.user._id,
            }
        },
        {
            arrayFilters: [{ "elem.societyBlock": req.resident.societyBlock, "elem.apartment": req.resident.apartment }]
        }
    );

    if (!result) {
        throw new ApiError(500, "Something went wrong");
    }

    return res.status(200).json(
        new ApiResponse(200, {}, "Gate pass entry status updated successfully")
    );
});

const removeApartmentByMember = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const gatePassId = mongoose.Types.ObjectId.createFromHexString(id);

    const result = await CheckInCode.updateOne(
        { _id: gatePassId },
        {
            $pull: {
                "gatepassAptDetails.societyApartments": {
                    "members._id": req.user._id
                }
            }
        }
    );

    if (result.modifiedCount === 0) {
        throw new ApiError(404, "No matching gate pass found or no members to remove");
    }

    return res.status(200).json(
        new ApiResponse(200, {}, "Member removed from gate pass successfully")
    );
});

function getFCMTokensForApartment(gatepassAptDetails, aptId) {
    const apartments = gatepassAptDetails?.societyApartments || [];
    const apartment = apartments.find(apt => apt._id.toString() === aptId);
    if (!apartment) return [];
    return (apartment.members || []).map(member => member.FCMToken).filter(Boolean);
}

function getFCMTokensForAdd(gatepassAptDetails, blockName, apartmentName) {
    const apartments = gatepassAptDetails?.societyApartments || [];

    const apartment = apartments.find(
        apt => apt.societyBlock === blockName && apt.apartment === apartmentName
    );

    if (!apartment) return []; // Not found

    return (apartment.members || [])
        .map(member => member.FCMToken)
        .filter(Boolean);
}

const removeApartmentBySecurity = asyncHandler(async (req, res) => {
    const { gateId, aptId } = req.params;
    const gatePassId = mongoose.Types.ObjectId.createFromHexString(gateId);
    const apartmentId = mongoose.Types.ObjectId.createFromHexString(aptId);

    const gatePass = await CheckInCode.findById(gatePassId)
        .populate("user", "userName phoneNo profile email role")
        .populate("approvedBy", "userName phoneNo profile email role")
        .populate("guardStatus.guard", "userName phoneNo profile email role")
        .populate({
            path: "gatepassAptDetails.societyApartments.entryStatus.approvedBy",
            model: "User",
            select: "userName phoneNo profile email role"
        })
        .populate({
            path: "gatepassAptDetails.societyApartments.entryStatus.rejectedBy",
            model: "User",
            select: "userName phoneNo profile email role"
        });

    const isUpdate = await CheckInCode.updateOne(
        { _id: gatePassId },
        {
            $pull: {
                "gatepassAptDetails.societyApartments": {
                    _id: apartmentId
                }
            }
        }
    );

    if (isUpdate.modifiedCount === 0) {
        throw new ApiError(404, "No matching gate pass found or no members to remove");
    }

    const result = await CheckInCode.findById(gatePassId)
        .populate("user", "userName phoneNo profile email role")
        .populate("approvedBy", "userName phoneNo profile email role")
        .populate("guardStatus.guard", "userName phoneNo profile email role")
        .populate({
            path: "gatepassAptDetails.societyApartments.entryStatus.approvedBy",
            model: "User",
            select: "userName phoneNo profile email role"
        })
        .populate({
            path: "gatepassAptDetails.societyApartments.entryStatus.rejectedBy",
            model: "User",
            select: "userName phoneNo profile email role"
        });

    if (!result) {
        throw new ApiError(404, "No matching gate pass found");
    }

    const payload = {
        action: 'REMOVE_APARTMENT_FROM_GATE_PASS',
        title: 'Apartment Removed from Gate Pass',
        message: `Security guard has removed your apartment from the gate pass for ${result.name}.`,
    }

    const fcmToken = getFCMTokensForApartment(gatePass.gatepassAptDetails, aptId);

    fcmToken.forEach(fcmToken => {
        sendNotification(fcmToken, payload.action, JSON.stringify(payload));
    });

    return res.status(200).json(
        new ApiResponse(200, result, "Member removed from gate pass successfully")
    );
});

const removeGatePassBySecurity = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const gatePassId = mongoose.Types.ObjectId.createFromHexString(id);

    const result = await CheckInCode.deleteOne({ _id: gatePassId });
    if (result.deletedCount === 0) {
        throw new ApiError(404, "No matching gate pass found to delete");
    }
    return res.status(200).json(
        new ApiResponse(200, {}, "Gate pass deleted successfully")
    );
});

const addApartmentToGatepass = asyncHandler(async (req, res) => {
    const { id, email } = req.body;
    const gatePassId = mongoose.Types.ObjectId.createFromHexString(id);

    const apartmentMember = await User.findOne({ email: email });
    if (!apartmentMember) {
        throw new ApiError(404, "Member not found with the provided email");
    }

    const memberProfile = await ProfileVerification.findOne({ user: apartmentMember._id });
    if (!memberProfile) {
        throw new ApiError(404, "Member profile not found");
    }

    const members = await ProfileVerification.find({
        societyName: memberProfile.societyName,
        societyBlock: memberProfile.societyBlock,
        apartment: memberProfile.apartment,
    }).populate('user');

    const filteredData = members.map(item => {
        return {
            _id: item.user._id,
            email: item.user.email,
            userName: item.user.userName,
            phoneNo: item.user.phoneNo,
            profile: item.user.profile,
            FCMToken: item.user.FCMToken,
        };
    });

    if (!filteredData || filteredData.length <= 0) {
        throw new ApiError(404, "No members found in the specified apartment");
    }

    const newApartment = {
        societyBlock: memberProfile.societyBlock,
        apartment: memberProfile.apartment,
        members: filteredData,
        entryStatus: {
            status: "approve",
            approvedBy: apartmentMember
        },
    };

    const isUpdate = await CheckInCode.updateOne(
        { _id: gatePassId },
        {
            $push: {
                "gatepassAptDetails.societyApartments": newApartment
            }
        }
    );

    if (isUpdate.modifiedCount === 0) {
        throw new ApiError(404, "No matching gate pass found or no apartments to add");
    }

    const result = await CheckInCode.findById(gatePassId)
        .populate("user", "userName phoneNo profile email role")
        .populate("approvedBy", "userName phoneNo profile email role")
        .populate("guardStatus.guard", "userName phoneNo profile email role")
        .populate({
            path: "gatepassAptDetails.societyApartments.entryStatus.approvedBy",
            model: "User",
            select: "userName phoneNo profile email role"
        })
        .populate({
            path: "gatepassAptDetails.societyApartments.entryStatus.rejectedBy",
            model: "User",
            select: "userName phoneNo profile email role"
        });

    if (!result) {
        throw new ApiError(404, "No matching gate pass found");
    }

    const payload = {
        action: 'ADD_APARTMENT_TO_GATE_PASS',
        title: 'Apartment Added to Gate Pass',
        message: `Security guard has added your apartment to the gate pass for ${result.name}.`,
    }

    const fcmToken = getFCMTokensForAdd(result.gatepassAptDetails, memberProfile.societyBlock, memberProfile.apartment);

    fcmToken.forEach(fcmToken => {
        sendNotification(fcmToken, payload.action, JSON.stringify(payload));
    });

    return res.status(200).json(
        new ApiResponse(200, result, "Apartment added to gate pass successfully")
    );
});

const getGatePass = asyncHandler(async (req, res) => {
    const user = await ProfileVerification.findOne({ user: req.user._id });
    if (!user) {
        throw new ApiError(404, "Access Denied: You are no longer a registered resident of this society");
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

        filters.checkInCodeStartDate = {
            $gte: startDate,
            $lte: endDate
        };
    }

    // status filter
    if (req.query.status) {
        const currentDate = new Date();

        if (req.query.status === 'active') {
            // Active: Current date is between start and expiry dates
            filters.checkInCodeStartDate = { $lte: currentDate };
            filters.checkInCodeExpiryDate = { $gte: currentDate };
        } else if (req.query.status === 'expired') {
            // Expired: Current date is after expiry date
            filters.checkInCodeExpiryDate = { $lt: currentDate };
        }
        // For 'all', no additional filter needed
    }

    // Name/keyword search
    if (req.query.search) {
        filters.$or = [
            { name: { $regex: req.query.search, $options: 'i' } },
            { companyName: { $regex: req.query.search, $options: 'i' } },
            { serviceName: { $regex: req.query.search, $options: 'i' } },
            { mobNumber: { $regex: req.query.search, $options: 'i' } },
            { "gatepassAptDetails.societyApartments.societyBlock": { $regex: req.query.search, $options: 'i' } },
            { "gatepassAptDetails.societyApartments.apartment": { $regex: req.query.search, $options: 'i' } }
        ];
    }

    // Base match conditions for DeliveryEntry
    const checkInCodeMatch = {
        societyName: user.societyName,
        entryType: 'service',
        ...filters
    };

    // Count total documents for pagination
    const totalCount = await CheckInCode.countDocuments(checkInCodeMatch);
    const totalPages = Math.ceil(totalCount / limit);

    let response = await CheckInCode.find(checkInCodeMatch)// Populate top-level references
        .populate("user", "userName phoneNo profile email role")
        .populate("approvedBy", "userName phoneNo profile email role")
        .populate("guardStatus.guard", "userName phoneNo profile email role")

        // Populate nested references in gatepassAptDetails
        .populate({
            path: "gatepassAptDetails.societyApartments.entryStatus.approvedBy",
            model: "User",
            select: "userName phoneNo profile email role"
        })
        .populate({
            path: "gatepassAptDetails.societyApartments.entryStatus.rejectedBy",
            model: "User",
            select: "userName phoneNo profile email role"
        })
        .sort({ createdAt: -1 });

    // Apply pagination on combined results
    response = response.slice(skip, skip + limit);

    if (response.length <= 0) {
        throw new ApiError(404, "No entries found matching your criteria");
    }

    return res.status(200).json(
        new ApiResponse(200, {
            gatePassBanner: response,
            pagination: {
                totalEntries: totalCount,
                entriesPerPage: limit,
                currentPage: page,
                totalPages: totalPages,
                hasMore: page < totalPages
            }
        }, "Gate pass fetched successfully.")
    );
});

const getGatePassDetails = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const gatePassId = mongoose.Types.ObjectId.createFromHexString(id);
    const user = await ProfileVerification.findOne({ user: req.user._id });

    if (!user) {
        throw new ApiError(403, "Access Denied: You are no longer a registered resident of this society");
    }

    const gatePass = await CheckInCode.findById(gatePassId)
        .populate([
            { path: "user", select: "_id userName phoneNo profile email role" },
            { path: "approvedBy", select: "_id userName phoneNo profile email role" },
            { path: "guardStatus.guard", select: "_id userName phoneNo profile email role" },
        ])
        .lean(); // optional: improves performance if no further Mongoose ops needed

    if (!gatePass) {
        throw new ApiError(404, "Gate pass not found");
    }

    // Manual population for nested `gatepassAptDetails.societyApartments[].entryStatus.approvedBy`
    if (gatePass?.gatepassAptDetails?.societyApartments?.length) {
        for (const apt of gatePass.gatepassAptDetails.societyApartments) {
            const approvedBy = apt.entryStatus?.approvedBy;
            const rejectedBy = apt.entryStatus?.rejectedBy;

            if (approvedBy) {
                apt.entryStatus.approvedBy = await User.findById(approvedBy)
                    .select("_id userName phoneNo email role")
                    .lean();
            }

            if (rejectedBy) {
                apt.entryStatus.rejectedBy = await User.findById(rejectedBy)
                    .select("_id userName phoneNo email role")
                    .lean();
            }
        }
    }

    return res.status(200).json(
        new ApiResponse(200, gatePass, "Gate pass details fetched successfully.")
    );
});

const getGatePassesToVerify = asyncHandler(async (req, res) => {
    const gatepasses = await CheckInCode.find({
        'guardStatus.status': 'pending',
        'gatepassAptDetails.societyApartments': {
            $elemMatch: {
                'members._id': req.user._id,
                'entryStatus.status': 'pending'
            }
        },
        entryType: 'service'
    })// Populate top-level references
        .populate("user", "userName phoneNo profile email role")
        .populate("approvedBy", "userName phoneNo profile email role")
        .populate("guardStatus.guard", "userName phoneNo profile email role")

        // Populate nested references in gatepassAptDetails
        .populate({
            path: "gatepassAptDetails.societyApartments.entryStatus.approvedBy",
            model: "User",
            select: "userName phoneNo profile email role"
        })
        .populate({
            path: "gatepassAptDetails.societyApartments.entryStatus.rejectedBy",
            model: "User",
            select: "userName phoneNo profile email role"
        });

    if (!gatepasses || gatepasses.length === 0) {
        throw new ApiError(404, "No pending gate pass requests found for your apartment");
    }

    return res.status(200).json(
        new ApiResponse(200, gatepasses, "Pending gate pass requests fetched successfully")
    );
})

const getRejectedGatePass = asyncHandler(async (req, res) => {
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

        filters.checkInCodeStartDate = {
            $gte: startDate,
            $lte: endDate
        };
    }

    // Name/keyword search
    if (req.query.search) {
        filters.$or = [
            { name: { $regex: req.query.search, $options: 'i' } },
            { mobNumber: { $regex: req.query.search, $options: 'i' } },
            { serviceName: { $regex: req.query.search, $options: 'i' } },
        ];
    }

    // Base match conditions for DeliveryEntry
    const checkInCodeMatch = {
        'guardStatus.status': { $ne: 'pending' },
        'gatepassAptDetails.societyApartments': {
            $elemMatch: {
                'members._id': req.user._id,
                'entryStatus.status': { $in: ['rejected', 'pending'] }
            }
        },
        entryType: 'service',
        ...filters
    };

    // Count total documents for pagination
    const totalCount = await CheckInCode.countDocuments(checkInCodeMatch);
    const totalPages = Math.ceil(totalCount / limit);

    const gatepasses = await CheckInCode.find(checkInCodeMatch)// Populate top-level references
        .populate("user", "userName phoneNo profile email role")
        .populate("approvedBy", "userName phoneNo profile email role")
        .populate("guardStatus.guard", "userName phoneNo profile email role")

        // Populate nested references in gatepassAptDetails
        .populate({
            path: "gatepassAptDetails.societyApartments.entryStatus.approvedBy",
            model: "User",
            select: "userName phoneNo profile email role"
        })
        .populate({
            path: "gatepassAptDetails.societyApartments.entryStatus.rejectedBy",
            model: "User",
            select: "userName phoneNo profile email role"
        })
        .sort({ createdAt: -1 });

    const response = gatepasses.slice(skip, skip + limit);

    if (response.length <= 0) {
        throw new ApiError(404, "There is no entry");
    }

    const data = {
        gatePassBanner: response,
        pagination: {
            totalEntries: totalCount,
            entriesPerPage: limit,
            currentPage: page,
            totalPages: totalPages,
            hasMore: page < totalPages
        }
    }

    return res.status(200).json(
        new ApiResponse(200, data, "Expired gate pass requests fetched successfully")
    );
})

const getExpiredGatePass = asyncHandler(async (req, res) => {
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

        filters.checkInCodeStartDate = {
            $gte: startDate,
            $lte: endDate
        };
    }

    // Name/keyword search
    if (req.query.search) {
        filters.$or = [
            { name: { $regex: req.query.search, $options: 'i' } },
            { mobNumber: { $regex: req.query.search, $options: 'i' } },
            { serviceName: { $regex: req.query.search, $options: 'i' } },
        ];
    }

    // Base match conditions for DeliveryEntry
    const checkInCodeMatch = {
        checkInCodeExpiryDate: { $lt: new Date() },
        'guardStatus.status': 'approve',
        'gatepassAptDetails.societyApartments': {
            $elemMatch: {
                'members._id': req.user._id,
                'entryStatus.status': 'approve'
            }
        },
        entryType: 'service',
        ...filters
    };

    // Count total documents for pagination
    const totalCount = await CheckInCode.countDocuments(checkInCodeMatch);
    const totalPages = Math.ceil(totalCount / limit);

    const gatepasses = await CheckInCode.find(checkInCodeMatch)// Populate top-level references
        .populate("user", "userName phoneNo profile email role")
        .populate("approvedBy", "userName phoneNo profile email role")
        .populate("guardStatus.guard", "userName phoneNo profile email role")

        // Populate nested references in gatepassAptDetails
        .populate({
            path: "gatepassAptDetails.societyApartments.entryStatus.approvedBy",
            model: "User",
            select: "userName phoneNo profile email role"
        })
        .populate({
            path: "gatepassAptDetails.societyApartments.entryStatus.rejectedBy",
            model: "User",
            select: "userName phoneNo profile email role"
        })
        .sort({ createdAt: -1 });

    const response = gatepasses.slice(skip, skip + limit);

    if (response.length <= 0) {
        throw new ApiError(404, "There is no entry");
    }

    const data = {
        gatePassBanner: response,
        pagination: {
            totalEntries: totalCount,
            entriesPerPage: limit,
            currentPage: page,
            totalPages: totalPages,
            hasMore: page < totalPages
        }
    }

    return res.status(200).json(
        new ApiResponse(200, data, "Expired gate pass requests fetched successfully")
    );
})

const getApprovedGatePass = asyncHandler(async (req, res) => {
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

        filters.checkInCodeStartDate = {
            $gte: startDate,
            $lte: endDate
        };
    }

    // Name/keyword search
    if (req.query.search) {
        filters.$or = [
            { name: { $regex: req.query.search, $options: 'i' } },
            { mobNumber: { $regex: req.query.search, $options: 'i' } },
            { checkInCode: { $regex: req.query.search, $options: 'i' } },
            { serviceName: { $regex: req.query.search, $options: 'i' } },
        ];
    }

    // Base match conditions for DeliveryEntry
    const checkInCodeMatch = {
        'guardStatus.status': 'approve',
        checkInCodeExpiryDate: { $gte: new Date() },
        'gatepassAptDetails.societyApartments': {
            $elemMatch: {
                'members._id': req.user._id,
                'entryStatus.status': 'approve'
            }
        },
        entryType: 'service',
        ...filters
    };

    // Count total documents for pagination
    const totalCount = await CheckInCode.countDocuments(checkInCodeMatch);
    const totalPages = Math.ceil(totalCount / limit);

    const gatepasses = await CheckInCode.find(checkInCodeMatch)// Populate top-level references
        .populate("user", "userName phoneNo profile email role")
        .populate("approvedBy", "userName phoneNo profile email role")
        .populate("guardStatus.guard", "userName phoneNo profile email role")

        // Populate nested references in gatepassAptDetails
        .populate({
            path: "gatepassAptDetails.societyApartments.entryStatus.approvedBy",
            model: "User",
            select: "userName phoneNo profile email role"
        })
        .populate({
            path: "gatepassAptDetails.societyApartments.entryStatus.rejectedBy",
            model: "User",
            select: "userName phoneNo profile email role"
        })
        .sort({ createdAt: -1 });

    const response = gatepasses.slice(skip, skip + limit);

    if (response.length <= 0) {
        throw new ApiError(404, "There is no entry");
    }

    const data = {
        gatePassBanner: response,
        pagination: {
            totalEntries: totalCount,
            entriesPerPage: limit,
            currentPage: page,
            totalPages: totalPages,
            hasMore: page < totalPages
        }
    }

    return res.status(200).json(
        new ApiResponse(200, data, "Approved gate pass requests fetched successfully")
    );
})

const getVerificationGatePassSecurity = asyncHandler(async (req, res) => {
    const gatepasses = await CheckInCode.find({
        'guardStatus.status': 'pending',
        'guardStatus.guard': req.user._id,
        entryType: 'service'
    })// Populate top-level references
        .populate("user", "userName phoneNo profile email role")
        .populate("approvedBy", "userName phoneNo profile email role")
        .populate("guardStatus.guard", "userName phoneNo profile email role")

        // Populate nested references in gatepassAptDetails
        .populate({
            path: "gatepassAptDetails.societyApartments.entryStatus.approvedBy",
            model: "User",
            select: "userName phoneNo profile email role"
        })
        .populate({
            path: "gatepassAptDetails.societyApartments.entryStatus.rejectedBy",
            model: "User",
            select: "userName phoneNo profile email role"
        });

    if (!gatepasses || gatepasses.length === 0) {
        throw new ApiError(404, "No pending gate pass requests found for your apartment");
    }

    return res.status(200).json(
        new ApiResponse(200, gatepasses, "Pending gate pass requests fetched successfully")
    );
})

const getExpiredGatePassSecurity = asyncHandler(async (req, res) => {
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

        filters.checkInCodeStartDate = {
            $gte: startDate,
            $lte: endDate
        };
    }

    // Name/keyword search
    if (req.query.search) {
        filters.$or = [
            { name: { $regex: req.query.search, $options: 'i' } },
            { mobNumber: { $regex: req.query.search, $options: 'i' } },
            { checkInCode: { $regex: req.query.search, $options: 'i' } },
            { serviceName: { $regex: req.query.search, $options: 'i' } },
        ];
    }

    // Base match conditions for DeliveryEntry
    const checkInCodeMatch = {
        entryType: 'service',
        $or: [
            { checkInCodeExpiryDate: { $lt: new Date() } },
            { 'guardStatus.status': 'rejected' }
        ],
        ...filters
    };

    // Count total documents for pagination
    const totalCount = await CheckInCode.countDocuments(checkInCodeMatch);
    const totalPages = Math.ceil(totalCount / limit);

    const gatepasses = await CheckInCode.find(checkInCodeMatch)// Populate top-level references
        .populate("user", "userName phoneNo profile email role")
        .populate("approvedBy", "userName phoneNo profile email role")
        .populate("guardStatus.guard", "userName phoneNo profile email role")

        // Populate nested references in gatepassAptDetails
        .populate({
            path: "gatepassAptDetails.societyApartments.entryStatus.approvedBy",
            model: "User",
            select: "userName phoneNo profile email role"
        })
        .populate({
            path: "gatepassAptDetails.societyApartments.entryStatus.rejectedBy",
            model: "User",
            select: "userName phoneNo profile email role"
        })
        .sort({ createdAt: -1 });

    const response = gatepasses.slice(skip, skip + limit);

    if (response.length <= 0) {
        throw new ApiError(404, "There is no entry");
    }

    const data = {
        gatePassBanner: response,
        pagination: {
            totalEntries: totalCount,
            entriesPerPage: limit,
            currentPage: page,
            totalPages: totalPages,
            hasMore: page < totalPages
        }
    }

    return res.status(200).json(
        new ApiResponse(200, data, "Expired gate pass requests fetched successfully")
    );
})

function getEntryStatus(data, societyBlock, apartment) {
    const apartments = data.gatepassAptDetails.societyApartments;
    const targetApartment = apartments.find((apartmentInfo) => apartmentInfo.societyBlock === societyBlock && apartmentInfo.apartment === apartment);

    if (targetApartment) {
        return targetApartment.entryStatus.status;
    } else {
        return "Not found";
    }
}

export {
    addPreApproval,
    reSchedule,
    getExpectedEntry,
    exitEntry,
    getCurrentEntry,
    getPastEntry,
    addGatePass,
    getGatePass,
    getGatePassDetails,
    approveGatePass,
    rejectGatePass,
    removeApartmentByMember,
    addApartmentToGatepass,
    removeApartmentBySecurity,
    getGatePassesToVerify,
    getRejectedGatePass,
    getExpiredGatePass,
    getApprovedGatePass,
    getVerificationGatePassSecurity,
    getExpiredGatePassSecurity,
    removeGatePassBySecurity
}