// utils/mailSender.js
import { createTransport } from 'nodemailer';
import bcryptjs from 'bcryptjs'
import { User } from '../models/user.model.js';

async function mailSender(email, userId, emailType) {
  try {
    // Create hashed token 
    const hashedToken = await bcryptjs.hash(userId.toString(), 10)

    if (emailType === "VERIFY") {
      await User.findByIdAndUpdate(userId, { verifyToken: hashedToken, verifyTokenExpiry: Date.now() + (1000 * 60 * 10) });
    } else if (emailType === "RESET") {
      await User.findByIdAndUpdate(userId, { forgotPasswordToken: hashedToken, forgotPasswordTokenExpiry: Date.now() + (1000 * 60 * 10) });
    } else if (emailType === "GOOGLE") {
      await User.findByIdAndUpdate(userId, { googleVerifyToken: hashedToken, googleVerifyTokenExpiry: Date.now() + (1000 * 60 * 10) });
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
      subject: emailType === "VERIFY" ? "Verify your email" : emailType === "GOOGLE" ? "Link your Google account" : "Reset your password",
      html: `<p>Click <a href="${process.env.DOMAIN}/api/v1/verify/${emailType === "VERIFY" ? "verify-email" : emailType === "GOOGLE" ? "link-google" : "reset-password"}?token=${hashedToken}">here</a> to ${emailType === "VERIFY" ? "verify your email" : emailType === "GOOGLE" ? "Link your Google account" : "Reset your password"}</p>`
    });

    return mailResponse;
  } catch (error) {
    console.log(error.message);
  }
};

export default mailSender;