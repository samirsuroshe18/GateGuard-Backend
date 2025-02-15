import { Router } from "express";
import { upload } from "../middlewares/multer.middleware.js";
import { verifyJwt } from "../middlewares/auth.middleware.js";
import { addResponse, getComplaintDetails, getComplaints, reopenComplaint, resolveComplaint, submitComplaint } from "../controllers/complaint.controller.js";

const router = Router();

router.route('/submit').post(verifyJwt, upload.single("file"), submitComplaint);
router.route('/get-complaints').get(verifyJwt, getComplaints);
router.route('/get-details/:id').get(verifyJwt, getComplaintDetails);
router.route('/add-response/:id').post(verifyJwt, addResponse);
router.route('/resolved/:id').get(verifyJwt, resolveComplaint);
router.route('/reopen/:id').get(verifyJwt, reopenComplaint);

export default router;