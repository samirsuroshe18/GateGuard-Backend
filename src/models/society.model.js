import mongoose, { Schema } from "mongoose";

const societySchema = new Schema({
    societyName: {
        type: String,
        required: true,
        unique: true
    },

    societyBlocks: {
        type: [String], // Array of strings
        default: [],
    },

    societyApartments: {
        type: [
            {
                societyBlock: {
                    type: String,
                    trim: true,
                },
                apartmentName: {
                    type: String,
                    trim: true,
                }
            }
        ],
        default: [],
    },

    societyGates: {
        type: [String],
        default: [],
    },
}, { timestamps: true });

export const Society = mongoose.model("Society", societySchema);