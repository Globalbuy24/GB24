const express=require('express')
const router =express.Router()
const User=require('../../models/user')
const passport =require('passport')
const FacebookStrategy = require( 'passport-facebook' ).Strategy;
const mailer=require('../../middleware/mailer')
const jwt = require('jsonwebtoken')
const mongoose=require('mongoose')
 
passport.use(new FacebookStrategy({
    clientID: process.env.FACEBOOK_APP_ID,
    clientSecret: process.env.FACEBOOK_APP_SECRET,
    callbackURL: "https://globalbuy24-e16651ed716e.herokuapp.com/register/facebook/callback"
  },
 async function(accessToken, refreshToken, profile, done) {
    const displayName = profile.displayName;
    const nameParts = displayName.split(' ');
    const first_name = nameParts[0];
    const last_name = nameParts[1];
    console.log(first_name)
    console.log(last_name)
    console.log(profile.id)
    try {
        const user = await User.findOne({ facebookId: profile.id });
            

        if (user) {
          // User exists, return the user data
  
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
          // User does not exist, create a new user and return the data
  
          const resolvedReferralCode = await generateRefCode();
          var emailExist=true;
          const jwt_secret=process.env.JWT_SECRET||'jwt_gb24_secret'
          const token=jwt.sign({
          data:first_name
          }, jwt_secret, { expiresIn: '12h' });
          
          if(!profile.email)
            {
                profile.email='noemail@globalbuy.default'
                emailExist=false
            }
            /**
         * @typedef {Object} newUser
         * @property {string} facebookId -user's facebook ID
         * @property {string} email
         * @property {string} first_name
         * @property {string} last_name
         * @property {string} referal_code
         * @property {string} provider - auth service provider
         * @property {boolean} email_is_verified
         * @property {boolean} is_verified
         * @property {string} token -users token
         */
          const newUser = new User({
            facebookId: profile.id,
            email:profile.email,
            first_name: first_name,
            last_name: last_name,
            referal_code: resolvedReferralCode,
            provider: profile.provider,
            email_is_verified: emailExist,
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
          
          
          newUser.notifications.push(welcomeNotification); 
          const newuser = await newUser.save();
          if(profile.email)
            {
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
            }
          return done(null, newuser);
        }
      } catch (err) {
        return done(err);
      }
    }));

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