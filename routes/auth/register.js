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

router.use(session({
  secret: 'gb24',
  resave: false,
  saveUninitialized: true
})); 

router.use(passport.initialize());
router.use(passport.session());
 

const formatDateTime = (date) => {
  if (!date) return '';
  const d = new Date(date);
  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const year = String(d.getFullYear()).slice(-2);
  const hours = String(d.getHours()).padStart(2, '0');
  const minutes = String(d.getMinutes()).padStart(2, '0');
  return `${day}.${month}.${year} ${hours}:${minutes}`;
};

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
        dob:formatDateTime(new Date(req.body.dob)),
        referal_code:resolvedReferralCode,
        image:defaultImage
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
          message: `GB24 welcomes you, ${req.body.first_name} ${req.body.last_name}. Enjoy your ride with us.`,
          created_at:formatDateTime(new Date())
        };
        if(req.body.phone_number!=null)
          {
              user.prefered_notification="phone"
              user.temp.code=newTempCode()
              user.temp.created_at=new Date()
              const temp_code=user.temp.code
             
              await sendSMS({
                sender: "GB24",
                recipient: user.phone_number, 
                message: "Your verification code is: "+temp_code+" . It is valid for 5 minutes.Do not share this code with anyone. Need Help? Visit the help centre on the app or globalbuy24.com"
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
              subject:'Welcome to GlobalBuy24',
              html:messageTemplateForWelcome()
            })
            await mailer.sendMail({
              from:'no-reply@globalbuy24.com',
              to:req.body.email,
              subject:'Verification code',
              html:messageTemplateForOTP(temp_code)
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

function messageTemplateForWelcome()
{

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Welcome to GlobalBuy24</title>
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
      <h1>Welcome to GB24!</h1>
    </div>
    <div class="content">
      <p>Hello and welcome 👋,</p>
      <p>We’re excited to have you on board. With GlobalBuy24, you can easily <span class="highlight">shop from global online stores</span> and get your purchases delivered to you in Cameroon — reliably, affordably, and hassle-free.</p>
      <p>Here’s what you can do with the GlobalBuy24 app:</p>
      <ul>
        <li>🛒 Simply add product links from any online store worldwide (e.g., Amazon, Temu, eBay, Fashion Nova, SHEIN, and more)</li>
        <li>📦 Request quotes and confirm orders</li>
        <li>🚀 Track shipping and delivery straight to Cameroon</li>
      </ul>
      <p>We can’t wait to help you shop the world.</p>
      <p><strong>Happy shopping!<br />— The GlobalBuy24 Team</strong></p>
    </div>
    <div class="footer">
      &copy; 2025 GlobalBuy24. All rights reserved.
    </div>
  </div>
</body>
</html>`
}

function messageTemplateForOTP(otp)
{

  return `
  <!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <title>Your OTP Code</title>
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
      <h1>Your OTP Code</h1>
    </div>
    <div class="content">
      <p>Hello,</p>
      <p>To complete your GlobalBuy24 sign-up, please enter the following verification code in the app:</p>
      <div class="otp-box">
        <p>${otp}</p> <!--Add OTP here-->
      </div>
      <p>This OTP is valid for <strong>5 minutes</strong>. Please do not share this code with anyone.</p>
      <p>If you didn't request this code, please ignore this email.</p>
      <p>Thank you for using our service!</p>
    </div>
    <div class="footer">
      &copy; 2025 GlobalBuy24 (GB24). All rights reserved.
    </div>
  </div>
</body>
</html>
  `
}
export default router;
