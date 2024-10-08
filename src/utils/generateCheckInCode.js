import { CheckInCode } from "../models/checkInCode.model.js";

const generateCheckInCode = async (societyName) => {
    try {
        const checkInCode = await CheckInCode.find({
            societyName,
            checkInCodeStart: { $lt: Date.now() },
            checkInCodeExpiry: { $gt: Date.now() }
        });

        // Ensure checkInCodeOnly is always an array
        const checkInCodeOnly = checkInCode.length > 0 ? checkInCode.map(doc => doc.checkInCode) : [];

        let newCode;
        do {
            newCode = Math.floor(100000 + Math.random() * 900000).toString();
        } while (checkInCodeOnly.includes(newCode));

        return newCode;
    } catch (error) {
        throw new ApiError(500, "Something went wrong while generating refresh and access token");
    }
}

const generateNotificationId = () => {
    try {
        let notificationCode = Math.floor(10000000 + Math.random() * 90000000).toString();
        return notificationCode;
    } catch (error) {
        throw new ApiError(500, "Something went wrong while generating refresh and access token");
    }
}

export { generateCheckInCode, generateNotificationId }