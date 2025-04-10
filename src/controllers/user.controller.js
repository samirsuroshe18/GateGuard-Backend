import dotenv from "dotenv";
dotenv.config()
import asyncHandler from '../utils/asynchandler.js';
import ApiError from '../utils/ApiError.js';
import ApiResponse from '../utils/ApiResponse.js';
import { User } from '../models/user.model.js';
import mailSender from '../utils/mailSender.js';
import { sendNotification, sendNotificationCancel } from '../utils/sendResidentNotification.js';
import { ProfileVerification } from '../models/profileVerification.model.js';
import { CheckInCode } from '../models/checkInCode.model.js';
import { generateCheckInCode } from '../utils/generateCheckInCode.js';
import { deleteCloudinary, uploadOnCloudinary } from "../utils/cloudinary.js";

const generateAccessAndRefreshToken = async (userId) => {
    try {
        const user = await User.findById(userId);
        const accessToken = user.generateAccessToken();
        const refreshToken = user.generateRefreshToken();

        user.refreshToken = refreshToken;

        // when we use save() method is used then all the fields are neccesary so to avoid that we have to pass an object with property {validatBeforeSave:false}
        await user.save({ validateBeforeSave: false });

        return { accessToken, refreshToken }
    } catch (error) {
        throw new ApiError(500, "Something went wrong while generating refresh and access token");
    }
}

const registerUser = asyncHandler(async (req, res) => {
    const { userName, email, password } = req.body;

    if (!userName?.trim() || !email?.trim() || !password?.trim()) {
        throw new ApiError(400, "All fields are required");
    }

    const existedUser = await User.findOne({ email });

    if (existedUser) {
        throw new ApiError(409, 'User with same email already exists');
    }

    const user = await User.create({
        email,
        password,
        userName,
        expireDocAfterSeconds : new Date()
    });

    const createdUser = await User.findById(user._id);

    if (!createdUser) {
        throw new ApiError(500, "Something went wrong");
    }

    const mailResponse = await mailSender(email, createdUser._id, "VERIFY");

    if (mailResponse) {
        return res.status(200).json(
            new ApiResponse(200, {}, "An email sent to your account please verify in 10 minutes")
        );
    }

    throw new ApiError(500, "Something went wrong!! An email couldn't sent to your account");
});

const loginUser = asyncHandler(async (req, res) => {
    const { email, password, FCMToken } = req.body;

    if (!email && !password) {
        throw new ApiError(400, "All fields are required");
    }

    const user = await User.findOne({ email });

    if (!user || !user?.password) {
        throw new ApiError(404, "Invalid credential");
    }

    // you cant access isPasswordCorrect method directly through 'User' beacause User is mogoose object 
    // these methods is applied only the instance of the user when mongoose return its instance
    // you can acces User.findOne() but you cant access User.isPasswordCorrect()
    const isPasswordValid = await user.isPasswordCorrect(password);

    if (!isPasswordValid) {
        throw new ApiError(401, "Invalid user credential");
    }

    if (!user?.isVerified) {
        const mailResponse = await mailSender(email, user._id, "VERIFY");

        if (mailResponse) {
            throw new ApiError(310, "Your email is not verified. An email sent to your account please verify in 10 minutes");
        }
    }

    const { accessToken, refreshToken } = await generateAccessAndRefreshToken(user._id);

    const loggedInUser = await User.findById(user._id).select("-password -refreshToken -__v");
    loggedInUser.FCMToken = FCMToken;
    await loggedInUser.save({ validateBeforeSave: false });

    //option object is created beacause we dont want to modified the cookie to front side
    const option = {
        httpOnly: true,
        secure: true
    }

    const checkInCode = await CheckInCode.findOne({ user: req?.user?._id });
    const society = await ProfileVerification.findOne({ user: req?.user?._id });

    return res.status(200).cookie('accessToken', accessToken, option).cookie('refreshToken', refreshToken, option).json(
        new ApiResponse(200, {
            loggedInUser: {
                ...loggedInUser.toObject(),
                checkInCode: checkInCode ? checkInCode.toObject().checkInCode : null,
                societyName: society ? society.toObject().societyName : null,
                societyBlock: society ? society.toObject().societyBlock : null,
                apartment: society ? society.toObject().apartment : null,
                profileType: society ? society.toObject().profileType : null
            },
            accessToken,
            refreshToken
        }, "User logged in sucessully")
    );
});

const registerUserGoogle = asyncHandler(async (req, res) => {
    const { userName, email, profile, FCMToken } = req.body;

    if (!userName?.trim() || !email?.trim() || !profile?.trim()) {
        throw new ApiError(400, "All fields are required");
    }

    const existedUser = await User.findOne({ email });

    if (existedUser && existedUser.isGoogleVerified === false) {
        throw new ApiError(409, 'An account with this email already exists. Would you like to link your Google account to this existing account?');
    }

    if (existedUser && existedUser.isGoogleVerified === true && existedUser.isVerified === true) {
        const { accessToken, refreshToken } = await generateAccessAndRefreshToken(existedUser._id);

        existedUser.email = email;
        existedUser.FCMToken = FCMToken;
        await existedUser.save({ validateBeforeSave: false });

        //option object is created beacause we dont want to modified the cookie to front side
        const option = {
            httpOnly: true,
            secure: true
        }
        const checkInCode = await CheckInCode.findOne({ user: req?.user?._id });
        const society = await ProfileVerification.findOne({ user: req?.user?._id });

        return res.status(200).cookie('accessToken', accessToken, option).cookie('refreshToken', refreshToken, option).json(
            new ApiResponse(200, {
                loggedInUser: {
                    ...existedUser.toObject(),
                    checkInCode: checkInCode ? checkInCode.toObject().checkInCode : null,
                    societyName: society ? society.toObject().societyName : null,
                    societyBlock: society ? society.toObject().societyBlock : null,
                    apartment: society ? society.toObject().apartment : null,
                    profileType: society ? society.toObject().profileType : null
                },
                accessToken,
                refreshToken
            }, "User logged in sucessully")
        );
    }

    const user = await User.create({
        userName,
        email,
        profile,
        isGoogleVerified: true,
        isVerified: true,
        FCMToken
    });

    const createdUser = await User.findById(user._id).select("-password");

    if (!createdUser) {
        throw new ApiError(500, "Something went wrong");
    }

    const { accessToken, refreshToken } = await generateAccessAndRefreshToken(createdUser._id);

    //option object is created beacause we dont want to modified the cookie to front side
    const option = {
        httpOnly: true,
        secure: true
    }

    const checkInCode = await CheckInCode.findOne({ user: req?.user?._id });
    const society = await ProfileVerification.findOne({ user: req?.user?._id });

    return res.status(200).cookie('accessToken', accessToken, option).cookie('refreshToken', refreshToken, option).json(
        new ApiResponse(200, {
            loggedInUser: {
                ...createdUser.toObject(),
                checkInCode: checkInCode ? checkInCode.toObject().checkInCode : null,
                societyName: society ? society.toObject().societyName : null,
                societyBlock: society ? society.toObject().societyBlock : null,
                apartment: society ? society.toObject().apartment : null,
                profileType: society ? society.toObject().profileType : null,
                residentStatus: society ? society.toObject().residentStatus : null,
                guardStatus: society ? society.toObject().guardStatus : null,
            },
            accessToken,
            refreshToken
        }, "User logged in sucessully")
    );
});

const linkGoogleAccount = asyncHandler(async (req, res) => {
    const { userName, email, profile } = req.body;

    if (!userName?.trim() || !email?.trim() || !profile?.trim()) {
        throw new ApiError(400, "all fields required");
    }

    const existedUser = await User.findOne({ email });

    if (!existedUser) {
        throw new ApiError(401, 'User does not exists');
    }

    const mailResponse = await mailSender(email, existedUser._id, "GOOGLE");

    if (mailResponse) {
        return res.status(200).json(
            new ApiResponse(200, {}, "An email sent to your account please verify in 10 minutes")
        );
    }

    throw new ApiError(500, "Something went wrong!! An email couldn't sent to your account");
});

const logoutUser = asyncHandler(async (req, res) => {

    await User.findByIdAndUpdate(
        req.user._id,
        {
            $unset: {
                refreshToken: 1,
                FCMToken: 1
            }
        },
        {
            new: true
        }
    );

    const option = {
        httpOnly: true,
        secure: true
    }

    return res.status(200).clearCookie("accessToken", option).clearCookie("refreshToken", option).json(
        new ApiResponse(200, {}, "User logged out")
    )
});

const changeCurrentPassword = asyncHandler(async (req, res) => {
    const { oldPassword, newPassword } = req.body;

    const user = await User.findById(req.user._id);
    const isPasswordCorrect = await user.isPasswordCorrect(oldPassword);

    if (!isPasswordCorrect) {
        throw new ApiError(400, "Password is incorrect");
    }

    user.password = newPassword;
    await user.save({ validateBeforeSave: false });

    return res.status(200).json(new ApiResponse(200, {}, "Password changed successfully"));
});

const forgotPassword = asyncHandler(async (req, res) => {
    const { email } = req.body;

    const user = await User.findOne({ email });

    if (!user || !user?.isVerified) {
        throw new ApiError(404, "Invalid email or email is not verified");
    }

    const mailResponse = await mailSender(email, user._id, "RESET");

    if (mailResponse) {
        return res.status(200).json(
            new ApiResponse(200, {}, "An email sent to your account please reset your password in 10 minutes")
        );
    }

    throw new ApiError(500, "Something went wrong!! An email couldn't sent to your account");
});

const getCurrentUser = asyncHandler(async (req, res) => {
    const user = await CheckInCode.findOne({ user: req.user._id });
    const society = await ProfileVerification.findOne({ user: req.user._id });
    return res.status(200).json(
        new ApiResponse(200, {
            ...req.user.toObject(),
            checkInCode: user ? user.toObject().checkInCode : null,
            societyName: society ? society.toObject().societyName : null,
            societyBlock: society ? society.toObject().societyBlock : null,
            apartment: society ? society.toObject().apartment : null,
            profileType: society ? society.toObject().profileType : null,
            residentStatus: society ? society.toObject().residentStatus : null,
            guardStatus: society ? society.toObject().guardStatus : null,
            gateAssign: society ? society.toObject().gateAssign : null,
        }, "Current user fetched successfully")
    );
});

const updateAccountDetails = asyncHandler(async (req, res) => {

    const { userName } = req.body;
    const file = req.file;

    if (file) {
        await deleteCloudinary(req.user.profile);
        const profileImg = await uploadOnCloudinary(file.path);

        if (!profileImg?.url) {
            throw new ApiError(400, "Error while uploading on profile");
        }

        const user = await User.findByIdAndUpdate(req.user?._id, {
            $set: {
                userName: userName || req.user.userName,
                profile: profileImg?.url || ''
            }
        }, { new: true }).select("-password -refreshToken");

        return res.status(200).json(
            new ApiResponse(200, user, "Account details updated successfully")
        );
    }

    const user = await User.findByIdAndUpdate(req.user?._id, {
        $set: {
            userName: userName || req.user.userName,
        }
    }, { new: true }).select("-password -refreshToken");

    return res.status(200).json(
        new ApiResponse(200, user, "Account details updated successfully")
    );
});

const refreshAccessToken = asyncHandler(async (req, res) => {
    try {
        const incomingRefreshToken = req.cookie?.refreshToken || req.header("Authorization")?.replace("Bearer ", "");

        if (!incomingRefreshToken) {
            throw new ApiError(401, "Unauthorized request");
        }

        const decodedToken = jwt.verify(incomingRefreshToken, process.env.REFRESH_TOKEN_SECRET);

        const user = await User.findById(decodedToken?._id);

        if (!user) {
            throw new ApiError(401, "Invalid refresh token");
        }

        if (incomingRefreshToken != user?.refreshToken) {
            throw new ApiError(401, "Refresh token is expired or used");
        }

        const option = {
            httpOnly: true,
            secure: true
        }

        const { accessToken, refreshToken } = await generateAccessAndRefreshToken(user._id);

        return res.status(200).clearCookie("accessToken", accessToken, option).clearCookie("refreshToken", refreshToken, option).json(
            new ApiResponse(200, { accessToken, refreshToken }, "Access token refreshed")
        );
    } catch (error) {
        throw new ApiError(401, "Something went wrong : Invalid refresh token");
    }
});

const addExtraInfo = asyncHandler(async (req, res) => {
    const { phoneNo, profileType, societyName, societyBlock, apartment, ownership, gateAssign, startDate, endDate } = req.body;
    const user = req.user;
    const file = req.file;
    const admin = await User.find({ role: 'admin' });
    const adminUserIds = admin.map(adminUser => adminUser._id);

    const results = await ProfileVerification.find({
        residentStatus: 'approve',
        societyName: societyName,
        user: { $in: adminUserIds }
    }).populate('user', 'FCMToken');
    
    const fcmToken = results
        .map(item => item.user?.FCMToken) // Use optional chaining in case user is null
        .filter(token => !!token); // Remove undefined/null tokens

    let document;
    if (file) {
        document = await uploadOnCloudinary(file.path);
    }

    if (!document?.url && profileType === 'Resident') {
        throw new ApiError(400, "Error while uploading on profile");
    }

    user.phoneNo = phoneNo;

    if (profileType === 'Resident') {
        let data = {};
        if (ownership == 'Owner') {
            data = {
                user: user._id,
                profileType,
                societyName,
                societyBlock,
                apartment,
                ownership: ownership.toLowerCase(),
                ownershipDocument: document?.url,
                residentStatus: user.role === 'admin' ? 'approve' : 'pending',
            }
        } else {
            data = {
                user: user._id,
                profileType,
                societyName,
                societyBlock,
                apartment,
                ownership: ownership.toLowerCase(),
                startDate: new Date(startDate),
                endDate: new Date(endDate),
                tenantAgreement: document?.url,
                residentStatus: user.role === 'admin' ? 'approve' : 'pending',
            }
        }
        const residentRequest = await ProfileVerification.create(data);

        if (!residentRequest) {
            throw new ApiError(500, "Something went wrong");
        }

        user.userType = 'Resident';

        if (user.role === 'admin') {
            const checkInCode = await CheckInCode.create({
                user: user._id,
                name: user.userName,
                mobNumber: user.phoneNo,
                profileType: 'Resident',
                societyName: residentRequest.societyName,
                blockName: residentRequest.societyBlock,
                apartment: residentRequest.apartment,
                checkInCode: await generateCheckInCode(residentRequest.societyName),
                checkInCodeStart: Date.now(),
                checkInCodeExpiry: null,
                checkInCodeStartDate: Date.now(),
                checkInCodeExpiryDate: null
            });
        }

        var payload = {
            userName: user.userName,
            profile: user.profile,
            societyName,
            societyBlock,
            apartment,
            ownership,
            action: 'VERIFY_RESIDENT_PROFILE_TYPE'
        };
    } else if (profileType === 'Security') {
        const securityRequest = await ProfileVerification.create({
            user: user._id,
            profileType,
            societyName,
            gateAssign,
            guardStatus: 'pending'
        });

        if (!securityRequest) {
            throw new ApiError(500, "Something went wrong");
        }

        user.userType = 'Security';

        var payload = {
            userName: user.userName,
            profile: user.profile,
            societyName,
            gateAssign,
            action: 'VERIFY_GUARD_PROFILE_TYPE'
        };
    }

    // Save the updated user object
    const isUpdate = await user.save({ validateBeforeSave: false });

    if (!isUpdate) {
        throw new ApiError(500, "Something went wrong");
    }

    // Send notification to admin if the user is not an admin
    if (user.role !== 'admin' && fcmToken.length > 0) {
        fcmToken.forEach(token => {
            sendNotification(token, payload.action, JSON.stringify(payload));
        });
    }

    const checkInCode = await CheckInCode.findOne({ user: req?.user?._id });
    const society = await ProfileVerification.findOne({ user: req?.user?._id });

    return res.status(200).json(
        new ApiResponse(200, {
            ...isUpdate.toObject(),
            checkInCode: checkInCode ? checkInCode.toObject().checkInCode : null,
            societyName: society ? society.toObject().societyName : null,
            societyBlock: society ? society.toObject().societyBlock : null,
            apartment: society ? society.toObject().apartment : null,
            profileType: society ? society.toObject().profileType : null
        }, "Extra details updated successfully")
    );
});

const updateFCMToken = asyncHandler(async (req, res) => {
    const { FCMToken } = req.body;
    if (!FCMToken) {
        throw new ApiError(400, "FCM Token is required");
    }
    const user = req.user;
    user.FCMToken = FCMToken;
    const isUpdate = await user.save({ validateBeforeSave: false });
    if (!isUpdate) {
        throw new ApiError(500, "Something went wrong");
    }
    console.log(`${req.user.userName}'s FCM Token updated successfully ${user.FCMToken}`);
    return res.status(200).json(
        new ApiResponse(200, {}, "FCM Token updated successfully")
    );
});

const cancelNotification = asyncHandler(async (req, res) => {
    const { notificationId, memberId } = req.body;
    sendNotificationCancel(token, notificationId);
});

const getContactEmail = asyncHandler(async (req, res) => {
    const member = await ProfileVerification.findOne({user: req.user._id});

    if (!member) {
        throw new ApiError(500, "Something went wrong!!");
    }

    const contactEmail = await User.findOne({societyName: member.societyName}).select("-isUserTypeVerified -role -isGoogleVerified -isVerified");
    
    if(!contactEmail){
        throw new ApiError(400, "Email do not exist");
    }

    return res.status(200).json(
        new ApiResponse(200, contactEmail, "Contact email fetched successfully.")
    )

});

export {
    registerUser,
    loginUser,
    registerUserGoogle,
    linkGoogleAccount,
    logoutUser,
    changeCurrentPassword,
    forgotPassword,
    getCurrentUser,
    refreshAccessToken,
    updateAccountDetails,
    addExtraInfo,
    updateFCMToken,
    cancelNotification,
    getContactEmail
};
