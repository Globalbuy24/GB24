const express=require('express')
const router =express.Router()
const User=require('../../models/user')
const bcrypt=require('bcrypt')
const jwt = require('jsonwebtoken')
const mailer=require('../../middleware/mailer')
const https = require('follow-redirects').https;

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
                if(bcrypt.compareSync(password, user.password))
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
       from:'noreply@globalbuy24.com',
       to:user.email,
       subject:'Verification code',
       html:html
     })
     res.json({message:"code sent successfully",uid:user.id})
    }
      /**
      * Send user sms based on their prefered notification
      */
  
    else if(user.prefered_notification=="phone")
    {
      const temp_code=newTempCode()
      await user.updateOne({$set:{temp:{code:temp_code,created_at:new Date()}}})
  
        
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
                  "destinations": [{"to":user.phone_number}],
                  "from": "GlobalBuy24",
                  "text": "Your verification code is: "+temp_code
              }
          ]
      });
      
      sms.write(postData);
      
      sms.end();
  
            res.json({message:"code sent successfully",uid:user.id})
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

 

 

module.exports=router