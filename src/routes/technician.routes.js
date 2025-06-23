import {Router} from "express";
import { verifyJwt } from "../middlewares/auth.middleware.js";
import { addComplaintResolution, approveResolution, getAssignedComplaints, rejectResolution } from "../controllers/technician.controller.js";
import { upload } from "../middlewares/multer.middleware.js";
import { verifyAdmin } from "../middlewares/admin.middleware.js";

const router = Router();

router.route('/get-assigned-complaints').get(verifyJwt, getAssignedComplaints);
router.route('/add-complaint-resolution').post(verifyJwt, upload.single('file'), addComplaintResolution);
router.route('/reject-resolution').post(verifyJwt, verifyAdmin, rejectResolution);
router.route('/approve-resolution').post(verifyJwt, verifyAdmin, approveResolution);

export default router;