import { Router } from "express";
import { verifyJwt } from "../middlewares/auth.middleware.js";
import { verifyAdmin } from "../middlewares/admin.middleware.js";
import { getAllAdmin, getAllGuards, getAllResidents, getComplaints, getPendingComplaints, getResolvedComplaints, makeAdmin, removeAdmin, removeGuard, removeResident } from "../controllers/admin.controller.js";

const router = Router();

router.route('/get-resident').get(verifyJwt, verifyAdmin, getAllResidents);
router.route('/get-guards').get(verifyJwt, verifyAdmin, getAllGuards);
router.route('/remove-resident').post(verifyJwt, verifyAdmin, removeResident);
router.route('/remove-guard').post(verifyJwt, verifyAdmin, removeGuard);
router.route('/get-admins').get(verifyJwt, verifyAdmin, getAllAdmin);
router.route('/make-admin').post(verifyJwt, verifyAdmin, makeAdmin);
router.route('/remove-admin').post(verifyJwt, verifyAdmin, removeAdmin);
router.route('/get-complaints').get(verifyJwt, verifyAdmin, getComplaints);
router.route('/get-pending-complaints').get(verifyJwt, verifyAdmin, getPendingComplaints);
router.route('/get-resolved-complaints').get(verifyJwt, verifyAdmin, getResolvedComplaints);


export default router;