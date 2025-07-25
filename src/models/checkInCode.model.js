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
        type: String,
        trim: true,
    },

    mobNumber: {
        type: String,
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

    vehicleNo: {
        type: String,
        trim: true,
    },

    profileType: {
        type: String,
        trim: true,
    },

    entryType: {
        type: String,
        trim: true,
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

    gatepassAptDetails: {
        type: {
            societyName: {
                type: String,
                required: true,
            },
            societyGates: {
                type: String,
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
        },
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

    addressProof: {
        type: String,
        trim: true,
    },

    address: {
        type: String,
        trim: true,
    },

    gender: {
        type: String,
        trim: true,
    },

    checkInCode: {
        type: String,
        trim: true,
    },

    checkInCodeStartDate: {
        type: Date
    },

    checkInCodeExpiryDate: {
        type: Date
    },

    checkInCodeStart: {
        type: Date
    },

    checkInCodeExpiry: {
        type: Date
    },

    isPreApproved: {
        type: Boolean,
        default: false,
    },

}, { timestamps: true });


export const CheckInCode = mongoose.model("CheckInCode", checkInCodeSchema);