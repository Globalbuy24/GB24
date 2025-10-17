import mongoose from 'mongoose';
import bcrypt from 'bcrypt';


const UserSchema = new mongoose.Schema({
    token: { type: String },
    image: { type: String },
    googleId: { type: String },
    facebookId: { type: String },
    provider: { type: String },
    first_name: {
        type: String,
        required: true
    },
    last_name: {
        type: String,
        required: true
    },
    email: {
        type: String,
        required: false,
        sparse: true,
        validate: {
            validator: function (value) {
                const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
                return emailRegex.test(value);
            },
            message: 'Invalid email format'
        }
    },
    phone_number: {
        type: String,
        sparse: true,
        default: ''
    },
    prefered_notification: { type: String },
    temp: { code: { type: String }, created_at: {type: Date } },
    num_is_verified: { type: Boolean, default: false },
    email_is_verified: { type: Boolean, default: false },
    password: {
        type: String,
        unique: false,
        maxlength: 120
    },
    dob: {type: String },
    pin: {
        type: Number,
        default: function () {
            return Math.floor(Math.random() * 90000) + 10000;
        }
    },
    is_verified: { type: Boolean, default: false },
    has_onboarded: { type: Boolean, default: false },
    loyalty_points: {
        type: Number,
        default: 0
    },
    referal_code: { type: String },
    referred_by: { type: String },
    addresses: [{
        _id: { type: mongoose.Schema.Types.ObjectId, default: mongoose.Types.ObjectId },
        street: { type: String },
        city: { type: String },
        num: { type: String },
        country: { type: String },
        isDefault: { type: Boolean, default: false }
    }],
    settings: {
        notification_types: [{ type: String, default: 'all' }],
        language: { type: String, default: 'en' },
        theme: { type: String, default: 'light' }
    },
    saved: [{
        _id: { type: mongoose.Schema.Types.ObjectId, default: mongoose.Types.ObjectId },
        url: { type: String },
        source: { type: String }
    }],
    basket: [{
        _id: { type: mongoose.Schema.Types.ObjectId, default: mongoose.Types.ObjectId },
        delivery_method: {
            name: { type: String },
            delivery_fee: { type: String, default: "0.00" }
        },
        product: {
            url: { type: String },
            message: { type: String , default: "No message" },
            source: { type: String },
            name: { type: String },
            colour: { type: String },
            length: { type: String },
            width: { type: String },
            weight: { type: String },
            height: { type: String },
            price: { type: String },
            quantity: { type: Number },
            created_at: { type: String },
            updated_at: {type: String },
        },
    }],
    orders: [{
        _id: { type: mongoose.Schema.Types.ObjectId, default: mongoose.Types.ObjectId },
        order_num: { type: String },
        pin: { type: String },
        delivery_details: {
            street: { type: String },
            city: { type: String },
            country: { type: String }
        },
        delivery_method: {
            name: { type: String },
            delivery_fee: { type: String }
        },
        products: [{
            url: { type: String },
            message: { type: String, default: "No message" },
            source: { type: String },
            name: { type: String, default: "Globalbuy" },
            colour: { type: String },
            length: { type: String, default: "0" },
            width: { type: String, default: "0" },
            quantity: { type: Number },
            weight: { type: String, default: "0" },
            height: { type: String, default: "0" },
            price: { type: String, default: "0.00" },
            delivery_time: { type: String, default: "2 weeks" },
            canResize: { type: Boolean, default: false },
            canRecolour: { type: Boolean, default: false },
            isRejected: { type: Boolean, default: false },
            extra_cost: { type: String, default: "0.00" },
            img: { type: String, default: "https://seeklogo.com/images/S/shopping-cart-logo-FDD62BF737-seeklogo.com.png" }
        }],
        items_count: { type: String },
        estimated_delivery: { type: String, default: "2" },
        expiresIn: { type: String, default: "7 days" },
        expires_date: {type: Date, default: () => {
            const currentDate = new Date();
            return new Date(currentDate.setDate(currentDate.getDate() + 7));
        }},
        status: { type: String, default: "pending" },
        isDelivered: { type: Boolean, default: false },
        service_fee: { type: String, default: "0.00" },
        sub_total: { type: String, default: "0.00" },
        total_amount: { type: String, default: "0.00" },
        currency: { type: String, default: "XAF" },
        created_at: { type: String },
        created_date: {type: String},
        updated_at: {type: Date},
        purchase_date: {type: String}
    }],
    payment_methods: [{
        _id: { type: mongoose.Schema.Types.ObjectId, default: mongoose.Types.ObjectId },
        type: { type: String },
        provider: { type: String },
        provider_logo: { type: String },
        account_name: { type: String },
        account_number: { type: String },
        number_ending: { type: String },
        expiry_date: { type: String },
        cvv: { type: String },
        isDefault: { type: Boolean, default: false }
    }],
    notifications: [{
        _id: { type: mongoose.Schema.Types.ObjectId, default: mongoose.Types.ObjectId },
        type: { type: String },
        title: { type: String },
        message: { type: String },
        icon: { type: String },
        link: { type: String },
        status: { type: String, default: 'unread' },
        created_at: {type: String }
    }],
    transactions: [{
        _id: { type: mongoose.Schema.Types.ObjectId, default: mongoose.Types.ObjectId },
        type: { type: String },
        amount: { type: String },
        status: { type: String },
        transId: { type: String },
        created_at: {type: String, default: new Date() }
    }],
    chats: [{
        user_message: { type: String },
        bot_response: { type: String },
        timestamp: { type: Date, default: Date.now }
    }]
});

// Pre-save hook to hash password and format dates
UserSchema.pre('save', async function (next) {
    if (this.isModified('password')) {
        try {
            const salt = await bcrypt.genSalt(10);
            const hashedPassword = await bcrypt.hash(this.password, salt);
            this.password = hashedPassword;
        } catch (error) {
            return next({ statusCode: 400, message: error });
        }
    }
    if (!this.email && !this.phone_number) {
        const error = new Error('At least one of email or phone number is required');
        return next(error);
    }



    next();
});

export default mongoose.model('users', UserSchema);
