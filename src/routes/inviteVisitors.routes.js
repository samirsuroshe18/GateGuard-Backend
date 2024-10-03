import { Router } from "express";
import { verifyJwt } from "../middlewares/auth.middleware.js";
import { addPreApproval } from "../controllers/inviteVisitors.controller.js";

const router = Router();

router.route('/add-pre-approval').post(verifyJwt, addPreApproval);

export default router;