import express from 'express';
import mongoose from 'mongoose';
import cors from 'cors';
import 'dotenv/config';

mongoose.connect(process.env.DATABASE_URL);
const db = mongoose.connection;
db.on('error', (error) => console.error(error));
db.once('open', () => console.log('Connected to database'));

const app = express();

// // Define allowed origins
// const allowedOrigins = [
//     'https://ff-debug-service-frontend-pro-ygxkweukma-uc.a.run.app',
//     'http://localhost:3000', // Add localhost for local development
//     // Add other specific origins here if needed
// ];

// Use CORS middleware
app.use(cors());

app.options('*',cors());

app.use(express.json({ limit: '10mb' }));

// Import routes
import loginRouter from './routes/auth/login.js';
import registerRouter from './routes/auth/register.js';
import usersRouter from './routes/users.js';
import adminsRouter from './routes/admins.js';
import referralRouter from './routes/auth/referral.js';
import homeRouter from './routes/home.js';

// Define routes
app.use('/', homeRouter);
app.use('/login', loginRouter);
app.use('/register', registerRouter);
app.use('/users', usersRouter);
app.use('/admin', adminsRouter);
app.use('/referral', referralRouter);

app.listen(process.env.PORT || 3000, () => console.log('Server Started'));
