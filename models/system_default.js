import mongoose from 'mongoose';

const SystemDefault=new mongoose.Schema({
        service_fee:{
            percentage:{type:Number,default:"0.00"},
            maxValue:{type:Number,default:"0.00"}
        },
        delivery_fee:{air_freight:{type:Number,default:"0.00"},sea_freight:{type:Number,default:"0.00"}},
        loyalty_points:{referals:{type:Number,default:"0.00"},purchase:{type:Number,default:"0.00"}},
        prohibited:{product:[{type:String}]}
    })

export default mongoose.model('system_defaults',SystemDefault);
