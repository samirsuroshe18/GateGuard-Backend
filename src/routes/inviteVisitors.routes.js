import { Router } from "express";
import { verifyJwt } from "../middlewares/auth.middleware.js";
import { addPreApproval, exitEntry, getCurrentEntry, getExpectedEntry, getPastEntry } from "../controllers/inviteVisitors.controller.js";

const router = Router();

router.route('/add-pre-approval').post(verifyJwt, addPreApproval);
router.route('/exit-entry').post(verifyJwt, exitEntry);
router.route('/get-expected').get(verifyJwt, getExpectedEntry);
router.route('/get-current').get(verifyJwt, getCurrentEntry);
router.route('/get-past').get(verifyJwt, getPastEntry);

export default router;