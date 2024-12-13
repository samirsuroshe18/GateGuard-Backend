import ApiResponse from '../utils/ApiResponse.js';
import ApiError from '../utils/ApiError.js';
import asyncHandler from '../utils/asynchandler.js';
import { ProfileVerification } from '../models/profileVerification.model.js';

const getApartmentMembers = asyncHandler(async (req, res) => {
    const user = await ProfileVerification.findOne({ user: req.user._id });

    if (!user) {
        throw new ApiError(500, "Access Denied: You are no longer a registered resident of this society");
    }

    const members = await ProfileVerification.aggregate([
        {
            $match: {
                societyName: user.societyName,
                societyBlock: user.societyBlock,
                apartment: user.apartment,
                residentStatus: "approve"
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
            $project: {
                user: 1,
                profileType: 1,
                societyName: 1,
                societyBlock: 1,
                apartment: 1,
                ownership: 1,
                residentStatus: 1,
            }
        }
    ]);

    return res.status(200).json(
        new ApiResponse(200, members, "Apartment members fetched successfully")
    );
});

export { getApartmentMembers }