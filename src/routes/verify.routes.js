import { Router } from "express";
import {verifyEmail, resetPassword, verifyPassword, verifyGoogle } from "../controllers/verify.controller.js";

const router = Router();

router.route('/verify-email').get(verifyEmail);
router.route('/link-google').get(verifyGoogle);
router.route('/reset-password').get(resetPassword);
router.route('/verify-password').post(verifyPassword);


export default router;