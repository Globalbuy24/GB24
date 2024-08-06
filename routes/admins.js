const express=require('express')
const router =express.Router()
const Admin=require('../models/admin')
const User=require('../models/user')
const SystemDefault=require('../models/system_default')
const jwt = require('jsonwebtoken')
const bcrypt=require('bcrypt')
const mongoose=require('mongoose')
const authenticate=require('../middleware/currentUser')

/**
 * Creating a new admin 
 */
router.post('/',async(req, res) => {
    
    const admin=new Admin({
        first_name:req.body.first_name,
        last_name:req.body.last_name,
        email:req.body.email,
        type:req.body.type,
        phone_number:req.body.phone_number,
        password:req.body.password,
    })
    try
    {
/**
 * Check whether the admin to be inputted a phone number or email
 */
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
                    //console.log(admins.length)
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
        data: admin.first_name
        }, jwt_secret, { expiresIn: '12h' });

        /**
         * Create a welcome notification for user
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

/**
 * Login admin
 */
router.post('/login',async(req,res)=>{
    
    const credential=req.body.credential
    const password=req.body.password
    try{
        
        if(credential!='' && password!='')
         {
            //console.log("cred good")
             let admin=await Admin.findOne({$or:[{'email':credential},{'phone_number':credential}]})
             if(admin!=null)
             {
                //console.log("Admin Exists")
                 if(bcrypt.compareSync(password, admin.password))
                 {
                     
                     const jwt_secret=process.env.JWT_SECRET||'jwt_gb24_secret'
                     const token=jwt.sign({
                         data: admin.first_name
                       }, jwt_secret, { expiresIn: '12h' });
                       
                       await admin.updateOne({$unset:{token:""}})
                       //user.token=token
                       await admin.updateOne({$set:{token:token}})
                       const updatedUser= await admin.save()
                      res.status(200).json({updatedUser})
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

/**
 * update user basket
 */
router.post('/:uId/updateUserBasket/:bId',authenticate,async(req,res)=>{
  
    const userId=req.params.uId;
    const basketId=req.params.bId;
    const user=await User.findOne({'_id':userId})
    const basket=user.basket.find((basket)=>basket.id===basketId)
    //console.log(basket)
   try{
   /**
    * @typedef {Object} data -basket data
    * @property {string} source
    * @property {string} name
    * @property {string} colour
    * @property {string} length
    * @property {string} width
    * @property {string} weight
    * @property {string} height
    * @property {string} price
    *  @property {string} price
    *  @property {string} quantity
    *  @property {string} updated_at
    *  @property {string} created_at
    *  @property {string} url
    */
    const data={
      source:basket.product.source,
      name:req.body.name||basket.product.name,
      colour:req.body.colour||basket.product.colour,
      length:req.body.length||basket.product.length,
      width:req.body.width||basket.product.width,
      weight:req.body.weight||basket.product.weight,
      height:req.body.height||basket.product.height,
      price:req.body.price||basket.product.price,
      quantity:req.body.quantity||basket.product.quantity,
      updated_at:new Date(),
      created_at:basket.product.created_at,
      url:basket.product.url
    }
    if(req.body.weight>23)
    {
        basket.delivery_method.name="Sea Freight"
        basket.delivery_method.delivery_fee="5 euro"
    }
    else if(req.body.weight<=23)
    {
        basket.delivery_method.name="Air Freight"
        basket.delivery_method.delivery_fee="2 euro"
    }

    basket.product=data
    const basketUpdatedNotification = {
      _id: new mongoose.Types.ObjectId(),
      type: 'basketUpdated',
      message: ` Your basket has been updated successfully,verify everything you need`,
      created_at:new Date()
    };
    user.notifications.push(basketUpdatedNotification)
    const updatedUser=await user.save();
    res.json(updatedUser)
   }
   catch(error)
   {
     res.status(400).json({message:error})
   }
});



/**
 *  Adding system defaults
 */
router.post('/system_default', authenticate, async (req, res) => {
  try {
    let system_default = await SystemDefault.findOne({}); // Use findOne instead of find for a single document

    if (!system_default) {
      const newSystemDefault = new SystemDefault();
      system_default = await newSystemDefault.save();
    }

    if (req.body.category.toLowerCase() === "air freight") {
      system_default.delivery_fee.air_freight = req.body.amount;
    } else if (req.body.category.toLowerCase() === "sea freight") {
      system_default.delivery_fee.sea_freight = req.body.amount;
    } 
    else if(req.body.category.toLowerCase() === "referals")
      {
        system_default.loyalty_points.referals = req.body.amount;
      }
    
    else if(req.body.category.toLowerCase() === "purchase")
      {
        system_default.loyalty_points.purchase = req.body.amount;
      }
      else if(req.body.category.toLowerCase() === "prohibited")
        {
          system_default.prohibited.product.push(req.body.product);
        }
    else {
      return res.status(400).json({ message: "Invalid category provided" });
    }

    const update = await system_default.save();
    res.json(update);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

module.exports=router