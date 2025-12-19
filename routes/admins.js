import express from 'express';
const router = express.Router();
import Admin from '../models/admin.js';
import User from '../models/user.js';
import Category from '../models/category.js';
import SystemDefault from '../models/system_default.js';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcrypt';
import mongoose from 'mongoose';
import authenticate from '../middleware/currentUser.js';
import authenticateAdmin from '../middleware/currentAdminOnWeb.js';
import axios from 'axios';
import translate from '../middleware/translator.js';
// currency converter
const CC_API_KEY = '1e06667412357fb0c88dacd6'; // Replace with your API key
const CC_BASE_URL = 'https://v6.exchangerate-api.com/v6'; // Modify this based on the API service you choose


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
        data: admin.id
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
          created_at:formatDateTime(new Date())
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
                         data: admin.id
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
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }
    const basket=user.basket.find((basket)=>basket.id===basketId)
    if (!basket) {
      return res.status(404).json({ message: 'Basket item not found' });
    }
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
      updated_at:formatDateTime(new Date()),
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
      type: '💲 Quote Ready',
      message: `We've prepared your quote with a full price breakdown. Please review and confirm your order in
       the app to proceed.`,
      created_at:formatDateTime(new Date())
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
router.get('/system_default', authenticate, async (req, res) => {
  try {
    const system_default = await SystemDefault.findOne({});
    if (!system_default) {
      return res.status(404).json({ message: "System defaults not found" });
    }
    res.json(system_default);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

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
    else if(req.body.category.toLowerCase() === "service fee")
    {
      const percentage = parseFloat(req.body.percentage);
      const maxValue = parseFloat(req.body.maxValue);

      // Create a new service_fee object
      const newServiceFee = {
        percentage: isNaN(percentage) ? (system_default.service_fee && system_default.service_fee.percentage || 0.00) : percentage,
        maxValue: isNaN(maxValue) ? (system_default.service_fee && system_default.service_fee.maxValue || 0.00) : maxValue,
      };

      // Use Mongoose's set method to replace the entire service_fee field
      system_default.set('service_fee', newServiceFee);
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

/**
 * add new category
 */
router.post('/categories', authenticate, async (req, res) => {

  try{
    const category = new Category({
      name: req.body.category,
      subtypes:req.body.subtypes
  });
  
  const cat=await category.save()
  res.json(cat)
  }
  catch(error){
    res.status(400).json({message:error})
  }

});

/**
 * get all categories
 */
router.get('/categories', async (req, res) => {

  try{
    const categories = await Category.find({});
    if(!categories)
    {
      res.status(400).json({message:"No Categories found!"})
    }
    res.json(categories)
  }
  catch(error){
    res.status(400).json({message:error})
  }

});

/**
 * Add subtype to category
 */

router.post('/category/subtype/:id', authenticate, async (req, res) => {

  const category=await Category.findById(req.params.id);
  if (!req.body.name) {
    return res.status(400).json({ message: "Subtype name is required!" });
 }
  if(!category)
  {
    res.status(400).json({message:"Category not found!"})
  }
  console.log(req.body)
  category.subtypes.push({name:req.body.name})

  try{
   
    const newCategory=await category.save()
    res.json(newCategory)
  }
  catch(error){
    res.status(400).json({message:error})
  }

});


/**
 * Get subtypes to category
 */

router.get('/category/subtype/:id', async (req, res) => {

  const category=await Category.findById(req.params.id);

  if(!category)
  {
    res.status(400).json({message:"Category not found!"})
  }

  try{
       res.json(category.subtypes)
  }
  catch(error){
    res.status(400).json({message:error})
  }

});
/**
 * delete category
 */

router.delete('/category/:cid', authenticate, async (req, res) => {
  try {
    const categoryToDelete = await Category.findById(req.params.cid);

    if (!categoryToDelete) {
      return res.status(404).json({ message: 'Category not found' });
    }

    await Category.findByIdAndDelete(req.params.cid);
    res.status(200).json({ message: 'Category deleted successfully' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
});
  
/**
 * delete subtype
 */

router.delete('/category/:cid/subtype/:sid', authenticate, async (req, res) => {
    // console.log(req.params.cid,req.params.sid)
    const category=await Category.findById(req.params.cid);
    

    try{
      // console.log(subTypeToDelete);
      const subTypeToDelete = category.subtypes.find((subtype) => subtype.id === req.params.sid);
      console.log(subTypeToDelete)
      if(!subTypeToDelete)
      {
          res.status(404).json({ error: 'Sub Type not found!' });
          return;
      }
  
      await subTypeToDelete.deleteOne()
      await category.save()
      res.json(200);
    }
    catch(err)
    {
      res.status(400).json({message:err})

    }

})
/**
 * =======================USERS=================================
 */
/**
 * Get all users
 */

router.get('/users',authenticate, async (req, res) => {
  const users=await User.find({})
  try{
      res.json(users)
  }
  catch(err)
    {
      res.status(400).json({message:err})

    }
})

/**
 * =======================ORDERS=================================
 */
/**
 * Get all orders
 */

router.get('/allOrders',authenticate, async (req, res) => {

  const users=await User.find({})

  try{
    
      const orders = [];
      users.forEach((user) => {
        const userOrders = user.orders;
        userOrders.forEach((order) => {
          orders.push(order);
        });
      });
     
      if(!orders) 
        {
          res.status(400).json("No orders found!")
          return
        }
      res.json(orders)
    }
    catch(err)
    {
      res.status(400).json({message:err})
   
    }
})

/**
 *  get one order
 */
router.get('/order/:oId',authenticate, async (req, res) => {
 try{
  const users=await User.find({})
  const new_order=[]
  users.forEach((user)=>{
    user.orders.forEach((order)=>{
       if(order.id==req.params.oId)
       {
        new_order.push(order)
        // new_order=order
         return
       }
    })
  })
  if(!new_order) 
  {
    res.status(400).json("Order not found")
    return
  }
  res.json(new_order)
 }
 catch(err)
 {
   res.status(400).json({message:err})

 }
})
/** 
*  get one order
*/

router.patch('/orderStatus/:oId', authenticate, async (req, res) => {
  try {
    const orderId = req.params.oId;
    const users = await User.find({});

    // Track if any order was updated
    let updatedUser = null;

    for (const user of users) {
      for (const order of user.orders) {
        if (order.id === orderId) {
          order.status = req.body.status; // Use the status from the request body
          const orderStatusNotification = {
            _id: new mongoose.Types.ObjectId(),
            type: translate(`Order Status Update`, user.settings.language),
            message: translate(`Your order {order_num} status has been updated to {status}.`, user.settings.language, { order_num: order.order_num, status: req.body.status }),
            created_at: formatDateTime(new Date())
          };
          user.notifications.push(orderStatusNotification);
          updatedUser = await user.save(); // Await the save
          break; // Exit the inner loop once the order is found and updated
        }
      }
      if (updatedUser) break; // Exit the outer loop if the user was updated
    }

    if (updatedUser) {
      res.json(updatedUser); // Send the updated user response
    } else {
      res.status(404).json({ message: "Order not found" }); // Handle case where order was not found
    }
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

/**
 * Toggle order progress
 */
router.patch('/order/:oId/progress', authenticate, async (req, res) => {
  try {
    const { oId } = req.params;
    const { progressItem, status } = req.body;

    if (!progressItem || typeof status === 'undefined') {
      return res.status(400).json({
        message: "Both 'progressItem' and 'status' are required",
      });
    }

    const user = await User.findOne({ "orders._id": oId }).select('settings.language orders.order_num');

    if (!user) {
      return res.status(404).json({ message: "Order not found" });
    }

    const order = user.orders.id(oId);

    if (!order.progress.hasOwnProperty(progressItem)) {
      return res.status(404).json({
        message: `Progress item '${progressItem}' not found in order progress`,
      });
    }

    order.progress[progressItem] = status;
    var orderProgressNotification = []
    if(progressItem=="items_ordered" && status==true)
    {
      var orderProgressNotification = {
        _id: new mongoose.Types.ObjectId(),
        type: translate(`Order Progress Update`,user.settings.language),
        message: translate(`We have received your order #{order_num} and it is being processed.`,user.settings.language, { order_num: order.order_num }),
        created_at: new Date()
      };
    }
    else if(progressItem=="items_received" && status==true)
    {
      var orderProgressNotification = {
        _id: new mongoose.Types.ObjectId(),
        type: translate(`Order Progress Update`,user.settings.language),
        message: translate(`Your order #{order_num} has been received at our warehouse.`,user.settings.language, { order_num: order.order_num }),
        created_at: new Date()
      };
    }
    else if(progressItem=="items_shipped" && status==true)
    {
      var orderProgressNotification = {
        _id: new mongoose.Types.ObjectId(),
        type: translate(`Order Progress Update`,user.settings.language),
        message: translate(`Your order #{order_num} has been shipped.`,user.settings.language, { order_num: order.order_num }),
        created_at: new Date()
      };
    }
    else if(progressItem=="arrived_destination" && status==true)
    {
      var orderProgressNotification = {
        _id: new mongoose.Types.ObjectId(),
        type: translate(`Order Progress Update`,user.settings.language),
        message: translate(`Your order #{order_num} has arrived at the destination country.`,user.settings.language, { order_num: order.order_num }),
        created_at: new Date()
      };
    }
    else if(progressItem=="ready_for_pickup" && status==true)
    {
      var orderProgressNotification = {
        _id: new mongoose.Types.ObjectId(),
        type: translate(`Order Progress Update`,user.settings.language),
        message: translate(`Your order #{order_num} is ready for pickup.`,user.settings.language, { order_num: order.order_num }),
        created_at: new Date()
      };
    }
    if(orderProgressNotification && Object.keys(orderProgressNotification).length > 0)
    {
      user.notifications.push(orderProgressNotification);
    }
    
    await user.save();

    res.json(order);
    
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});


// /**
//  *  test currency 
//  */
router.get('/currency',async (req, res) => {

// convertCurrency(amountToConvert, fromCurrency, toCurrency);


  
  try {
       
    const amount=convertCurrency(100, 'EUR', 'XAF');

       console.log(amount);
    
   
} catch (error) {
    console.error('Error fetching currency data:', error);
}

})

/**
 *  edit one order
 */
router.patch('/order/:oId/product/:pId', authenticate, async (req, res) => {
  try {
    const users = await User.find({});
    const orderId = req.params.oId;
    const productId = req.params.pId;

    console.log(orderId, productId);
    const new_order = [];

    // Collect orders matching the orderId
    for (const user of users) {
      for (const order of user.orders) {
        if (order.id === orderId) {
          new_order.push({ user, order }); // Store both user and order
        }
      }
    }

    if (new_order.length > 0) {
      for (const { user, order } of new_order) {
        for (const item of order.products) {
          if (item.id === productId) {
            // Update item properties with provided data
            const itemPrice = await convertCurrency(req.body.price, 'EUR', 'XAF');

            item.source = req.body.source || item.source;
            item.name = req.body.name || item.name;
            item.length = req.body.length || item.length;
            item.width = req.body.width || item.width;
            item.quantity = req.body.quantity || item.quantity;
            item.weight = req.body.weight || item.weight;
            item.height = req.body.height || item.height;
            item.price = itemPrice || item.price;
            item.delivery_time = req.body.delivery_time || item.delivery_time;
            item.canResize = req.body.canResize || item.canResize;
            item.canRecolour = req.body.canRecolour || item.canRecolour;
            // item.extra_cost = req.body.extra_cost || item.extra_cost;
            item.isRejected = req.body.isRejected || item.isRejected;

            // Save the user
            await user.save(); // Ensure you have the correct user reference
            
            // Update order total price
            let system_default = await SystemDefault.findOne({});

            order.delivery_fee=system_default.delivery_fee.air_freight ;

            let price = 0;
            // let extra = 0;
            let delivery_period = 0;

            for (const order of user.orders) {
              if (order.id === orderId) {
                for (const item of order.products) {
                  if(item.isRejected==false && item.price)
                  {
                    delivery_period +=parseInt(item.delivery_time)
                    price += parseFloat(item.price)*parseFloat(item.quantity);
                    // extra += parseInt(item.extra_cost);
                  }
                 
                }
                order.estimated_delivery=2+Math.ceil(delivery_period/7)

                const amount1 = price
                // const amount2 = await convertCurrency(extra, 'EUR', 'XAF');
                
                const serviceFeePercentage = parseFloat(system_default.service_fee.percentage);
                const serviceFeeMaxValue = parseFloat(system_default.service_fee.maxValue);
                let calculatedServiceFee = amount1 * (serviceFeePercentage / 100);
                
                // Apply the maximum value cap
                if (calculatedServiceFee > serviceFeeMaxValue) {
                  calculatedServiceFee = serviceFeeMaxValue;
                }

                order.service_fee = calculatedServiceFee.toFixed(1);

                order.sub_total=amount1.toFixed(1)
                order.total_amount = parseFloat((
                  parseFloat(amount1) + 
                  parseFloat(order.service_fee) + 
                  parseFloat(system_default.delivery_fee.air_freight)
              ).toFixed(1));

                
              }
            }

            const updatedUser = await user.save();
            return res.status(200).json(updatedUser);
          }
        }
      }
    }

    return res.status(404).json({ message: 'Order or product not found' });
  } catch (err) {
    console.error(err); // Log the error for debugging
    res.status(400).json({ message: 'An error occurred', error: err.message });
  }
});

/**
 * =======================SERVICE_FEES=================================
 */
/**
 *  add service fee
 */
router.patch('/service_fee',authenticate, async (req, res) => {
  try{
    const systemDefault=await SystemDefault.findOne({})

    if(!systemDefault)
    {
      const sysDef = new SystemDefault({
        service_fee:{
          percentage: parseFloat(req.body.percentage) || 0.00,
          maxValue: parseFloat(req.body.maxValue) || 0.00
        }
      })
      await sysDef.save()
      res.status(200).json({message:"service fees updated"})

    }
    const percentage = parseFloat(req.body.percentage);
    const maxValue = parseFloat(req.body.maxValue);

    // Create a new service_fee object
    const newServiceFee = {
      percentage: isNaN(percentage) ? (systemDefault.service_fee && systemDefault.service_fee.percentage || 0.00) : percentage,
      maxValue: isNaN(maxValue) ? (systemDefault.service_fee && systemDefault.service_fee.maxValue || 0.00) : maxValue,
    };

    // Use Mongoose's set method to replace the entire service_fee field
    systemDefault.set('service_fee', newServiceFee);
    await systemDefault.save()
    res.status(200).json({message:"service fees updated"})

  }
  
  catch(error){
    res.status(400).json({message:error})
  }

})

/**
 * Get service fees
 */
router.get('/service_fee',authenticate, async (req, res) => {
  const systemDefault=await SystemDefault.findOne({})

  try
  {
    if(!systemDefault)
    {
      res.status(400).json({message:"No service fees"})
    }
    res.json({fees:systemDefault.service_fee})
  }

  catch(error){
    res.status(400).json({message:error})
  }

})

/**
 *  add airfreight fee
 */
router.patch('/airfreight_fee',authenticate, async (req, res) => {
  try{
    const systemDefault=await SystemDefault.findOne({})

    if(!systemDefault)
    {
      const sysDef = new SystemDefault({
        delivery_fee:{air_freight:req.body.amount}
      })
      await sysDef.save()
      res.status(200).json({message:"service fees updated"})

    }
    systemDefault.delivery_fee.air_freight=req.body.amount
    await systemDefault.save()
    res.status(200).json({message:"service fees updated"})
  }
  
  catch(error){
    res.status(400).json({message:error})
  }

})


/**
 * Get service fees
 */
router.get('/airfreight_fee',authenticate, async (req, res) => {
  const systemDefault=await SystemDefault.findOne({})

  try{
    if(!systemDefault)
    {
      res.status(400).json({message:"No service fees"})
    }
    res.json({fees:systemDefault.delivery_fee.air_freight})
  }
  catch(error){
    res.status(400).json({message:error})
  }
})


/**
 *  add airfreight fee
 */
router.patch('/seafreight_fee',authenticate, async (req, res) => {
  try{
    const systemDefault=await SystemDefault.findOne({})

    if(!systemDefault)
    {
      const sysDef = new SystemDefault({
        delivery_fee:{sea_freight:req.body.amount}
      })
      await sysDef.save()
      res.status(200).json({message:"service fees updated"})

    }
    systemDefault.delivery_fee.sea_freight=req.body.amount
    await systemDefault.save()
    res.status(200).json({message:"service fees updated"})
  }
  
  catch(error){
    res.status(400).json({message:error})
  }

})


/**
 * Get service fees
 */
router.get('/seafreight_fee',authenticate, async (req, res) => {
  const systemDefault=await SystemDefault.findOne({})

  try{
    if(!systemDefault)
    {
      res.status(400).json({message:"No service fees"})
    }
    res.json({fees:systemDefault.delivery_fee.sea_freight})
  }
  catch(error){
    res.status(400).json({message:error})
  }
})

/**
 * 
 */

router.get('/auth/verify', authenticateAdmin, async (req, res) => {
  try {
    
    const user = await Admin.findById(req.user.id);
    
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }
    
    // Return sanitized user data
    res.status(200).json({
      user: user
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

/**
 * 
 * @param {*} amount 
 * @param {*} fromCurrency 
 * @param {*} toCurrency 
 * @returns 
 */

async function convertCurrency(amount, fromCurrency, toCurrency) {
    try {
        const response = await axios.get(`${CC_BASE_URL}/${CC_API_KEY}/latest/${fromCurrency}`);
        const rates = response.data.conversion_rates;

        if (rates[toCurrency]) {
            const conversionRate = rates[toCurrency];
            const convertedAmount = amount * conversionRate;
            return parseFloat(convertedAmount.toFixed(2))
        } else {
            return null
        }
    } catch (error) {
            return null
    }
}

const formatDateTime = (date) => {
  let d;

  // If no date is provided or it's invalid, use current date
  if (!date || isNaN(Date.parse(date))) {
      d = new Date(); // Use current date
  } else {
      d = new Date(date);
  }

  // Check if the date object is valid
  if (isNaN(d.getTime())) {
      d = new Date(); // Fallback to current date if invalid
  }

  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const year = String(d.getFullYear()).slice(-2);
  const hours = String(d.getHours()).padStart(2, '0');
  const minutes = String(d.getMinutes()).padStart(2, '0');

  return `${day}.${month}.${year} ${hours}:${minutes}`;
};

export default router;
