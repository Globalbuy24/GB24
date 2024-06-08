const express=require('express')
const router =express.Router()
const User=require('../models/user')
const authenticate=require('../middleware/currentUser')
const mongoose = require('mongoose');

//read all users
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
//read one user
router.get('/:id',authenticate,getUser,async(req,res)=>{
   res.json(res.user)
})
//update one user
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

//user pin auto update
router.patch('/:id/updatePin',authenticate,getUser,async(req,res)=>{
    res.user.pin = newPin();
    const updatedUser = await res.user.save()
    res.json(updatedUser)
 })


//read one user
router.get('/:id/pin',authenticate,getUser,async(req,res)=>{
    res.json(res.user.pin)
 })


 //user add address
 router.post('/:id/deliveryAddress', authenticate, getUser, async (req, res) => {
    
    const newAddress = {
      street: req.body.street,
      city: req.body.city,
      country: req.body.country ? req.body.country : 'Cameroon',
      _id: new mongoose.Types.ObjectId() 
    };
  
    
    try {
      
      res.user.addresses.push(newAddress);
      const updatedUser = await res.user.save();
      res.json(updatedUser);
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: 'Server error' });
    }
  });



//get all delivery addresses
router.get('/:id/deliveryAddress', authenticate, getUser, async (req, res) => {
    
    
    try {
      res.json(res.user.addresses);
    } catch (error) {
      console.error(error);
      res.status(500).json({message:error});
    }
  });

// get one delivery address for a particular user

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

//  update any existing field from the addresses
router.patch('/:id/deliveryAddress/:dId', authenticate, getUser, async (req, res) => {
    
    try {
        const addressId = req.params.dId;
       
        const addressToUpdate = res.user.addresses.find((address) => address.id === addressId);
      
        if (!addressToUpdate) {
         
          res.status(404).json({ error: 'Address not found' });
          return;
        }
      
        // Get the existing city value
        const oldCity = addressToUpdate.city;
        const oldStreet = addressToUpdate.street;
        const oldCountry = addressToUpdate.country;
        
        addressToUpdate.street = req.body.street||oldStreet;
        addressToUpdate.city = req.body.city || oldCity;
        addressToUpdate.country = req.body.country || oldCountry;
      
        
        const updatedUser = await res.user.save();
        res.json(updatedUser);
    } catch (error) {
      res.status(500).json({message:error});
    }
  });

//  delete individual addresses

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
function newPin() {
    return Math.floor(Math.random() * 90000) + 10000; 
}
module.exports=router