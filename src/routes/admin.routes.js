import { Router } from "express";
import { verifyJwt } from "../middlewares/auth.middleware.js";
import { verifyAdmin } from "../middlewares/admin.middleware.js";
import { getAllAdmin, getAllGuards, getAllResidents, makeAdmin, removeAdmin, removeGuard, removeResident } from "../controllers/admin.controller.js";

const router = Router();

router.route('/get-resident').get(verifyJwt, verifyAdmin, getAllResidents);
router.route('/get-guards').get(verifyJwt, verifyAdmin, getAllGuards);
router.route('/remove-resident').post(verifyJwt, verifyAdmin, removeResident);
router.route('/remove-guard').post(verifyJwt, verifyAdmin, removeGuard);
router.route('/get-admins').get(verifyJwt, verifyAdmin, getAllAdmin);
router.route('/make-admin').post(verifyJwt, verifyAdmin, makeAdmin);
router.route('/remove-admin').post(verifyJwt, verifyAdmin, removeAdmin);


export default router;