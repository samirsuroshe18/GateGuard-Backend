import { Router } from "express";
import { verifyJwt } from "../middlewares/auth.middleware.js";
import { addDeliveryEntry, addDeliveryEntryStringImg } from "../controllers/deliveryEntry.controller.js";
import { upload } from "../middlewares/multer.middleware.js";

const router = Router();

router.route('/add-delivery-entry').post(verifyJwt, upload.single("profileImg"), addDeliveryEntry);
router.route('/add-delivery-entry-2').post(verifyJwt, addDeliveryEntryStringImg);

export default router;