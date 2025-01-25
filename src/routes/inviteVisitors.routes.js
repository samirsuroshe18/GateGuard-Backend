import { Router } from "express";
import { verifyJwt } from "../middlewares/auth.middleware.js";
import { addGatePass, addPreApproval, exitEntry, getCurrentEntry, getExpectedEntry, getGatePass, getPastEntry } from "../controllers/inviteVisitors.controller.js";
import { verifyResident } from "../middlewares/resiedent.middleware.js";
import { verifyGuard } from "../middlewares/guard.middleware.js";
import { upload } from "../middlewares/multer.middleware.js";

const router = Router();

router.route('/add-pre-approval').post(verifyJwt, verifyResident, addPreApproval);
router.route('/exit-entry').post(verifyJwt, verifyGuard, exitEntry);
router.route('/get-expected').get(verifyJwt, verifyResident, getExpectedEntry);
router.route('/get-current').get(verifyJwt, getCurrentEntry);
router.route('/get-past').get(verifyJwt, getPastEntry);
router.route('/add-gate-pass').post(verifyJwt, upload.array('files', 2), addGatePass);
router.route('/get-gate-pass').get(verifyJwt, getGatePass);

export default router;