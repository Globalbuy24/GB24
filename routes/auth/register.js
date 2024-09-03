//create new user
const express=require('express')
const session = require('express-session');
require('../../routes/auth/google')
require('../../routes/auth/facebook')
const router =express.Router()
const passport =require('passport')
const User=require('../../models/user')
const jwt = require('jsonwebtoken')
const mongoose=require('mongoose')
const mailer=require('../../middleware/mailer')
//const sms=require('../../middleware/sms')
const https = require('follow-redirects').https;
const fs = require('fs');

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
    const user=new User({
        first_name:req.body.first_name,
        last_name:req.body.last_name,
        email:req.body.email,
        phone_number:req.body.phone_number,
        password:req.body.password,
        dob:req.body.dob,
        referal_code:resolvedReferralCode,
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
          created_at:new Date()
        };
        if(req.body.phone_number!=null)
          {
              user.prefered_notification="phone"
              user.temp.code=newTempCode()
              user.temp.created_at=new Date()
              const temp_code=user.temp.code
             
              /**
               * Send an sms to user if they added a phone number and not email
               */
              var options = {
                'method': 'POST',
                'hostname': 'vvn8np.api.infobip.com',
                'path': '/sms/2/text/advanced',
                'headers': {
                    'Authorization': 'App 7423850e235a5ee716d199e09b38062c-26cbd0e7-1598-4ca6-89cf-35cad5c9047d',
                    'Content-Type': 'application/json',
                    'Accept': 'application/json'
                },
                'maxRedirects': 20
            };
            
            const sms = https.request(options, function (res) {
                var chunks = [];
            
                res.on("data", function (chunk) {
                    chunks.push(chunk);
                });
            
                res.on("end", function (chunk) {
                    var body = Buffer.concat(chunks);
                    console.log(body.toString());
                });
            
                res.on("error", function (error) {
                    console.error(error);
                });
            });

              var postData = JSON.stringify({
                "messages": [
                    {
                        "destinations": [{"to":req.body.phone_number}],
                        "from": "GlobalBuy24",
                        "text": "Your verification code is: "+temp_code
                    }
                ]
            });
            
            sms.write(postData);
            
            sms.end();
            
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





module.exports=router