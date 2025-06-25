import mongoose, {Schema} from "mongoose";

const ResolutionSchema = new Schema({
    complaintId: {
        type: Schema.Types.ObjectId,
        ref: "Complaint",
    },
    resolutionAttachment: {
        type: String,
    },
    resolutionNote: {
        type: String,
    },
    resolvedBy: {
        type: Schema.Types.ObjectId,
        ref: "User",
    },
    resolutionSubmittedAt: {
        type: Date,
    },
    status: {
        type: String,
        enum: ['pending', 'under_review', 'approved', 'rejected'],
        default: "pending"
    },
    rejectedNote: {
        type: String,
    },
    approvedBy: {
        type: Schema.Types.ObjectId,
        ref: "User"
    },
    rejectedBy: {
        type: Schema.Types.ObjectId,
        ref: "User"
    }
}, { timestamps: true});

export const Resolution = mongoose.model("Resolution", ResolutionSchema);