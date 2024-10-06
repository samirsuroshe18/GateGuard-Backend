import { Router } from "express";
import { verifyJwt } from "../middlewares/auth.middleware.js";
import { addPreApproval, getExpectedEntry } from "../controllers/inviteVisitors.controller.js";

const router = Router();

router.route('/add-pre-approval').post(verifyJwt, addPreApproval);
router.route('/get-expected').get(verifyJwt, getExpectedEntry);

export default router;