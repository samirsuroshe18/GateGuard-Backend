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

    name: {
        type: String
    },

    mobNumber: {
        type: String
    },

    profileType: {
        type: String
    },

    entryTime: {
        type: Date
    },

    exitTime: {
        type: Date
    },

}, { timestamps: true });


export const PreApproved = mongoose.model("PreApproved", preApprovedSchema);