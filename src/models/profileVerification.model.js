import mongoose, { Schema } from "mongoose";

const profileVerificationSchema = new Schema({
    user: {
        type: Schema.Types.ObjectId,
        ref: "User"
    },

    profileType: {
        type: String,
        required: true,
        trim: true,
    },

    societyName: {
        type: String,
        required: true,
        trim: true,
    },

    societyBlock: {
        type: String,
        trim: true,
    },

    apartment: {
        type: String,
        trim: true,
    },

    ownership: {
        type: String,
        enum: ['owner', 'tenant'],
    },

    gateAssign: {
        type: String
    },

    residentStatus: {
        type: String,
        enum: ['none', 'pending', 'rejected', 'approve'],
        default: 'none'
    },

    guardStatus: {
        type: String,
        enum: ['none', 'pending', 'rejected', 'approve'],
        default: 'none'
    },
}, { timestamps: true });


export const ProfileVerification = mongoose.model("ProfileVerification", profileVerificationSchema);