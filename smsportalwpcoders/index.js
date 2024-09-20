import express from 'express';
import 'dotenv/config';
import cors from 'cors';
import path from 'path';
import bcrypt from 'bcrypt';
import { fileURLToPath } from 'url';
import { v4 as uuidv4 } from 'uuid';
import { SignModel, TokenModel } from './Schema/Post.js';
import MainRoute from './Routes/Main.js';
import SMSRoute from './Routes/SMS.js';
import connection from './DB/db.js';
import PackageDetails from './Routes/Package.js';
import sendVerificationEmail from './emailService.js';
const PORT = process.env.PORT || 3437;
const app = express();
app.use(express.json());
app.use(cors());
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
await connection();
// Session and Token Management Arrays
const SessionManager = [];
const OneTime = [];
const ExpiredTokens = [];
const FetchUserDetails = [];
const verificateUser = [];
// Serve static assets
app.use('/assets', express.static(path.join(__dirname, 'assets')));
// Function to clear one-time tokens
function clearOneTimeToken() {
    const maxTimeout = Math.pow(2, 31) - 1; // Maximum timeout in JS
    const timeoutDuration = Math.min(2.592E+09, maxTimeout); // 30 days or max timeout
    setTimeout(async () => {
        if (OneTime.length > 0) {
            console.log('OneTime token expired');
            const Token = OneTime.shift(); // Remove first token
            if (Token) {
                const signin = await TokenModel.findOneAndDelete({ Token });
                console.log('Deleted Token', signin);
            }
        }
    }, timeoutDuration);
}
if (OneTime.length > 0) {
    clearOneTimeToken();
}
// Middleware for token verification and path exceptions
const exemptPaths = ['/verify-email', '/resend-verification', '/recoverpass'];
app.use((req, res, next) => {
    if (exemptPaths.includes(req.path.toLowerCase())) {
        return next();
    }
    if (OneTime[0]) {
        const isValidToken = SessionManager.some(session => session.Token === OneTime[0]);
        if (!isValidToken) {
            console.log('Invalid Token');
            OneTime.shift();
            SessionManager.shift();
            return res.redirect('/signin');
        }
        if (req.path.toLowerCase() === '/signin' || req.path.toLowerCase() === '/signup') {
            return res.redirect('/');
        }
        else {
            console.log('Success');
            next();
        }
    }
    else {
        console.log('OneTime Token is not set');
        if (req.path.toLowerCase() === '/signin' || req.path.toLowerCase() === '/signup') {
            next();
        }
        else {
            return res.redirect('/signin');
        }
    }
    if (OneTime.length > 0) {
        clearOneTimeToken();
    }
});
// Sign-up route
app.get('/signup', (req, res) => {
    res.sendFile(path.resolve(__dirname, './Views/signup.html'));
});
app.post('/signup', async (req, res) => {
    const { Name, Email, Password, Role, Organization, PhoneNumber } = req.body;
    try {
        if (!Name || !Email || !Password || !Role || !Organization || !PhoneNumber) {
            return res.status(400).send('Error: Missing fields');
        }
        const hashedPassword = await bcrypt.hash(Password, 10);
        const verificationToken = uuidv4(); // Generate unique verification token
        const newUser = new SignModel({
            id: uuidv4(),
            Name,
            Email,
            Password: hashedPassword,
            PhoneNumber,
            Role,
            Organization,
            verificationToken,
            verificationTokenExpiry: new Date(Date.now() + 3600000), // Token expiry time
            isVerified: false,
        });
        await newUser.save();
        // Send verification email
        await sendVerificationEmail(Email, verificationToken);
        console.log('A verification link has been sent to your email.');
        res.redirect('/');
    }
    catch (error) {
        console.error('Error during signup:', error);
        res.status(500).send('Internal Server Error');
    }
});
// Sign-in route
app.get('/signin', (req, res) => {
    res.sendFile(path.resolve(__dirname, './Views/signin.html'));
});
app.post('/signin', async (req, res) => {
    const { Email, Password } = req.body;
    try {
        if (!Email || !Password) {
            return res.status(400).send('Error: Missing fields');
        }
        const user = await SignModel.findOne({ Email });
        if (!user || !user.Password) {
            console.log('User or Password not found');
            return res.status(401).send('Error: Invalid email or password');
        }
        const isMatch = await bcrypt.compare(Password, user.Password);
        if (!isMatch) {
            console.log('Password does not match');
            return res.status(401).send('Error: Invalid password');
        }
        if (user.Role === 'Admin') {
            return res.status(401).send('Error: You are not a User');
        }
        if (user.isVerified) {
            const token = uuidv4();
            const hashedToken = await bcrypt.hash(token, 10);
            SessionManager.push({ Token: hashedToken });
            const signin = await TokenModel.create({ Token: hashedToken });
            await signin.save();
            OneTime.push(hashedToken);
            ExpiredTokens.push({ Token: hashedToken });
            FetchUserDetails.push({ user });
            console.log('User logged in:', user);
            console.log('Uploaded Id on Database:', signin);
            console.log('Generated access token:', hashedToken);
            res.redirect('/');
        }
        else {
            res.redirect('/signup');
        }
    }
    catch (error) {
        console.error('Error during login:', error.message);
        res.status(500).send('Internal Server Error');
    }
});
app.post('/reset-session', async (req, res) => {
    const token = OneTime[0];
    if (token) {
        const signin = await TokenModel.findOneAndDelete({ Token: token });
        console.log('Deleted Token:', signin);
        OneTime.shift();
        SessionManager.shift();
        FetchUserDetails.shift();
    }
    res.status(200).send('Session reset');
});
app.post('/user', async (req, res) => {
    const userData = FetchUserDetails[0];
    console.log(userData);
    try {
        if (!userData || !userData.user || !userData.user.Email || !userData.user.Password) {
            return res.status(400).send('Error: Missing fields');
        }
        const userId = userData.user._id;
        const user = await SignModel.findById(userId);
        if (!user) {
            console.log('User not found');
            return res.status(401).send('Error: Invalid email');
        }
        const data = {
            Name: user.Name,
            Email: user.Email,
            Password: user.Password,
            PackageName: user.Details?.PackageName,
            Coins: user.Details?.Coins,
        };
        res.send(data);
    }
    catch (error) {
        console.error('Error fetching user data:', error.message);
        res.status(500).send('Internal Server Error');
    }
});
app.use('/', MainRoute);
app.use('/sms', SMSRoute);
app.use('/buypackage', PackageDetails);
const passwordArray = [];
app.post('/recoverpass', async (req, res) => {
    const { email } = req.body;
    try {
        const user = await SignModel.findOne({ Email: email });
        if (!user) {
            console.log('User not found');
            return res.status(401).send('Invalid email address. Please try again.');
        }
        const userId = user._id;
        const generateTemporaryPassword = (length = 10) => {
            const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
            let password = '';
            for (let i = 0; i < length; i++) {
                const randomIndex = Math.floor(Math.random() * characters.length);
                password += characters[randomIndex];
            }
            return password;
        };
        const temporaryPassword = generateTemporaryPassword(12);
        const hashedPassword = await bcrypt.hash(temporaryPassword, 10);
        passwordArray.push(hashedPassword);
        const verificationToken = passwordArray[0];
        const updatedUser = await SignModel.findByIdAndUpdate(userId, {
            $set: {
                Password: passwordArray[0],
                verificationToken,
                verificationTokenExpiry: new Date(Date.now() + 3600000),
                isVerified: false,
            },
        }, { new: true, runValidators: true });
        await updatedUser?.save();
        await sendVerificationEmail(email, verificationToken);
        if (!updatedUser) {
            return res.status(500).send('Failed to update the password. Please try again.');
        }
        console.log(`Temporary password for ${email}: ${temporaryPassword}`);
        res.send({
            message: `A verification link has been sent to your email. Please copy and save the temporary password: ${temporaryPassword}.`,
        });
    }
    catch (error) {
        console.error('Error in /recoverpass:', error);
        res.status(500).send('An internal server error occurred. Please try again later.');
    }
});
app.get('/verify-email', async (req, res) => {
    const { token } = req.query;
    if (!token) {
        return res.status(400).send('Verification token is required.');
    }
    try {
        const user = await SignModel.findOne({
            verificationToken: token,
            verificationTokenExpiry: { $gt: Date.now() },
        });
        if (!user) {
            return res.status(400).send('Invalid or expired token.');
        }
        // Mark the user as verified
        user.isVerified = true;
        user.verificationToken = undefined;
        user.verificationTokenExpiry = undefined;
        await user.save();
        console.log('Email verified successfully for user:', user.Email);
        res.send('Email verified successfully!');
    }
    catch (error) {
        console.error('Error verifying email:', error.message);
        res.status(500).send('Server error');
    }
});
app.post('/resend-verification', async (req, res) => {
    const { Email } = req.body;
    try {
        const user = await SignModel.findOne({ Email });
        if (!user) {
            return res.status(404).send('Error: User not found');
        }
        if (user.isVerified) {
            return res.status(400).send('Error: Email is already verified');
        }
        const newToken = uuidv4();
        const hashedToken = await bcrypt.hash(newToken, 10);
        user.verificationToken = hashedToken;
        user.verificationTokenExpiry = new Date(Date.now() + 3600000); // Token valid for 1 hour
        await user.save();
        await sendVerificationEmail(Email, newToken);
        console.log('Resent verification email to:', Email);
        res.status(200).send('Verification email sent');
    }
    catch (error) {
        console.error('Error resending verification email:', error.message);
        res.status(500).send('Internal Server Error');
    }
});
// Catch-all for 404 errors
app.use('*', (req, res) => {
    res.status(404).sendFile(path.resolve(__dirname, './Views/page-404.html'));
});
// Export shared variables for other modules
export { FetchUserDetails, OneTime, SessionManager, };
