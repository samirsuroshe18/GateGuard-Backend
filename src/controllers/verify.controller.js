import { User } from '../models/user.model.js';
import ApiResponse from '../utils/ApiResponse.js';
import ApiError from '../utils/ApiError.js';
import asyncHandler from '../utils/asynchandler.js';

const verifyEmail = asyncHandler(async (req, res) => {
  try {
    const token = req.query.token;
    const user = await User.findOne({ verifyToken: token, verifyTokenExpiry: { $gt: Date.now() } });

    if (!user) {
      return res.render("invalid")
    }

    user.isVerified = true;
    user.verifyToken = undefined;
    user.verifyTokenExpiry = undefined;
    await user.save()

    return res.render("success");

  } catch (error) {
    console.log(error.message);
    return res.status(500).json({ success: false, error: error.message });
  }
});

const resetPassword = asyncHandler(async (req, res) => {
  try {
    const token = req.query.token;

    const user = await User.findOne({ forgotPasswordToken: token, forgotPasswordTokenExpiry: { $gt: Date.now() } });

    if (!user) {
      return res.render("invalidForgotLink")
    }

    return res.render("forgotPasswordSuccess")

  } catch (error) {
    console.log(error.message);
    return res.status(500).json({ success: false, error: error.message });
  }
})

const verifyPassword = asyncHandler(async (req, res) => {
  try {
    const token = req.query.token;
    const { password, confirmPassword } = req.body;

    if (password !== confirmPassword) {
      throw new ApiError(400, "Password do not match");
    }

    const user = await User.findOne({ forgotPasswordToken: token, forgotPasswordTokenExpiry: { $gt: Date.now() } });

    if (!user) {
      throw new ApiError(500, "Invalid or expired token");
    }

    user.forgotPasswordToken = undefined;
    user.forgotPasswordTokenExpiry = undefined;
    user.password = password
    await user.save()

    return res.status(200).json(
      new ApiResponse(200, {}, "Password reset successful")
    )

  } catch (error) {
    console.log(error.message);
    return res.status(500).json({ success: false, error: error.message });
  }
});

const verifyGoogle = asyncHandler(async (req, res) => {
  try {
    const token = req.query.token;
    const user = await User.findOne({ googleVerifyToken: token, googleVerifyTokenExpiry: { $gt: Date.now() } });

    if (!user) {
      return res.render("googleLinkInvalid")
    }

    user.isVerified = true;
    user.isGoogleVerified = true;
    user.googleVerifyToken = undefined;
    user.googleVerifyTokenExpiry = undefined;
    user.verifyToken = undefined;
    user.verifyTokenExpiry = undefined;
    await user.save({ validateBeforeSave: false })

    return res.render("googleLinkSuccess");

  } catch (error) {
    console.log(error.message);
    return res.status(500).json({ success: false, error: error.message });
  }
});

export { verifyEmail, resetPassword, verifyPassword, verifyGoogle }