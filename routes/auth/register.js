//create new user
const express=require('express')
const router =express.Router()
const User=require('../../models/user')
const jwt = require('jsonwebtoken')

router.post('/',async(req,res)=>{
    const user=new User({
        first_name:req.body.first_name,
        last_name:req.body.last_name,
        email:{email:req.body.email},
        phone_number:{number:req.body.phone_number},
        password:req.body.password,
        dob:req.body.dob
    })
    try
    {
        const jwt_secret=process.env.JWT_SECRET||'jwt_gb24_secret'
        const token=jwt.sign({
        data: user
        }, jwt_secret, { expiresIn: '12h' });

        user.token = token;
        const newUser=await user.save()
        res.status(201).json(newUser)
    }
    catch(error)
    {
        res.status(400).json({message:error.message})
    }
})

module.exports=router