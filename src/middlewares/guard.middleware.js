import asyncHandler from "../utils/asynchandler.js";
import ApiError from "../utils/ApiError.js";
import { ProfileVerification } from "../models/profileVerification.model.js";

const verifyGuard = asyncHandler(async (req, _, next) => {
    try {
        const guard = await ProfileVerification.findOne({ user: req.user._id, profileType: 'Security', guardStatus: 'approve' });
        if (!guard) {
            throw new ApiError(500, "Access Denied: You are no longer a registered security guard of this society");
        }

        req.guard = guard;
        next();
    } catch (error) {
        throw new ApiError(401, error?.message || "Access denied");
    }
})

export { verifyGuard };