import {Router} from "express";
import { verifyJwt } from "../middlewares/auth.middleware.js";
import { addComplaintResolution, approveResolution, getAssignedComplaints, rejectResolution, getTechnicianDetails, getResolvedComplaints } from "../controllers/technician.controller.js";
import { upload } from "../middlewares/multer.middleware.js";
import { verifyAdmin } from "../middlewares/admin.middleware.js";
import { verifyMember } from "../middlewares/members.middleware.js";

const router = Router();

router.route('/get-assigned-complaints').get(verifyJwt, getAssignedComplaints);
router.route('/get-resolved-complaints').get(verifyJwt, getResolvedComplaints);
router.route('/get-technician-details').post(verifyJwt, getTechnicianDetails);
router.route('/add-complaint-resolution').post(verifyJwt, verifyMember, upload.single('file'), addComplaintResolution); 
router.route('/reject-resolution').post(verifyJwt, verifyAdmin, rejectResolution);
router.route('/approve-resolution').post(verifyJwt, verifyAdmin, approveResolution);

export default router;