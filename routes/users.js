const express=require('express')
const router =express.Router()
const User=require('../models/user')
const bcrypt=require('bcrypt')
const Admin=require('../models/admin')
const authenticate=require('../middleware/currentUser')
const mongoose = require('mongoose');
const mailer=require('../middleware/mailer')
const https = require('follow-redirects').https;
const fs = require('fs');
const user = require('../models/user')
const fapshi=require('./payments/fapshi')
const axios = require('axios');

const { format } = require('date-fns');

/**
 * Read and return all users 
 */

router.get('/',authenticate,async (req,res)=>{
    try
    {
        const users= await User.find()
        res.json(users)
    }
    catch(error)
    {
        res.status(500).json({message:error.message})
    }
})


/**
 * Verifies user using a code
 */

router.post('/verify/:id',authenticate,getUser,async(req,res)=>{

  /**
   * 
   * @param {*} dateToCompare The time the code was sent
   * @returns false if the difference in time is more than 2 minutes
   */
  function codeIsValid(dateToCompare) {
    const currentDate = new Date();
    const diffInMilliseconds = currentDate - dateToCompare;
    const diffInMinutes = diffInMilliseconds / (1000 * 60);

    return Math.abs(diffInMinutes) < 5;
}

 try{
  if(res.user.temp.code==req.body.code)
    {
     if(codeIsValid(res.user.temp.created_at))
      {
        if(res.user.prefered_notification=="email")
          {

            await res.user.updateOne({$set:{email_is_verified:true,is_verified:true}})
            const updatedUser=await User.findById(res.user.id)

            res.json(updatedUser)
          }
        else if(res.user.prefered_notification=="phone")
          {
             await res.user.updateOne({$set:{num_is_verified:true,is_verified:true}})
             const updatedUser=await User.findById(res.user.id)
            res.json(updatedUser)
          }
      }
      else{
        res.status(400).json({message:"code expired"})
      }
     
    }
  else{
    res.status(400).json({message:"Something went wrong"})
  }
    
 }
 catch(error)
 {
  res.status(400).json({message:error})
 }
})

/**
 * Read and display on particular user
 */

router.get('/:id',authenticate,getUser,async(req,res)=>{
   res.json(res.user)
})

/**
 * updates a users profile information
 */

router.patch('/:id',authenticate,getUser,async(req,res)=>{
    if(req.body.phone_number !=null)
    {
        res.user.phone_number=req.body.phone_number
        res.user.num_is_verified=false
    }
    if(req.body.email !=null)
    {
        res.user.email=req.body.email
        res.user.email_is_verified=false
    }
    
    try{
        const updatedUser = await res.user.save()
        res.json(updatedUser)
    }
    catch(error)
    {
        res.status(400).json({message:error.message})
    }
})

/**
 * Delete a particular user based on their id
 */
//delete one user
router.delete('/:id',authenticate,getUser,async (req,res)=>{
  try
  {
        await res.user.deleteOne();
        res.json({message:'user deleted sucessfully'})
  } 
  catch(error)
  {
        res.status(500).json({message:error.message})
  } 
});

/**
 * get OTP code which lasts 2mins
 */


router.post('/getCode/:id',getUser,async(req,res)=>{

  /**
   * 
   * @returns temporal code to user
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
  
  
  try{
    /**
    * Send user email based on their prefered notification
    */

  if(res.user.prefered_notification=="email")
  {
    const temp_code=newTempCode()
   await res.user.updateOne({$set:{temp:{code:temp_code,created_at:new Date()}}})
   

   const html=messageTemplateForOTP(temp_code)

   await mailer.sendMail({
     from:'no-reply@globalbuy24.com',
     to:res.user.email,
     subject:'Verification code',
     html:html
   })
   res.json({message:"code sent successfully"})
  }
    /**
    * Send user sms based on their prefered notification
    */

  else if(res.user.prefered_notification=="phone")
  {
    const temp_code=newTempCode()
    await res.user.updateOne({$set:{temp:{code:temp_code,created_at:formatDateTime(new Date())}}})

    await sendSMS({
      sender: "GB24",
      recipient: res.user.phone_number, 
      message: "Your verification code is: "+temp_code+" . It is valid for 5 minutes.Do not share this code with anyone. Need Help? Visit the help centre on the app or globalbuy24.com"
    });
    
     res.json({message:"code sent successfully"})
    
  }

}
catch(error)
{
  res.status(500).json({message:error})
}

})

   /**
    * Logout user and return their profile, this typically unsets their token
    */

router.post('/logout/:id',getUser,async(req,res)=>{
  await res.user.updateOne({$unset:{token:""}})
  res.json(res.user)

})

   /**
    * user pin auto update based on user's id
    */

router.patch('/:id/updatePin',authenticate,getUser,async(req,res)=>{
    res.user.pin = newPin();
    const updatedUser = await res.user.save()
    res.json(updatedUser)
 })



/**
 * read one user pin
 */
router.get('/:id/pin',authenticate,getUser,async(req,res)=>{
    res.json(res.user.pin)
 })


/**
 *  user add address
 */
 router.post('/:id/deliveryAddress', authenticate, getUser, async (req, res) => {
    
  /**
   * @typedef {Object} newAddress
   * @property {string} street
   * @property {string} city
   * @property {string} street
   * @property {string} country
   * @property {string} _id
   */
    const newAddress = {
      street: req.body.street,
      city: req.body.city,
      country: req.body.country ? req.body.country : 'Cameroon',
      num: req.body.num ? req.body.num : 'no-number',
      isDefault:req.body.default,
      _id: new mongoose.Types.ObjectId() 
    };

      if(res.user.addresses.length === 0)
      {
        newAddress.isDefault=true
      }
    
      try {
        
        res.user.addresses.push(newAddress);
        const updatedUser = await res.user.save();
        res.json(updatedUser);
      } catch (error) { 
        console.error(error);
        res.status(500).json({ error: 'Server error' });
      }
  });

/**
 * default user address
 */

router.get('/:id/defaultDeliveryAddress', authenticate, getUser, async (req, res) => {

  try {
    const isDefault= res.user.addresses.find((address) => address.isDefault === true);
    res.json(isDefault);
  } catch (error) {
    console.error(error);
    res.status(500).json({message:error});
  }
})

/**
 * other user addresses
 */

router.get('/:id/otherDeliveryAddress', authenticate, getUser, async (req, res) => {
  try {
    // Filter addresses where isDefault is false
    const otherAddresses = res.user.addresses.filter((address) => address.isDefault === false);
    
    // Send the filtered addresses back as a response
    res.json(otherAddresses);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: error.message });
  }
});
/**
 * get all delivery addresses for a particular user
 */
router.get('/:id/deliveryAddress', authenticate, getUser, async (req, res) => {
    
    
    try {
      res.json(res.user.addresses);
    } catch (error) {
      console.error(error);
      res.status(500).json({message:error});
    }
  });


/**
 *  get one delivery address for a particular user
 */

router.get('/:id/deliveryAddress/:dId', authenticate, getUser, async (req, res) => {
    
    try {
        const addressId = req.params.dId;
        const deliveryAdress =await  res.user.addresses.find((address) => address.id === addressId);  
        if (!deliveryAdress) {
         
            res.status(404).json({ error: 'Address not found' });
            return;
          }    
        res.json(deliveryAdress);
    } catch (error) {

      res.status(500).json({message:error});
    }
  });

/**
 *  update any existing field from the addresses
 */ 
router.patch('/:id/deliveryAddress/:dId', authenticate, getUser, async (req, res) => {
  try {
    // Reset any address with default true to default false if isDefault is true
    if(req.body.isDefault===true)
    {
      res.user.addresses.map((address) => {
        address.isDefault = false;
        return address;
      });
    
    }
   

    const addressId = req.params.dId;

    // Ensure ID comparison is done correctly (using toString())
    const addressToUpdate = res.user.addresses.find((address) => address.id.toString() === addressId);

    if (!addressToUpdate) {
      return res.status(404).json({ error: 'Address not found' });
    }

    // Get existing values
    const oldCity = addressToUpdate.city;
    const oldStreet = addressToUpdate.street;
    const oldCountry = addressToUpdate.country;
    const oldNum = addressToUpdate.num;
    const oldDefault = addressToUpdate.isDefault;

    // Update address fields with new values or retain old ones
    addressToUpdate.street = req.body.street || oldStreet;
    addressToUpdate.city = req.body.city || oldCity;
    addressToUpdate.num = req.body.num || oldNum;
    addressToUpdate.country = req.body.country || oldCountry;

    // Logic for setting isDefault
    if (res.user.addresses.length === 0) {
      addressToUpdate.isDefault = true;
    } else {
      addressToUpdate.isDefault = req.body.isDefault !== undefined ? req.body.isDefault : oldDefault;
    }

    // Save the updated user
    const updatedUser = await res.user.save();
    return res.json(updatedUser);
  } catch (error) {
    console.error('Error updating delivery address:', error); // Log the error for debugging
    return res.status(500).json({ message: 'Internal server error' });
  }
});


/**
 *  delete individual addresses
 */

router.delete('/:id/deliveryAddress/:dId', authenticate, getUser, async (req, res) => {
  try {
      const addressId = req.params.dId;

      const addressToDelete = res.user.addresses.find((address) => address.id === addressId);
      if (!addressToDelete) {
          res.status(404).json({ error: 'Address not found' });
          return;
      }

      // Delete the address
      await addressToDelete.deleteOne();

      // Find the first address that is not deleted and set it as default
      const remainingAddresses = res.user.addresses.filter(address => address.id !== addressId);
      if (remainingAddresses.length > 0) {
          // Set the first remaining address as default
          remainingAddresses[0].isDefault = true;
      }

      // Save the updated user
      const updatedUser = await res.user.save();
      res.json(updatedUser);
  } catch (error) {
      res.status(500).json({ message: error });
  }
});

/**
* Get user notifications for a particular user id
*/
router.get('/:id/notifications', authenticate, getUser, async (req, res) => {
  try {
      res.json(res.user.notifications);
  } catch (error) {
      res.status(500).json({ message: error });
  }
});

/**
 * add new user notification
 */
router.post('/:id/notifications', authenticate, getUser, async (req, res) => {

    /**
   * @typedef {Object} newNotification
   * @property {string} type
   * @property {string} message
   * @property {string} created_at
   * @property {string} _id
   */
  const newNotification={
    _id: new mongoose.Types.ObjectId(),
    type:req.body.type,
    message:req.body.message,
    created_at:formatDateTime(new Date())
  }
  try {
     res.user.notifications.push(newNotification)
     const updatedUser=await res.user.save()
     res.json(updatedUser)
  }
  catch(error)
  {
    res.status(500).json({message:error});
  }

})


/**
 * delete user notification
 */
router.delete('/:id/notifications/:nId', authenticate, getUser, async (req, res) => {
 
  try {
     
     const notificationId = req.params.nId;
       
     const notificationToDelete = res.user.notifications.find((notification) => notification.id === notificationId);
     if(!notificationToDelete)
     {
         res.status(404).json({ error: 'Notification not found' });
         return;
     }
     notificationToDelete.deleteOne()

     const updatedUser = await res.user.save();
     res.json(updatedUser);
  }
  catch(error)
  {
    res.status(500).json({message:error});
  }

})

/**
 * add payments to account
 */

router.post('/:id/addPayment', authenticate, getUser, async (req, res) => {
  const { type, provider, account_name, account_number, expiry_date, cvv } = req.body;
  // console.log(req.body);
  if (!type || !provider || !account_name || !account_number) {
    return res.status(400).json({ message: 'All fields are required.' });
  }
  const numberExist = res.user.payment_methods.find((payment) => payment.account_number.toString() === account_number);

  if(numberExist)
  {
    return res.status(400).json({ message: 'Account number already exist' });
  }
  const providerLogo=await provLogo(provider);
  const numEnding=await numEnd(account_number)
  var isDefault=false;
  if(res.user.payment_methods === null || 
    (typeof res.user.payment_methods === 'object' && 
     Object.keys(res.user.payment_methods).length === 0))
  {
    isDefault=true;
  }
  try {
    const payment={
      _id: new mongoose.Types.ObjectId(),
      type:type,
      provider:provider.toUpperCase(),
      provider_logo:providerLogo,
      account_name:account_name,
      account_number:account_number,
      number_ending:numEnding,
      expiry_date:expiry_date||"N/A",
      cvv:cvv||"N/A",
      isDefault:isDefault
    }
  
    res.user.payment_methods.push(payment)
    await res.user.save()
    res.status(201).json({ message: 'Payment method added successfully.', user });
} catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error.' });
}

});

/**
 * get default payment details
*/

router.get('/:id/defaultPayment', authenticate, getUser, async (req, res) => {

  try {
    const isDefault= res.user.payment_methods.find((payment) => payment.isDefault === true);
    res.json(isDefault);
  } catch (error) {
    console.error(error);
    res.status(500).json({message:error});
  }
})


/**
 * get other payment methods
*/


router.get('/:id/otherPayment', authenticate, getUser, async (req, res) => {
  try {
    // Filter addresses where isDefault is false
    const otherPayement= res.user.payment_methods.filter((payment) => payment.isDefault === false);
    
    // Send the filtered addresses back as a response
    res.json(otherPayement);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: error.message });
  }
});

/**
 * get mobile payment address
*/

router.get('/:id/mobilePayment', authenticate, getUser, async (req, res) => {
  try {
    // Filter addresses where isDefault is false
    const mobilePayment= res.user.payment_methods.filter((payment) => payment.type == "mobile");
    
    // Send the filtered addresses back as a response
    res.json(mobilePayment);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: error.message });
  }
});

/**
 * get card payment addresses
*/

router.get('/:id/cardPayment', authenticate, getUser, async (req, res) => {
  try {
    // Filter addresses where isDefault is false
    const cardPayment= res.user.payment_methods.filter((payment) => payment.type == "card");
    
    // Send the filtered addresses back as a response
    res.json(cardPayment);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: error.message });
  }
});

/**
 * upadte payment details
*/
router.patch('/:id/paymentMethod/:dId', authenticate, getUser, async (req, res) => {
  try {
    // Reset any address with default true to default false if isDefault is true
    if(req.body.isDefault===true)
    {
      res.user.payment_methods.map((payment) => {
        payment.isDefault = false;
        return payment;
      });
    }
    const numberExist = res.user.payment_methods.find((payment) => payment.account_number.toString() === req.body.account_number);

    if(numberExist)
    {
      return res.status(400).json({ message: 'Account number already exist' });
    }

    const paymentId = req.params.dId;

    // Ensure ID comparison is done correctly (using toString())
    const paymentToUpdate = res.user.payment_methods.find((payment) => payment.id.toString() === paymentId);

    if (!paymentToUpdate) {
      return res.status(404).json({ error: 'payment not found' });
    }

    // Get existing values
    const oldAccountName = paymentToUpdate.account_name;
    const oldAccountNumber = paymentToUpdate.account_number;
    const oldNumEnding = paymentToUpdate.number_ending;
    const oldExpiry = paymentToUpdate.expiry_date;
    const oldCvv = paymentToUpdate.cvv;
    const oldDefault = paymentToUpdate.isDefault;

    // Update payment fields with new values or retain old ones
    paymentToUpdate.account_name=req.body.account_name||oldAccountName;
    paymentToUpdate.account_number=req.body.account_number||oldAccountNumber;
    if(req.body.account_number)
    {
      paymentToUpdate.number_ending=await numEnd(req.body.account_number);

    }
    else if(!req.body.account_number)
    {
      paymentToUpdate.number_ending=oldNumEnding;
    }
    paymentToUpdate.expiry_date=req.body.expiry_date||oldExpiry;
    paymentToUpdate.cvv=req.body.cvv||oldCvv;
    paymentToUpdate.isDefault=req.body.isDefault||oldDefault;

    // Logic for setting isDefault
    if (res.user.payment_methods.length === 0) {
      paymentToUpdate.isDefault = true;
    } else {
      paymentToUpdate.isDefault = req.body.isDefault !== undefined ? req.body.isDefault : oldDefault;
    }

    // Save the updated user
    const updatedUser = await res.user.save();
    return res.json(updatedUser);
  } catch (error) {
    console.error('Error updating delivery payment:', error); // Log the error for debugging
    return res.status(500).json({ message: 'Internal server error' });
  }
})

/**
 *  get one delivery address for a particular user
 */

router.get('/:id/paymentMethod/:dId', authenticate, getUser, async (req, res) => {
    
  try {
      const paymentId = req.params.dId;
      const paymentMethod =await  res.user.payment_methods.find((payment) => payment.id === paymentId);  
      if (!paymentMethod) {
       
          res.status(404).json({ error: 'payment not found' });
          return;
        }    
      res.json(paymentMethod);
  } catch (error) {

    res.status(500).json({message:error});
  }
});

/**
 * delete user notification
 */
router.delete('/:id/payment/:nId', authenticate, getUser, async (req, res) => {
 
  try {
     
     const paymentId = req.params.nId;
       
     const paymentToDelete = res.user.payment_methods.find((payment) => payment.id === paymentId);
     if(!paymentToDelete)
     {
         res.status(404).json({ error: 'payment not found' });
         return;
     }
     paymentToDelete.deleteOne()

     const remainingPayments = res.user.payment_methods.filter(payment => payment.id !== paymentId);
     if (remainingPayments.length > 0) {
         // Set the first remaining address as default
         remainingPayments[0].isDefault = true;
     }

     const updatedUser = await res.user.save();
     res.json(updatedUser);
  }
  catch(error)
  {
    res.status(500).json({message:error});
  }

})


/**
 * Add product to users basket
 */

router.post('/:id/newBasket', authenticate, getUser, async (req, res) => {
  try {
    if (!req.body.orderURL) {
      return res.status(400).json({ message: "No Order URL available" });
    }

    // Parse URL and extract domain more safely
    let domain, source;
    try {
      const url = new URL(req.body.orderURL);
      domain = url.hostname.replace('www.', '').split('.')[0];
      source = domain.charAt(0).toUpperCase() + domain.slice(1);
    } catch (e) {
      return res.status(400).json({ message: "Invalid URL format" });
    }

    const createdAt = formatDateTime(new Date());

    const newBasket = {
      _id: new mongoose.Types.ObjectId(),
      delivery_method: { name: 'Air Freight' },
      product: {
        url: req.body.orderURL, // Store as string instead of URL object
        source: source,
        quantity: parseInt(req.body.quantity) || 1,
        created_at: createdAt
      }
    };

    // Check for existing URL
    const urlExists = res.user.basket.some(basketItem => {
      try {
        const existingUrl = basketItem.product.url;
        return existingUrl === req.body.orderURL; // Simple string comparison
      } catch (e) {
        return false;
      }
    });

    if (urlExists) {
      return res.status(400).json({ message: "An item exists with that URL in your basket!" });
    }

    // Create notifications
    const basketCreatedNotification = {
      _id: new mongoose.Types.ObjectId(),
      type: 'Basket Created',
      message: 'Your basket has been created successfully',
      created_at: formatDateTime(new Date())
    };

    const basketCreatedByUserNotification = {
      _id: new mongoose.Types.ObjectId(),
      type: 'Basket Created',
      message: 'A new order has been created',
      created_at: formatDateTime(new Date())
    };

    console.log('Current Date:', new Date());
    // Update user
    res.user.notifications.push(basketCreatedNotification);
    res.user.basket.push(newBasket);

    // Save user and notify admins in parallel
    const [updatedUser] = await Promise.all([
      res.user.save(),
      Admin.updateMany(
        { type: "type1" },
        { $push: { notifications: basketCreatedByUserNotification } }
      )
    ]);

    res.json(updatedUser);
  } catch (error) {
    console.error('Error in /:id/newBasket:', error);
    res.status(500).json({ message: error.message });
  }
});


/**
 * Get user's basket
 */

router.get('/:id/basket', authenticate, getUser, async (req, res) => {
     try{
      
      userBasket=res.user.basket
      res.json(userBasket);
     }
     catch(error)
     {
       res.status(400).json({message:error})
     }
});

/**
 * Delete particular user basket
*/
router.delete('/:id/basket/:nId', authenticate, getUser, async (req, res) => {
 
  try {
     
     const basketId = req.params.nId;
       
     const basketToDelete = res.user.basket.find((basket) => basket.id === basketId);
     if(!basketToDelete)
     {
         res.status(404).json({ error: 'basket not found' });
         return;
     }
     basketToDelete.deleteOne()

     const updatedUser = await res.user.save();
     res.json(updatedUser);
  }
  catch(error)
  {
    res.status(500).json({message:error});
  }

})

/**
 * Save Item for later
 */

router.post('/:id/saveItem/:bId', authenticate, getUser, async (req, res) => {
  const basketItem=await res.user.basket.find(item=>item.id==req.params.bId)
  const itemAlreadySaved=await res.user.saved.find(item2=>item2.url==basketItem.product.url)

  try{
      if(basketItem==null)
      {
        res.status(400).json({message:"Item not found in your basket."})
        return
      }
     
    
      if(itemAlreadySaved)
      {
        res.status(400).json({message:"This item is already saved.Try saving something else!"})
        return

      }
    const itemToSave={
      _id: new mongoose.Types.ObjectId(),
      url:basketItem.product.url,
      source:basketItem.product.source
      }
      
      await res.user.saved.push(itemToSave)
      basketItem.deleteOne();
      const updatedUser=await res.user.save()
      res.json(updatedUser)
  }
  catch(err)
  {
    res.status(400).json({message:err})
  }
  
})

/**
 * Save Item for later
 */

router.get('/:id/saveItem', authenticate, getUser, async (req, res) => {
  const savedItems=await res.user.saved
  try{
   
  res.json(savedItems)
  }
  catch(err)
  {
    res.status(400).json({message:err})
  }
})
/**
 * Move Saved Item to Basket
 */

router.post('/:id/moveSaveItemToBasket/:sId', authenticate, getUser, async (req, res) => {
  const savedItem=await res.user.saved.find(item=>item.id==req.params.sId)
  const basketItem=await res.user.basket.find(item=>item.id==req.params.sId)

  try{
      if(savedItem==null)
      {
        res.status(400).json({message:"Item not found."})
        return
      }
     
    
      if(basketItem)
      {
        res.status(400).json({message:"This item already exists in your basket."})
        return

      }
    
      const createdAt = formatDateTime(new Date()); 
      const humanReadableDate = format(createdAt, 'MMMM do yyyy, h:mm:ss a');
    
      const itemToMove={
        _id: new mongoose.Types.ObjectId(),
        delivery_method:{name:'Air Freight'},
         product:{
          url:savedItem.url,
          source:savedItem.source,
          quantity:1,
          created_at:humanReadableDate,
         }
      }
      await res.user.basket.push(itemToMove)
      savedItem.deleteOne();
      const updatedUser=await res.user.save()
      res.json(updatedUser)
  }
  catch(err)
  {
    res.status(400).json({message:err})
  }
  
})

/**
 * Delete saved item
 */
router.delete('/:id/savedItem/:sId', authenticate, getUser, async (req, res) => {
 
  try {
     
     const savedId = req.params.sId;
       
     const savedToDelete = res.user.saved.find((saved) => saved.id === savedId);
     if(!savedToDelete)
     {
         res.status(404).json({ message: 'Item not found' });
         return;
     }
     savedToDelete.deleteOne()

     const updatedUser = await res.user.save();
     res.json(updatedUser);
  }
  catch(error)
  {
    res.status(500).json({message:error});
  }

})

/**
 * Create order by user
 */
router.post('/:id/newOrder',authenticate,getUser,async(req,res)=>{
     
 console.log(req.body);
 
  if(res.user.is_verified==false)
  {
    res.status(400).json({message:"Please verify your account"})
    return
  }
  if (!req.body.basketProducts || !Array.isArray(req.body.basketProducts)) {
    return res.status(400).json({ message: "Invalid basket products" });
  }

  const orderNumber=await newOrderNumber(res.user.id)
  const userDeliveryAddress=res.user.addresses.find(address=>address.isDefault==true)
  var itemCount=0;
  const userProducts=[]
  req.body.basketProducts.forEach(item2=>{
     res.user.basket.forEach(item1 => {
          if(item1.id==item2.id)
          {
            item1.product.quantity=item2.quantity;
            userProducts.push(item1.product);
            itemCount+=1;
            item1.deleteOne({_id:item1.id});
          }
      })
    });

    console.log(itemCount);
    const defaultDelivery={
      name:"Air Freight",
      delivery_fee:"0.00"
    }
     const humanReadableDate = format(new Date(), 'MMMM do yyyy, h:mm:ss a');
  
    const newOrder={
    _id: new mongoose.Types.ObjectId(),
    pin:newPin(),
    order_num:orderNumber,
    delivery_details:userDeliveryAddress,
    delivery_method:defaultDelivery,
    products:userProducts,
    created_at:humanReadableDate,
    items_count:itemCount
    }

    const newOrderNotification = {
      _id: new mongoose.Types.ObjectId(),
      type: '✅ Order Received',
      message: `Thank you for placing your order with GlobalBuy24. We’ve received your request and are now
      verifying the product details. We’ll notify you once we place the order.`,
      created_at:formatDateTime(new Date())
    };
    const newOrderNotification2 = {
      _id: new mongoose.Types.ObjectId(),
      type: '🔍 Order Under Review',
      message: `Our team is reviewing your product link(s) to confirm availability, price, shipping, and size/variant
      information. We’ll send you a quote shortly.`,
      created_at:formatDateTime(new Date())
    };
    
     try{
         res.user.notifications.push(newOrderNotification,newOrderNotification2)
          res.user.orders.push(newOrder)
          const updatedUser= await res.user.save()
          res.status(201).json(updatedUser)
     }
     catch(error)
     {
       res.status(400).json({message:error})
     }
})

/**
 * Update Order on product change
 */

router.post('/:id/updateOrder/:oId/quantity/:pId',authenticate,getUser,async(req,res)=>{
    
    const orderId=req.params.oId
    const productId=req.params.pId
    const quantity=parseInt(req.body.quantity)
    var productExist=false
    const order= await res.user.orders.filter((order)=>order.id==orderId)
    
    res.user.orders.forEach((item)=>{
      if(item.id==orderId)
      {
        if(item.products)
        {
          item.products.forEach((item2)=>{
            if(item2.id==productId)
            {
              productExist=true
               item2.quantity=quantity 
            }
        }
       
      )
        }
      }
       
    })

    if(!quantity)
    {
      res.status(400).json({message:"Quantity not found or invalid"})
      return
    }
    if(!res.user)
    {
      res.status(400).json({message:"User not found"})
      return
    }
    if(!order)
    {
      res.status(400).json({message:"Order not found"})
      return
    }
    if(!productExist)
      {
        res.status(400).json({message:"Order not found"})
        return
      }
    
    // Recompute order total
    var orderTotal=0

    res.user.orders.forEach((item)=>{
      if(item.id==orderId)
      {
        if(item.products)
        {
          item.products.forEach((item2)=>{
            orderTotal+=parseInt(item2.quantity)*parseFloat(item2.price)+parseFloat(item2.extra_cost)
          })
        }
        item.total_amount=orderTotal+parseFloat(item.service_fee)
      }
       
    })

    const updatedUser=await res.user.save()
    const newOrder= await updatedUser.orders.filter((order)=>order.id==orderId)
    
    res.json(newOrder)
    // console.log(userId,orderId,productId,quantity);


})
/**
 * Canceled an Order
 */
router.delete('/:id/cancelOrder/:oId',authenticate,getUser,async(req,res)=>{
     
  try {
     
    const orderId = req.params.oId;
      
    const orderToDelete = res.user.orders.find((saved) => saved.id === orderId);
    if(!orderToDelete)
    {
        res.status(404).json({ message: 'Item not found' });
        return;
    }
    orderToDelete.deleteOne()

    const updatedUser = await res.user.save();
    res.json(updatedUser);
 }
 catch(error)
 {
   res.status(500).json({message:error});
 }
})


/**
 * Get user's order which hasn't been canceled
 */

router.get('/:id/orders', authenticate, getUser, async (req, res) => {
  try{
    res.user.orders.forEach((item)=>{
      if(orderExpiration(item.expires_date)=="expired")
      {
         item.deleteOne();
      }
      item.expiresIn=orderExpiration(item.expires_date);
    })
    await res.user.save()
   userOrder=res.user.orders.filter((order)=>order.status!=="refunded" && order.status!=="purchased")
  
   res.json(userOrder);
  }
  catch(error)
  {
    res.status(400).json({message:error})
  }
});

/**
 * count user orders
 */

router.get('/:id/ordersCount', authenticate, getUser, async (req, res) => {
  try{
    var count=0;
    res.user.orders.forEach((item)=>{
      // console.log(item.expiresIn!=="expired" && item.status!=="refunded" && item.isDelivered===false)
      if(item.expiresIn!=="expired" && item.status!=="refunded" && item.status!=="purchased" && item.isDelivered===false)
      {
         count+=1;
      }
      
    })  
   res.json(count);
  }
  catch(error)
  {
    res.status(400).json({message:error})
  }
});

/**
 * Get user's pending orders 
 */

router.get('/:id/pendingOrders', authenticate, getUser, async (req, res) => {
  try{
    res.user.orders.forEach((item)=>{
      if(orderExpiration(item.expires_date)=="expired" && item.status==="confirmed")
      {
         item.deleteOne();
      }
      item.expiresIn=orderExpiration(item.expires_date);
    })
    await res.user.save()

   userOrder=res.user.orders.filter((order)=>order.status==="pending")
  
   res.json(userOrder);
  }
  catch(error)
  {
    res.status(400).json({message:error})
  }
});

/**
 * Get user's refunded orders 
 */

router.get('/:id/refundedOrders', authenticate, getUser, async (req, res) => {
  try{
    res.user.orders.forEach((item)=>{
      if(orderExpiration(item.expires_date)=="expired" && item.status==="confirmed")
      {
         item.deleteOne();
      }
      item.expiresIn=orderExpiration(item.expires_date);
    })
    await res.user.save()

   userOrder=res.user.orders.filter((order)=>order.status==="refunded")
  
   res.json(userOrder);
  }
  catch(error)
  {
    res.status(400).json({message:error})
  }
});
/**
 * Get user's confirmed orders 
 */

router.get('/:id/confirmedOrders', authenticate, getUser, async (req, res) => {
  try{
    res.user.orders.forEach((item)=>{
      if(orderExpiration(item.expires_date)=="expired" && item.status==="confirmed")
      {
         item.deleteOne();
      }
      item.expiresIn=orderExpiration(item.expires_date);
    })
    await res.user.save()

   userOrder=res.user.orders.filter((order)=>order.status==="confirmed")
  
   res.json(userOrder);
  }
  catch(error)
  {
    res.status(400).json({message:error})
  }
});

/**
 * Get user's purchased orders 
 */

router.get('/:id/purchasedOrders', authenticate, getUser, async (req, res) => {
  try{
   
    res.user.orders.forEach((item)=>{
      if(orderExpiration(item.expires_date)=="expired" && item.status==="confirmed")
      {
         item.deleteOne();
      }
      item.expiresIn=orderExpiration(item.expires_date);
    })
    await res.user.save()

   userOrder=res.user.orders.filter((order)=>order.status==="purchased")
  
   res.json(userOrder);
  }
  catch(error)
  {
    res.status(400).json({message:error})
  }
});

/**
 * Get user's purchased and in progress orders 
 */

router.get('/:id/inprogressOrders', authenticate, getUser, async (req, res) => {
  try{
    res.user.orders.forEach((item)=>{
      if(orderExpiration(item.expires_date)=="expired" && item.status==="confirmed")
      {
         item.deleteOne();
      }
      item.expiresIn=orderExpiration(item.expires_date);
    })
    await res.user.save()

   userOrder=res.user.orders.filter((order)=>order.status==="purchased" && order.isDelivered===false)
  
   res.json(userOrder);
  }
  catch(error)
  {
    res.status(400).json({message:error})
  }
});

/**
 * Get user's purchased and delivered orders 
 */

router.get('/:id/deliveredOrders', authenticate, getUser, async (req, res) => {
  try{
    res.user.orders.forEach((item)=>{
      if(orderExpiration(item.expires_date)=="expired"&& item.status==="confirmed")
      {
         item.deleteOne();
      }
      item.expiresIn=orderExpiration(item.expires_date);
    })
    await res.user.save()

   userOrder=res.user.orders.filter((order)=>order.status==="purchased" && order.isDelivered===true)
  
   res.json(userOrder);
  }
  catch(error)
  {
    res.status(400).json({message:error})
  }
});
/**
 * Get one particular order from a group of orders
 */
router.get('/:id/order/:nId', authenticate, getUser, async (req, res) => {
 
  try {
     
     const orderId = req.params.nId;
       
     const order = res.user.orders.find((order) => order.id === orderId);
     if(!order)
     {
         res.status(404).json({ error: 'order not found' });
         return;
     }
     
     res.json(order);
  }
  catch(error)
  {
    res.status(500).json({message:error});
  }

})

/**
 * Get one particular order's from a group of orders
 */
router.get('/:id/orderProducts/:nId', authenticate, getUser, async (req, res) => {
 
  try {
     
     const orderId = req.params.nId;
       
     const order = res.user.orders.find((order) => order.id === orderId);
     if(!order)
     {
         res.status(404).json({ error: 'order not found' });
         return;
     }
     
     res.json(order.products);
  }
  catch(error)
  {
    res.status(500).json({message:error});
  }

})

/**
 * Get one particular order's from a group of orders
 */
router.get('/:id/orderProducts/:nId', authenticate, getUser, async (req, res) => {
 
  try {
     
     const orderId = req.params.nId;
       
     const order = res.user.orders.find((order) => order.id === orderId);
     if(!order)
     {
         res.status(404).json({ error: 'order not found' });
         return;
     }
     
     res.json(order.products);
  }
  catch(error)
  {
    res.status(500).json({message:error});
  }

})
/**
 * 
 */


// Route to group purchases by delivery dates
router.get('/:id/groupedPurchases', authenticate, getUser, async (req, res) => {
  try {
      const userId = req.params.id; // Get user ID from the route

      const user = await User.findById(userId).select('orders'); // Fetch user with orders

      if (!user) {
          return res.status(404).json({ message: "User not found" });
      }

      const orders = user.orders.filter((order)=>order.status=="purchased");

      // Perform aggregation on the orders array
      const groupedPurchases = orders.reduce((acc, order) => {
          const purchaseDate = order.purchase_date.toISOString().split('T')[0]; // Format date

          // Check if the date group already exists
          if (!acc[purchaseDate]) {
              acc[purchaseDate] = {
                  purchaseDate,
                  totalAmount: 0,
                  orders: []
              };
          }

          // Update the total amount and push the order
          acc[purchaseDate].totalAmount += parseFloat(order.total_amount);
          acc[purchaseDate].orders.push(order);

          return acc;
      }, {});

      // Convert the object back to an array
      const result = Object.values(groupedPurchases);

      res.status(200).json(result);
  } catch (error) {
      console.error(error);
      res.status(500).json({ message: "Internal Server Error" });
  }

});

/**
 * get 4 images from an order 
 */

router.get('/:id/orderImages/:pId', authenticate, getUser, async (req, res) => {
 
  try {
     
     const orderId = req.params.pId;
       
     const order = res.user.orders.find((order) => order.id === orderId);
     if(!order)
     {
         res.status(404).json({ error: 'order not found' });
         return;
     }
    //  console.log(order.products)
     var images=[];
     var count=1;
     var remainder=0;
     order.products.forEach((item)=>{
      if(count>4)
      {
        return;
      }
         images.push(item.img)
         count+=1 
     })
     order.products.forEach((item)=>{
      remainder+=1;
     })
     if(remainder>4)
     {
      remainder-=4
     }
     else if(remainder<4)
     {
      remainder=[];
     }
     const orderImg={
      images:images,
      remainder:remainder
     }

     res.json(orderImg);
  }
  catch(error)
  {
    res.status(500).json({message:error});
  }

})
/**
 * Change password from forgot password
 */
router.post('/change-password/:id', authenticate, getUser, async (req, res) => {

  try{
    if (res.user) {
      const password = req.body.pwd;
      console.log(password)
      const salt = await bcrypt.genSalt(10);
      const hashedPassword = await bcrypt.hash(password, salt);

      const updatedUser = await res.user.updateOne({ $set: { password: hashedPassword } });

      res.json(updatedUser);
  } else {
      res.status(400).json({ message: "Something went wrong" });
  }
  }
  catch(error)
  {
    res.status(400).json({message:error});
  }
});

/**
 * Change password from forgot password
 */
router.post('/change-password-auth/:id', authenticate, getUser, async (req, res) => {

  try{

    const isMatch = await bcrypt.compare(req.body.currentPwd, res.user.password);

    if(isMatch===false)
    {
        res.status(400).json({message:"Incorrect current password!"})
        return;
    }
    else if(isMatch && res.user) {
      const password = req.body.newPwd;
      console.log(password)
      const salt = await bcrypt.genSalt(10);
      const hashedPassword = await bcrypt.hash(password, salt);

      const updatedUser = await res.user.updateOne({ $set: { password: hashedPassword } });

      res.json(updatedUser);
  } else {
      res.status(400).json({ message: "Something went wrong" });
  }
  }
  catch(error)
  {
    res.status(400).json({message:error});
  }
});


// payments

/**
 *  initiate payment, create a payment link and redirect user to fapshi.com for payment processing
 */

router.post('/initiate-payment/:id/payfor/:oId', authenticate, getUser, async (req, res) => {
  
   const order=res.user.orders.find((order)=> order.id === req.params.oId)
   const isDefault= res.user.addresses.find((address) => address.isDefault === true);

  //  console.log(order)
  if(!order)
  {
    res.status(400).json({message:"Order not found!"})
    return
  }
   try{

      if(order.status=="purchased")
      {
        res.status(400).json({message:"You have already paid for this order!"})
        return
      }
      if(order.status!="confirmed")
      {
        res.status(400).json({message:"Order confirmation pending!"})
        return
      }
      if(parseInt(order.total_amount)<99)
        {
          res.status(400).json({message:"Order total too low"})
          return
        }
      if(res.user.addresses.length === 0) {
          res.status(400).json({message: "Please add a delivery address"});
          return;
      }
      if(res.user.payment_methods.length === 0)
      {
          res.status(400).json({message:"Please add a payment method"})
          return
      }
     
      order.delivery_details.street=isDefault.delivery_details.street
      order.delivery_details.city=isDefault.delivery_details.city
   
    const payment = {
      amount:parseInt(order.total_amount)+parseInt(0.04*parseInt(order.total_amount)),
      // email:userEmail,
      externalId:order.id,//orderID
      userId: res.user.id,
      redirectUrl: 'https://globalbuy24.com',
      message: 'GlobalBuy24 Order Payment',

      }
     const resp = await fapshi.initiatePay(payment)
    // const resp={link:"nothing"}
    //  console.log(resp.transId)

    // create new transaction
    const transaction=
    {
      _id: new mongoose.Types.ObjectId(),
      type:"Deposit",
      amount:parseInt(order.total_amount),
      status:"Pending",
      transId:resp.transId
    }
    res.user.transactions.push(transaction)
    const updatedUser=await res.user.save()
    
    res.json(resp)
    
   }
   catch(err)
   {
      res.status(400).json({message:err})
   }

 
})


// fapshi webhook

router.post('/fapshi-webhook', express.json(), async (req, res) => {
  // Get the transaction status from fapshi's API to be sure of its source
  const event = await fapshi.paymentStatus(req.body.transId);
  if(event.statusCode !== 200)
    return res.status(400).send({message: event.message});
  const user=await User.findById(event.userId)
  if(user===null)
  {
    return res.status(400).send({message:"User not found"});

  }
  var order=user.orders.find((order)=>order.id ==event.externalId)
  if(order===null)
    {
      return res.status(400).send({message:"Order not found"});
  
    }
  var transaction=user.transactions.find((trans)=> trans.transId==event.transId)
  console.log(transaction)
  // Handle the event
  switch (event.status) {
    case 'SUCCESSFUL':
      //  If payment was successful, update order status to purchased, update the transaction,notify user
      order.status="purchased"
      transaction.status="success"
      // notify user
      const newNotification={
        _id: new mongoose.Types.ObjectId(),
        type:"💳 Payment Confirmed",
        message:`We’ve received your payment of ${event.amount-(0.04*event.amount)}XAF successfully. We are now placing your order with the seller. You’ll be
          notified once the item arrives at our hub in Berlin.`,
        created_at:formatDateTime(new Date())
      }
      user.notifications.push(newNotification)

      const userUpdated1=await user.save()
      console.log(userUpdated1)
      console.log(event, 'successful');
      break;
    case 'FAILED':
      // If transaction failed, update transaction, notify user
      transaction.status="failed"
       // notify user
       const secondNewNotification={
        _id: new mongoose.Types.ObjectId(),
        type:"Payment Failed",
        message:`Your payment of ${event.amount-(0.04*event.amount)}XAF has failed`,
        created_at:formatDateTime(new Date())
      }
      user.notifications.push(secondNewNotification)
      const updatedUser=await user.save()
      break;
    case 'EXPIRED':
      transaction.status="failed"
      // notify user
      const thirdNewNotification={
       _id: new mongoose.Types.ObjectId(),
       type:"Payment Expired",
       message:`Your payment of ${event.amount-(0.04*event.amount)}XAF has expired`,
       created_at:formatDateTime(new Date())
     }
     user.notifications.push(thirdNewNotification)
     await user.save()
      break;
    // ... handle other event types
    default:
      console.log(`Unhandled event status: ${event.type}`);
  }

  // Return a 200 response to acknowledge receipt of the event
  res.send();
});

// Delete user account 
router.delete('/delete-account/:id', authenticate, getUser, async (req, res) => {
      
      var cantDeleteAccount=false
      res.user.orders.forEach((order)=>{
          if(order.status==="purchased")
          {
            cantDeleteAccount=true
            return
          }
      })

      if(cantDeleteAccount===true)
      {
        res.status(400).json({message:"You have (an) ongoing order(s), therefore your account cannot be deleted"})
        return
      }
      // Delete acount
      await User.findByIdAndDelete(req.params.id);

      res.json({message:"Account deleted"})


})



////////////////////////////////////////////////-----Functions-----/////////////////////////////////////////

/**
 * 
 * @param {*} req from user ,use the parameter called id , then search for a user with that id
 * @param {*} res 
 * @param {*} next since this is a middleware, the next passes everything in the middle to a function that uses it
 * @returns any errors encountered
 */
async function getUser(req,res,next)
{   let user
    try
    {
        user= await User.findById(req.params.id)
        if(user == null)
        {
            return res.status(404).json({message:'user not found'})
        }
    }
    catch(error)
    {
        return res.status(500).json({message:error.message})
    }
    res.user=user
    next()
}

/**
 * 
 * @returns a new random pin to users
 */
function newPin() {
    return Math.floor(Math.random() * 90000) + 10000; 
}

/**
 * 
 * @param {*} user takes a user ,considers the user's orders
 * @returns returns a unique order number
 */
async function newOrderNumber(userId) {
  const ordernum = Math.floor(Math.random() * 9000000) + 1000000;
  const user = await User.findById(userId);
  const orders = user.orders;
  let orderExist = 0;

  if (orders.length > 0) {
      orders.forEach((order) => {
          if (order.order_num === ordernum) {
              orderExist += 1;
          }
      });

      if (orderExist === 0) {
          return ordernum;
      } else {
          return newOrderNumber(userId);
      }
  } else {
      return ordernum;
  }
}

/**
 * 
 * @param {*} provider 
 * @returns a matching provider logo for each provider else it returns a default logo
 */
async function provLogo(provider) {
  
  const providerLower = provider.toLowerCase();
  
  
  const logoUrls = {
      mtn: 'https://seeklogo.com/images/M/mtn-logo-A285C69508-seeklogo.com.png',
      orange: 'https://seeklogo.com/images/O/orange-logo-A4FC5976DF-seeklogo.com.png',
      visa: 'https://seeklogo.com/images/V/VISA-logo-A32D589D31-seeklogo.com.png',
      master: 'https://seeklogo.com/images/M/Master_Card-logo-027CB51F96-seeklogo.com.png',
      americanexpress: 'https://seeklogo.com/images/A/american-express-logo-EDF87C04A0-seeklogo.com.png'
  };

  return logoUrls[providerLower] || 'https://seeklogo.com/images/D/dollar-logo-F5403A8DB9-seeklogo.com.png';
}

/**
 * 
 * @param {*} account_number 
 * @returns last 4 digits of the account number
 */

async function numEnd(account_number) {
  return new Promise((resolve, reject) => {
      
      const accountStr = String(account_number);
      const lastFourDigits = accountStr.slice(-4);

      resolve(lastFourDigits);
  });
}


 function orderExpiration(expires_date) {
    const expirationDate = new Date(expires_date);
    const currentDate = new Date();
    
    const timeDifference = expirationDate - currentDate;
    
    const dayDifference = Math.ceil(timeDifference / (1000 * 60 * 60 * 24));
    
    return dayDifference >= 0 ? `${dayDifference} days` : 'expired';
}

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


const formatDateTime = (date) => {
  let d;
  
  // Try to parse the input date
  try {
    d = new Date(date);
    // Check if the date is invalid
    if (isNaN(d.getTime())) {
      throw new Error('Invalid date');
    }
  } catch (e) {
    // Fall back to current date if parsing fails
    d = new Date();
  }

  // Format the date components
  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const year = String(d.getFullYear()).slice(-2);
  const hours = String(d.getHours()).padStart(2, '0');
  const minutes = String(d.getMinutes()).padStart(2, '0');

  return `${day}.${month}.${year} ${hours}:${minutes}`;
};

module.exports=router