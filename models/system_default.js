import mongoose from 'mongoose';

const SystemDefault=new mongoose.Schema({
        service_fee:{
            percentage:{type:String,default:"0.00"},
            maxValue:{type:String,default:"0.00"}
        },
        delivery_fee:{air_freight:{type:String,default:"0.00"},sea_freight:{type:String,default:"0.00"}},
        loyalty_points:{referals:{type:String,default:"0.00"},purchase:{type:String,default:"0.00"}},
        prohibited:{product:[{type:String}]}
    })

export default mongoose.model('system_defaults',SystemDefault);
