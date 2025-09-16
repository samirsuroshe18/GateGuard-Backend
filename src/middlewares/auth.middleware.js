import ApiError from "../utils/ApiError.js";
import asyncHandler from "../utils/asynchandler.js";
import jwt from 'jsonwebtoken';
import { User } from "../models/user.model.js";

const verifyJwt = asyncHandler(async (req, _, next) => {
    try {
        const token = req.header("Authorization")?.replace("Bearer ", "");

        if (!token || token === "null" || token === "undefined") {
            throw new ApiError(401, "Unauthorised request");
        }

        let decodedToken;
        try {
            decodedToken = jwt.verify(token, process.env.ACCESS_TOKEN_SECRET);
        } catch (error) {
            if (error.name === 'TokenExpiredError') {
                throw new ApiError(401, "Access token expired");
            } else {
                throw new ApiError(403, "Invalid access token");
            }
        }

        const user = await User.findById(decodedToken?._id).select("-password -refreshToken -__v -FCMToken -isGoogleVerified -isVerified");

        if (!user) {
            throw new ApiError(401, "Invalid access token");
        }

        req.user = user;
        next();
    } catch (error) {
        throw new ApiError(401, error?.message || "Invalid access token");
    }
})

export { verifyJwt };