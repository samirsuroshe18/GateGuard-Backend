import mongoose, { Schema } from "mongoose";

const preApprovedSchema = new Schema({
    approvedBy: {
        type: Schema.Types.ObjectId,
        ref: "User"
    },

    allowedBy: {
        type: Schema.Types.ObjectId,
        ref: "User"
    },

    profileImg: {
        type: String
    },

    name: {
        type: String
    },

    mobNumber: {
        type: String
    },

    profileType: {
        type: String
    },

    societyName: {
        type: String
    },

    blockName: {
        type: String
    },

    apartment: {
        type: String
    },

    entryTime: {
        type: Date
    },

    exitTime: {
        type: Date
    },

    hasExited: {
        type: Boolean,
        default: false, // Optional: set a default value
    },

}, { timestamps: true });


export const PreApproved = mongoose.model("PreApproved", preApprovedSchema);