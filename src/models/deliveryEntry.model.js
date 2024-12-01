import mongoose, { Schema } from "mongoose";

const societyDetails = new Schema({
    societyName: {
        type: String,
        required: true,
    },
    societyApartments: {
        type: [
            {
                societyBlock: String,
                apartment: String,
                members: {
                    type: [{}]
                },
                entryStatus: {
                    status: {
                        type: String,
                        enum: ['pending', 'approve', 'rejected'],
                        default: 'pending'
                    },
                    approvedBy: {
                        type: Schema.Types.ObjectId,
                        ref: "User"
                    },
                    rejectedBy: {
                        type: Schema.Types.ObjectId,
                        ref: "User"
                    }
                }
            }
        ],
        default: [],
    },
    societyGates: {
        type: String,
    },
});

const deliveryEntrySchema = new Schema({
    name: {
        type: String,
        required: true,
        trim: true,
    },

    mobNumber: {
        type: String,
        required: true,
        trim: true,
    },

    profileImg: {
        type: String,
        required: true,
        trim: true,
    },

    companyName: {
        type: String,
        trim: true,
    },

    companyLogo: {
        type: String,
    },

    serviceName: {
        type: String,
        trim: true,
    },

    serviceLogo: {
        type: String,
    },

    accompanyingGuest: {
        type: String,
        trim: true,
    },

    vehicleDetails: {
        type: {
            vehicleType: {
                type: String,
                trim: true,
            },
            vehicleNumber: {
                type: String,
                trim: true,
            }
        }
    },

    entryType: {
        type: String,
        trim: true,
        lowercase: true
    },

    guardStatus: {
        guard: {
            type: Schema.Types.ObjectId,
            ref: "User"
        },
        status: {
            type: String,
            enum: ['pending', 'approve', 'rejected'],
            default: 'pending'
        },
    },

    societyDetails: societyDetails,

    entryTime: {
        type: Date
    },

    exitTime: {
        type: Date
    },

    notificationId: {
        type: Number
    },

    hasExited: {
        type: Boolean,
        default: false, // Optional: set a default value
    },

}, { timestamps: true });


export const DeliveryEntry = mongoose.model("DeliveryEntry", deliveryEntrySchema);
