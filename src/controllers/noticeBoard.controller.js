import asyncHandler from "../utils/asynchandler.js";
import ApiResponse from "../utils/ApiResponse.js";
import ApiError from "../utils/ApiError.js";
import { NoticeBoard } from "../models/noticeBoard.model.js";
import {uploadOnCloudinary} from "../utils/cloudinary.js";
import mongoose from "mongoose";

const createNotice = asyncHandler(async (req, res, next) => {
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

    const existNotice = await NoticeBoard.findById(notice._id).populate("publishedBy", "userName email")

    if (!existNotice) {
        throw new ApiError(400, "Notice creation failed");
    }

    return res.status(201).json(
        new ApiResponse(200, existNotice, "Notice created successfully")
    );
});

const getNotices = asyncHandler(async (req, res, next) => {
    const society = req.member?.societyName || '';
    
    const notices = await NoticeBoard.find({ isDeleted: false, society })
        .populate("publishedBy", "userName email") 
        .populate("readBy", "userName email");

    return res.status(200).json(
        new ApiResponse(200, notices, "Notices fetched successfully")
    );
});

const getNotice = asyncHandler(async (req, res, next) => {
    const society = req.member?.societyName || '';

    const id = mongoose.Types.ObjectId.createFromHexString(req.params.id);
    const notice = await NoticeBoard.findOneAndUpdate(
        {_id: id, isDeleted: false, society},
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

const updateNotice = asyncHandler(async (req, res, next) => {
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
    
    const notice = await NoticeBoard.findOneAndUpdate({_id: id, isDeleted: false, society}, updateData, { new: true });

    if (!notice) {
        throw new ApiError(404, "Notice not found");
    }

    return res.status(200).json(
        new ApiResponse(200, notice, "Notice updated successfully")
    );
});

const deleteNotice = asyncHandler(async (req, res, next) => {
    const id = mongoose.Types.ObjectId.createFromHexString(req.params.id);
    const society = req.member?.societyName || '';

    const notice = await NoticeBoard.findOneAndUpdate(
        {_id:id, isDeleted: false, society},
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

    const unreadNotices = await NoticeBoard.find({ isDeleted: false, society, readBy: { $ne: {_id:req.user._id} } });

    return res.status(200).json(
        new ApiResponse(200, unreadNotices, "Unread notices fetched successfully")
    );
});

export { createNotice, getNotices, getNotice, updateNotice, deleteNotice, isUnreadNotice };