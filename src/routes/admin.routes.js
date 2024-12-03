import { Router } from "express";
import { verifyJwt } from "../middlewares/auth.middleware.js";
import { verifyAdmin } from "../middlewares/admin.middleware.js";
import { getAllGuards, getAllResidents } from "../controllers/admin.controller.js";

const router = Router();

router.route('/get-resident').get(verifyJwt, verifyAdmin, getAllResidents);
router.route('/get-guards').get(verifyJwt, verifyAdmin, getAllGuards);


export default router;