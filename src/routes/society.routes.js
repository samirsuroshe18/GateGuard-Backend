import { Router } from "express";
import { addSocietyApartments, addSocietyBlocks, addSocietyDetails, addSocietyGates, getAllSocieties, getAllSocietyApartments, getSocietyApartments, getSocietyBlocks, getSocietyGates, removeSociety, removeSocietyApartment, removeSocietyBlock, removeSocietyGate } from "../controllers/society.controller.js";
import { verifyJwt } from "../middlewares/auth.middleware.js"; 

const router = Router();

router.route('/add-society-details').post(addSocietyDetails);
router.route('/add-society-blocks').post(addSocietyBlocks);
router.route('/add-society-apartments').post(addSocietyApartments);
router.route('/add-society-gates').post(addSocietyGates);
router.route('/get-all-societies').get(getAllSocieties);
router.route('/get-society-blocks').get(getSocietyBlocks);
router.route('/get-all-apartments').get(getAllSocietyApartments);
router.route('/get-society-apartments').get(getSocietyApartments);
router.route('/get-society-gates').get(getSocietyGates);
router.route('/remove-society').post(removeSociety);
router.route('/remove-society-block').post(removeSocietyBlock);
router.route('/remove-society-apartment').post(removeSocietyApartment);
router.route('/remove-society-gate').post(removeSocietyGate);


export default router;