import mongoose, { Schema } from "mongoose";

const noticeBoardSchema = new Schema({
    society: {
        type: String,
        required: true,
        trim: true,
    },  
    title: {
        type: String,
        required: true,
        trim: true,
    },
    description: {
        type: String,
        required: true,
        trim: true,
    },
    category: {  // New category field added
        type: String,
        enum: ["important", "event", "maintenance"],
        required: true,
    },
    image: {
        type: String,
    },
    readBy: [{
        type: Schema.Types.ObjectId,
        ref: 'User',
    }],
    publishedBy: {
        type: Schema.Types.ObjectId,
        ref: 'User',
    },
    isDeleted: {
        type: Boolean,
        default: false,
    },
    deletedAt: {
        type: Date,
    },
    deletedBy: {
        type: Schema.Types.ObjectId,
        ref: 'User',
    },
    updatedBy: {
        type: Schema.Types.ObjectId,
        ref: 'User',
    },
}, { timestamps: true });

export const NoticeBoard = mongoose.model('NoticeBoard', noticeBoardSchema);