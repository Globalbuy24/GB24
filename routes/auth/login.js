const express=require('express')
const router =express.Router()
const User=require('../../models/user')
const bcrypt=require('bcrypt')
const jwt = require('jsonwebtoken')
const mailer=require('../../middleware/mailer')
const https = require('follow-redirects').https;
const axios = require('axios');

/**
 * login user
 */
router.post('/', async(req, res) => {
    /**
     * credential , can be email or phone number
     */
    const credential=req.body.credential
    const password=req.body.password
   try{
        
       if(credential!='' && password!='')
        {
            let user=await User.findOne({$or:[{'email':credential},{'phone_number':credential}]})
            if(user!=null)
            {
                const jwt_secret=process.env.JWT_SECRET
                console.log(bcrypt.compareSync(password, user.password))
                console.log(user.password)
                const isMatch = await bcrypt.compare(password, user.password);
               
                if(isMatch)
                {
                    
                    const jwt_secret=process.env.JWT_SECRET
                    const token=jwt.sign({
                        data: user.first_name
                      }, jwt_secret, { expiresIn: '168h' });
                      
                      
                      await user.updateOne({$unset:{token:""}})
                     
                     await user.updateOne({$set:{token:token}})
                      const updatedUser= await user.save()
                      res.status(200).json({updatedUser})
                }
                else
                {
                    res.status(400).json({message:'Incorrect password'})
                }
                
            }
            else
            {
                res.status(400).json({message:'User not found'})
            }
        }
        else{
            res.status(400).json({message:'Empty input fields'})
        }
   }
   catch(error)
   {
    res.status(400).json({message:error})
   }
  });
/**
 * forgot password verify user email or phone number
 */
router.post('/forgot-pwd-verify-user', async(req, res) => {

    function newTempCode() {
        var code = "";
        var digits = "0123456789";
       
        for (var i = 0; i < 6; i++) {
          var randomIndex = Math.floor(Math.random() * digits.length);
          code += digits[randomIndex];
        }
      
        return code;
      }
//    console.log(req.params)
   try{
    const user = await User.findOne({
        $or: [
          { phone_number: req.body.credential },
          { email: req.body.credential }
        ]
      });
    if(!user)
    {
        res.status(400).json({message:"User not found!"})
    }
    else{
           /**
    * Send user email based on their prefered notification
    */

  if(user.prefered_notification=="email")
    {
      const temp_code=newTempCode()
     await user.updateOne({$set:{temp:{code:temp_code,created_at:new Date()}}})
     
  
      const html=`
      <p> Your verification code is : <strong>${temp_code} </strong></p>
     `
     await mailer.sendMail({
       from:'no-reply@globalbuy24.com',
       to:user.email,
       subject:'Verification code',
       html:messageTemplateForOTP(temp_code)
     })
     const jwt_secret=process.env.JWT_SECRET
      const token=jwt.sign({
                        data: user.first_name
      }, jwt_secret, { expiresIn: '1h' });

     res.json({message:"code sent successfully",uid:user.id,token:token})
    }

      /**
      * Send user sms based on their prefered notification
      */
  
    else if(user.prefered_notification=="phone")
    {
      const temp_code=newTempCode()
      await user.updateOne({$set:{temp:{code:temp_code,created_at:new Date()}}})
  
      await sendSMS({
        sender: "GB24",
        recipient: user.phone_number, 
        message: "Your verification code is: "+temp_code+" . It is valid for 5 minutes.Do not share this code with anyone. Need Help? Visit the help centre on the app or globalbuy24.com"
      });

    }
    }
   }
   catch(error)
   {
    res.status(400).json({message:error})
   }
});

/**
 * forgot password verify user otp
 */
router.post('/forgot-pwd-verify-otp/:id', async(req, res) => {
    function codeIsValid(dateToCompare) {
        const currentDate = new Date();
        const diffInMilliseconds = currentDate - dateToCompare;
        const diffInMinutes = diffInMilliseconds / (1000 * 60);
    
        return Math.abs(diffInMinutes) < 2;
    }
    const user=await User.findById(req.params.id)
    if(!user)
    {
        res.status(400).json({message:"User not found!"})
        return
    }
  
    try{
        if(user.temp.code==req.body.code)
        {
            if(codeIsValid(user.temp.created_at))
            {
                    const jwt_secret=process.env.JWT_SECRET
                    const token=jwt.sign({
                        data: user.first_name
                      }, jwt_secret, { expiresIn: '168h' });
                      
                      
                      await user.updateOne({$unset:{token:""}})
                     
                     await user.updateOne({$set:{token:token}})
                      const updatedUser= await user.save()
                      res.json(updatedUser)
                return;
            }
            res.status(400).json({message:"Code Expired!"})

        }
        
        else{
            res.status(400).json({message:"Invalid code!"})

        }
    }
    catch(error)
    {
     res.status(400).json({message:error})
    }
 });


// Message 
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
       <p>We've recieved a request to reset your password for your GlobalBuy24 account</p>
       <p>To proceed, please enter the following verification code in the GlobalBuy24 app</p>
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

 

module.exports=router