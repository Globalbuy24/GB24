const nodemailer=require('nodemailer')

var transport = nodemailer.createTransport({
    host: "sandbox.smtp.mailtrap.io",
    port: 2525,
    auth: {
      user: "396669c7213975",
      pass: "c03e923e51240a"
    }
  });

module.exports = transport;