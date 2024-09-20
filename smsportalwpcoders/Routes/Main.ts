import express, { Request, Response } from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import bcrypt from 'bcrypt';
import { FetchUserDetails } from '../index.js';
import "dotenv/config";
import axios from 'axios';

// Resolve file and directory paths
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const router = express.Router();

const findAndUpdateUserById = async (id: string, updateData: any) => {
    try {
        const responseFind = await axios.post(
            `${process.env.DB_ENDPOINT}/findOne`,
            {
                collection: 'signhandlers',
                database: 'test',
                dataSource: 'SMSCluster',
                filter: { _id: { $oid: id } }
            },
            {
                headers: {
                    'Content-Type': 'application/json',
                    'api-key': process.env.MongoDB_API_KEY
                }
            }
        );

        const user = responseFind.data.document;
        if (!user) {
            return { error: "User not found." };
        }

        const responseUpdate = await axios.post(
            `${process.env.DB_ENDPOINT}/updateOne`,
            {
                collection: 'signhandlers',
                database: 'test',
                dataSource: 'SMSCluster',
                filter: { _id: { $oid: id } },
                update: { $set: updateData }
            },
            {
                headers: {
                    'Content-Type': 'application/json',
                    'api-key': process.env.MongoDB_API_KEY
                }
            }
        );

        return responseUpdate.data;
    } catch (error: any) {
        console.error('Error finding and updating user by id:', error.response?.data || error.message);
        throw new Error('Failed to find and update user by id.');
    }
};

// Route to serve the HTML page
router.get('/', (req: Request, res: Response) => {
    res.sendFile(path.resolve(__dirname, '../Views/index.html'));
});

// Route to serve the change password page
router.get('/changepass', (req: Request, res: Response) => {
    res.sendFile(path.resolve(__dirname, "../Views/changePass.html"));
});

// Change password route
router.post('/changepass', async (req: Request, res: Response) => {
    const { current_password, new_password, confirm_password } = req.body;

    if (!current_password || !new_password || !confirm_password) {
        return res.status(400).send('All fields are required.');
    }

    const user = FetchUserDetails[0]?.user;
    if (!user) {
        return res.status(404).send('User not found.');
    }

    try {
        const match = await bcrypt.compare(current_password, user.Password);
        if (!match) {
            return res.status(400).send('Current password is incorrect.');
        }

        if (new_password !== confirm_password) {
            return res.status(400).send('New password and confirmation do not match.');
        }

        // Add password strength validation here if needed
        const hashedPassword = await bcrypt.hash(new_password, 10);
        const updated_data = {
            Password: hashedPassword
        };

        await findAndUpdateUserById(user._id, updated_data);
        res.status(200).send('Password changed successfully.');
    } catch (error: any) {
        console.error('Error changing password:', error);
        res.status(500).send({ error: 'Error changing password: ' + error.message });
    }
});

export default router;
