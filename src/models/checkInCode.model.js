import mongoose, { Schema } from "mongoose";

const checkInCodeSchema = new Schema({
    user: {
        type: Schema.Types.ObjectId,
        ref: "User"
    },

    approvedBy: {
        type: Schema.Types.ObjectId,
        ref: "User"
    },

    name: {
        type: String
    },

    mobNumber: {
        type: String
    },

    societyName: {
        type: String
    },

    checkInCode: {
        type: String
    },

    profileType: {
        type: String
    },

    checkInCodeStart: {
        type: Date
    },

    checkInCodeExpiry: {
        type: Date
    },

    isPreApproved: {
        type: Boolean,
        default: false, // Optional: set a default value
    },

}, { timestamps: true });


export const CheckInCode = mongoose.model("CheckInCode", checkInCodeSchema);