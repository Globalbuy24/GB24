//create new user
import express from 'express';
import session from 'express-session';
import '../../routes/auth/google.js';
import '../../routes/auth/facebook.js';
const router = express.Router();
import passport from 'passport';
import User from '../../models/user.js';
import jwt from 'jsonwebtoken';
import mongoose from 'mongoose';
import mailer from '../../middleware/mailer.js';
//const sms=require('../../middleware/sms')
import pkg from 'follow-redirects';
const { https } = pkg;
import fs from 'fs';
import axios from 'axios';
import translate from '../../middleware/translator.js';

router.use(session({
  secret: 'gb24',
  resave: false,
  saveUninitialized: true
})); 

router.use(passport.initialize());
router.use(passport.session());


/**
 * Creating new user
 */
router.post('/',async(req,res)=>{
    
    const resolvedReferralCode = await generateRefCode();
    const initial = req.body.first_name.charAt(0).toUpperCase(); // Get the first initial
    const defaultImage=await initialImage(initial);

    const user=new User({
        first_name:req.body.first_name,
        last_name:req.body.last_name,
        email:req.body.email,
        phone_number:req.body.phone_number,
        password:req.body.password,
        dob:new Date(req.body.dob),
        referal_code:resolvedReferralCode,
        image:defaultImage,
        settings: {
          language: req.body.language || 'en' // Default to 'en' if not provided
        }
    })
    /**
     * 
     * @returns a temporal code to be sent to the admin
     */
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
/**
 *  Check if user inputted email or phone number
 * The check if the phone number or email already exist
 */
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

        const jwt_secret=process.env.JWT_SECRET
        const token=jwt.sign({
        data: user.first_name
        }, jwt_secret, { expiresIn: '168h' });

        /**
         * Create a default welcome notification to the user
         * @typedef {Object} welcomeNotification
         * @property {string} _id
         * @property {string} type
         * @property {string} message
         * @property {string} created_at
         */
        const welcomeNotification = {
          _id: new mongoose.Types.ObjectId(),
          type: 'welcome',
          title: 'Welcome to GlobalBuy', // Store the English key directly
          message: 'GlobalBuy welcomes you, {first_name} {last_name}. Enjoy your ride with us.', // Store the English key directly
          created_at: new Date()
        };
        if(req.body.phone_number!=null)
          {
              user.prefered_notification="phone"
              user.temp.code=newTempCode()
              user.temp.created_at=new Date()
              const temp_code=user.temp.code
             
              await sendSMS({
                sender: "GB",
                recipient: user.phone_number, 
                message: translate("Your verification code is: {temp_code} . It is valid for 5 minutes.Do not share this code with anyone. Need Help? Visit the help centre on the app or globalbuy24.com", user.settings.language, {temp_code: temp_code})
              });
            
          }
        else if(req.body.email!=null)
          {
            user.prefered_notification="email"
            user.temp.code=newTempCode()
            user.temp.created_at=new Date()
            const temp_code=user.temp.code
            
              /**
               * Send an email to user if they added an email not a phone number
               */
           
            // const info = await emailMessage(req.body.email, "Welcome to GlobalBuy24'", welcomehtml);

            await mailer.sendMail({
              from:'no-reply@globalbuy24.com',
              to:req.body.email,
              subject:translate('Welcome to GlobalBuy', user.settings.language),
              html:messageTemplateForWelcome(user.settings.language)
            })
            await mailer.sendMail({
              from:'no-reply@globalbuy24.com',
              to:req.body.email,
              subject:translate('Verification code', user.settings.language),
              html:messageTemplateForOTP(temp_code, user.settings.language)
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
/**
 * 
 * @returns a random referal code,not found in the database
 */
    async function generateRefCode() {
        const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
        const codeLength = 6;
        let referralCode = '';
      
        for (let i = 0; i < codeLength; i++) {
          const randomIndex = Math.floor(Math.random() * characters.length);
          referralCode += characters[randomIndex];
        }
        const userExist=await User.findOne({referal_code:referralCode})
        
        if(!userExist)
        {
            return referralCode;
        }
        else
        {
            generateRefCode()
        }
      
}
/**
 * google oauth
 */
router.get('/auth/google',
  passport.authenticate('google', { scope: ['email', 'profile'] })
);

/**
 * google oauth callback end point
 */
router.get('/google/callback',
  passport.authenticate('google',
    {
      successRedirect:'/register/google/sucess',
      failureRedirect:'register/loginFailed'
    }
));

/**
 * google oauth success end point
 */
router.get('/google/sucess', (req, res) => {
  res.json(req.user)
});

/**
 * facebook oauth
 */
router.get('/auth/facebook',
  passport.authenticate('facebook'));
/**
 * facebook oauth callback endpoint
 */
router.get('/facebook/callback',
  passport.authenticate('facebook', { failureRedirect: '/login' }),
  function(req, res) {
   
    res.json(req.user);
  });



/**
 * oauth login failed ,general endpoint for both  google and facebook
 */

router.get('/loginFailed', (req, res) => {
  res.status(400).json({message:"Something went wrong"});
});



// ----Initial image

const initialImage = async (letter) => {
  try {
     if(letter.length==1)
     {
        const image="https://raw.githubusercontent.com/eladnava/material-letter-icons/master/dist/png/"+letter+".png"
        return image;
     }
  } catch (error) {
    res.status(400).json({message:error});
  }
};


/**
 * Send sms
 * @param {sender, recipient, message}  
 * @returns 
 */
async function sendSMS({ sender, recipient, message }) {
  const apiUrl = 'https://api.avlytext.com/v1/sms';
  const apiKey = '8tVlW9AtRnTfIpuTkxGvqAyuBNzAK3tyJkbZXfgBX1vmvAkT3PYCh0DmjPLuahCbj5k9';

  try {
      const response = await axios.post(apiUrl, {
          sender: sender,
          recipient: recipient,
          text: message
      }, {
          params: {
              api_key: apiKey
          },
          headers: {
              'Content-Type': 'application/json'
          }
      });

      return response.data;
  } catch (error) {
      console.error('Error sending SMS:', error.response?.data || error.message);
      throw error; // You can handle this error where you call the function
  }
}

function messageTemplateForWelcome(language)
{

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${translate('Welcome to GlobalBuy', language)}</title>
  <link href="https://fonts.googleapis.com/css2?family=Poppins:wght@400;600&display=swap" rel="stylesheet" />
  <style>
    body {
      font-family: 'Poppins', sans-serif;
      background-color: #f4f4f5;
      color: #1a1a1a;
      margin: 0;
      padding: 0;
    }

    @media (prefers-color-scheme: dark) {
      body {
        background-color: #1a1a1a;
        color: #e4e4e7;
      }
      .email-container {
        background-color: #262626;
      }
      .header {
        background-color: #005ae0;
      }
      .code-box {
        background-color: #333;
        color: #ffffff;
      }
      .footer {
        background-color: #1f1f1f;
        color: #a3a3a3;
      }
    }

    .email-wrapper {
      max-width: 600px;
      margin: 40px auto;
      background-color: #fff;
      border-radius: 12px;
      box-shadow: 0 5px 15px rgba(0, 0, 0, 0.05);
      overflow: hidden;
    }

    .header {
      background-color: #005ae0;
      padding: 24px;
      text-align: center;
    }

    .header h1 {
      color: #ffffff;
      font-size: 26px;
      margin: 0;
    }

    .content {
      padding: 32px 24px;
    }

    .content p {
      margin: 16px 0;
      font-size: 16px;
      line-height: 1.5;
    }

    .content .highlight {
      font-weight: 600;
    }
    
    .footer {
      padding: 16px;
      background-color: #f3f4f6;
      text-align: center;
      font-size: 14px;
      color: #6b7280;
    }
  </style>
</head>
<body>
  <div class="email-wrapper">
    <div class="header">
      <h1>${translate('Welcome to GB!', language)}</h1>
    </div>
    <div class="content">
      <p>${translate('Hello and welcome 👋,', language)}</p>
      <p>${translate('We’re excited to have you on board. With GlobalBuy, you can easily <span class="highlight">shop from global online stores</span> and get your purchases delivered to you in Cameroon — reliably, affordably, and hassle-free.', language)}</p>
      <p>${translate('Here’s what you can do with the GlobalBuy app:', language)}</p>
      <ul>
        <li>${translate('🛒 Simply add product links from any online store worldwide (e.g., Amazon, Temu, eBay, Fashion Nova, SHEIN, and more)', language)}</li>
        <li>${translate('📦 Request quotes and confirm orders', language)}</li>
        <li>${translate('🚀 Track shipping and delivery straight to Cameroon', language)}</li>
      </ul>
      <p>${translate('We can’t wait to help you shop the world.', language)}</p>
      <p><strong>${translate('Happy shopping!', language)}<br />— ${translate('The GlobalBuy Team', language)}</strong></p>
    </div>
    <div class="footer">
      &copy; ${translate('2025 GlobalBuy. All rights reserved.', language)}
    </div>
  </div>
</body>
</html>`
}

function messageTemplateForOTP(otp, language)
{

  return `
  <!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <title>${translate('Your verification code is: {otp}', language, { otp: otp })}</title>
  <style>
    :root {
      --primary: #005AE0; /* Indigo-600 */
      --text-light: #ffffff;
      --text-dark: #1f2937;
      --bg-light: #ffffff;
      --bg-gray: #f3f4f6;
      --text-muted: #6b7280;
    }

    @media (prefers-color-scheme: dark) {
      :root {
        --primary: #2979FF;
        --text-light: #ffffff;
        --text-dark: #f9fafb;
        --bg-light: #1f2937;
        --bg-gray: #374151;
        --text-muted: #9ca3af;
      }
    }
    
    body {
      margin: 0;
      font-family: 'Poppins', sans-serif;
      background-color: var(--bg-gray);
      color: var(--text-dark);
    }

    .container {
      max-width: 600px;
      margin: 2rem auto;
      background-color: var(--bg-light);
      border-radius: 10px;
      overflow: hidden;
      box-shadow: 0 4px 12px rgba(0,0,0,0.1);
    }

    .header {
      background-color: var(--primary);
      padding: 1.5rem;
      text-align: center;
    }

    .header h1 {
      margin: 0;
      color: var(--text-light);
      font-size: 2rem;
      font-weight: bold;
    }

    .content {
      padding: 2rem;
    }

    .content p {
      margin-bottom: 1.5rem;
      color: var(--text-dark);
    }

    .otp-box {
      background-color: var(--bg-gray);
      padding: 1rem;
      border-radius: 8px;
      text-align: center;
      margin-bottom: 1.5rem;
    }

    .otp-box p {
      margin: 0;
      font-size: 2.5rem;
      font-weight: bold;
      color: var(--primary);
    }

    .footer {
      background-color: var(--bg-gray);
      padding: 1rem;
      text-align: center;
      font-size: 0.875rem;
      color: var(--text-muted);
    }
  </style>
  <!-- Poppins Font -->
  <link href="https://fonts.googleapis.com/css2?family=Poppins:wght@400;600&display=swap" rel="stylesheet">
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>${translate('Your OTP Code', language)}</h1>
    </div>
    <div class="content">
      <p>${translate('Hello,', language)}</p>
      <p>${translate('To complete your GlobalBuy sign-up, please enter the following verification code in the app:', language)}</p>
      <div class="otp-box">
        <p>${otp}</p> <!--Add OTP here-->
      </div>
      <p>${translate('This OTP is valid for <strong>5 minutes</strong>. Please do not share this code with anyone.', language)}</p>
      <p>${translate('If you didn\'t request this code, please ignore this email.', language)}</p>
      <p>${translate('Thank you for using our service!', language)}</p>
    </div>
    <div class="footer">
      &copy; ${translate('2025 GlobalBuy (GB). All rights reserved.', language)}
    </div>
  </div>
</body>
</html>
  `
}
export default router;
