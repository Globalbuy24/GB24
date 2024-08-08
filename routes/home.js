const express=require('express')
const router =express.Router()

router.get('/',async (req,res)=>{
    try
    {
        
        res.json("Welcome to GlobalBuy24")
    }
    catch(error)
    {
        res.status(500).json({message:error.message})
    }
})

module.exports=router