import { Router } from "express";
import { verifyJwt } from "../middlewares/auth.middleware.js";
import { checkInByCodeEntry } from "../controllers/checkInByCode.controller.js";

const router = Router();

router.route('/add-entry').post(verifyJwt, checkInByCodeEntry);

export default router;