const express=require('express')
const router =express.Router()
const Admin=require('../models/admin')
const jwt = require('jsonwebtoken')
const bcrypt=require('bcrypt')
const mongoose=require('mongoose')

router.post('/',async(req, res) => {
    
    const admin=new Admin({
        first_name:req.body.first_name,
        last_name:req.body.last_name,
        email:req.body.email,
        phone_number:req.body.phone_number,
        password:req.body.password,
    })
    try
    {

        if(req.body.email!=null || req.body.phone_number!=null)
            {
                
                let admins=await Admin.find(
                    {
                      $or: [
                        { 'email': req.body.email },
                        { 'phone_number': req.body.phone_number }
                      ]
                    }
                  )
                    console.log(admins.length)
                    if (admins.length > 0) {
                        for (const admin of admins) {
                          if(admin.email!=null && admin.email === req.body.email ) {
                            console.log("email exists");
                            const error = new Error('Email already exist');
                            res.status(400).json({message:error.message})
                            return; 
                          }
                        
                          else if(admin.phone_number!=null && admin.phone_number === req.body.phone_number) {
                            console.log("num exists");
                            const error = new Error('Phone number already exist');
                            res.status(400).json({message:error.message})
                            return;
                          }
                        }
                      }
            }

        const jwt_secret=process.env.JWT_SECRET||'jwt_gb24_secret'
        const token=jwt.sign({
        data: admin
        }, jwt_secret, { expiresIn: '12h' });

        const welcomeNotification = {
          _id: new mongoose.Types.ObjectId(),
          type: 'welcome',
          message: `GB24 welcomes you, ${req.body.first_name} ${req.body.last_name}. Enjoy your ride with us.`,
          created_at:new Date()
        };
        
        admin.notifications.push(welcomeNotification); 
        admin.token = token;
        const newAdmin=await admin.save()
        res.status(201).json(newAdmin)
    }
    catch(error)
    {
        res.status(400).json({message:error.message})
    }
});

router.post('/login',async(req,res)=>{
    
    const credential=req.body.credential
    const password=req.body.password
    try{
        
        if(credential!='' && password!='')
         {
            console.log("cred good")
             let admin=await Admin.findOne({$or:[{'email':credential},{'phone_number':credential}]})
             if(admin!=null)
             {
                console.log("Admin Exists")
                 if(bcrypt.compareSync(password, admin.password))
                 {
                     
                     const jwt_secret=process.env.JWT_SECRET||'jwt_gb24_secret'
                     const token=jwt.sign({
                         data: admin
                       }, jwt_secret, { expiresIn: '12h' });
                       
                       //console.log("Password Match")
                       //admin.token = token;
                       //await admin.save();
                       //console.log("admin saved")
 
                      res.status(200).json({admin})
                 }
                 else
                 {
                     res.status(400).json({message:'incorrect password'})
                 }
                 
             }
             else
             {
                 res.status(400).json({message:'user not found'})
             }
         }
         else{
             res.status(400).json({message:'empty input fields'})
         }
    }
    catch(error)
    {
     res.status(400).json({message:error})
    }

})

module.exports=router