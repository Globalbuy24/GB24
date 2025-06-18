
if(process.env.NODE_ENV!=='production')
{
    require('dotenv').config()
}

const express=require('express')
const app=express()
const mongoose=require('mongoose')
const cors = require('cors');

mongoose.connect(process.env.DATABASE_URL)
const db=mongoose.connection
db.on('error',(error)=>console.error(error))
db.once('open',()=>console.log('connected to database'))

// app.use(cors());

// Option 1: Allow ALL origins (not recommended for production)
app.use(cors());

// Option 2: Allow specific origins + all others (better)
const allowedOrigins = [
  'https://ff-debug-service-frontend-pro-ygxkweukma-uc.a.run.app',
  // Add other specific origins here
];

app.use(cors({
  origin: function (origin, callback) {
    // Allow requests with no origin (like mobile apps or curl requests)
    if (!origin) return callback(null, true);
    
    if (allowedOrigins.includes(origin) || origin.includes('localhost')) {
      return callback(null, true);
    }
    
    // For production, you might want to remove this and just use the allowedOrigins
    return callback(null, true); // Allow any origin - ONLY FOR DEVELOPMENT
  },
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true // If you need cookies/auth headers
}));


app.use(express.json({ limit: '10mb' }));

const loginRouter=require('./routes/auth/login')
const registerRouter=require('./routes/auth/register')
const usersRouter=require('./routes/users')
const adminsRouter=require('./routes/admins')
const referralRouter=require('./routes/auth/referral')
const homeRouter=require('./routes/home')

// routes
app.use('/',homeRouter)
app.use('/login',loginRouter)
app.use('/register',registerRouter)
app.use('/users',usersRouter)
app.use('/admin',adminsRouter)
app.use('/referral',referralRouter)

app.listen(process.env.PORT || 3000,()=>console.log('Server Started'))