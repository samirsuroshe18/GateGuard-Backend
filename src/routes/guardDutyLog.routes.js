import { Router } from "express";
import { verifyJwt } from "../middlewares/auth.middleware.js";
import { verifyGuard } from "../middlewares/guard.middleware.js";
import { guardDutyCheckin, guardDutyCheckout, guardDutyStatus } from "../controllers/guardDutyLog.controller.js";

const router = Router();

router.route('/check-in').post(verifyJwt, verifyGuard, guardDutyCheckin);
router.route('/check-out').post(verifyJwt, verifyGuard, guardDutyCheckout);
router.route('/status').get(verifyJwt, verifyGuard, guardDutyStatus);

export default router;