// // utils/mailSender.js
// import { createTransport } from 'nodemailer';
// import bcryptjs from 'bcryptjs'
// import { User } from '../models/user.model.js';

// async function mailSender(email, userId, emailType) {
//   try {
//     // Create hashed token 
//     const hashedToken = await bcryptjs.hash(userId.toString(), 10)

//     if (emailType === "VERIFY") {
//       await User.findByIdAndUpdate(userId, { verifyToken: hashedToken, verifyTokenExpiry: Date.now() + (1000 * 60 * 10) });
//     } else if (emailType === "RESET") {
//       await User.findByIdAndUpdate(userId, { forgotPasswordToken: hashedToken, forgotPasswordTokenExpiry: Date.now() + (1000 * 60 * 10) });
//     } else if (emailType === "GOOGLE") {
//       await User.findByIdAndUpdate(userId, { googleVerifyToken: hashedToken, googleVerifyTokenExpiry: Date.now() + (1000 * 60 * 10) });
//     }


//     // Create a Transporter to send emails
//     let transporter = createTransport({
//       host: process.env.MAIL_HOST,
//       port: process.env.EMAIL_PORT,
//       auth: {
//         user: process.env.MAIL_USER,
//         pass: process.env.MAIL_PASS,
//       }
//     });


//     // Send emails to users
//     let mailResponse = await transporter.sendMail({
//       from: process.env.MAIL_USER,
//       to: email,
//       subject: emailType === "VERIFY" ? "Verify your email" : emailType === "GOOGLE" ? "Link your Google account" : "Reset your password",
//       html: `<p>Click <a href="${process.env.DOMAIN}/api/v1/verify/${emailType === "VERIFY" ? "verify-email" : emailType === "GOOGLE" ? "link-google" : "reset-password"}?token=${hashedToken}">here</a> to ${emailType === "VERIFY" ? "verify your email" : emailType === "GOOGLE" ? "Link your Google account" : "Reset your password"}</p>`
//     });

//     return mailResponse;
//   } catch (error) {
//     console.log(error.message);
//   }
// };

// export default mailSender;

// utils/mailSender.js
import { createTransport } from 'nodemailer';
import bcryptjs from 'bcryptjs'
import { User } from '../models/user.model.js';

async function mailSender(email, userId, emailType, password = "NA") {
  try {
    // Create hashed token 
    const hashedToken = await bcryptjs.hash(userId.toString(), 10)
    let subject, htmlContent;

    if (emailType === "VERIFY") {
      await User.findByIdAndUpdate(userId, { verifyToken: hashedToken, verifyTokenExpiry: Date.now() + (1000 * 60 * 10) });
      subject = "Verify your email";
      htmlContent = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #333;">Email Verification Required</h2>
          <p>Please verify your email address to complete your account setup.</p>
          <div style="margin: 30px 0;">
            <a href="${process.env.DOMAIN}/api/v1/verify/verify-email?token=${hashedToken}" 
               style="background-color: #28a745; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px; display: inline-block;">
              Verify Email Address
            </a>
          </div>
          <p style="color: #666; font-size: 14px;">If you didn't create an account, please ignore this email.</p>
        </div>
      `;
    } else if (emailType === "RESET") {
      await User.findByIdAndUpdate(userId, { forgotPasswordToken: hashedToken, forgotPasswordTokenExpiry: Date.now() + (1000 * 60 * 10) });
      subject = "Reset your password";
      htmlContent = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #333;">Password Reset Request</h2>
          <p>You have requested to reset your password. Click the button below to proceed.</p>
          <div style="margin: 30px 0;">
            <a href="${process.env.DOMAIN}/api/v1/verify/reset-password?token=${hashedToken}" 
               style="background-color: #dc3545; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px; display: inline-block;">
              Reset Password
            </a>
          </div>
          <p style="color: #666; font-size: 14px;">If you didn't request a password reset, please ignore this email.</p>
        </div>
      `;
    } else if (emailType === "GOOGLE") {
      await User.findByIdAndUpdate(userId, { googleVerifyToken: hashedToken, googleVerifyTokenExpiry: Date.now() + (1000 * 60 * 10) });
      subject = "Link your Google account";
      htmlContent = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #333;">Link Your Google Account</h2>
          <p>Complete the linking process by clicking the button below.</p>
          <div style="margin: 30px 0;">
            <a href="${process.env.DOMAIN}/api/v1/verify/link-google?token=${hashedToken}" 
               style="background-color: #4285f4; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px; display: inline-block;">
              Link Google Account
            </a>
          </div>
          <p style="color: #666; font-size: 14px;">If you didn't request to link your Google account, please ignore this email.</p>
        </div>
      `;
    } else if (emailType === "VERIFY_TECHNICIAN") {
      subject = "Welcome! Your Technician Account Credentials";
      htmlContent = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #333;">Welcome to Our Platform!</h2>
          <p>Your technician account has been created successfully. Here are your login credentials:</p>
          
          <div style="background-color: #f5f5f5; padding: 20px; border-radius: 5px; margin: 20px 0;">
            <h3 style="margin-top: 0;">Login Credentials:</h3>
            <p><strong>Email:</strong> ${email}</p>
            <p><strong>Password:</strong> ${password || 'Not provided'}</p>
          </div>
          
          <p style="color: #666; font-size: 14px;">
            <strong>Important:</strong> Please keep your credentials secure and do not share them with anyone.
          </p>
        </div>
      `;
    }


    // Create a Transporter to send emails
    let transporter = createTransport({
      host: process.env.MAIL_HOST,
      port: process.env.EMAIL_PORT,
      auth: {
        user: process.env.MAIL_USER,
        pass: process.env.MAIL_PASS,
      }
    });


    // Send emails to users
    let mailResponse = await transporter.sendMail({
      from: process.env.MAIL_USER,
      to: email,
      subject: subject,
      html: htmlContent
    });

    return mailResponse;
  } catch (error) {
    console.log(error.message);
  }
};

export default mailSender;