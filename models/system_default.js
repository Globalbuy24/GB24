const mongoose=require('mongoose')

const SystemDefault=new mongoose.Schema({
        delivery_fee:{air_freight:{type:String,default:"0.00"},sea_freight:{type:String,default:"0.00"}},
        loyalty_points:{referals:{type:String,default:"0.00"},purchase:{type:String,default:"0.00"}}
    })

module.exports=mongoose.model('system_defaults',SystemDefault)