import { Router } from "express";
import { verifyJwt } from "../middlewares/auth.middleware.js";
import { addApartmentToGatepass, addGatePass, addPreApproval, approveGatePass, exitEntry, getApprovedGatePass, getCurrentEntry, getExpectedEntry, getExpiredGatePass, getExpiredGatePassSecurity, getGatePass, getGatePassDetails, getGatePassesToVerify, getPastEntry, getRejectedGatePass, getVerificationGatePassSecurity, rejectGatePass, removeApartmentByMember, removeApartmentBySecurity, removeGatePassBySecurity } from "../controllers/inviteVisitors.controller.js";
import { verifyResident } from "../middlewares/resiedent.middleware.js";
import { verifyGuard } from "../middlewares/guard.middleware.js";
import { upload } from "../middlewares/multer.middleware.js";

const router = Router();

router.route('/add-pre-approval').post(verifyJwt, verifyResident, addPreApproval);
router.route('/exit-entry').post(verifyJwt, verifyGuard, exitEntry);
router.route('/get-expected').get(verifyJwt, verifyResident, getExpectedEntry);
router.route('/get-current').get(verifyJwt, getCurrentEntry);
router.route('/get-past').get(verifyJwt, getPastEntry);
router.route('/add-gate-pass').post(verifyJwt, upload.array('files', 2), addGatePass);
router.route('/approve-gate-pass/:id').get(verifyJwt, verifyResident, approveGatePass);
router.route('/reject-gate-pass/:id').get(verifyJwt, verifyResident, rejectGatePass);
router.route('/remove-apartment/:id').get(verifyJwt, verifyResident, removeApartmentByMember);
router.route('/remove-apartment-security/:gateId/:aptId').get(verifyJwt, verifyGuard, removeApartmentBySecurity);
router.route('/remove-gatepass-security/:id').get(verifyJwt, verifyGuard, removeGatePassBySecurity);
router.route('/add-apartment').post(verifyJwt, verifyGuard, addApartmentToGatepass);
router.route('/get-gate-pass').get(verifyJwt, getGatePass);
router.route('/get-gate-pass-details/:id').get(verifyJwt, getGatePassDetails);
router.route('/get-verify-passes').get(verifyJwt, verifyResident, getGatePassesToVerify);
router.route('/get-rejected-passes').get(verifyJwt, verifyResident, getRejectedGatePass);
router.route('/get-expired-passes').get(verifyJwt, verifyResident, getExpiredGatePass);
router.route('/get-approved-passes').get(verifyJwt, verifyResident, getApprovedGatePass);
router.route('/get-verification-passes-security').get(verifyJwt, verifyGuard, getVerificationGatePassSecurity);
router.route('/get-expired-passes-security').get(verifyJwt, verifyGuard, getExpiredGatePassSecurity);

export default router;