import { Router } from "express";
import { verifyJwt } from "../middlewares/auth.middleware.js";
import { getGuardSocietyApartments, getGuardSocietyBlocks, getMobileNumber } from "../controllers/checkInWithoutCode.controller.js";
import { verifyGuard } from "../middlewares/guard.middleware.js";

const router = Router();

router.route('/get-blocks').get(verifyJwt, verifyGuard, getGuardSocietyBlocks);
router.route('/get-apartments').post(verifyJwt, verifyGuard, getGuardSocietyApartments);
router.route('/get-mobile').post(verifyJwt, verifyGuard, getMobileNumber);

export default router;