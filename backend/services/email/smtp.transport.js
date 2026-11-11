const nodemailer = require('nodemailer');

const { smtp } = require('../../config/env');

// Una sola conexión configurada para todo el proceso (config/env.js ya validó las variables)
const transporter = nodemailer.createTransport({
  host: smtp.host,
  port: smtp.port,
  secure: smtp.secure,
  auth: {
    user: smtp.user,
    pass: smtp.pass,
  },
});

async function send({ to, subject, text, html }) {
  await transporter.sendMail({ from: smtp.from, to, subject, text, html });
}

module.exports = { send };
