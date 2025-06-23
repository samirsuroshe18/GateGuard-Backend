import mongoose, { Schema } from "mongoose";

const ComplaintSchema = new Schema({
    raisedBy: {
        type: Schema.Types.ObjectId,
        ref: "User"
    },

    societyName: {
        type: String,
        required: true
    },

    area: {
        type: String,
        required: true
    },

    category: {
        type: String,
        required: true
    },

    subCategory: {
        type: String,
        required: true
    },

    status: {
        type: String,
        enum: ["pending", "resolved"],
        default: "pending"
    },

    description: {
        type: String,
        required: true
    },

    date: {
        type: Date,
        default: Date.now
    },

    complaintId: {
        type: String,
        unique: true,
        required: true
    },

    review: {
        type: Number,
        min: 0,
        max: 5
    },

    responses: [
        {
            responseBy: {
                type: Schema.Types.ObjectId,
                ref: "User"
            },
            message: String,
            date: {
                type: Date,
                default: Date.now
            },
        },
    ],

    imageUrl: {
        type: String
    },

    technicianId: {
        type: Schema.Types.ObjectId,
        ref: "User"
    },

    assignedBy: {
        type: Schema.Types.ObjectId,
        ref: "User"
    },

    assignedAt: {
        type: Date,
        default: Date.now
    },

    assignStatus: {
        type: String,
        enum: ["assigned", "unassigned"],
        default: "unassigned"
    },

    resolution : {
        type: Schema.Types.ObjectId,
        ref: "Resolution"
    }

}, { timestamps: true });

export const Complaint = mongoose.model("Complaint", ComplaintSchema);
