import { Router } from "express";
import { verifyJwt } from "../middlewares/auth.middleware.js";
import { checkInByCodeEntry } from "../controllers/checkInByCode.controller.js";
import { verifyGuard } from "../middlewares/guard.middleware.js";

const router = Router();

router.route('/add-entry').post(verifyJwt, verifyGuard, checkInByCodeEntry);

export default router;