import asyncHandler from '../utils/asynchandler.js';
import ApiError from '../utils/ApiError.js';
import ApiResponse from '../utils/ApiResponse.js';
import { CheckInCode } from '../models/checkInCode.model.js';
import { PreApproved } from '../models/preApproved.model.js';
import { ProfileVerification } from '../models/profileVerification.model.js';


const checkInByCodeEntry = asyncHandler(async (req, res) => {
    const { checkInCode } = req.body;
    const security = await ProfileVerification.findOne({ user: req.user._id, profileType: 'Security' });

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

    const msg = compareTime(checkInCodeExist.checkInCodeStart, checkInCodeExist.checkInCodeExpiry);
    if (msg) {
        throw new ApiError(500, msg);
    }

    checkInCodeExist.isPreApproved = true;
    await checkInCodeExist.save({ validateBeforeSave: false });

    const checkInCodeEntry = await PreApproved.create({
        name: checkInCodeExist.name,
        mobNumber: checkInCodeExist.mobNumber,
        profileType: checkInCodeExist.profileType,
        approvedBy: checkInCodeExist.approvedBy,
        allowedBy: req.user._id,
        entryTime: Date.now(),
    });

    if (!checkInCodeEntry) {
        throw new ApiError(500, "Something went wrong");
    }

    return res.status(200).json(
        new ApiResponse(200, {}, "CheckInCode entry added successfully")
    );
});

function compareTime(startTime, endTime) {
    // Extract current time in seconds
    const now = new Date();
    const current = now.getHours() * 3600 + now.getMinutes() * 60 + now.getSeconds();

    // Extract start and end times in seconds
    const start = startTime?.getHours() * 3600 + startTime?.getMinutes() * 60 + startTime?.getSeconds();
    const end = endTime?.getHours() * 3600 + endTime?.getMinutes() * 60 + endTime?.getSeconds();

    // Compare current time with start and end times
    // Check if the time range crosses midnight
    const crossesMidnight = start > end;

    if (crossesMidnight) {
        // If current time is before the end or after the start
        if (current < start && current > end) {
            return `You are not authorized to enter yet. Your access begins from ${formatTime(startTime)} to ${formatTime(endTime)}. Please wait until the allowed entry time.`;
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