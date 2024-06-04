const express=require('express')
const router =express.Router()
const User=require('../models/user')


//read all users
router.get('/',async (req,res)=>{
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
router.get('/:id',getUser,(req,res)=>{
   res.json(res.user)
})
//update one user
router.patch('/:id',getUser,async(req,res)=>{
    if(req.body.phone_number !=null)
    {
        res.user.phone_number.number=req.body.phone_number
        res.user.phone_number.is_verified=false
    }
    if(req.body.email !=null)
    {
        res.user.email.email=req.body.email
        res.user.email.is_verified=false
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
router.delete('/:id',getUser,async (req,res)=>{
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
module.exports=router