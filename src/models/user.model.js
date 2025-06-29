import mongoose, { Schema } from "mongoose";
import jwt from "jsonwebtoken";
import bcrypt from 'bcrypt';

const userSchema = new Schema({
    userName: {
        type: String,
        required: true,
        trim: true,
    },

    email: {
        type: String,
        required: true,
        trim: true,
        unique: true,
        lowercase: true
    },

    phoneNo: {
        type: String,
        trim: true,
    },

    profile: {
        type: String,
    },

    password: {
        type: String,
    },
    
    technicianPassword: {
        type: String,
    },

    isVerified: {
        type: Boolean,
        default: false,
    },

    isGoogleVerified: {
        type: Boolean,
        default: false,
    },

    FCMToken: {
        type: String
    },

    role: {
        type: String,
        default: 'user'
    },

    userType: {
        type: String,
        enum: ['Resident', 'Security', 'Technician'],
    },

    isUserTypeVerified: {
        type: Boolean,
        default: false,
    },
    
    isOnDuty: {
        type: Boolean,
        default: false,
    },

    refreshToken: {
        type: String
    },

    expireDocAfterSeconds: { 
        type: Date, 
    },

    verifyToken: String,
    verifyTokenExpiry: Date,
    googleVerifyToken: String,
    googleVerifyTokenExpiry: Date,
    forgotPasswordToken: String,
    forgotPasswordTokenExpiry: Date,

}, { timestamps: true });

// Create TTL index manually (only applies to documents where `lastModifiedDate` exists)
userSchema.index({ expireDocAfterSeconds: 1 }, { expireAfterSeconds: 600 });

//pre hooks allow us to do any operation before saving the data in database
//in pre hook the first parameter on which event you have to do the operation like save, validation, etc
userSchema.pre("save", async function (next) {
    if (!this.isModified("password")) return next();

    this.password = await bcrypt.hash(this.password, 10);
    next();
});

//you can create your custom methods as well by using methods object
userSchema.methods.isPasswordCorrect = async function (password) {
    return await bcrypt.compare(password, this.password);
}

//jwt is a bearer token it means the person bear this token we give the access to that person its kind of chavi
userSchema.methods.generateAccessToken = function () {
    return jwt.sign(
        {
            _id: this._id,
            email: this.email,
            userName: this.userName,
        }, process.env.ACCESS_TOKEN_SECRET,
        {
            expiresIn: process.env.ACCESS_TOKEN_EXPIRY
        }
    );
}

userSchema.methods.generateRefreshToken = function () {
    return jwt.sign(
        {
            _id: this._id
        },
        process.env.REFRESH_TOKEN_SECRET,
        {
            expiresIn: process.env.REFRESH_TOKEN_EXPIRY
        }
    );
}

export const User = mongoose.model("User", userSchema);