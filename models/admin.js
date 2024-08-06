const mongoose=require('mongoose')
const bcrypt=require('bcrypt')

const AdminSchema=new mongoose.Schema({
    token:{type:String},
    first_name:{
        type:String,
        required:true
    },
    last_name:{
        type:String,
        required:true
    },
    type:{
        type:String
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
    notifications:[{
        _id: { type: mongoose.Schema.Types.ObjectId, default: mongoose.Types.ObjectId },
        type:{type:String},
        message:{type:String},
        created_at:{type:Date}
    }]
});


AdminSchema.pre('save',async function(next){
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

module.exports=mongoose.model('admins',AdminSchema)