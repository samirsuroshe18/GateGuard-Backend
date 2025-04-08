import asyncHandler from '../utils/asynchandler.js';
import ApiError from '../utils/ApiError.js';
import ApiResponse from '../utils/ApiResponse.js';
import { Complaint } from '../models/complaint.model.js';
import { uploadOnCloudinary } from '../utils/cloudinary.js';
import { ProfileVerification } from '../models/profileVerification.model.js';
import { sendNotification } from '../utils/sendResidentNotification.js'
import mongoose from 'mongoose';

const submitComplaint = asyncHandler(async (req, res) => {
    const { area, category, subCategory, description } = req.body;
    const complaintId = `C${Date.now()}`;

    const society = await ProfileVerification.findOne({ user: req.user._id });

    if (!society) {
        throw new ApiError(404, "Profile is not found");
    }

    const file = req.file;
    let document = null;

    if (file) {
        document = await uploadOnCloudinary(file.path);
    }

    const complaint = await Complaint.create({
        raisedBy: req.user._id,
        societyName: society.societyName,
        area,
        category,
        subCategory,
        description,
        complaintId,
        imageUrl: document?.secure_url || '',
    });

    const isComplaintExist = await Complaint.findById(complaint._id)
        .populate("responses.responseBy", "userName email profile role phoneNo")
        .populate("raisedBy", "userName email profile role phoneNo FCMToken");

    if (!isComplaintExist) {
        throw new ApiError(500, "Something went wrong");
    }

    const users = await ProfileVerification.find({ societyName: isComplaintExist.societyName })
        .populate("user", "FCMToken role");

    const FCMTokens = users
        .filter((item) => item.user?.role === "admin" && item.user?.FCMToken && isComplaintExist.raisedBy.FCMToken !== item.user?.FCMToken)
        .map((item) => item.user.FCMToken);


    let payload = {
        ...isComplaintExist.toObject(),
        action: 'NOTIFY_COMPLAINT_CREATED'
    };

    FCMTokens.forEach(token => {
        sendNotification(token, payload.action, JSON.stringify(payload));
    });

    return res.status(200).json(
        new ApiResponse(200, isComplaintExist, "Complaint submitted successfully")
    );
});

const getComplaints = asyncHandler(async (req, res) => {

    const updatedComplaint = await Complaint.find({ raisedBy: req.user._id })
        .populate("responses.responseBy", "userName email profile role phoneNo")
        .populate("raisedBy", "userName email profile role phoneNo");


    return res.status(200).json(
        new ApiResponse(200, updatedComplaint, "Complaint submitted successfully")
    );
});

const getComplaintDetails = asyncHandler(async (req, res) => {
    const id = mongoose.Types.ObjectId.createFromHexString(req.params.id);
    const complaint = await Complaint.findById(id)
    .populate("responses.responseBy", "userName email profile role phoneNo")
        .populate("raisedBy", "userName email profile role phoneNo");

    if (!complaint) {
        throw new ApiError(404, "Complaint not found");
    }

    return res.status(200).json(
        new ApiResponse(200, complaint, "Complaint details fetched successfully")
    );
});

const addResponse = asyncHandler(async (req, res) => {
    const complaint = await Complaint.findOneAndUpdate(
        { complaintId: req.params.id },
        {
            $push: {
                responses: {
                    responseBy: req.user._id,
                    message: req.body.message,
                    date: new Date(),
                }
            }
        },
        { new: true }
    ).populate("responses.responseBy", "userName email profile role phoneNo")
        .populate("raisedBy", "userName email profile role phoneNo FCMToken")
        .exec();

    if (!complaint) {
        throw new ApiError(404, "Complaint not found");
    }

    if (complaint.raisedBy._id.toString() === req.user._id.toString()) {
        const users = await ProfileVerification.find({ societyName: complaint.societyName })
            .populate("user", "FCMToken role");

        const FCMTokens = users
            .filter((item) => item.user?.role === "admin" && item.user?.FCMToken && item.user.FCMToken !== complaint.raisedBy.FCMToken)
            .map((item) => item.user.FCMToken);


        let payload = {
            societyName: complaint.societyName,
            raisedBy: complaint.raisedBy,
            category: complaint.category,
            subCategory: complaint.subCategory,
            id: complaint._id,
            action: 'NOTIFY_RESIDENT_REPLIED'
        };

        FCMTokens.forEach(token => {
            sendNotification(token, payload.action, JSON.stringify(payload));
        });
    } else {
        let payload = {
            societyName: complaint.societyName,
            raisedBy: complaint.raisedBy,
            category: complaint.category,
            subCategory: complaint.subCategory,
            id: complaint._id,
            action: 'NOTIFY_ADMIN_REPLIED'
        };

        sendNotification(complaint.raisedBy.FCMToken, payload.action, JSON.stringify(payload));
    }

    return res.status(200).json(
        new ApiResponse(200, complaint, "Response added successfully")
    );
});

const resolveComplaint = asyncHandler(async (req, res) => {
    const complaint = await Complaint.findOneAndUpdate(
        { complaintId: req.params.id },
        {
            $set: { status: "resolved" },
        },
        { new: true }  // Return the updated document
    ).populate("responses.responseBy", "userName email profile role phoneNo")
        .populate("raisedBy", "userName email profile role phoneNo FCMToken");

    if (!complaint) {
        throw new ApiError(404, "Complaint not found");
    }

    if (complaint.raisedBy._id.toString() === req.user._id.toString()) {
        const users = await ProfileVerification.find({ societyName: complaint.societyName })
            .populate("user", "FCMToken role");

        const FCMTokens = users
            .filter((item) => item.user?.role === "admin" && item.user?.FCMToken && item.user.FCMToken !== complaint.raisedBy.FCMToken)
            .map((item) => item.user.FCMToken);

        let payload = {
            complaintId: complaint.complaintId,
            category: complaint.category,
            societyName: complaint.societyName,
            resolvedBy: req.user.userName,
            isResolvedByResident: true,
            action: "NOTIFY_COMPLAINT_RESOLVED"
        };

        FCMTokens.forEach(token => {
            sendNotification(token, payload.action, JSON.stringify(payload));
        });
    } else {

        let payload = {
            complaintId: complaint.complaintId,
            category: complaint.category,
            societyName: complaint.societyName,
            resolvedBy: req.user.userName,
            isResolvedByResident: false,
            action: "NOTIFY_COMPLAINT_RESOLVED"
        };

        sendNotification(complaint.raisedBy.FCMToken, payload.action, JSON.stringify(payload));
    }

    return res.status(200).json(
        new ApiResponse(200, complaint, "Complaint marked as resolved")
    );
});

const reopenComplaint = asyncHandler(async (req, res) => {
    const complaint = await Complaint.findOneAndUpdate(
        { complaintId: req.params.id },
        {
            $set: { status: "pending" },
        },
        { new: true }  // Return the updated document
    ).populate("responses.responseBy", "userName email profile role phoneNo")
        .populate("raisedBy", "userName email profile role phoneNo FCMToken");

    if (!complaint) {
        throw new ApiError(404, "Complaint not found");
    }

    if (complaint.raisedBy._id.toString() === req.user._id.toString()) {
        const users = await ProfileVerification.find({ societyName: complaint.societyName })
            .populate("user", "FCMToken role");

        const FCMTokens = users
            .filter((item) => item.user?.role === "admin" && item.user?.FCMToken && item.user.FCMToken !== complaint.raisedBy.FCMToken)
            .map((item) => item.user.FCMToken);

        let payload = {
            complaintId: complaint.complaintId,
            category: complaint.category,
            societyName: complaint.societyName,
            reopenedBy: req.user.userName,
            isReopenedByResident: true,
            action: "NOTIFY_COMPLAINT_REOPENED"
        };

        FCMTokens.forEach(token => {
            sendNotification(token, payload.action, JSON.stringify(payload));
        });
    } else {

        let payload = {
            complaintId: complaint.complaintId,
            category: complaint.category,
            societyName: complaint.societyName,
            reopenedBy: req.user.userName,
            isReopenedByResident: false,
            action: "NOTIFY_COMPLAINT_REOPENED"
        };

        sendNotification(complaint.raisedBy.FCMToken, payload.action, JSON.stringify(payload));
    }

    return res.status(200).json(
        new ApiResponse(200, complaint, "Complaint reopened successfully")
    );
});

const getResponse = asyncHandler(async (req, res) => {
    const id = mongoose.Types.ObjectId.createFromHexString(req.params.id);
    const complaint = await Complaint.findById(id)
        .populate("responses.responseBy", "userName email profile role phoneNo")
        .populate("raisedBy", "userName email profile role phoneNo");

    if (!complaint) {
        throw new ApiError(404, "Complaint not found");
    }

    return res.status(200).json(
        new ApiResponse(200, complaint, "Response added successfully")
    );
});

export { submitComplaint, getComplaints, getComplaintDetails, addResponse, resolveComplaint, reopenComplaint, getResponse };