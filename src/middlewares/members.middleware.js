import asyncHandler from "../utils/asynchandler.js";
import ApiError from "../utils/ApiError.js";
import { ProfileVerification } from "../models/profileVerification.model.js";

const verifyMember = asyncHandler(async (req, _, next) => {
    const member = await ProfileVerification.findOne({
        user: req.user._id,
        $or: [
            { residentStatus: "approve" },
            { guardStatus: "approve" }
        ]
    });
    
    if (!member) {
        throw new ApiError(500, "Access Denied: You are no longer a registered member of this society");
    }

    req.member = member;
    next();
})

export { verifyMember };