import { Router } from "express";
import { verifyJwt } from "../middlewares/auth.middleware.js";
import { getApartmentMembers } from "../controllers/resident.controller.js";

const router = Router();

router.route('/get-members').get(verifyJwt, verifyResident, getApartmentMembers);


export default router;