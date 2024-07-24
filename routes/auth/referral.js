//create new user
const express=require('express')
const session = require('express-session');
require('../../routes/auth/google')
require('../../routes/auth/facebook')
const router =express.Router()
const passport =require('passport')
const User=require('../../models/user')
const SystemDefault=require('../../models/system_default')
const jwt = require('jsonwebtoken')
const mongoose=require('mongoose')
const mailer=require('../../middleware/mailer')

router.get('/:id',async(req,res)=>{
    
    const userAgent = req.headers['user-agent'];

    // Check if the request is coming from a mobile device
    if (/Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(userAgent)) {
        // Redirect to custom URL scheme
        res.redirect('globalbuy24://referral?id=SAQJ5G');
    } else {
        // Redirect to app store based on the platform
        const platform = userAgent.includes('Android') ? 'android' : 'ios';
        if (platform === 'android') {
            res.redirect('https://play.google.com/store/apps/details?id=yourapp.package.name');
        } else {
            res.redirect('https://apps.apple.com/app/yourappname/id123456789');
        }
    }
})


router.post('/:id',async(req,res)=>{
    const referal_code=req.params.id
    const referalUser= await User.findOne({referal_code:referal_code})
    const system_default=await SystemDefault.findOne({})   

    const resolvedReferralCode = await generateRefCode();
    const user=new User({
        first_name:req.body.first_name,
        last_name:req.body.last_name,
        email:req.body.email,
        phone_number:req.body.phone_number,
        password:req.body.password,
        dob:req.body.dob,
        referal_code:resolvedReferralCode,
    })
    function newTempCode() {
      var code = "";
      var digits = "0123456789";
     
      for (var i = 0; i < 6; i++) {
        var randomIndex = Math.floor(Math.random() * digits.length);
        code += digits[randomIndex];
      }
    
      return code;
    }
    
    try
    {

        if(req.body.email!=null || req.body.phone_number!=null)
            {
                
                let users=await User.find(
                    {
                      $or: [
                        { 'email': req.body.email },
                        { 'phone_number': req.body.phone_number }
                      ]
                    }
                  )
                    console.log(users.length)
                    if (users.length > 0) {
                        for (const user of users) {
                          if(user.email!=null && user.email === req.body.email ) {
                            console.log("email exists");
                            const error = new Error('Email already exist');
                            res.status(400).json({message:error.message})
                            return; 
                          }
                        
                          else if(user.phone_number!=null && user.phone_number === req.body.phone_number) {
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
        data: user.first_name
        }, jwt_secret, { expiresIn: '12h' });

        const welcomeNotification = {
          _id: new mongoose.Types.ObjectId(),
          type: 'welcome',
          message: `GB24 welcomes you, ${req.body.first_name} ${req.body.last_name}. Enjoy your ride with us.`,
          created_at:new Date()
        };
        if(req.body.phone_number!=null)
          {
              user.prefered_notification="phone"
              user.temp_code=newTempCode()
              const temp_code=user.temp_code
              //send sms
          }
        else if(req.body.email!=null)
          {
            user.prefered_notification="email"
            user.temp_code=newTempCode()
            const temp_code=user.temp_code
            //send email
            const html=`
             <p> Your verification code is : <strong>${temp_code} </strong></p>
            `
            const welcomehtml=`
             <p>
             GB24 welcomes you,<strong> ${req.body.first_name} ${req.body.last_name}</strong>. Enjoy your ride with us.
             </p>
            `
            await mailer.sendMail({
              from:'noreply@globalbuy24.com',
              to:req.body.email,
              subject:'Welcome to GlobalBuy24',
              html:welcomehtml
            })
            await mailer.sendMail({
              from:'noreply@globalbuy24.com',
              to:req.body.email,
              subject:'Verification code',
              html:html
            })

          }
        user.referred_by=referalUser.id

        //reward referral
        referalUser.loyalty_points+=system_default.loyalty_points.referals
        const referralNotification = {
            _id: new mongoose.Types.ObjectId(),
            type: 'referral',
            message: ` You just gained ${system_default.loyalty_points.referals} loyalty points upon referral of ${req.body.first_name} ${req.body.last_name}`,
            created_at:new Date()
          };
        referalUser.notifications.push(referralNotification)
        await referalUser.save()

        //send email if they can recieve emails
       if(referalUser.prefered_notification=="email")
        {
            const referral=`
            <p>
            You just gained <strong>${system_default.loyalty_points.referals}</strong> loyalty points upon referral of <strong>${req.body.first_name} ${req.body.last_name}</strong>
            </p>
           `
            await mailer.sendMail({
                from:'noreply@globalbuy24.com',
                to:referalUser.email,
                subject:'New Referral',
                html:referral
              })
    
        }
        user.notifications.push(welcomeNotification); 
        user.token = token;
        const newUser=await user.save()
        res.status(201).json(newUser)
    }
    catch(error)
    {
        res.status(400).json({message:error.message})
    }
})

async function generateRefCode() {
    const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    const codeLength = 6;
    let referralCode = '';
  
    for (let i = 0; i < codeLength; i++) {
      const randomIndex = Math.floor(Math.random() * characters.length);
      referralCode += characters[randomIndex];
    }
    userExist=await User.findOne({referal_code:referralCode})
    
    if(!userExist)
    {
        return referralCode;
    }
    else
    {
        generateRefCode()
    }
  
}


module.exports=router