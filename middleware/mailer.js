const nodemailer=require('nodemailer')

var transport = nodemailer.createTransport({
  host: "live.smtp.mailtrap.io",
  port: 587,
  auth: {
    user: "api",
    pass: "731e2c98c7272dbcca7bb85396f644ae"
  }
});
module.exports = transport;