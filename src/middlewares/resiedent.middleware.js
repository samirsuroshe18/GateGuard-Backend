import asyncHandler from "../utils/asynchandler.js";
import ApiError from "../utils/ApiError.js";
import { ProfileVerification } from "../models/profileVerification.model.js";

const verifyResident = asyncHandler(async (req, _, next) => {
    try {
        const resident = await ProfileVerification.findOne({ user: req.user._id, profileType: 'Resident', residentStatus: "approve" });
        if (!resident) {
            throw new ApiError(500, "Access Denied: You are no longer a registered resident of this society");
        }

        req.resident = resident;
        next();
    } catch (error) {
        throw new ApiError(401, error?.message || "Access denied");
    }
})

export { verifyResident };