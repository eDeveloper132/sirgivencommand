import transporter from './emailconfig.js';
import { URL } from 'url';
// import { v4 as uuidv4 } from 'uuid'; // Removed since not used
// import bcrypt from "bcrypt"; // Removed since not used
import { SignModel } from "./Schema/Post.js";

async function sendVerificationEmail(Email: string, verificationToken: string): Promise<void> {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    if (!Email || !emailRegex.test(Email)) {
        console.error("Invalid recipient email");
        return;
    }

    const verificationURL = new URL(`${process.env.END_POINT}/verify-email`);
    verificationURL.searchParams.append('token', verificationToken);

    const mailOptions = {
        from: process.env.EMAIL_USER,
        to: Email,
        subject: 'Verify Your Email',
        text: `Please verify your email for using SMS PORTAL by clicking on the following link: ${verificationURL}`,
        html: `
            <p>Please verify your email for using SMS PORTAL by clicking on the following link:</p>
            <p><a href="${verificationURL}">Verify Email</a></p>
        `
    };

    try {
        await transporter.sendMail(mailOptions);
        console.log("Verification email sent successfully");
    } catch (error) {
        console.error("Failed to send verification email:", error);
    }
}

export default sendVerificationEmail;
