
const mongoose=require('mongoose')
const bcrypt=require('bcrypt')

const UserSchema=new mongoose.Schema({
        token:{type:String},
        first_name:{
            type:String,
            required:true
        },
        last_name:{
            type:String,
            required:true
        },
        
            email:{
            type:String,
            required:false,
            sparse:true,
            validate: 
                {
                validator: function (value) {
                  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
                  return emailRegex.test(value);
                },
                message: 'Invalid email format'
              }
            
            },
        phone_number:{
            type:String,
            sparse:true,
            default:''
        },
        num_is_verified:{type:Boolean,default:false},
        email_is_verified:{type:Boolean,default:false}
        ,
        password:{
            type:String,
            required:true,
        },
        dob:{
            type:Date,
            required:true
        },

        pin:{
            type:Number,
            default:function () {
                return Math.floor(Math.random() * 90000) + 10000; 
              }
        },
        is_verified:{type:Boolean,default:false},
        loyalty_points:{
            type:Number,
            default:0
        },
        referal_code:{type:String},
        addresses: [
            {
              _id: { type: mongoose.Schema.Types.ObjectId, default: mongoose.Types.ObjectId },
              street: { type: String },
              city: { type: String },
              country: { type: String}
            }
        ],
        settings:{
            notification_types:[{type:String,default:'all'}],
            language:{type:String},
            theme:{type:String,default:'light'}
        },
        orders:{
            id:{type:Number},
            delivery_details:
            {
                street: { type: String },
                city: { type: String },
                country: { type: String}
            },
            delivery_method:
            {
                name:{type:String},
                charge_per_product:{type:Number}
            },
            products:
            {
                url:{type:String},
                name:{type:String},
                colour:{type:String},
                length:{type:Number},
                width:{type:Number},
                height:{type:Number},
                price:{type:Number},
            },
            total_charge:{type:String}

        },

        payment_methods:[{type:String}],
        notifications:{
            type:{type:String},
            message:{type:String},
            created_at:{type:Date}
        }
})

UserSchema.pre('save',async function(next){
    if(this.isModified('password'))
    {
        try
        {
            const salt=await bcrypt.genSalt(10)
            const hashedPassword=await bcrypt.hash(this.password,salt)
            this.password=hashedPassword
        }
        catch(error)
        {
            return next({statusCode:400,message:error})
        }
    }
    if(!this.email && !this.phone_number)
    {
        const error = new Error('At least one of email or phone number is required');
        return next(error);
    }
     
    next();
})

module.exports=mongoose.model('users',UserSchema)