import express from "express";
import cors from 'cors';
import cookieParser from "cookie-parser";
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import path from 'path';

const app = express();
initializeFirebaseAdmin();

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const staticPath = path.join(__dirname, '../public');

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, './views'));

// this use for cross origin sharing 
app.use(cors({ origin: process.env.CORS_ORIGIN }));
// this middleware use for parsing the json data
app.use(express.json());
// this is used for parsing url data extended is used for nessted object
app.use(express.urlencoded({ extended: true }));
// this is used for accessing public resources from server
app.use(express.static(staticPath));
// this is used to parse the cookie
app.use(cookieParser());

// routes import
import userRouter from './routes/user.routes.js';
import verifyRouter from './routes/verify.routes.js';
import initializeFirebaseAdmin from "./utils/firebaseAdminSdk.js";
import societyRouter from './routes/society.routes.js';
import profileVerificationRouter from './routes/profileVerification.routes.js';
import deliveryEntryRouter from './routes/deliveryEntry.routes.js';
import checkInRouter from './routes/checkInWithoutCode.routes.js';
import checkInByCodeRouter from './routes/checkInByCode.routes.js';
import invitevisitorsRoter from './routes/inviteVisitors.routes.js';
import adminRouter from './routes/admin.routes.js';
import residentRouter from './routes/resident.routes.js';
import complaintRouter from './routes/complaint.routes.js';


//Routes declaration
app.use("/api/v1/users", userRouter);
app.use("/api/v1/verify", verifyRouter);
app.use("/api/v1/society", societyRouter);
app.use("/api/v1/profile-verification", profileVerificationRouter);
app.use("/api/v1/delivery-entry", deliveryEntryRouter);
app.use("/api/v1/check-in", checkInRouter);
app.use("/api/v1/check-in-by-code", checkInByCodeRouter);
app.use("/api/v1/invite-visitors", invitevisitorsRoter);
app.use("/api/v1/admin", adminRouter);
app.use("/api/v1/resident", residentRouter);
app.use("/api/v1/complaint", complaintRouter);

// Custom error handeling
app.use((err, req, res, next) => {
  const statusCode = err.statusCode || 500;
  const message = err.message || "Internal server error";

  return res.status(statusCode).json({
    statusCode: statusCode,
    message: message
  });
})

export default app