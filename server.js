const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');

if (process.env.NODE_ENV !== 'production') {
    require('dotenv').config();
}

mongoose.connect(process.env.DATABASE_URL);
const db = mongoose.connection;
db.on('error', (error) => console.error(error));
db.once('open', () => console.log('Connected to database'));

const app = express();

// Define allowed origins
const allowedOrigins = [
    'https://ff-debug-service-frontend-pro-ygxkweukma-uc.a.run.app',
    'http://localhost:3000', // Add localhost for local development
    // Add other specific origins here if needed
];

// Use CORS middleware
app.use(cors({
    origin: function (origin, callback) {
        if (!origin) return callback(null, true); // Allow requests with no origin
        if (allowedOrigins.includes(origin)) {
            return callback(null, true);
        }
        return callback(new Error('Not allowed by CORS'));
    },
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: true // If you need cookies/auth headers
}));

app.use(express.json({ limit: '10mb' }));

// Import routes
const loginRouter = require('./routes/auth/login');
const registerRouter = require('./routes/auth/register');
const usersRouter = require('./routes/users');
const adminsRouter = require('./routes/admins');
const referralRouter = require('./routes/auth/referral');
const homeRouter = require('./routes/home');

// Define routes
app.use('/', homeRouter);
app.use('/login', loginRouter);
app.use('/register', registerRouter);
app.use('/users', usersRouter);
app.use('/admin', adminsRouter);
app.use('/referral', referralRouter);

app.listen(process.env.PORT || 3000, () => console.log('Server Started'));