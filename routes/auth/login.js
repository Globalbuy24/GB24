const express=require('express')
const router =express.Router()
const User=require('../../models/user')
const bcrypt=require('bcrypt')
const jwt = require('jsonwebtoken')

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
  
module.exports=router