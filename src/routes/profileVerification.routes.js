import { Router } from "express";
import { verifyJwt } from "../middlewares/auth.middleware.js";
import { verifyAdmin } from "../middlewares/admin.middleware.js";
import { getPendingResidentRequest, getPendingSecurityRequest, makeAdmin, verifyResidentRequest, verifySecurityRequest } from "../controllers/profileVerification.controller.js";

const router = Router();

router.route('/get-pending-resident-req').get(verifyJwt, verifyAdmin, getPendingResidentRequest);
router.route('/get-pending-guard-req').get(verifyJwt, verifyAdmin, getPendingSecurityRequest);
router.route('/verify-resident-req').post(verifyJwt, verifyAdmin, verifyResidentRequest);
router.route('/verify-guard-req').post(verifyJwt, verifyAdmin, verifySecurityRequest);
router.route('/make-admin').post(makeAdmin);


export default router;