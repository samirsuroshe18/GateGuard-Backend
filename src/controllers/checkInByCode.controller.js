import asyncHandler from '../utils/asynchandler.js';
import ApiError from '../utils/ApiError.js';
import ApiResponse from '../utils/ApiResponse.js';
import { CheckInCode } from '../models/checkInCode.model.js';
import { PreApproved } from '../models/preApproved.model.js';
import { ProfileVerification } from '../models/profileVerification.model.js';
import { User } from '../models/user.model.js';
import { sendNotification } from '../utils/sendResidentNotification.js';


const checkInByCodeEntry = asyncHandler(async (req, res) => {
    const { checkInCode } = req.body;
    const security = await ProfileVerification.findOne({ user: req.user._id, profileType: 'Security' });

    if (!security) {
        throw new ApiError(500, `You are not security guard`);
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

    let residentOrSecurityImg = null;
    if (checkInCodeExist.profileType != null && checkInCodeExist.profileType == 'Resident' || checkInCodeExist.profileType == 'Security') {
        const user = await User.findById(checkInCodeExist.user);
        if (user) {
            residentOrSecurityImg = user.profile;
        }
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
        profileImg: residentOrSecurityImg != null ? residentOrSecurityImg : checkInCodeExist.profileImg,
        companyName: checkInCodeExist.companyName,
        companyLogo: checkInCodeExist.companyLogo,
        serviceName: checkInCodeExist.serviceName,
        serviceLogo: checkInCodeExist.serviceLogo,
        'vehicleDetails.vehicleNumber': checkInCodeExist.vehicleNo,
        entryType: checkInCodeExist.entryType,
        profileType: checkInCodeExist.profileType,
        societyName: checkInCodeExist.societyName,
        blockName: checkInCodeExist.blockName,
        apartment: checkInCodeExist.apartment,
        gateName: security.gateAssign,
        entryTime: new Date(),
    });

    if (!checkInCodeEntry) {
        throw new ApiError(500, "Something went wrong");
    }

    const profile = await ProfileVerification.aggregate([
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

    const FCMTokens = profile.map((item) => item.user.FCMToken);

    let payload = {
        guardName: security.userName,
        entryType: checkInCodeEntry.entryType,
        deliveryName: checkInCodeEntry.name,
        action: 'NOTIFY_CHECKED_IN_ENTRY'
    };

    FCMTokens.forEach(token => {
        sendNotification(token, payload.action, JSON.stringify(payload));
    });

    return res.status(200).json(
        new ApiResponse(200, {}, "CheckInCode entry added successfully")
    );
});

function compareTime(startTime, endTime) {
    const startDate = `${startTime.getDate()}/${startTime.getMonth() + 1}/${startTime.getFullYear()}`;
    const endDate = `${endTime.getDate()}/${endTime.getMonth() + 1}/${endTime.getFullYear()}`;

    const now = new Date();
    const current = now.getHours() * 3600 + now.getMinutes() * 60 + now.getSeconds();
    const currentDate = `${now.getDate()}/${now.getMonth() + 1}/${now.getFullYear()}`;

    // Extract start and end times in seconds
    const start = startTime?.getHours() * 3600 + startTime?.getMinutes() * 60 + startTime?.getSeconds();
    const end = endTime?.getHours() * 3600 + endTime?.getMinutes() * 60 + endTime?.getSeconds();

    if (start >= end) {
        if (start === end && currentDate === startDate && current < start) {
            // If current time is before the end or after the start
            return `You are not authorized to enter yet. Your access begins from ${formatTime(startTime)} to ${formatTime(endTime)}. Please wait until the allowed entry time.`;
        } else if (start === end && currentDate == endDate && current > end) {
            // If current time is before the end or after the start
            return `Your access time has expired for today. The allowed entry was from ${formatTime(startTime)} to ${formatTime(endTime)}. Please contact the host for further assistance.`;
        } else if (start > end && currentDate == startDate && current < start) {
            // If current time is before the end or after the start
            return `You are not authorized to enter yet. Your access begins from ${formatTime(startTime)} to ${formatTime(endTime)}. Please wait until the allowed entry time.`;
        } else if (start > end && currentDate == endDate && current > end) {
            // If current time is before the end or after the start
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