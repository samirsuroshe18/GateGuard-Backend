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
    rejectDelivery,
    waitingForResidentApprovalEntries
} from "../controllers/deliveryEntry.controller.js";
import { upload } from "../middlewares/multer.middleware.js";

const router = Router();

router.route('/add-delivery-entry').post(verifyJwt, upload.single("profileImg"), addDeliveryEntry);
router.route('/add-delivery-entry-2').post(verifyJwt, addDeliveryEntryStringImg);
router.route('/approve-delivery').post(verifyJwt, approveDelivery);
router.route('/reject-delivery').post(verifyJwt, rejectDelivery);
router.route('/get-delivery-waiting-entries').get(verifyJwt, waitingForResidentApprovalEntries);
router.route('/allow-delivery-entries').post(verifyJwt, allowDeliveryBySecurity);
router.route('/deny-delivery-entries').post(verifyJwt, denyDeliveryBySecurity);
router.route('/get-allowed-entries').get(verifyJwt, getDeliveryAllowedEntries);
router.route('/get-allowed-guest-entries').get(verifyJwt, getGuestEntries);
router.route('/get-allowed-cab-entries').get(verifyJwt, getCabEntries);
router.route('/get-allowed-other-entries').get(verifyJwt, getOtherEntries);
router.route('/get-allowed-delivery-entries').get(verifyJwt, getDeliveryEntries);
router.route('/exit-entry').post(verifyJwt, exitEntry);
router.route('/get-service-entries').get(verifyJwt, getDeliveryServiceRequest);
router.route('/get-checkout-history').get(verifyJwt, getCheckoutHistroy);

//For residents

router.route('/get-current').get(verifyJwt, getCurrentDeliveryEntries);
router.route('/get-past').get(verifyJwt, getPastDeliveryEntries);
router.route('/get-denied').get(verifyJwt, getDeniedDeliveryEntries);

export default router;