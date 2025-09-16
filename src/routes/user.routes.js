import { Router } from "express";
import { addExtraInfo, cancelNotification, changeCurrentPassword, forgotPassword, getContactEmail, getCurrentUser, linkGoogleAccount, loginUser, logoutUser, refreshAccessToken, registerUser, registerUserGoogle, updateAccountDetails, updateFCMToken } from "../controllers/user.controller.js";
import { upload } from "../middlewares/multer.middleware.js";
import { verifyJwt } from "../middlewares/auth.middleware.js";

const router = Router();

router.route('/register').post(registerUser);
router.route('/login').post(loginUser);
router.route('/google-signin').post(registerUserGoogle);
router.route('/link-google').post(linkGoogleAccount);
router.route('/forgot-password').post(forgotPassword);
router.route('/refresh-token').get(refreshAccessToken);
router.route('/logout').get(logoutUser);

//Secure routes
router.route('/update-fcm').post(verifyJwt, updateFCMToken);
router.route('/change-password').post(verifyJwt, changeCurrentPassword);
router.route('/get-current-user').get(verifyJwt, getCurrentUser);
router.route('/update-details').post(verifyJwt, upload.single("profile"), updateAccountDetails);
router.route('/extra-info').post(verifyJwt, upload.single("file"), addExtraInfo);
router.route('/cancel-notification').post(cancelNotification);

router.route('/get-contact-email').get(verifyJwt, getContactEmail);

export default router;