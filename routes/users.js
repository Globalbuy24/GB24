const express=require('express')
const router =express.Router()
const User=require('../models/user')
const Admin=require('../models/admin')
const authenticate=require('../middleware/currentUser')
const mongoose = require('mongoose');
const mailer=require('../middleware/mailer')
const https = require('follow-redirects').https;
const fs = require('fs');
const user = require('../models/user')

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

    return Math.abs(diffInMinutes) < 2;
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
})

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
   

    const html=`
    <p> Your verification code is : <strong>${temp_code} </strong></p>
   `
   await mailer.sendMail({
     from:'noreply@globalbuy24.com',
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
    await res.user.updateOne({$set:{temp:{code:temp_code,created_at:new Date()}}})

      
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
                "destinations": [{"to":res.user.phone_number}],
                "from": "GlobalBuy24",
                "text": "Your verification code is: "+temp_code
            }
        ]
    });
    
    sms.write(postData);
    
    sms.end();

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
    const oldDefault = addressToUpdate.isDefault;

    // Update address fields with new values or retain old ones
    addressToUpdate.street = req.body.street || oldStreet;
    addressToUpdate.city = req.body.city || oldCity;
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
        if(!addressToDelete)
        {
            res.status(404).json({ error: 'Address not found' });
            return;
        }
        addressToDelete.deleteOne()

        const updatedUser = await res.user.save();
        res.json(updatedUser);
    } catch (error) {
      res.status(500).json({message:error});
    }
  });



/**
 * get user notification for a particular user id
 */
router.get('/:id/notifications', authenticate, getUser, async (req, res) => {
  try {
    res.json(res.user.notifications)
  }
  catch(error)
  {
    res.status(500).json({message:error});
  }

})

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
 * get card payment address
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
 * get mobile payment addresses
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
  console.log(req.body);
  var  userUrlExist=false

  if(!req.body.orderURL)
  {
     res.status(400).json({message:"No Order Url available"});
  }
  
  var domain = req.body.orderURL.match(/(?:https?:\/\/)?(?:www\.)?(.*?)?(?:.com)?\//)[1];
  const source=domain.charAt(0).toUpperCase()+domain.slice(1)
  
  const newBasket={
    _id: new mongoose.Types.ObjectId(),
    delivery_method:{name:'Air Freight'},
     product:{
      url: new URL(req.body.orderURL),
      source:source,
      quantity:req.body.quantity,
      created_at:new Date(),
     }
  }
 
  try {
    /**
     * 
     * @param {*} url 
     * @param {*} url2 
     * @returns true if url and url2 are the same
     */

    function urlsMatch(url, url2) {
      const parsedUrl1 = new URL(url);
      const parsedUrl2 = new URL(url2);
    
      // Compare origin (protocol, hostname, port)
      return (
        parsedUrl1.origin === parsedUrl2.origin &&
        parsedUrl1.pathname === parsedUrl2.pathname &&
        parsedUrl1.search === parsedUrl2.search
      );
    }
    
   await res.user.basket.forEach((basketItem) => {
    const url=basketItem.product.url||"https://www.gb24.com"
        //console.log(url)
        /**
         * check is the url sent by the user already exists in the system
         */
            if (urlsMatch(req.body.orderURL, url)) {
              userUrlExist=true
              //res.status(400).json({message:"A basket exists with that url"});
            }
    });

 /**
  * if url doesnt exist, then the new url is added to the system
  */
   if(!userUrlExist)
    {
      /**
       * @typedef {Object} basketCreatedNotification
       * @typedef {Object} basketCreatedByUserNotification
       * @property {String} _id
       * @property {String} type
       * @property {String} message
       * @property {String} created_at
       */
      const basketCreatedNotification = {
        _id: new mongoose.Types.ObjectId(),
        type: 'basketCreated',
        message: ` Your basket has been created successfully`,
        created_at:new Date()
      };
      const basketCreatedByUserNotification = {
        _id: new mongoose.Types.ObjectId(),
        type: 'basketCreated',
        message: ` A new order has been created`,
        created_at:new Date()
      };
      res.user.notifications.push(basketCreatedNotification)
      res.user.basket.push(newBasket)
      const updatedUser=await res.user.save()

     /**
      *  alert all type1 admins of new basket created
      */
      const admins=await Admin.find({})
      admins.forEach((admin)=>{
          if(admin.type=="type1")
            {
              admin.notifications.push(basketCreatedByUserNotification)
              admin.save()
            }
      })
      res.json(updatedUser)
    }
    else{
      res.status(400).json({message:"A basket exists with that url"});
    }
    
    }
  catch(error)
  {
    res.status(500).json({message:error});
  }

})



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
 * Complete order by user
 */
router.post('/:id/newOrder',authenticate,getUser,async(req,res)=>{
     
 
     const orderNumber=await newOrderNumber(res.user.id)
   
    const newOrder={
    _id: new mongoose.Types.ObjectId(),
    order_num:orderNumber,
    delivery_details:req.body.delivery_details,
    delivery_method:req.body.delivery_method,
    products:req.body.products,
    total_charge:req.body.total_charge,
    created_at:new Date()
    }
    const newOrderNotification = {
      _id: new mongoose.Types.ObjectId(),
      type: 'newOrder',
      message: ` Your order has been placed successfully`,
      created_at:new Date()
    };
    
     try{
         res.user.notifications.push(newOrderNotification)
          await res.user.orders.push(newOrder)
          const updatedUser= await res.user.save()
          res.status(201).json(updatedUser)
     }
     catch(error)
     {
       res.status(400).json({message:error})
     }
})







////////////////////////////////////////////////

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

module.exports=router