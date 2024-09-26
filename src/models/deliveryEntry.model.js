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
                apartment: String
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
        lowercase: true
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

    vehicleDetails: {
        type: {
            vehicleType: String,
            vehicleNumber: String
        }
    },

    entryType: {
        type: String,
        trim: true,
        lowercase: true
    },

    societyDetails: societyDetails,

}, { timestamps: true });

export const DeliveryEntry = mongoose.model("DeliveryEntry", deliveryEntrySchema);

// Payload
// {
//     "name": "john doe",
//         "mobNumber": "1234567890",
//             "profileImg": "https://example.com/johndoe.jpg",
//                 "vehicleDetails": {
//         "vehicleType": "bike",
//             "vehicleNumber": "MH12AB1234"
//     },
//     "entryType": "delivery",
//         "societyDetails": {
//         "societyName": "Sunshine Apartments",
//             "societyApartments": [
//                 {
//                     "societyBlock": "A",
//                     "apartmentName": "101"
//                 },
//                 {
//                     "societyBlock": "B",
//                     "apartmentName": "202"
//                 }
//             ],
//                 "societyGates": "Gate 1"
//     }
// }
