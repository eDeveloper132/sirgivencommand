// config.ts
import 'dotenv/config';
// Type assertion to specify environment variables
const env = process.env;
const URI = `mongodb+srv://${env.Name}:${env.Password}@smscluster.whyae4e.mongodb.net/`;
export { URI };
