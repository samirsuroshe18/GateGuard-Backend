import { Router } from "express";
import { verifyJwt } from "../middlewares/auth.middleware.js";
import { addDeliveryEntry, addDeliveryEntryStringImg, allowDeliveryBySecurity, approveDelivery, denyDeliveryBySecurity, exitEntry, getDeliveryAllowedEntries, getDeliveryApprovalEntries, rejectDelivery } from "../controllers/deliveryEntry.controller.js";
import { upload } from "../middlewares/multer.middleware.js";

const router = Router();

router.route('/add-delivery-entry').post(verifyJwt, upload.single("profileImg"), addDeliveryEntry);
router.route('/add-delivery-entry-2').post(verifyJwt, addDeliveryEntryStringImg);
router.route('/approve-delivery').post(verifyJwt, approveDelivery);
router.route('/reject-delivery').post(verifyJwt, rejectDelivery);
router.route('/get-delivery-entries').get(verifyJwt, getDeliveryApprovalEntries);
router.route('/allow-delivery-entries').post(verifyJwt, allowDeliveryBySecurity);
router.route('/deny-delivery-entries').post(verifyJwt, denyDeliveryBySecurity);
router.route('/get-allowed-entries').get(verifyJwt, getDeliveryAllowedEntries);
router.route('/exit-entry').post(verifyJwt, exitEntry);

export default router;