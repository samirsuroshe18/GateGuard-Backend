import asyncHandler from '../utils/asynchandler.js'; 
import ApiError from '../utils/ApiError.js';
import ApiResponse from '../utils/ApiResponse.js';
import { CheckInCode } from '../models/checkInCode.model.js';
import { PreApproved } from '../models/preApproved.model.js';
import { ProfileVerification } from '../models/profileVerification.model.js';
import { sendNotification } from '../utils/sendResidentNotification.js';

const checkInByCodeEntry = asyncHandler(async (req, res) => {
    const { checkInCode } = req.body;
    const security = await ProfileVerification.findOne({ user: req.user._id, profileType: 'Security' });

    if (!security) {
        throw new ApiError(500, `Access Denied: You are no longer a registered security guard of this society`);
    }

    const checkInCodeEarly = await CheckInCode.findOne({
        checkInCode,
        societyName: security.societyName,
        checkInCodeStartDate: { $gt: Date.now() },
        checkInCodeExpiryDate: { $gt: Date.now() }
    });

    if (checkInCodeEarly) {
        throw new ApiError(500, `You are not authorized to enter yet. Your access is valid starting from ${formatDateTime(checkInCodeEarly.checkInCodeStartDate, checkInCodeEarly.checkInCodeStart)}. Please return on or after this date.`);
    }

    const checkInCodeExist = await CheckInCode.findOne({
        checkInCode,
        societyName: security.societyName,
        checkInCodeStartDate: { $lt: Date.now() },
        $or: [
            { checkInCodeExpiryDate: { $gt: Date.now() } },
            { checkInCodeExpiryDate: null }
        ]
    });

    if (!checkInCodeExist) {
        throw new ApiError(500, "CheckIn code is invalid or expired.");
    }

    if(checkInCodeExist?.entryType === 'service' && checkInCodeExist?.guardStatus?.status != 'approve') {
        throw new ApiError(500, `Check-In Failed: Your gate pass is either not approved yet or has expired.`);
    }

    let residentOrSecurityImg = null;
    if (checkInCodeExist.profileType != null && checkInCodeExist.profileType == 'Resident' || checkInCodeExist.profileType == 'Security') {
        const message = checkInCodeExist.profileType == 'Resident' ? "You are already registered as a resident. No new entry is required." : "You are already registered as a security guard. No new entry is required.";
        return res.status(200).json(
            new ApiResponse(200, {}, message)
        );
    }

    const msg = compareTime(checkInCodeExist.checkInCodeStart, checkInCodeExist.checkInCodeExpiry);

    if (msg) {
        throw new ApiError(500, msg);
    }

    checkInCodeExist.isPreApproved = false;
    await checkInCodeExist.save({ validateBeforeSave: false });

    const checkInCodeEntry = await PreApproved.create({
        'approvedBy.user': checkInCodeExist.approvedBy,
        'allowedBy.user': req.user._id,
        name: checkInCodeExist.name,
        mobNumber: checkInCodeExist.mobNumber,
        profileImg: residentOrSecurityImg != null ? residentOrSecurityImg : checkInCodeExist?.profileImg,
        companyName: checkInCodeExist?.companyName,
        companyLogo: checkInCodeExist?.companyLogo,
        serviceName: checkInCodeExist?.serviceName,
        serviceLogo: checkInCodeExist?.serviceLogo,
        'vehicleDetails.vehicleNumber': checkInCodeExist?.vehicleNo,
        entryType: checkInCodeExist?.entryType,
        profileType: checkInCodeExist?.profileType,
        societyName: checkInCodeExist?.societyName,
        blockName: checkInCodeExist?.blockName,
        apartment: checkInCodeExist?.apartment,
        gatepassAptDetails: checkInCodeExist?.gatepassAptDetails,
        gateName: security.gateAssign,
        entryTime: new Date(),
    });

    if (!checkInCodeEntry) {
        throw new ApiError(500, "Something went wrong");
    }

    let profile;

    if (checkInCodeEntry.entryType == 'service') {
        profile = await ProfileVerification.aggregate([
            {
                $match: {
                    residentStatus: 'approve',
                    societyName: checkInCodeEntry.societyName,
                    $or: checkInCodeEntry.gatepassAptDetails.societyApartments.map(apartment => ({
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
                    residentStatus: 'approve',
                    societyName: checkInCodeEntry.societyName,
                    societyBlock: checkInCodeEntry.blockName,
                    apartment: checkInCodeEntry.apartment
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

    const FCMTokens = profile.map((item) => item.user?.FCMToken).filter((token) => token != null);

    let payload = {
        guardName: req.user.userName,
        entryType: checkInCodeEntry.entryType,
        deliveryName: checkInCodeEntry.name,
        action: 'NOTIFY_CHECKED_IN_ENTRY'
    };

    if (checkInCodeEntry.entryType != null) {
        FCMTokens.forEach(token => {
            sendNotification(token, payload.action, JSON.stringify(payload));
        });
    }

    return res.status(200).json(
        new ApiResponse(200, {}, "CheckInCode entry added successfully")
    );
});

function compareTime(startTime, endTime) {
    const startDate = `${startTime?.getDate()}/${startTime?.getMonth() + 1}/${startTime?.getFullYear()}`;
    const endDate = `${endTime?.getDate()}/${endTime?.getMonth() + 1}/${endTime?.getFullYear()}`;

    const now = new Date();
    const istOffset = 5.5 * 60 * 60 * 1000; // IST is UTC + 5.5 hours
    const localTime = new Date(now.getTime() + istOffset);
    const current = localTime.getHours() * 3600 + localTime.getMinutes() * 60 + localTime.getSeconds();
    const currentDate = `${localTime.getDate()}/${localTime.getMonth() + 1}/${localTime.getFullYear()}`;

    // Extract start and end times in seconds
    const start = startTime?.getHours() * 3600 + startTime?.getMinutes() * 60 + startTime?.getSeconds();
    const end = endTime?.getHours() * 3600 + endTime?.getMinutes() * 60 + endTime?.getSeconds();

    if (start > end || start === end) {
        if (start === end && currentDate === startDate && current < start) {
            return `You are not authorized to enter yet. Your access begins from ${formatTime(startTime)} to ${formatTime(endTime)}. Please wait until the allowed entry time.`;
        } else if (start === end && currentDate == endDate && current > end) {
            return `Your access time has expired for today. The allowed entry was from ${formatTime(startTime)} to ${formatTime(endTime)}. Please contact the host for further assistance.`;
        } else if (start > end && currentDate == startDate && current < start) {
            return `You are not authorized to enter yet. Your access begins from ${formatTime(startTime)} to ${formatTime(endTime)}. Please wait until the allowed entry time.`;
        } else if (start > end && currentDate == endDate && current > end) {
            return `Your access time has expired for today. The allowed entry was from ${formatTime(startTime)} to ${formatTime(endTime)}. Please contact the host for further assistance.`;
        }
    } else {
        // Regular comparison if the range doesn't cross midnight
        if (current < start) {
            return `You are not authorized to enter yet. Your access begins from ${formatTime(startTime)} to ${formatTime(endTime)}. Please wait until the allowed entry time.`;
        } else if (current > end) {
            return `Your access time has expired for today. The allowed entry was from ${formatTime(startTime)} to ${formatTime(endTime)}. Please contact the host for further assistance.`;
        }
    }
    return null;
}

function formatTime(dateTime) {
    // Get the hours and minutes
    let hours = dateTime.getHours();
    const minutes = String(dateTime.getMinutes()).padStart(2, '0');

    // Determine AM or PM
    const amPm = hours >= 12 ? 'PM' : 'AM';

    // Convert to 12-hour format
    hours = hours % 12;
    hours = hours ? String(hours).padStart(2, '0') : '12'; // the hour '0' should be '12'

    return `${hours}:${minutes} ${amPm}`;
}

function formatDateTime(startDate, startTime) {
    // Get the hours and minutes
    let hours = startTime.getHours();
    const minutes = String(startTime.getMinutes()).padStart(2, '0');

    // Determine AM or PM
    const amPm = hours >= 12 ? 'PM' : 'AM';

    // Convert to 12-hour format
    hours = hours % 12;
    hours = hours ? String(hours).padStart(2, '0') : '12'; // the hour '0' should be '12'

    // Format the date
    const formattedDate = `${String(startDate.getDate()).padStart(2, '0')}/${String(startDate.getMonth() + 1).padStart(2, '0')}/${startDate.getFullYear()}`;
    const formattedTime = `${hours}:${minutes} ${amPm}`;

    return `${formattedDate} to ${formattedTime}`;
}

export {
    checkInByCodeEntry,
}