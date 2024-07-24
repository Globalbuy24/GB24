
const mongoose=require('mongoose')
const bcrypt=require('bcrypt')

const UserSchema=new mongoose.Schema({
        token:{type:String},
        googleId:{type:String},
        facebookId:{type:String},
        provider:{type:String},
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
        prefered_notification:{type:String},
        temp_code:{type:String},
        num_is_verified:{type:Boolean,default:false},
        email_is_verified:{type:Boolean,default:false}
        ,
        password:{
            type:String,
            
        },
        dob:{
            type:Date,
            
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
        referred_by:{type:String},
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

        basket:[{
            _id: { type: mongoose.Schema.Types.ObjectId, default: mongoose.Types.ObjectId },
            delivery_method:
            {
                name:{type:String},
                delivery_fee:{type:String,default:"0.00"}
            },
            product:
            {
                url:{type:String},
                source:{type:String},
                name:{type:String},
                colour:{type:String},
                length:{type:String},
                width:{type:String},
                weight:{type:String},
                height:{type:String},
                price:{type:String},
                quantity:{type:String},
                created_at:{type:Date},
                updated_at:{type:Date},
            },
            
        }],

        orders:[{
            _id: { type: mongoose.Schema.Types.ObjectId, default: mongoose.Types.ObjectId },
            delivery_details:
            {
                street: { type: String },
                city: { type: String },
                country: { type: String}
            },
            delivery_method:
            {
                name:{type:String},
                delivery_fee:{type:String}
            },
            products:
            [{
                url:{type:String},
                source:{type:String},
                name:{type:String},
                colour:{type:String},
                length:{type:String},
                width:{type:String},
                weight:{type:String},
                height:{type:String},
                price:{type:String},
            }],
            total_amount:{type:String},
            created_at:{type:Date}
        }],

        payment_methods:[{type:String}],
        notifications:[{
            _id: { type: mongoose.Schema.Types.ObjectId, default: mongoose.Types.ObjectId },
            type:{type:String},
            message:{type:String},
            created_at:{type:Date}
        }]
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