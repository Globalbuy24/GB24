
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
app.use(cors({
    origin: true, // Dynamically allows the requesting origin
    credentials: true // Enable if using cookies/sessions
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