import mongoose, { Schema } from "mongoose";

const guardDutyLogSchema = new Schema({
    guardId: {
        type: Schema.Types.ObjectId,
        ref: "User",
        required: true
    },

    gate: {
        type: String,
    },
    
    checkinReason: {
        type: String,
    },
    
    checkoutReason: {
        type: String,
    },

    date: {
        type: Date
    },
    
    checkinTime: {
        type: Date
    },
    
    checkoutTime: { 
        type: Date, 
    },

}, { timestamps: true });

export const GuardDutyLog = mongoose.model("GuardDutyLog", guardDutyLogSchema);