import { Router } from "express";
import { verifyJwt } from "../middlewares/auth.middleware.js";
import { verifyGuard } from "../middlewares/guard.middleware.js";
import { getGuardLogs, getGuardReport, guardDutyCheckin, guardDutyCheckout, guardDutyStatus } from "../controllers/guardDutyLog.controller.js";
import { verifyAdmin } from "../middlewares/admin.middleware.js";

const router = Router();

router.route('/check-in').post(verifyJwt, verifyGuard, guardDutyCheckin);
router.route('/check-out').post(verifyJwt, verifyGuard, guardDutyCheckout);
router.route('/status').get(verifyJwt, verifyGuard, guardDutyStatus);
router.route('/get-report/:id').get(verifyJwt, verifyAdmin, getGuardReport);
router.route('/get-logs').get(verifyJwt, verifyAdmin, getGuardLogs);

export default router;