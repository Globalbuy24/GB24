import express from 'express';
const router = express.Router();
import User from '../models/user.js';
import bcrypt from 'bcrypt';
import Admin from '../models/admin.js';
import authenticate from '../middleware/currentUser.js';
import mongoose from 'mongoose';
import mailer from '../middleware/mailer.js';
import pkg from 'follow-redirects';
const { https } = pkg;
import fs from 'fs';
import user from '../models/user.js';
import fapshi from './payments/fapshi.js';
import axios from 'axios';
import translate from '../middleware/translator.js';


import { format } from 'date-fns';

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
   

   const html=messageTemplateForOTP(temp_code, res.user.settings.language)

   await mailer.sendMail({
     from:'no-reply@globalbuy24.com',
     to:res.user.email,
     subject:translate('Verification code', res.user.settings.language),
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
    await res.user.updateOne({$set:{temp:{code:temp_code,created_at: new Date()}}})
    
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
      const userLanguage = res.user.settings.language;
      const translatedNotifications = res.user.notifications.map(notification => {
          let replacements = {};
          let notificationTitle = notification.type || ''; // Set title to notification type
          let notificationMessage = notification.message || '';
          return {
              ...notification.toObject(),
              title: translate(notificationTitle, userLanguage, replacements),
              message: translate(notificationMessage, userLanguage, replacements)
          };
      });
      res.json(translatedNotifications);
  } catch (error) {
      console.error("Error in /:id/notifications:", error); // Log the full error
      res.status(500).json({ message: error.message }); // Send error message
  }
});

/**
* Get all user notifications for a particular user id
*/
router.get('/:id/all-notifications', authenticate, getUser, async (req, res) => {
  try {
      const userLanguage = res.user.settings.language;
      const translatedNotifications = res.user.notifications.map(notification => {
          let replacements = {};
          let notificationTitle = notification.type || ''; // Set title to notification type
          let notificationMessage = notification.message || '';
          return {
              ...notification.toObject(),
              title: translate(notificationTitle, userLanguage, replacements),
              message: translate(notificationMessage, userLanguage, replacements)
          };
      });
      res.json(translatedNotifications);
  } catch (error) {
      console.error("Error in /:id/all-notifications:", error); // Log the full error
      res.status(500).json({ message: error.message }); // Send error message
  }
});

/**
* Get all unread user notifications for a particular user id
*/
router.get('/:id/unread-notifications', authenticate, getUser, async (req, res) => {
  try {
      const userLanguage = res.user.settings.language;
      const unreadNotifications = res.user.notifications.filter(notification => notification.status === 'unread').map(notification => {
          let replacements = {};
          let notificationTitle = notification.type || ''; // Set title to notification type
          let notificationMessage = notification.message || '';
          return {
              ...notification.toObject(),
              title: translate(notificationTitle, userLanguage, replacements),
              message: translate(notificationMessage, userLanguage, replacements)
          };
      });
      res.json(unreadNotifications);
  } catch (error) {
      console.error("Error in /:id/unread-notifications:", error); // Log the full error
      res.status(500).json({ message: error.message }); // Send error message
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
    title:req.body.title,
    message:req.body.message,
    icon:req.body.icon,
    link:req.body.link,
    created_at:new Date()
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
 * mark user notification as read
 */
router.patch('/:id/notifications/:nId', authenticate, getUser, async (req, res) => {
 
  try {
     
     const notificationId = req.params.nId;
       
     const notificationToUpdate = res.user.notifications.find((notification) => notification.id === notificationId);
     if(!notificationToUpdate)
     {
         res.status(404).json({ error: 'Notification not found' });
         return;
     }
     notificationToUpdate.status = 'read';

     const updatedUser = await res.user.save();
     res.json(updatedUser);
  }
  catch(error)
  {
    res.status(500).json({message:error});
  }

})

/**
 * delete all user notifications
 */
router.delete('/:id/notifications', authenticate, getUser, async (req, res) => {
 
  try {
     
     res.user.notifications = [];

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
  console.log('Received provider from client:', provider);
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

    const createdAt = new Date();

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
    const userLanguage = res.user.settings.language;

    const basketCreatedNotification = {
      _id: new mongoose.Types.ObjectId(),
      type: translate('Basket Created', userLanguage),
      message: translate('Your basket has been created successfully', userLanguage),
      created_at: new Date()
    };

    const basketCreatedByUserNotification = {
      _id: new mongoose.Types.ObjectId(),
      type: translate('Basket Created', userLanguage),
      message: translate('A new order has been created', userLanguage),
      created_at: new Date()
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

      const userBasket = res.user.basket;
      res.json(userBasket);
     }
     catch(error)
     {
       res.status(400).json({message:error.message})
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
    
      const createdAt = new Date(); 
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

    const userLanguage = res.user.settings.language;

    const newOrderNotification = {
      _id: new mongoose.Types.ObjectId(),
      type: translate('✅ Order Received', userLanguage),
      message: translate('Thank you for placing your order with GlobalBuy24. We’ve received your request and are now verifying the product details. We’ll notify you once we place the order.', userLanguage),
      created_at:new Date()
    };
    const newOrderNotification2 = {
      _id: new mongoose.Types.ObjectId(),
      type: translate('🔍 Order Under Review', userLanguage),
      message: translate('Our team is reviewing your product link(s) to confirm availability, price, shipping, and size/variant information. We’ll send you a quote shortly.', userLanguage),
      created_at:new Date()
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
   const userOrder=res.user.orders.filter((order)=>order.status!=="refunded" && order.status!=="purchased")
  
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

   const userOrder=res.user.orders.filter((order)=>order.status==="pending")
  
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

   const userOrder=res.user.orders.filter((order)=>order.status==="refunded")
  
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

  const userOrder=res.user.orders.filter((order)=>order.status==="confirmed")
  
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

   const userOrder=res.user.orders.filter((order)=>order.status==="purchased")
  
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

   const userOrder=res.user.orders.filter((order)=>order.status==="purchased" && order.isDelivered===false)
  
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

   const userOrder=res.user.orders.filter((order)=>order.status==="purchased" && order.isDelivered===true)
  
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

    const orders = user.orders.filter((order) => order.status === "purchased");

    // Perform aggregation on the orders array
    const groupedPurchases = orders.reduce((acc, order) => {
      // ✅ Defensive check
      const purchaseDate = order.purchase_date
        ? new Date(order.purchase_date).toISOString().split('T')[0]
        : "Unknown Date"; 

      if (!acc[purchaseDate]) {
        acc[purchaseDate] = {
          purchaseDate,
          totalAmount: 0,
          orders: []
        };
      }

      acc[purchaseDate].totalAmount += parseFloat(order.total_amount || 0);
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
      console.log(hashedPassword)
      await res.user.updateOne({ $set: { password: hashedPassword } });
      const updatedUser = await User.findById(res.user.id);
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
     console.log(isDefault)
      order.delivery_details.street=isDefault.street
      order.delivery_details.city=isDefault.city
     
    const payment = {
      amount:parseInt(order.total_amount)+parseInt(0.031*parseInt(order.total_amount)),
      // email:userEmail,
      externalId:order.id,//orderID
      userId: res.user.id,
      redirectUrl: 'https://globalbuy24.com',
      message: 'GlobalBuy24 Order Payment',

      }
     const resp = await fapshi.initiatePay(payment)
     console.log(resp)
    // const resp={link:"nothing"}
    //  console.log(resp.transId)

    // create new transaction
    // return 1
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
   catch(err) {
  res.status(400).json({message: err.message || "Something went wrong"})
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
  const userLanguage = user.settings.language; // Declare userLanguage once here
  // Handle the event
  switch (event.status) {
    case 'SUCCESSFUL':
      //  If payment was successful, update order status to purchased, update the transaction,notify user
      order.status="purchased"
      transaction.status="success"
      order.purchase_date=new Date()
      // notify user
      const newNotification={
        _id: new mongoose.Types.ObjectId(),
        type: translate("💳 Payment Confirmed", userLanguage),
        message: translate("We’ve received your payment of {amount}XAF successfully. We are now placing your order with the seller. You’ll be notified once the item arrives at our hub in Berlin.", userLanguage, { amount: event.amount - (0.031 * event.amount) }),
        created_at:new Date()
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
        type: translate("Payment Failed", userLanguage),
        message: translate("Your payment of {amount}XAF has failed", userLanguage, { amount: event.amount - (0.031 * event.amount) }),
        created_at:new Date()
      }
      user.notifications.push(secondNewNotification)
      const updatedUser=await user.save()
      break;
    case 'EXPIRED':
      transaction.status="failed"
      // notify user
      const thirdNewNotification={
       _id: new mongoose.Types.ObjectId(),
       type: translate("Payment Expired", userLanguage),
       message: translate("Your payment of {amount}XAF has expired", userLanguage, { amount: event.amount - (0.031 * event.amount) }),
       created_at:new Date()
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


// Chatbot

router.post('/chatbot/:id', getUser, authenticate, async (req, res) => {
    try {
        const { message } = req.body;

        if (!message) {
            return res.status(400).json({ error: 'Message is required' });
        }

        const last10Chats = res.user.chats
            .slice(Math.max(res.user.chats.length - 5, 0))
            .flatMap(chat => [
                { role: 'user', content: chat.user_message },
                { role: 'assistant', content: chat.bot_response }
            ]);

        console.log(last10Chats);

        // Using OpenAI GPT-5 Nano model
        const response = await fetch("https://api.openai.com/v1/chat/completions", {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${process.env.OPEN_AI_KEY}`, // Replace with your OpenAI API key
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                model: "gpt-5-nano",
                  "messages": [
                    
                  { role: 'assistant', content: `Your name is GlobalBuy(GB24) AI assitant or GB24 AI assitant for short, and you help with customer support and product recommendation on GB24 platform.  
                    When you recomend a Company, you should include the company name, a brief description, and a link to their website or product page.
                    Always be very direct and use simple terms any user can understand.
                    Use emojis when necessary, to improve anthropormorphism.
                    Always respond with the current language the user's message is in(Do not add any strange language for any reason).
                    Keep your response within GB24 and E-commerce related topics(at all times,do not go against this)

                    This is everthing about the current user
                    First Name: ${res.user.first_name},
                    Last Name: ${res.user.last_name},
                    Referal code: ${res.user.referal_code},
                    Basket/Cart: ${res.user.basket},
                    Items saved for later: ${res.user.saved},
                    Orders: ${res.user.orders}
                    Addresses: ${res.user.addresses}
                    Payment Methods: ${res.user.payment_methods}

                    Here is the last 10 chats to help you retain context and information from previous steps, it is made up of user messages and bot responses(assistant);thats you,:${JSON.stringify(last10Chats)}

                    Here are some frequently asked questions: [
                {
                  question: 'What is GlobalBuy24 (GB24)?',
                  answer: 'GlobalBuy24 (GB24) is a shopping platform that allows users in Africa, starting with Cameroon, to order products from international online stores. We manage the order, payment, inspection upon arrival, and shipping—delivering global products to your local pickup point.',
                },
                {
                  question: 'How does GB24 work?',
                  answer:'1. Find a product on any global online store.
                        \n2. Paste the product link into the GB24 app.
                          \n3. Receive a full quote for purchase and delivery.
                          \n4. Confirm and pay.
                          \n5. We order the product and receive it at our warehouse (In Germany). We check that the item is in good condition (not damaged, not opened) upon arrival.If the item is damaged, we may return it to the merchant. This may cause delivery delays.
                          \n6. If the product is in good state, we continue with shipment to Cameroon.
                          \n7. You collect the item when it arrives.'
                    },
                    {
                      question: 'Which countries or stores can I buy from?',
                      answer: 'At GlobalBuy24, your shopping choices know no limits! You have the flexibility to shop from virtually any international online store worldwide, whether it\'s a major retailer or a niche boutique. Our goal is to empower you to explore a vast array of products, from countries and sites that might not typically ship to your region.However, please be aware that GlobalBuy24 does not take responsibility for verifying the credibility or legitimacy of third-party online stores. You, the user, have full control and choice over where you decide to shop',
                    },
                    {
                      question: 'Where is GB24 available?',
                      answer: 'We currently operate in Cameroon, with plans to expand to other African countries soon.',
                    },
                    {
                      question: 'How do I get a quote?',
                      answer: 'Paste the product link into the GB24 app. We’ll generate a quote including item cost, shipping, customs, and handling.',
                    },
                    {
                      question: 'How do I pay?',
                      answer: 'Payments can be made securely via mobile money (MTN MoMo, Orange Money) or bank transfer.',
                    },
                    {
                      question: 'How long does delivery take?',
                      answer: 'Standard delivery takes 10–21 working days.If the product arrives damaged and must be returned to the store, delivery may take longer.',
                    },
                    {
                      question: 'Can I track my order?',
                      answer: 'Yes. You’ll receive status updates within the app throughout the process.',
                    },
                    {
                      question: 'Can I cancel or return an order?',
                      answer: 'Cancellations depend on the store’s policy. Once your item has shipped, cancellation is not possible. Contact support quickly if needed.',
                    },
                    {
                      question: 'What happens if the item is damaged?',
                      answer: 'We inspect every item when it arrives at our facility. If a product is broken, visibly opened, or not in good condition, we may return it to the original store.If an item is accepted but still has an issue, contact our support team within 24 hours of pickup.',
                    },
                    {
                      question: 'Where do I collect my product?',
                      answer: 'Cancellations depend on the store’s policy. Once your item has shipped, cancellation is not possible. Contact support quickly if needed.',
                    },
                    { 
                      question:'how do I add to cart',
                      answer:'To add to cart you can either go to an external browser like chrome ,etc ,and search for a product from companies like Amazon ,ebay and so on, then copy the product link and come to the cart section of the app, add to cart by pasting in the link you copied. Or you can go to the home
                      screen,the featured shops and select a shop from there , and you will see the add to cart button at the left of your screen , click on it to automatically add the product to cart'
                    }


                  ];
                  Users can only use the mobile app to be able to shop on GB24 platform.
                  This is a full description of our app, so you get more context of every single screen that exist, or atleast the most important ones

                  Authentication Screens:{
                          1.Login: Involves a tap which users can click to login. with email or phon number(country code + number),then two input fields (1 for credentials[email,phone number], the other for password) then a sign up button , then under that we forgot password ,which takes users to a screen which can help them change their passwords and all
                          2.Sign up: the initial screen is the login , and from there, users can click signup, when they do they are taken to a screen called create account, and this screen as a button sheet which shows:sign up with email, phone number , google or facebook ,and the users can use those to create their information
                          2.Verify Account:After sign up if a user is not yet verified , they'll be sent a 6 digit code which they can use to verify their account , they also have the liberty of skipping but when they later login , they'll be asked again to verify their account, If a user's account isnt't verified , they cannot place an order on the platform

                  },
                  Bottom nav bar :{
                   We have a bottom navigation bar that allows users to easily navigate between different sections of the app. The bar includes icons for Home, Purchases, Cart, and Profile.
                  }
                  Home Screen: The home screen a header and on the left side of the header ,there is a greeting (based on the time of the day ,eg:Good Morning), the left side has a notification icon and a help icon (leads to help screen ,which contains FAQs, chat with us , chat wiht chatbot and all that), then under that we have a carousel of images ,under that we have a
                  dashboard, showing users total orders,pending ,loyalty points , under that , we have a featured shops sections , under that we have recommended products section, under that we have refurbished and preowned section.
                  Purchases screen: We have the purchases section, which shows users their past orders, order details, and the status of each order. Users can also initiate returns or exchanges from this screen.
                  Cart Screen: The cart screen displays all items added to the cart, along with their quantities. Users can update quantities or remove items before proceeding to placing a order. At the top of the screen (the header, we have a save for later , which shows the list of all items which have been saved for later), to add , each cart item has the option of saving for later as well
                    The cart screen has a little hidden gem: The button of the cart screen has a place order floating button , and to its left it has a button which has order counts , it leaders users to a screen for their incompleted orders as the screen is called, this screen holds incompleted or not yet purchased orders(The incomplete order screen shows pending orders as well as confirmed orders[Orders which has been reviewed by us and accpeted.])
                   When orders are confirmed , users can then see a proceed to checkout button from the confirmed orders , they can then proceed to payment.On the checkout page the users can see a summary of their orders and if they do not have a payment method set already or delivery address, they'll be tasked to add one.When they have they see an optionto complete payemnt in-app(uses a webview) or on an external browser
                  Profile Screen: The profile screen allows users to view and edit their personal information, manage addresses,payments, change their preferred languages,themes, view privacy policies,delete account and logo out.

                  ===>Our official website:https://globalbuy24.com

                  THings you cannot do{
                  
                    You cannot add Items directly to the backend
                    You cannot bypass the authentication process
                    You cannot access other users' data
                    You cannot modify system settings
                    You cannot delete system files
                    You cannot access the admin panel
                    You cannot use system commands
                    You cannot place orders for users
                    You cannot delete user's others
                    You cannot change user's order status
                    You cannot add to cart for users
                    You cannot track orders in real time.
                    
                  }
                  ` },
                  {
                        "role": "user",
                        "content": message
                    },
                ]
            })
        });

        if (!response.ok) {
            throw new Error(`OpenAI API error: ${response.status} ${response.statusText}`);
        }

        const data = await response.json();
        const botResponse = data.choices[0].message.content;

        res.user.chats.push({
            user_message: message,
            bot_response: botResponse,
            timestamp: new Date()
        });
        await res.user.save();

        res.json(botResponse);

    } catch (error) {
        console.error('Error:', error);
        res.status(500).json({ error: error.message });
    }
});


/**
 * Get all user chats
 */
router.get('/chatbot/:id', getUser,authenticate, async (req, res) => {
    try {
        res.json(res.user.chats);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

/**
 * Delete all user chats
 */
router.delete('/chatbot/:id', getUser,authenticate, async (req, res) => {
    try {
        res.user.chats = [];
        await res.user.save();
        res.json({ message: 'All chats deleted successfully' });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
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

/**
 * Set user's preferred language
 */
router.patch('/:id/language', authenticate, getUser, async (req, res) => {
  try {
    console.log(req.body)
    const { language } = req.body;

    if (!language) {
      return res.status(400).json({ message: 'Language is required.' });
    }

    if (language !== 'en' && language !== 'fr') {
      return res.status(400).json({ message: 'Invalid language. Must be "en" or "fr".' });
    }

    res.user.settings.language = language;
    const updatedUser = await res.user.save();
    res.json(updatedUser);
  } catch (error) {
    console.error('Error setting language:', error);
    res.status(500).json({ message: 'Internal server error.' });
  }
});


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

  if (providerLower.includes('mtn')) {
    return 'https://seeklogo.com/images/M/mtn-logo-A285C69508-seeklogo.com.png';
  }
  if (providerLower.includes('orange')) {
    return 'https://seeklogo.com/images/O/orange-logo-A4FC5976DF-seeklogo.com.png';
  }
  if (providerLower.includes('visa')) {
    return 'https://seeklogo.com/images/V/VISA-logo-A32D589D31-seeklogo.com.png';
  }
  if (providerLower.includes('master')) {
    return 'https://seeklogo.com/images/M/Master_Card-logo-027CB51F96-seeklogo.com.png';
  }
  if (providerLower.includes('american')) {
    return 'https://seeklogo.com/images/A/american-express-logo-EDF87C04A0-seeklogo.com.png';
  }

  return 'https://seeklogo.com/images/D/dollar-logo-F5403A8DB9-seeklogo.com.png';
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



function messageTemplateForOTP(otp, language)
{
  const translatedTitle = translate('Verification code', language);
  const translatedHello = translate('Hello', language);
  const translatedMessage = translate('Your verification code is: {otp}', language, { otp: otp });
  const translatedValidity = translate('This OTP is valid for 5 minutes. Please do not share this code with anyone.', language);
  const translatedIgnore = translate('If you didn\'t request this code, please ignore this email.', language);
  const translatedThanks = translate('Thank you for using our service!', language);
  const translatedFooter = translate('All rights reserved.', language);


  return `
  <!DOCTYPE html>
<html lang="${language}">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <title>${translatedTitle}</title>
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
      <h1>${translatedTitle}</h1>
    </div>
    <div class="content">
      <p>${translatedHello},</p>
      <p>${translatedMessage}</p>
      <div class="otp-box">
        <p>${otp}</p> <!--Add OTP here-->
      </div>
      <p>${translatedValidity}</p>
      <p>${translatedIgnore}</p>
      <p>${translatedThanks}</p>
    </div>
    <div class="footer">
      &copy; 2025 GlobalBuy24 (GB24). ${translatedFooter}
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

export default router;
