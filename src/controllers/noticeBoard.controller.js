import asyncHandler from "../utils/asynchandler.js";
import ApiResponse from "../utils/ApiResponse.js";
import ApiError from "../utils/ApiError.js";
import { NoticeBoard } from "../models/noticeBoard.model.js";
import { uploadOnCloudinary } from "../utils/cloudinary.js";
import mongoose from "mongoose";
import { ProfileVerification } from "../models/profileVerification.model.js";
import {sendNotification} from "../utils/sendResidentNotification.js"

const createNotice = asyncHandler(async (req, res) => {
    const { title, description, category } = req.body;
    const society = req.member?.societyName || '';

    let image = null;
    if (req.file) {
        image = await uploadOnCloudinary(req.file.path);
    }

    const notice = await NoticeBoard.create({
        society,
        title,
        image: image ? image.url : undefined,
        description,
        category,
        publishedBy: req.user._id,
    });

    const existNotice = await NoticeBoard.findById(notice._id).populate("publishedBy", "userName email FCMToken")

    if (!existNotice) {
        throw new ApiError(400, "Notice creation failed");
    }

    const users = await ProfileVerification.find({ societyName: existNotice.society }).populate("user", "FCMToken");

    const FCMTokens = users
            .filter((item) => item.user?.FCMToken && existNotice.publishedBy.FCMToken !== item.user?.FCMToken)
            .map((item) => item.user.FCMToken);

    let payload = {
        ...existNotice.toObject(),
        action: 'NOTIFY_NOTICE_CREATED'
    };

    FCMTokens.forEach(token => {
        sendNotification(token, payload.action, JSON.stringify(payload));
    });

    return res.status(201).json(
        new ApiResponse(200, existNotice, "Notice created successfully")
    );
});

const getNotices = asyncHandler(async (req, res) => {
    const society = req.member?.societyName || '';
    // Pagination parameters
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    // Filter parameters
    const filters = {};

    // Date range filter
    if (req.query.startDate && req.query.endDate) {
        const startDate = new Date(req.query.startDate);
        const endDate = new Date(req.query.endDate);
        endDate.setHours(23, 59, 59, 999); // Set to end of day

        filters.createdAt = {
            $gte: startDate,
            $lte: endDate
        };
    }

    // Entry type filter
    if (req.query.category) {
        filters.category = req.query.category;
    }

    // Name/keyword search
    if (req.query.search) {
        filters.$or = [
            { title: { $regex: req.query.search, $options: 'i' } },
            { description: { $regex: req.query.search, $options: 'i' } },
        ];
    }

    // Base match conditions for DeliveryEntry
    const noticeMatch = {
        isDeleted: false, 
        society,
        ...filters
    };

    // Count total documents for pagination
    const totalCount = await NoticeBoard.countDocuments(noticeMatch);
    const totalPages = Math.ceil(totalCount / limit);

    let notices = await NoticeBoard.find(noticeMatch)
        .sort({ createdAt: -1 }) // Sort by newest first
        .populate("publishedBy", "userName email")
        .populate("readBy", "userName email profile");

    // Apply pagination on combined results
    notices = notices.slice(skip, skip + limit);

    if (notices.length <= 0) {
        throw new ApiError(404, "No entries found matching your criteria");
    }

    return res.status(200).json(
        new ApiResponse(200, {
            notices: notices,
            pagination: {
                totalEntries: totalCount,
                entriesPerPage: limit,
                currentPage: page,
                totalPages: totalPages,
                hasMore: page < totalPages
            }
        }, "Notices fetched successfully.")
    );
});

const getNotice = asyncHandler(async (req, res) => {
    const society = req.member?.societyName || '';

    const id = mongoose.Types.ObjectId.createFromHexString(req.params.id);
    const notice = await NoticeBoard.findOneAndUpdate(
        { _id: id, isDeleted: false, society },
        {
            $addToSet: { readBy: req.user._id }
        },
        { new: true }
    )
        .populate("publishedBy", "userName email")
        .populate("readBy", "userName email");

    if (!notice) {
        throw new ApiError(404, "Notice not found");
    }

    return res.status(200).json(
        new ApiResponse(200, notice, "Notice fetched successfully")
    );
});

const updateNotice = asyncHandler(async (req, res) => {
    let { title, description, image } = req.body;
    const id = mongoose.Types.ObjectId.createFromHexString(req.params.id);
    const society = req.member?.societyName || '';

    let uploadedImage = null;
    if (req.file) {
        uploadedImage = await uploadOnCloudinary(req.file.path);
    }

    image = image ? image : uploadedImage ? uploadedImage.url : undefined;

    const updateData = {
        title,
        description,
        updatedBy: req.user._id,
    };

    // ✅ Only add `image` if it's defined (avoids setting `undefined`).
    if (image) {
        updateData.image = image;
    } else {
        updateData.$unset = { image: "" }; // ✅ Removes `image` field from the document
    }

    const notice = await NoticeBoard.findOneAndUpdate({ _id: id, isDeleted: false, society }, updateData, { new: true });

    if (!notice) {
        throw new ApiError(404, "Notice not found");
    }

    return res.status(200).json(
        new ApiResponse(200, notice, "Notice updated successfully")
    );
});

const deleteNotice = asyncHandler(async (req, res) => {
    const id = mongoose.Types.ObjectId.createFromHexString(req.params.id);
    const society = req.member?.societyName || '';

    const notice = await NoticeBoard.findOneAndUpdate(
        { _id: id, isDeleted: false, society },
        {
            isDeleted: true,
            deletedAt: new Date(),
            deletedBy: req.user._id,
        },
        { new: true }
    );

    if (!notice) {
        throw new ApiError(404, "Notice not found");
    }

    return res.status(200).json(
        new ApiResponse(200, notice, "Notice deleted successfully")
    );
});

const isUnreadNotice = asyncHandler(async (req, res) => {
    const society = req.member?.societyName || '';

    const unreadNotices = await NoticeBoard.find({ isDeleted: false, society, readBy: { $ne: { _id: req.user._id } } });

    return res.status(200).json(
        new ApiResponse(200, unreadNotices, "Unread notices fetched successfully")
    );
});

export { createNotice, getNotices, getNotice, updateNotice, deleteNotice, isUnreadNotice };