import mongoose, { Schema } from "mongoose";

const preApprovedSchema = new Schema({
    approvedBy: {
        user: {
            type: Schema.Types.ObjectId,
            ref: "User"
        },
        status: {
            type: String,
            enum: ['pending', 'approve', 'rejected'],
            default: 'approve'
        }
    },

    allowedBy: {
        user: {
            type: Schema.Types.ObjectId,
            ref: "User"
        },
        status: {
            type: String,
            enum: ['pending', 'approve', 'rejected'],
            default: 'approve'
        }
    },

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
        type: String
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

    vehicleDetails: {
        type: {
            vehicleType: String,
            vehicleNumber: String
        }
    },

    profileType: {
        type: String,
        trim: true,
    },

    entryType: {
        type: String,
        trim: true,
        lowercase: true
    },

    societyName: {
        type: String,
        trim: true,
    },

    blockName: {
        type: String,
        trim: true,
    },

    apartment: {
        type: String,
        trim: true,
    },

    gateName: {
        type: String,
        trim: true,
    },

    entryTime: {
        type: Date
    },

    exitTime: {
        type: Date
    },

    hasExited: {
        type: Boolean,
        default: false,
    },

    gatepassAptDetails: {
        type: {
            societyName: {
                type: String,
                required: true,
            },
            societyApartments: {
                type: [
                    {
                        societyBlock: String,
                        apartment: String,
                    }
                ],
                default: [],
            },
        },
    },

}, { timestamps: true });


export const PreApproved = mongoose.model("PreApproved", preApprovedSchema);