import asyncHandler from '../utils/asynchandler.js';
import ApiError from '../utils/ApiError.js';
import ApiResponse from '../utils/ApiResponse.js';
import { Complaint } from '../models/complaint.model.js';
import { uploadOnCloudinary } from '../utils/cloudinary.js';
import { ProfileVerification } from '../models/profileVerification.model.js';

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

    const newComplaint = await Complaint.create({
        raisedBy: req.user._id,
        societyName: society.societyName,
        area,
        category,
        subCategory,
        description,
        complaintId,
        imageUrl: document?.url || '',
    });

    if (!newComplaint) {
        throw new ApiError(500, "Something went wrong");
    }

    return res.status(200).json(
        new ApiResponse(200, newComplaint, "Complaint submitted successfully")
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
    try {
        const complaint = await Complaint.findOne({ complaintId: req.params.id });

        if (!complaint) {
            return res.status(404).json({ success: false, message: "Complaint not found" });
        }

        res.status(200).json({ success: true, complaint });
    } catch (error) {
        res.status(500).json({ success: false, message: "Error fetching complaint details", error: error.message });
    }
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
        .populate("raisedBy", "userName email profile role phoneNo");

    if (!complaint) {
        throw new ApiError(404, "Complaint not found");
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
        .populate("raisedBy", "userName email profile role phoneNo");

    if (!complaint) {
        throw new ApiError(404, "Complaint not found");
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
        .populate("raisedBy", "userName email profile role phoneNo");

    if (!complaint) {
        throw new ApiError(404, "Complaint not found");
    }

    return res.status(200).json(
        new ApiResponse(200, complaint, "Complaint reopened successfully")
    );
});

export { submitComplaint, getComplaints, getComplaintDetails, addResponse, resolveComplaint, reopenComplaint };