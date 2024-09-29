import { Router } from "express";
import { verifyJwt } from "../middlewares/auth.middleware.js";
import { getGuardSocietyApartments, getGuardSocietyBlocks, getMobileNumber } from "../controllers/checkInWithoutCode.controller.js";

const router = Router();

router.route('/get-blocks').get(verifyJwt, getGuardSocietyBlocks);
router.route('/get-apartments').post(verifyJwt, getGuardSocietyApartments);
router.route('/get-mobile').post(verifyJwt, getMobileNumber);

export default router;