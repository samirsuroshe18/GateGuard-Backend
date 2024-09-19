import asyncHandler from "../utils/asynchandler.js";
import ApiError from "../utils/ApiError.js";

const verifyAdmin = asyncHandler(async (req, _, next) => {
    try {
        if (req.user.role !== 'admin') {
            throw new ApiError(401, "You are not admin.");
        }

        req.admin = req.user;
        next();
    } catch (error) {
        throw new ApiError(401, error?.message || "Access denied");
    }
})

export { verifyAdmin };