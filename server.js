require('dotenv').config()

const express=require('express')
const app=express()
const mongoose=require('mongoose')

mongoose.connect(process.env.DATABASE_URL)
const db=mongoose.connection
db.on('error',(error)=>console.error(error))
db.once('open',()=>console.log('connected to database'))

app.use(express.json())

const loginRouter=require('./routes/auth/login')
const registerRouter=require('./routes/auth/register')
const usersRouter=require('./routes/users')

// routes
app.use('/login',loginRouter)
app.use('/register',registerRouter)
app.use('/users',usersRouter)



app.listen(3000,()=>console.log('Server Started'))