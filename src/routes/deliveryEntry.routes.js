import { Router } from "express";
import { verifyJwt } from "../middlewares/auth.middleware.js";
import {
    addDeliveryEntry,
    addDeliveryEntryStringImg,
    allowDeliveryBySecurity,
    approveDelivery,
    denyDeliveryBySecurity,
    exitEntry,
    getCabEntries,
    getCheckoutHistroy,
    getCurrentDeliveryEntries,
    getDeliveryAllowedEntries,
    getDeliveryEntries,
    getDeliveryServiceRequest,
    getDeniedDeliveryEntries,
    getGuestEntries,
    getOtherEntries,
    getPastDeliveryEntries,
    getWaitingEntry,
    rejectDelivery,
    waitingForResidentApprovalEntries
} from "../controllers/deliveryEntry.controller.js";
import { upload } from "../middlewares/multer.middleware.js";
import { verifyGuard } from "../middlewares/guard.middleware.js";
import { verifyResident } from "../middlewares/resiedent.middleware.js";

const router = Router();

router.route('/add-delivery-entry').post(verifyJwt, verifyGuard, upload.single("profileImg"), addDeliveryEntry);
router.route('/add-delivery-entry-2').post(verifyJwt, verifyGuard, addDeliveryEntryStringImg);
router.route('/get-delivery-waiting-entries').get(verifyJwt, verifyGuard, waitingForResidentApprovalEntries);
router.route('/get-waiting-entry/:id').get(verifyJwt, verifyGuard, getWaitingEntry);
router.route('/allow-delivery-entries').post(verifyJwt, verifyGuard, allowDeliveryBySecurity);
router.route('/deny-delivery-entries').post(verifyJwt, verifyGuard, denyDeliveryBySecurity);
router.route('/get-allowed-entries').get(verifyJwt, verifyGuard, getDeliveryAllowedEntries);
router.route('/get-allowed-guest-entries').get(verifyJwt, verifyGuard, getGuestEntries);
router.route('/get-allowed-cab-entries').get(verifyJwt, verifyGuard, getCabEntries);
router.route('/get-allowed-other-entries').get(verifyJwt, verifyGuard, getOtherEntries);
router.route('/get-allowed-delivery-entries').get(verifyJwt, verifyGuard, getDeliveryEntries);
router.route('/exit-entry').post(verifyJwt, verifyGuard, exitEntry);
router.route('/get-checkout-history').get(verifyJwt,  getCheckoutHistroy);

//For residents

router.route('/approve-delivery').post(verifyJwt, verifyResident, approveDelivery);
router.route('/reject-delivery').post(verifyJwt, verifyResident, rejectDelivery);
router.route('/get-service-entries').get(verifyJwt, verifyResident, getDeliveryServiceRequest);
router.route('/get-current').get(verifyJwt, verifyResident, getCurrentDeliveryEntries);
router.route('/get-past').get(verifyJwt, verifyResident, getPastDeliveryEntries);
router.route('/get-denied').get(verifyJwt, verifyResident, getDeniedDeliveryEntries);

export default router;