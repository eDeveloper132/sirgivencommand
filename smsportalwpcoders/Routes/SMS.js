import express from 'express';
import 'dotenv/config';
import { fileURLToPath } from 'url';
import path from 'path';
import axios from 'axios';
import { MessageModel, SignModel } from '../Schema/Post.js';
import { v4 as uuidv4 } from 'uuid';
import { FetchUserDetails } from '../index.js';
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const router = express.Router();
// Route to serve the HTML file for SMS
router.get('/', (req, res) => {
    res.sendFile(path.resolve(__dirname, '../Views/sms.html'));
});
// POST route to handle SMS sending
router.post('/', async (req, res) => {
    const { phonecode, phonenumber, message } = req.body;
    if (!phonecode || !phonenumber || !message) {
        console.log('400: Missing required fields');
        return res.status(400).json({ error: 'Please fill in all required fields: phone code, phone number, and message.' });
    }
    const user = FetchUserDetails[0]?.user;
    const { PackageName: packageName, Coins: coins } = user?.Details || {};
    if (!packageName || !coins) {
        console.log('403: Incomplete user package details.');
        return res.status(403).json({ error: 'You cannot send SMS. Please buy a package first.' });
    }
    const recipient = `${phonecode}${phonenumber}`;
    console.log(`Delivering message: "${message}" to ${recipient}`);
    try {
        // Send SMS using ClickSend API
        const smsMessage = { to: recipient, body: message };
        const apiUrl = 'https://rest.clicksend.com/v3/sms/send';
        const username = process.env.CLICKSEND_USERNAME;
        const apiKey = process.env.CLICKSEND_API_KEY;
        if (!username || !apiKey) {
            return res.status(500).json({ error: 'ClickSend credentials are not set in the environment variables.' });
        }
        const response = await axios.post(apiUrl, { messages: [smsMessage] }, {
            auth: {
                username,
                password: apiKey
            }
        });
        console.log(response.data);
        const userId = user._id;
        const dbUser = await SignModel.findById(userId);
        if (!dbUser || !dbUser.Details) {
            return res.status(404).send('User not found or user details missing.');
        }
        // Deduct one coin from the user's balance
        if (typeof dbUser.Details.Coins === 'number' && dbUser.Details.Coins > 0) {
            dbUser.Details.Coins -= 1;
            await dbUser.save();
        }
        else {
            return res.status(400).send('Insufficient coins for sending message');
        }
        // Create a new message entry in the database
        const newMessage = await MessageModel.create({
            id: uuidv4(),
            u_id: dbUser._id,
            from: 'NOT PROVIDED',
            to: recipient,
            message,
            m_count: response.data.data.total_count,
            m_schedule: 'NOT PROVIDED',
            status: response.data.response_code
        });
        // Add the message to the user's messages array
        const messageId = newMessage._id;
        // Add the message to the user's messages array and save the user
        dbUser.messages.push(messageId);
        await dbUser.save();
        console.log('Data Updated Successfully', dbUser);
        console.log('Message Added Successfully', newMessage);
        // Respond with success
        res.status(200).json({ message: 'Message sent successfully!' });
    }
    catch (error) {
        console.error(error.response ? error.response.data : error.message);
        res.status(500).json({ error: 'Failed to send SMS. Please try again later.' });
    }
});
// Route to serve the messages list HTML
router.get('/messages', (req, res) => {
    res.sendFile(path.resolve(__dirname, '../Views/messageslist.html'));
});
// API endpoint to fetch messages
router.get('/api/messages', async (req, res) => {
    try {
        const userId = FetchUserDetails[0]?.user?._id;
        if (!userId) {
            return res.status(401).json({ message: 'Unauthorized' });
        }
        const user = await SignModel.findById(userId).populate('messages').exec();
        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }
        res.status(200).json({ messages: user.messages });
    }
    catch (error) {
        console.error('Error fetching messages:', error);
        res.status(500).json({ message: 'Server error' });
    }
});
export default router;
// {
//     username: "bluebirdintegrated@gmail.com",
//     password: "EA26A5D0-7AAC-6631-478B-FC155CE94C99"
// }
