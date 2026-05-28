const nodemailer = require('nodemailer');
const dns = require('dns');

// Apply global DNS fix
if (dns.setDefaultResultOrder) {
  dns.setDefaultResultOrder('ipv4first');
}

const config = {
  host: 'smtp.gmail.com',
  port: 587,
  secure: false,
  family: 4,
  auth: {
    user: 'rinkupatel3495@gmail.com',
    pass: 'rgxbhqlaawflvguy'
  }
};

console.log('📬 Initializing Nodemailer with config:', {
  host: config.host,
  port: config.port,
  secure: config.secure,
  user: config.auth.user
});

const transporter = nodemailer.createTransport(config);

transporter.verify(function (error, success) {
  if (error) {
    console.error('\n❌ Nodemailer Connection Failed! Error details:\n');
    console.error(error);
    process.exit(1);
  } else {
    console.log('\n✅ SUCCESS! SMTP Transporter is ready to send emails.');
    
    // Attempt to send a quick diagnostic email
    console.log('\n📧 Sending a diagnostic test email to rinkupatel3495@gmail.com...');
    transporter.sendMail({
      from: '"RK Creation Diagnostics" <rinkupatel3495@gmail.com>',
      to: 'rinkupatel3495@gmail.com',
      subject: 'RK Creation SMTP Diagnostic Success',
      text: 'Diagnostic email sent successfully from your local workspace configuration.'
    }, (sendErr, info) => {
      if (sendErr) {
        console.error('❌ Failed to send diagnostic email:', sendErr);
        process.exit(1);
      } else {
        console.log('✅ TEST EMAIL SENT SUCCESSFULLY!', info.messageId);
        process.exit(0);
      }
    });
  }
});
