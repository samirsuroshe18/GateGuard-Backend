import { Router } from "express";
import { verifyJwt } from "../middlewares/auth.middleware.js";

const router = Router();

// router.route('/add-pre-approval').post(verifyJwt, addPreApproval);

export default router;