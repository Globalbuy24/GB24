
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
            is_verified:{type:Boolean,default:false}
        },
        phone_number:{
            number:{
            type:String,
            default:''},
            is_verified:{type:Boolean,default:false}
        },
        password:{
            type:String,
            required:true,
            unique:true
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
        address:{
                street: { type: String },
                city: { type: String },
                country: { type: String ,default:'Cameroon'}
        },
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
    if(this.email !=null || this.phone_number!=null)
    {
        
        this.constructor.find(
            {
              $or: [
                { email: this.email },
                { phone_number: this.phone_number }
              ]
            }
          )
          .then(users => {
            if (users.length > 0) {
              if (users.some(user => user.email === this.email)) {
                const error = new Error('Email already exists');
                return next(error);
              }
          
              if (users.some(user => user.phone_number === this.phone_number)) {
                const error = new Error('Phone number already exists');
                return next(error);
              }
            }
          
            
          })
          .catch(error => {
            return next(error);
          });
    }
                
    next();
})

module.exports=mongoose.model('users',UserSchema)