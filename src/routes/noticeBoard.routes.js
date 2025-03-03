import { Router } from "express";
import { verifyJwt } from "../middlewares/auth.middleware.js";
import { createNotice, getNotices, getNotice, updateNotice, deleteNotice, isUnreadNotice } from "../controllers/noticeBoard.controller.js";
import { upload } from "../middlewares/multer.middleware.js";
import { verifyAdmin } from "../middlewares/admin.middleware.js";
import { verifyMember } from "../middlewares/members.middleware.js";

const router = Router();

router.route('/create-notice').post(verifyJwt, verifyAdmin, verifyMember, upload.single("file"), createNotice);
router.route('/get-notices').get(verifyJwt, verifyMember, getNotices);
router.route('/get-notice/:id').get(verifyJwt, verifyMember, getNotice);
router.route('/update-notice/:id').put(verifyJwt, verifyMember, upload.single("file"), updateNotice);
router.route('/delete-notice/:id').delete(verifyJwt, verifyMember, deleteNotice);
router.route('/is-unread-notice').get(verifyJwt, verifyMember, isUnreadNotice);

export default router;
