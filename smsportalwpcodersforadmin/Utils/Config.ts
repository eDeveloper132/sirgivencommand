// config.ts
import 'dotenv/config';

// Define a type for environment variables
interface ProcessEnv {
  Name?: string;
  Password?: string;
}

// Type assertion to specify environment variables
const env = process.env as unknown as ProcessEnv;

const URI = `mongodb+srv://${env.Name}:${env.Password}@smscluster.whyae4e.mongodb.net/`;

export { URI };
