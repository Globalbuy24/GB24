const express=require('express')
const router =express.Router()
const User=require('../../models/user')
const passport =require('passport')
const GoogleStrategy = require( 'passport-google-oauth2' ).Strategy;
const mailer=require('../../middleware/mailer')
const jwt = require('jsonwebtoken')
const mongoose=require('mongoose')
 
passport.use(new GoogleStrategy({
    clientID: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    callbackURL: "http://localhost:3000/register/google/callback",
    passReqToCallback : true
  },
  async function asyncFunction(request, accessToken, refreshToken, profile, done) {
    try {
      const user = await User.findOne({ googleId: profile.id });
      
      if (user) {
      
        /**
         *   User exists, return the user data
         */
        const jwt_secret=process.env.JWT_SECRET||'jwt_gb24_secret'
        const token=jwt.sign({
            data: user.first_name
          }, jwt_secret, { expiresIn: '15m' });
          
          
          await user.updateOne({$unset:{token:""}})
         //user.token=token
         await user.updateOne({$set:{token:token}})
          const updatedUser= await user.save()

        return done(null, updatedUser);
      } else {
       /**
        *     User does not exist, create a new user and return the data
        */
        const resolvedReferralCode = await generateRefCode();

        const jwt_secret=process.env.JWT_SECRET||'jwt_gb24_secret'
        const token=jwt.sign({
        data: profile.given_name
        }, jwt_secret, { expiresIn: '12h' });

        /**
         * @typedef {Object} newUser
         * @property {string} googleId -user's google ID
         * @property {string} email
         * @property {string} first_name
         * @property {string} last_name
         * @property {string} referal_code
         * @property {string} provider
         * @property {boolean} email_is_verified
         * @property {boolean} is_verified
         * @property {string} token -users token
         */
        const newUser = new User({
          googleId: profile.id,
          email: profile.email,
          first_name: profile.given_name,
          last_name: profile.family_name,
          referal_code: resolvedReferralCode,
          provider: profile.provider,
          email_is_verified: true,
          is_verified:true,
          token:token
        });
        /**
         * @typedef {Object} welcomeNotification - default user welcom notification
         * @property {Object} _id
         * @property {Object} type
         * @property {Object} message
         * @property {Object} created_at
         */
        const welcomeNotification = {
          _id: new mongoose.Types.ObjectId(),
          type: 'welcome',
          message: `GB24 welcomes you, ${newUser.first_name} ${newUser.last_name}. Enjoy your ride with us.`,
          created_at:new Date()
        };
        newUser.prefered_notification="email"
        newUser.notifications.push(welcomeNotification); 
        const newuser = await newUser.save();
        //welcome email

        const welcomehtml=`
        <p>
        GB24 welcomes you,<strong> ${newUser.first_name} ${newUser.last_name}</strong>. Enjoy your ride with us.
        </p>
       `
       await mailer.sendMail({
         from:'noreply@globalbuy24.com',
         to:newUser.email,
         subject:'Welcome to GlobalBuy24',
         html:welcomehtml
       })
        return done(null, newuser);
      }
    } catch (err) {
      return done(err);
    }
  }


  
));


// Serialize and deserialize user data
passport.serializeUser(function(user, done) {
  done(null, user);
});

passport.deserializeUser(function(user, done) {
 
    done(null, user);

});

/**
 * 
 * @returns unique referal code ,which will be assigned to each new user
 */

async function generateRefCode() {
  const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  const codeLength = 6;
  let referralCode = '';

  for (let i = 0; i < codeLength; i++) {
    const randomIndex = Math.floor(Math.random() * characters.length);
    referralCode += characters[randomIndex];
  }
  userExist=await User.findOne({referal_code:referralCode})
  
  if(!userExist)
  {
      return referralCode;
  }
  else
  {
      generateRefCode()
  }

}