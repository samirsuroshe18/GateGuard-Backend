import { Router } from "express";
import { addApartment, addExtraInfo, addGate, changeCurrentPassword, deleteApartment, forgotPassword, getCurrentUser, linkGoogleAccount, loginUser, logoutUser, refreshAccessToken, registerUser, registerUserGoogle, updateAccountDetails, updateFCMToken } from "../controllers/user.controller.js";
import { upload } from "../middlewares/multer.middleware.js";
import { verifyJwt } from "../middlewares/auth.middleware.js";

const router = Router();

router.route('/register').post(registerUser);
router.route('/login').post(loginUser);
router.route('/google-signin').post(registerUserGoogle);
router.route('/link-google').post(linkGoogleAccount);
router.route('/forgot-password').post(forgotPassword);


//Secure routes
router.route('/logout').get(verifyJwt, logoutUser);
router.route('/refresh-token').post(refreshAccessToken);
router.route('/update-fcm').post(verifyJwt, updateFCMToken);
router.route('/change-password').post(verifyJwt, changeCurrentPassword);
router.route('/get-current-user').get(verifyJwt, getCurrentUser);
router.route('/update-details').post(verifyJwt, upload.single("profile"), updateAccountDetails);
router.route('/extra-info').post(verifyJwt, addExtraInfo);
router.route('/add-apartment').post(verifyJwt, addApartment);
router.route('/delete-apartment').post(verifyJwt, deleteApartment);
router.route('/add-gate').post(verifyJwt, addGate);


export default router;