const mongoose=require('mongoose')

const SystemDefault=new mongoose.Schema({
        service_fee:{type:String,default:"0.00"},
        delivery_fee:{air_freight:{type:String,default:"0.00"},sea_freight:{type:String,default:"0.00"}},
        loyalty_points:{referals:{type:String,default:"0.00"},purchase:{type:String,default:"0.00"}},
        prohibited:{product:[{type:String}]}
    })

module.exports=mongoose.model('system_defaults',SystemDefault)