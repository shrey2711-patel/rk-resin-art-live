const dns = require('dns');
if (dns.setDefaultResultOrder) {
  dns.setDefaultResultOrder('ipv4first');
}

// Global fetch polyfill for older Node.js versions (e.g. Node 14/16)
if (!global.fetch) {
  const https = require('https');
  const http = require('http');
  const { URL } = require('url');

  global.fetch = function (url, options = {}) {
    return new Promise((resolve, reject) => {
      const parsedUrl = new URL(url);
      const protocol = parsedUrl.protocol === 'https:' ? https : http;
      
      const headers = options.headers || {};
      let bodyData = null;
      
      if (options.body) {
        if (typeof options.body === 'string') {
          bodyData = options.body;
        } else if (options.body instanceof URLSearchParams || (options.body && options.body.constructor && options.body.constructor.name === 'URLSearchParams')) {
          bodyData = options.body.toString();
          headers['Content-Type'] = 'application/x-www-form-urlencoded';
        } else if (options.body instanceof Buffer) {
          bodyData = options.body;
        } else {
          bodyData = JSON.stringify(options.body);
          if (!headers['Content-Type']) {
            headers['Content-Type'] = 'application/json';
          }
        }
      }

      if (bodyData && !headers['Content-Length']) {
        headers['Content-Length'] = Buffer.byteLength(bodyData);
      }

      const reqOptions = {
        method: options.method || 'GET',
        headers: headers
      };

      const req = protocol.request(parsedUrl, reqOptions, (res) => {
        const chunks = [];
        res.on('data', (chunk) => chunks.push(chunk));
        res.on('end', () => {
          const buffer = Buffer.concat(chunks);
          const response = {
            ok: res.statusCode >= 200 && res.statusCode < 300,
            status: res.statusCode,
            statusText: res.statusMessage,
            headers: {
              get: (name) => res.headers[name.toLowerCase()]
            },
            text: () => Promise.resolve(buffer.toString('utf8')),
            json: () => {
              try {
                return Promise.resolve(JSON.parse(buffer.toString('utf8')));
              } catch (e) {
                return Promise.reject(new Error(`Invalid JSON: ${e.message}`));
              }
            }
          };
          resolve(response);
        });
      });

      req.on('error', (err) => reject(err));

      if (bodyData) {
        req.write(bodyData);
      }
      req.end();
    });
  };
}

const express = require('express');
const cors = require('cors');
const compression = require('compression');
const helmet = require('helmet');
const bodyParser = require('body-parser');
const jwt = require('jsonwebtoken');
const multer = require('multer');
const bcrypt = require('bcryptjs');
const fs = require('fs');
const path = require('path');
const Razorpay = require('razorpay');
const crypto = require('crypto');
const nodemailer = require('nodemailer');
const geoip = require('geoip-lite');
const rateLimit = require('express-rate-limit');
let sharp = null;
try { sharp = require('sharp'); } catch (e) { console.warn('⚠️ sharp not installed — HEIC conversion disabled. Run: npm install sharp'); }

let S3Client, PutObjectCommand;
try {
  const s3mod = require('@aws-sdk/client-s3');
  S3Client = s3mod.S3Client;
  PutObjectCommand = s3mod.PutObjectCommand;
} catch (e) { console.warn('⚠️ @aws-sdk/client-s3 not installed — R2 upload disabled. Run: npm install @aws-sdk/client-s3'); }

const app = express();
app.disable('x-powered-by');
if (process.env.RENDER) {
  app.set('trust proxy', 1); // Trust Render's single-hop load balancer
} else {
  app.set('trust proxy', false); // Do not trust proxies in local development
}

const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'rk-resin-art-secret-2024';
const PERSISTENT_DIR = process.env.PERSISTENT_DISK_PATH || path.join(__dirname, 'data');
const VISITOR_LOGS_PATH = path.join(PERSISTENT_DIR, 'visitor_logs.json');
if (!fs.existsSync(PERSISTENT_DIR)) {
  fs.mkdirSync(PERSISTENT_DIR, { recursive: true });
}

const DB_PATH = path.join(PERSISTENT_DIR, 'db.json');
const UPLOAD_DIR = path.join(PERSISTENT_DIR, 'uploads');
const DB_BACKUP_DIR = path.join(PERSISTENT_DIR, 'backups');
if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}
if (!fs.existsSync(DB_BACKUP_DIR)) {
  fs.mkdirSync(DB_BACKUP_DIR, { recursive: true });
}

// Initialize Razorpay SDK helper dynamically
function getRazorpayClient() {
  const db = readDB();
  const key_id = db.settings.razorpayKeyId || process.env.RAZORPAY_KEY_ID || '';
  const key_secret = db.settings.razorpayKeySecret || process.env.RAZORPAY_KEY_SECRET || '';
  return new Razorpay({ key_id, key_secret });
}

// ── Email Mailer Initialization & Dispatcher Helpers ─────────
let mailTransporter = null;

async function initMailer() {
  try {
    const db = readDB();
    const smtpConf = db.settings.smtp || {};

    if (smtpConf.host && smtpConf.user && smtpConf.pass && smtpConf.pass !== 'PASTE_YOUR_GMAIL_APP_PASSWORD_HERE') {
      const transportConfig = {
        host: smtpConf.host || 'smtp.gmail.com',
        port: Number(smtpConf.port) || 587,
        secure: smtpConf.secure === true,
        family: 4, // Force IPv4
        auth: {
          user: smtpConf.user,
          pass: smtpConf.pass
        }
      };
      mailTransporter = nodemailer.createTransport(transportConfig);
      console.log(`\n📧 SMTP Transporter initialized successfully for sender: ${smtpConf.user}`);
    } else if (process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS) {
      const envTransportConfig = {
        host: process.env.SMTP_HOST,
        port: Number(process.env.SMTP_PORT) || 587,
        secure: process.env.SMTP_SECURE === 'true',
        family: 4, // Force IPv4
        auth: {
          user: process.env.SMTP_USER,
          pass: process.env.SMTP_PASS
        }
      };
      mailTransporter = nodemailer.createTransport(envTransportConfig);
      console.log(`\n📧 SMTP Transporter initialized successfully via environment variables.`);
    } else {
      console.log('\n📧 Creating Ethereal developer sandbox SMTP mail account...');
      const testAccount = await nodemailer.createTestAccount();
      mailTransporter = nodemailer.createTransport({
        host: 'smtp.ethereal.email',
        port: 587,
        secure: false,
        auth: {
          user: testAccount.user,
          pass: testAccount.pass
        }
      });
      console.log(`📧 Developer Sandbox SMTP account initialized successfully!`);
      console.log(`   User: ${testAccount.user}`);
      console.log(`   Ethereal Login URL: https://ethereal.email`);
    }
  } catch (err) {
    console.error('⚠️ Failed to initialize email transporter:', err.message);
  }
}

// Hybrid HTTPS API dispatcher for cloud deployments (Bypasses SMTP port blocking on Render)
async function sendEmailViaHTTPS(to, subject, htmlBody, textBody) {
  const BREVO_API_KEY = process.env.BREVO_API_KEY;
  const RESEND_API_KEY = process.env.RESEND_API_KEY;

  // 1. Try Brevo HTTPS API first (Perfect for free domain-less sending to real customers!)
  if (BREVO_API_KEY) {
    try {
      console.log(`📡 Dispatched mail via Brevo HTTPS API to ${to}...`);
      const response = await fetch('https://api.brevo.com/v3/smtp/email', {
        method: 'POST',
        headers: {
          'api-key': BREVO_API_KEY,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          sender: { name: 'RK Resin Art', email: 'rinkupatel3495@gmail.com' },
          to: [{ email: to }],
          subject: subject,
          htmlContent: htmlBody,
          textContent: textBody
        })
      });

      if (!response.ok) {
        throw new Error(`Brevo API error: ${response.status} ${await response.text()}`);
      }
      console.log(`✅ Mail successfully delivered via Brevo HTTPS API to ${to}!`);
      return true;
    } catch (err) {
      console.error('❌ Failed to send email via Brevo HTTPS API:', err.message);
    }
  }

  // 2. Fallback to Resend HTTPS API (Requires domain to send to real customers)
  if (RESEND_API_KEY) {
    try {
      console.log(`📡 Dispatched mail via Resend HTTPS API to ${to}...`);
      
      let targetEmail = to;
      let finalSubject = subject;
      
      // Resend free tier sends to the account owner (shreypatel00557@gmail.com) by default.
      // We route customer copies to the owner labelled with [CUSTOMER COPY]
      const isSandboxSender = !process.env.RESEND_VERIFIED_DOMAIN;
      const sandboxTarget = process.env.RESEND_SANDBOX_EMAIL || 'shreypatel00557@gmail.com';
      if (isSandboxSender && to.toLowerCase() !== sandboxTarget.toLowerCase()) {
        targetEmail = sandboxTarget;
        finalSubject = `[CUSTOMER COPY TO: ${to}] ${subject}`;
      }

      const response = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${RESEND_API_KEY}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          from: process.env.RESEND_FROM_EMAIL || 'RK Resin Art <onboarding@resend.dev>',
          to: targetEmail,
          subject: finalSubject,
          html: htmlBody,
          text: textBody
        })
      });

      if (!response.ok) {
        throw new Error(`Resend API error: ${response.status} ${await response.text()}`);
      }
      console.log(`✅ Mail successfully delivered via Resend HTTPS API to ${targetEmail}!`);
      return true;
    } catch (err) {
      console.error('❌ Failed to send email via Resend HTTPS API:', err.message);
    }
  }
  return false;
}

async function sendAdminEmailNotification(order) {
  if (!mailTransporter && !process.env.RESEND_API_KEY && !process.env.BREVO_API_KEY) {
    console.log('⚠️ Mail transporter not initialized. Postponing email...');
    return;
  }
  try {
    const db = readDB();
    // Force admin notification to go to rinkupatel3495@gmail.com as requested
    const adminEmail = 'rinkupatel3495@gmail.com';
    const isOnline = order.paymentStatus === 'Paid (Razorpay)';

    const customer = order.customer || {};
    const fullName = `${customer.firstName || ''} ${customer.lastName || ''}`.trim() || 'Valued Customer';
    const fullAddress = [customer.address, customer.city, customer.pin].filter(Boolean).join(', ') || 'No Address Provided';

    // Format order items table rows
    let itemsHTML = '';
    (order.items || []).forEach((item, index) => {
      const rowBg = index % 2 === 0 ? '#ffffff' : '#f8fafc';
      const amount = item.price * item.qty;
      itemsHTML += `
        <tr style="background-color: ${rowBg};">
          <td style="padding: 10px; border-bottom: 1px solid #e2e8f0; font-family: Helvetica, Arial, sans-serif; font-size: 14px; color: #1e293b;">${index + 1}</td>
          <td style="padding: 10px; border-bottom: 1px solid #e2e8f0; font-family: Helvetica, Arial, sans-serif; font-size: 14px; color: #1e293b; font-weight: bold;">
            ${item.name}
            <div style="font-size: 11px; color: #64748b; font-weight: normal; margin-top: 2px;">Category: ${item.category || 'Product'}</div>
          </td>
          <td style="padding: 10px; border-bottom: 1px solid #e2e8f0; font-family: Helvetica, Arial, sans-serif; font-size: 14px; color: #1e293b; text-align: center;">${item.qty}</td>
          <td style="padding: 10px; border-bottom: 1px solid #e2e8f0; font-family: Helvetica, Arial, sans-serif; font-size: 14px; color: #1e293b; text-align: right;">₹${Number(item.price).toLocaleString('en-IN')}</td>
          <td style="padding: 10px; border-bottom: 1px solid #e2e8f0; font-family: Helvetica, Arial, sans-serif; font-size: 14px; color: #1e293b; text-align: right; font-weight: bold;">₹${amount.toLocaleString('en-IN')}</td>
        </tr>
      `;
    });

    const paymentBadge = isOnline 
      ? `<span style="background-color: #d1fae5; color: #065f46; padding: 4px 10px; border-radius: 9999px; font-size: 12px; font-weight: bold;">💳 PAID (Razorpay)</span>`
      : `<span style="background-color: #fef3c7; color: #92400e; padding: 4px 10px; border-radius: 9999px; font-size: 12px; font-weight: bold;">💵 COD (WhatsApp)</span>`;

    const paymentIdRow = isOnline
      ? `<p style="margin: 4px 0 0 0; font-family: Helvetica, Arial, sans-serif; font-size: 13px; color: #64748b;"><strong>Razorpay Payment ID:</strong> ${order.paymentId}</p>`
      : '';

    const emailSubject = `🛒 New Order #${order.id} Placed - ${isOnline ? 'PAID' : 'COD'} [RK Resin Art]`;

    const emailHTML = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>New Order Alert</title>
      </head>
      <body style="margin: 0; padding: 0; background-color: #f4f6f8; -webkit-text-size-adjust: 100%; -ms-text-size-adjust: 100%;">
        <table border="0" cellpadding="0" cellspacing="0" width="100%" style="background-color: #f4f6f8; padding: 20px 0;">
          <tr>
            <td align="center">
              <table border="0" cellpadding="0" cellspacing="0" width="600" style="background-color: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 12px rgba(0,0,0,0.06); border: 1px solid #e2e8f0;">
                
                <!-- BRAND HEADER -->
                <tr>
                  <td align="center" style="background-color: #0f766e; padding: 30px 20px; text-align: center;">
                    <h1 style="margin: 0; font-family: Helvetica, Arial, sans-serif; font-size: 24px; color: #ffffff; font-weight: bold; letter-spacing: 0.5px;">🛍️ NEW ORDER RECEIVED!</h1>
                    <p style="margin: 8px 0 0 0; font-family: Helvetica, Arial, sans-serif; font-size: 14px; color: #ccfbf1;">Order ID: #${order.id} | Date: ${new Date(order.createdAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'long', year: 'numeric' })}</p>
                  </td>
                </tr>

                <!-- ORDER INTRO & STATUS -->
                <tr>
                  <td style="padding: 24px 30px 10px 30px;">
                    <table border="0" cellpadding="0" cellspacing="0" width="100%">
                      <tr>
                        <td>
                          <h2 style="margin: 0 0 10px 0; font-family: Helvetica, Arial, sans-serif; font-size: 18px; color: #0f766e; font-weight: bold;">Order Summary</h2>
                          <div style="background-color: #f8fafc; border-radius: 8px; padding: 15px; border: 1px solid #f1f5f9;">
                            <p style="margin: 0 0 8px 0; font-family: Helvetica, Arial, sans-serif; font-size: 14px; color: #1e293b;"><strong>Payment Mode:</strong> ${paymentBadge}</p>
                            ${paymentIdRow}
                            <p style="margin: 4px 0 0 0; font-family: Helvetica, Arial, sans-serif; font-size: 14px; color: #1e293b;"><strong>Order Status:</strong> <span style="text-transform: uppercase; font-weight: bold; color: ${isOnline ? '#0f766e' : '#475569'};">${order.status}</span></p>
                          </div>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>

                <!-- CUSTOMER DETAILS -->
                <tr>
                  <td style="padding: 10px 30px 15px 30px;">
                    <table border="0" cellpadding="0" cellspacing="0" width="100%" style="background-color: #f8fafc; border-radius: 8px; padding: 15px; border: 1px solid #f1f5f9; font-family: Helvetica, Arial, sans-serif;">
                      <tr>
                        <td>
                          <h3 style="margin: 0 0 12px 0; font-size: 15px; color: #0f766e; font-weight: bold; border-bottom: 1px solid #e2e8f0; padding-bottom: 6px;">👤 Customer Details</h3>
                          <table border="0" cellpadding="0" cellspacing="0" width="100%" style="font-size: 14px; color: #334155; line-height: 1.5;">
                            <tr>
                              <td width="30%" valign="top" style="font-weight: bold; padding: 3px 0;">Name:</td>
                              <td width="70%" valign="top" style="padding: 3px 0;">${fullName}</td>
                            </tr>
                            <tr>
                              <td valign="top" style="font-weight: bold; padding: 3px 0;">Phone:</td>
                              <td valign="top" style="padding: 3px 0;">${customer.phone || 'N/A'}</td>
                            </tr>
                            <tr>
                              <td valign="top" style="font-weight: bold; padding: 3px 0;">Email:</td>
                              <td valign="top" style="padding: 3px 0;">${customer.email || 'N/A'}</td>
                            </tr>
                            <tr>
                              <td valign="top" style="font-weight: bold; padding: 3px 0;">Shipping Address:</td>
                              <td valign="top" style="padding: 3px 0;">${fullAddress}</td>
                            </tr>
                          </table>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>

                <!-- ITEMS TABLE -->
                <tr>
                  <td style="padding: 10px 30px 20px 30px;">
                    <h3 style="margin: 0 0 12px 0; font-family: Helvetica, Arial, sans-serif; font-size: 15px; color: #0f766e; font-weight: bold;">📦 Items Ordered</h3>
                    <table border="0" cellpadding="0" cellspacing="0" width="100%" style="border-collapse: collapse; min-width: 100%;">
                      <thead>
                        <tr style="background-color: #0f766e; color: #ffffff;">
                          <th style="padding: 10px 8px; font-family: Helvetica, Arial, sans-serif; font-size: 12px; font-weight: bold; text-align: left; border-radius: 4px 0 0 4px;">#</th>
                          <th style="padding: 10px 8px; font-family: Helvetica, Arial, sans-serif; font-size: 12px; font-weight: bold; text-align: left;">Product</th>
                          <th style="padding: 10px 8px; font-family: Helvetica, Arial, sans-serif; font-size: 12px; font-weight: bold; text-align: center;">Qty</th>
                          <th style="padding: 10px 8px; font-family: Helvetica, Arial, sans-serif; font-size: 12px; font-weight: bold; text-align: right;">Rate</th>
                          <th style="padding: 10px 8px; font-family: Helvetica, Arial, sans-serif; font-size: 12px; font-weight: bold; text-align: right; border-radius: 0 4px 4px 0;">Amount</th>
                        </tr>
                      </thead>
                      <tbody>
                        ${itemsHTML}
                      </tbody>
                    </table>
                  </td>
                </tr>

                <!-- TOTALS SECTION -->
                <tr>
                  <td style="padding: 0 30px 30px 30px;" align="right">
                    <table border="0" cellpadding="0" cellspacing="0" width="280" style="font-family: Helvetica, Arial, sans-serif; border-top: 2px dashed #e2e8f0; padding-top: 15px; line-height: 1.6;">
                      <tr>
                        <td style="font-size: 14px; color: #64748b; padding: 4px 0;">Subtotal:</td>
                        <td align="right" style="font-size: 14px; color: #1e293b; font-weight: bold; padding: 4px 0;">₹${Number(order.total).toLocaleString('en-IN')}</td>
                      </tr>
                      ${order.discount > 0 ? `
                      <tr>
                        <td style="font-size: 14px; color: #b91c1c; padding: 4px 0; font-weight: bold;">Discount (${order.couponCode}):</td>
                        <td align="right" style="font-size: 14px; color: #b91c1c; font-weight: bold; padding: 4px 0;">-₹${Number(order.discount).toLocaleString('en-IN')}</td>
                      </tr>
                      ` : ''}
                      <tr>
                        <td style="font-size: 14px; color: #64748b; padding: 4px 0;">Shipping:</td>
                        <td align="right" style="font-size: 14px; color: #1e293b; font-weight: bold; padding: 4px 0;">${order.shipping === 0 ? 'FREE' : `₹${order.shipping}`}</td>
                      </tr>
                      ${order.otherChargesAmount > 0 ? `
                      <tr>
                        <td style="font-size: 14px; color: #64748b; padding: 4px 0;">Other Charges${order.otherChargesType === 'percentage' ? ' (' + order.otherCharges + '%)' : ''}:</td>
                        <td align="right" style="font-size: 14px; color: #1e293b; font-weight: bold; padding: 4px 0;">₹${Number(order.otherChargesAmount).toLocaleString('en-IN')}</td>
                      </tr>
                      ` : ''}
                      <tr style="background-color: #f0fdfa;">
                        <td style="font-size: 15px; color: #0f766e; font-weight: bold; padding: 8px 10px; border-radius: 6px 0 0 6px;">GRAND TOTAL:</td>
                        <td align="right" style="font-size: 16px; color: #0f766e; font-weight: bold; padding: 8px 10px; border-radius: 0 6px 6px 0;">₹${Number(order.grandTotal).toLocaleString('en-IN')}</td>
                      </tr>
                    </table>
                  </td>
                </tr>

                <!-- FOOTER BRANDING -->
                <tr>
                  <td align="center" style="background-color: #f8fafc; border-top: 1px solid #edf2f7; padding: 20px; text-align: center; font-family: Helvetica, Arial, sans-serif; font-size: 12px; color: #64748b;">
                    <p style="margin: 0 0 6px 0; font-weight: bold; color: #0f766e;">RK Resin Art — Premium Craft Supplies</p>
                    <p style="margin: 0 0 10px 0;">This is an automated order alert dispatched by your e-commerce engine.</p>
                    <p style="margin: 0;"><a href="https://wa.me/918141994995" style="color: #0f766e; text-decoration: underline; font-weight: bold;">Quick Admin WhatsApp Chat</a></p>
                  </td>
                </tr>

              </table>
            </td>
          </tr>
        </table>
      </body>
      </html>
    `;

    // Construct text version fallback
    const itemsText = (order.items || []).map((i, index) => 
      `${index + 1}. ${i.name} [Qty: ${i.qty}] - Rate: Rs. ${i.price} - Total: Rs. ${i.price * i.qty}`
    ).join('\n');
    
    const emailText = `
🛍️ NEW ORDER RECEIVED - ORDER #${order.id}

--- ORDER SUMMARY ---
Payment Method: ${order.paymentStatus || 'Pending COD (WhatsApp)'}
${order.paymentId ? `Razorpay Payment ID: ${order.paymentId}\n` : ''}Order Status: ${order.status}
Date: ${new Date(order.createdAt).toLocaleDateString('en-IN')}

--- CUSTOMER DETAILS ---
Name: ${fullName}
Phone: ${customer.phone || 'N/A'}
Email: ${customer.email || 'N/A'}
Address: ${fullAddress}

--- ITEMS ORDERED ---
${itemsText}

--- FINANCIAL SUMMARY ---
Subtotal: Rs. ${order.total}
${order.discount > 0 ? `Discount (${order.couponCode}): -Rs. ${order.discount}\n` : ''}Shipping: ${order.shipping === 0 ? 'FREE' : `Rs. ${order.shipping}`}
${order.otherChargesAmount > 0 ? `Other Charges${order.otherChargesType === 'percentage' ? ' (' + order.otherCharges + '%)' : ''}: Rs. ${order.otherChargesAmount}\n` : ''}GRAND TOTAL: Rs. ${order.grandTotal}

---
RK Resin Art - Premium Craft Supplies
`;

    // Try to dispatch via Resend HTTPS API first for cloud compatibility
    const sentViaResend = await sendEmailViaHTTPS(adminEmail, emailSubject, emailHTML, emailText);
    if (sentViaResend) return;

    if (!mailTransporter) {
      console.log('⚠️ SMTP mail transporter not initialized. Skipping SMTP dispatch.');
      return;
    }

    // Dispatch the email
    const senderEmail = mailTransporter.options.auth.user;
    const mailOptions = {
      from: `"RK Resin Art Admin Alerts" <${senderEmail}>`,
      to: adminEmail,
      subject: emailSubject,
      text: emailText,
      html: emailHTML
    };

    const info = await mailTransporter.sendMail(mailOptions);
    console.log(`📧 Order Alert Email dispatched successfully to ${adminEmail}!`);
    const previewUrl = nodemailer.getTestMessageUrl(info);
    if (previewUrl) {
      console.log(`   Ethereal Preview URL: ${previewUrl}`);
      const logMsg = `[${new Date().toISOString()}] Order #${order.id} (${isOnline ? 'Razorpay' : 'COD'}): Preview email at ${previewUrl}\n`;
      fs.appendFileSync(path.join(__dirname, 'data', 'notifications.log'), logMsg);
    }
  } catch (err) {
    console.error('⚠️ Failed to dispatch admin notification email:', err.message);
  }
}

async function sendCustomerOrderConfirmation(order) {
  if (!mailTransporter && !process.env.RESEND_API_KEY && !process.env.BREVO_API_KEY) {
    console.log('⚠️ Mail transporter not initialized. Postponing customer email...');
    return;
  }
  try {
    const customer = order.customer || {};
    const customerEmail = customer.email;
    if (!customerEmail) {
      console.log(`⚠️ No customer email provided for Order #${order.id}. Skipping customer email alert.`);
      return;
    }

    const fullName = `${customer.firstName || ''} ${customer.lastName || ''}`.trim() || 'Valued Customer';
    const fullAddress = [customer.address, customer.city, customer.pin].filter(Boolean).join(', ') || 'No Address Provided';

    // Format order items table rows
    let itemsHTML = '';
    (order.items || []).forEach((item, index) => {
      const rowBg = index % 2 === 0 ? '#ffffff' : '#f9fafb';
      const amount = item.price * item.qty;
      itemsHTML += `
        <tr style="background-color: ${rowBg};">
          <td style="padding: 10px; border-bottom: 1px solid #e5e7eb; font-family: Helvetica, Arial, sans-serif; font-size: 14px; color: #333333;">${index + 1}</td>
          <td style="padding: 10px; border-bottom: 1px solid #e5e7eb; font-family: Helvetica, Arial, sans-serif; font-size: 14px; color: #111111; font-weight: bold;">
            ${item.name}
            <div style="font-size: 11px; color: #555555; font-weight: normal; margin-top: 2px;">Category: ${item.category || 'Product'}</div>
          </td>
          <td style="padding: 10px; border-bottom: 1px solid #e5e7eb; font-family: Helvetica, Arial, sans-serif; font-size: 14px; color: #333333; text-align: center;">${item.qty}</td>
          <td style="padding: 10px; border-bottom: 1px solid #e5e7eb; font-family: Helvetica, Arial, sans-serif; font-size: 14px; color: #333333; text-align: right;">₹${Number(item.price).toLocaleString('en-IN')}</td>
          <td style="padding: 10px; border-bottom: 1px solid #e5e7eb; font-family: Helvetica, Arial, sans-serif; font-size: 14px; color: #111111; text-align: right; font-weight: bold;">₹${amount.toLocaleString('en-IN')}</td>
        </tr>
      `;
    });

    const emailSubject = `📄 Order Receipt - #${order.id} [RK Resin Art]`;

    const emailHTML = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Invoice #${order.id}</title>
      </head>
      <body style="margin: 0; padding: 0; background-color: #f3f4f6; -webkit-text-size-adjust: 100%; -ms-text-size-adjust: 100%;">
        <table border="0" cellpadding="0" cellspacing="0" width="100%" style="background-color: #f3f4f6; padding: 40px 0;">
          <tr>
            <td align="center">
              <!-- A4 Invoice Sheet Container -->
              <table border="0" cellpadding="0" cellspacing="0" width="650" style="background-color: #ffffff; border: 1px solid #d1d5db; box-shadow: 0 4px 6px rgba(0,0,0,0.04); font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; text-align: left;">
                
                <!-- TOP HEADER BLOCK -->
                <tr>
                  <td style="padding: 40px 40px 20px 40px;">
                    <table border="0" cellpadding="0" cellspacing="0" width="100%">
                      <tr>
                        <td>
                          <h1 style="margin: 0; font-size: 26px; font-weight: 800; color: #111111; letter-spacing: 1px; text-transform: uppercase;">INVOICE</h1>
                          <p style="margin: 4px 0 0 0; font-size: 13px; color: #555555;">Order ID: #${order.id}</p>
                        </td>
                        <td align="right" style="text-align: right;">
                          <h2 style="margin: 0; font-size: 18px; font-weight: 700; color: #111111;">RK Resin Art</h2>
                          <p style="margin: 4px 0 0 0; font-size: 12px; color: #555555; line-height: 1.4;">
                            Umiyanagar, Ratanpar<br>
                            Surendranagar, Gujarat - 363020<br>
                            Phone: +91 81419 94995
                          </p>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>

                <!-- DIVIDER -->
                <tr>
                  <td style="padding: 0 40px;">
                    <table border="0" cellpadding="0" cellspacing="0" width="100%" style="border-top: 1px solid #e5e7eb;">
                      <tr><td></td></tr>
                    </table>
                  </td>
                </tr>

                <!-- BILLING / INFO DOUBLE COLUMN -->
                <tr>
                  <td style="padding: 25px 40px;">
                    <table border="0" cellpadding="0" cellspacing="0" width="100%">
                      <tr>
                        <td width="50%" valign="top">
                          <h3 style="margin: 0 0 8px 0; font-size: 12px; font-weight: 800; color: #111111; text-transform: uppercase; letter-spacing: 0.5px;">Bill To:</h3>
                          <p style="margin: 0; font-size: 13px; color: #333333; line-height: 1.5;">
                            <strong>${fullName}</strong><br>
                            ${fullAddress}<br>
                            Phone: ${customer.phone || 'N/A'}<br>
                            Email: ${customer.email || 'N/A'}
                          </p>
                        </td>
                        <td width="50%" valign="top" align="right" style="text-align: right;">
                          <h3 style="margin: 0 0 8px 0; font-size: 12px; font-weight: 800; color: #111111; text-transform: uppercase; letter-spacing: 0.5px;">Invoice Details:</h3>
                          <p style="margin: 0; font-size: 13px; color: #333333; line-height: 1.5;">
                            <strong>Date:</strong> ${new Date(order.createdAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'long', year: 'numeric' })}<br>
                            <strong>Status:</strong> ${order.paymentStatus === 'Paid (Razorpay)' ? 'Paid' : 'Pending COD'}<br>
                            <strong>Method:</strong> ${order.paymentStatus === 'Paid (Razorpay)' ? 'Prepaid Online' : 'Cash on Delivery (COD)'}
                          </p>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>

                <!-- ITEMS TABLE -->
                <tr>
                  <td style="padding: 10px 40px 20px 40px;">
                    <table border="0" cellpadding="0" cellspacing="0" width="100%" style="border-collapse: collapse;">
                      <thead>
                        <tr style="border-bottom: 2px solid #111111;">
                          <th style="padding: 10px 0; font-size: 12px; font-weight: 800; color: #111111; text-align: left; text-transform: uppercase; width: 5%;">#</th>
                          <th style="padding: 10px 0; font-size: 12px; font-weight: 800; color: #111111; text-align: left; text-transform: uppercase; width: 55%;">Product Description</th>
                          <th style="padding: 10px 0; font-size: 12px; font-weight: 800; color: #111111; text-align: center; text-transform: uppercase; width: 10%;">Qty</th>
                          <th style="padding: 10px 0; font-size: 12px; font-weight: 800; color: #111111; text-align: right; text-transform: uppercase; width: 15%;">Rate</th>
                          <th style="padding: 10px 0; font-size: 12px; font-weight: 800; color: #111111; text-align: right; text-transform: uppercase; width: 15%;">Amount</th>
                        </tr>
                      </thead>
                      <tbody>
                        ${itemsHTML}
                      </tbody>
                    </table>
                  </td>
                </tr>

                <!-- TOTALS SECTION -->
                <tr>
                  <td style="padding: 0 40px 40px 40px;" align="right">
                    <table border="0" cellpadding="0" cellspacing="0" width="280" style="line-height: 1.8;">
                      <tr>
                        <td style="font-size: 13px; color: #555555; padding: 4px 0;">Subtotal:</td>
                        <td align="right" style="font-size: 13px; color: #111111; font-weight: bold; padding: 4px 0; text-align: right;">₹${Number(order.total).toLocaleString('en-IN')}</td>
                      </tr>
                      ${order.discount > 0 ? `
                      <tr>
                        <td style="font-size: 13px; color: #111111; padding: 4px 0; font-weight: bold;">Discount (${order.couponCode}):</td>
                        <td align="right" style="font-size: 13px; color: #111111; font-weight: bold; padding: 4px 0; text-align: right;">-₹${Number(order.discount).toLocaleString('en-IN')}</td>
                      </tr>
                      ` : ''}
                      <tr>
                        <td style="font-size: 13px; color: #555555; padding: 4px 0;">Shipping:</td>
                        <td align="right" style="font-size: 13px; color: #111111; font-weight: bold; padding: 4px 0; text-align: right;">${order.shipping === 0 ? 'FREE' : `₹${order.shipping}`}</td>
                      </tr>
                      ${order.otherChargesAmount > 0 ? `
                      <tr>
                        <td style="font-size: 13px; color: #555555; padding: 4px 0;">Other Charges${order.otherChargesType === 'percentage' ? ' (' + order.otherCharges + '%)' : ''}:</td>
                        <td align="right" style="font-size: 13px; color: #111111; font-weight: bold; padding: 4px 0; text-align: right;">₹${Number(order.otherChargesAmount).toLocaleString('en-IN')}</td>
                      </tr>
                      ` : ''}
                      <tr style="border-top: 1px solid #111111; border-bottom: 2px double #111111;">
                        <td style="font-size: 14px; font-weight: 800; color: #111111; padding: 8px 0; text-transform: uppercase;">Total:</td>
                        <td align="right" style="font-size: 15px; font-weight: 800; color: #111111; padding: 8px 0; text-align: right;">₹${Number(order.grandTotal).toLocaleString('en-IN')}</td>
                      </tr>
                    </table>
                  </td>
                </tr>

                <!-- FOOTER BRANDING & HELP -->
                <tr>
                  <td align="center" style="background-color: #f9fafb; border-top: 1px solid #e5e7eb; padding: 30px; text-align: center; font-size: 12px; color: #555555; line-height: 1.6;">
                    <p style="margin: 0 0 6px 0; font-weight: 800; color: #111111; font-size: 13px; text-transform: uppercase; letter-spacing: 0.5px;">RK Resin Art</p>
                    <p style="margin: 0 0 15px 0;">For queries or support regarding this invoice, please chat with our support team on WhatsApp.</p>
                    <p style="margin: 0;"><a href="https://wa.me/918141994995" style="border: 1px solid #111111; background-color: #111111; color: #ffffff; padding: 8px 18px; text-decoration: none; font-weight: bold; display: inline-block; font-size: 12px; text-transform: uppercase; letter-spacing: 0.5px;">💬 Chat on WhatsApp</a></p>
                  </td>
                </tr>

              </table>
            </td>
          </tr>
        </table>
      </body>
      </html>
    `;

    // Construct text version fallback
    const itemsText = (order.items || []).map((i, index) => 
      `${index + 1}. ${i.name} [Qty: ${i.qty}] - Rate: Rs. ${i.price} - Total: Rs. ${i.price * i.qty}`
    ).join('\n');
    
    const isCod = order.paymentStatus !== 'Paid (Razorpay)';
    const emailText = `
💖 THANK YOU FOR YOUR ORDER! - ORDER #${order.id}

Hello ${fullName},
${isCod
  ? 'Your order has been placed successfully as Cash on Delivery. Our team will contact you on WhatsApp to confirm delivery details.'
  : 'Your order has been successfully placed and paid online via Razorpay. We are already preparing your premium craft supplies for dispatch!'}

--- DELIVERY DETAILS ---
Delivery Address: ${fullAddress}
Phone Number: ${customer.phone || 'N/A'}

--- ITEMS ORDERED ---
${itemsText}

--- FINANCIAL SUMMARY ---
Subtotal: Rs. ${order.total}
${order.discount > 0 ? `Discount (${order.couponCode}): -Rs. ${order.discount}\n` : ''}Shipping: ${order.shipping === 0 ? 'FREE' : `Rs. ${order.shipping}`}
${order.otherChargesAmount > 0 ? `Other Charges${order.otherChargesType === 'percentage' ? ' (' + order.otherCharges + '%)' : ''}: Rs. ${order.otherChargesAmount}\n` : ''}GRAND TOTAL: Rs. ${order.grandTotal}

---
Need Help? Chat with our support team on WhatsApp: wa.me/918141994995
RK Resin Art
`;

    // Try to dispatch via Resend HTTPS API first for cloud compatibility
    const sentViaResend = await sendEmailViaHTTPS(customerEmail, emailSubject, emailHTML, emailText);
    if (sentViaResend) return;

    if (!mailTransporter) {
      console.log('⚠️ SMTP mail transporter not initialized. Skipping SMTP dispatch.');
      return;
    }

    // Dispatch the email
    const senderEmail = mailTransporter.options.auth.user;
    const mailOptions = {
      from: `"RK Resin Art" <${senderEmail}>`,
      to: customerEmail,
      subject: emailSubject,
      text: emailText,
      html: emailHTML
    };

    const info = await mailTransporter.sendMail(mailOptions);
    console.log(`📧 Customer Order Confirmation email dispatched successfully to ${customerEmail}!`);
    const previewUrl = nodemailer.getTestMessageUrl(info);
    if (previewUrl) {
      console.log(`   Ethereal Customer Preview URL: ${previewUrl}`);
      const logMsg = `[${new Date().toISOString()}] Order #${order.id} Customer Confirmation: Preview email at ${previewUrl}\n`;
      fs.appendFileSync(path.join(__dirname, 'data', 'notifications.log'), logMsg);
    }
  } catch (err) {
    console.error('⚠️ Failed to dispatch customer order confirmation email:', err.message);
  }
}

async function sendCustomerShippingNotification(order) {
  if (!mailTransporter && !process.env.RESEND_API_KEY && !process.env.BREVO_API_KEY) {
    console.log('⚠️ Mail transporter not initialized. Postponing customer shipping email...');
    return;
  }
  try {
    const customer = order.customer || {};
    const customerEmail = customer.email;
    if (!customerEmail) {
      console.log(`⚠️ No customer email provided for Order #${order.id}. Skipping shipping email alert.`);
      return;
    }

    const fullName = `${customer.firstName || ''} ${customer.lastName || ''}`.trim() || 'Valued Customer';
    const fullAddress = [customer.address, customer.city, customer.pin].filter(Boolean).join(', ') || 'No Address Provided';
    const courierName = order.courierName || 'Our Shipping Partner';
    const trackingId = order.trackingId || '';
    const trackingLink = trackingId ? (trackingId.startsWith('http') ? trackingId : `https://www.google.com/search?q=${encodeURIComponent(courierName + ' tracking ' + trackingId)}`) : '#';

    // Format order items table rows for packing list / invoice
    let itemsHTML = '';
    (order.items || []).forEach((item, index) => {
      const rowBg = index % 2 === 0 ? '#ffffff' : '#f9fafb';
      const amount = item.price * item.qty;
      itemsHTML += `
        <tr style="background-color: ${rowBg};">
          <td style="padding: 10px; border-bottom: 1px solid #e5e7eb; font-family: Helvetica, Arial, sans-serif; font-size: 14px; color: #333333;">${index + 1}</td>
          <td style="padding: 10px; border-bottom: 1px solid #e5e7eb; font-family: Helvetica, Arial, sans-serif; font-size: 14px; color: #111111; font-weight: bold;">
            ${item.name}
            <div style="font-size: 11px; color: #555555; font-weight: normal; margin-top: 2px;">Category: ${item.category || 'Product'}</div>
          </td>
          <td style="padding: 10px; border-bottom: 1px solid #e5e7eb; font-family: Helvetica, Arial, sans-serif; font-size: 14px; color: #333333; text-align: center;">${item.qty}</td>
          <td style="padding: 10px; border-bottom: 1px solid #e5e7eb; font-family: Helvetica, Arial, sans-serif; font-size: 14px; color: #333333; text-align: right;">₹${Number(item.price).toLocaleString('en-IN')}</td>
          <td style="padding: 10px; border-bottom: 1px solid #e5e7eb; font-family: Helvetica, Arial, sans-serif; font-size: 14px; color: #111111; text-align: right; font-weight: bold;">₹${amount.toLocaleString('en-IN')}</td>
        </tr>
      `;
    });

    const emailSubject = `🚚 Shipping Invoice & Tracking - #${order.id} [RK Resin Art]`;

    const emailHTML = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Shipping Invoice #${order.id}</title>
      </head>
      <body style="margin: 0; padding: 0; background-color: #f3f4f6; -webkit-text-size-adjust: 100%; -ms-text-size-adjust: 100%;">
        <table border="0" cellpadding="0" cellspacing="0" width="100%" style="background-color: #f3f4f6; padding: 40px 0;">
          <tr>
            <td align="center">
              <!-- A4 Invoice Sheet Container -->
              <table border="0" cellpadding="0" cellspacing="0" width="650" style="background-color: #ffffff; border: 1px solid #d1d5db; box-shadow: 0 4px 6px rgba(0,0,0,0.04); font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; text-align: left;">
                
                <!-- TOP HEADER BLOCK -->
                <tr>
                  <td style="padding: 40px 40px 20px 40px;">
                    <table border="0" cellpadding="0" cellspacing="0" width="100%">
                      <tr>
                        <td>
                          <h1 style="margin: 0; font-size: 26px; font-weight: 800; color: #111111; letter-spacing: 1px; text-transform: uppercase;">SHIPPING INVOICE</h1>
                          <p style="margin: 4px 0 0 0; font-size: 13px; color: #555555;">Order ID: #${order.id}</p>
                        </td>
                        <td align="right" style="text-align: right;">
                          <h2 style="margin: 0; font-size: 18px; font-weight: 700; color: #111111;">RK Resin Art</h2>
                          <p style="margin: 4px 0 0 0; font-size: 12px; color: #555555; line-height: 1.4;">
                            Umiyanagar, Ratanpar<br>
                            Surendranagar, Gujarat - 363020<br>
                            Phone: +91 81419 94995
                          </p>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>

                <!-- DIVIDER -->
                <tr>
                  <td style="padding: 0 40px;">
                    <table border="0" cellpadding="0" cellspacing="0" width="100%" style="border-top: 1px solid #e5e7eb;">
                      <tr><td></td></tr>
                    </table>
                  </td>
                </tr>

                <!-- BILLING / INFO DOUBLE COLUMN -->
                <tr>
                  <td style="padding: 25px 40px;">
                    <table border="0" cellpadding="0" cellspacing="0" width="100%">
                      <tr>
                        <td width="50%" valign="top">
                          <h3 style="margin: 0 0 8px 0; font-size: 12px; font-weight: 800; color: #111111; text-transform: uppercase; letter-spacing: 0.5px;">Ship To:</h3>
                          <p style="margin: 0; font-size: 13px; color: #333333; line-height: 1.5;">
                            <strong>${fullName}</strong><br>
                            ${fullAddress}<br>
                            Phone: ${customer.phone || 'N/A'}<br>
                            Email: ${customer.email || 'N/A'}
                          </p>
                        </td>
                        <td width="50%" valign="top" align="right" style="text-align: right;">
                          <h3 style="margin: 0 0 8px 0; font-size: 12px; font-weight: 800; color: #111111; text-transform: uppercase; letter-spacing: 0.5px;">Shipping Details:</h3>
                          <p style="margin: 0; font-size: 13px; color: #333333; line-height: 1.5;">
                            <strong>Courier:</strong> ${courierName}<br>
                            <strong>Tracking ID:</strong> ${trackingId || 'N/A'}<br>
                            <strong>Date Shipped:</strong> ${new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'long', year: 'numeric' })}<br>
                            <strong>Status:</strong> Shipped
                          </p>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>

                <!-- DIVIDER -->
                <tr>
                  <td style="padding: 0 40px;">
                    <table border="0" cellpadding="0" cellspacing="0" width="100%" style="border-top: 1px solid #e5e7eb;">
                      <tr><td></td></tr>
                    </table>
                  </td>
                </tr>

                <!-- TRACKING CALL-TO-ACTION (ONLY IF TRACKING ID EXISTS) -->
                ${trackingId ? `
                <tr>
                  <td style="padding: 25px 40px 10px 40px;">
                    <table border="0" cellpadding="0" cellspacing="0" width="100%" style="background-color: #f9fafb; border: 1px solid #e5e7eb; padding: 20px; text-align: center; border-radius: 4px;">
                      <tr>
                        <td>
                          <p style="margin: 0 0 12px 0; font-size: 14px; color: #333333; line-height: 1.5;">
                            Your package has been dispatched. Track your delivery status using the link below:
                          </p>
                          <a href="${trackingLink}" target="_blank" style="background-color: #111111; border: 1px solid #111111; color: #ffffff; padding: 10px 22px; text-decoration: none; font-weight: bold; display: inline-block; font-size: 12px; text-transform: uppercase; letter-spacing: 0.5px; border-radius: 4px;">🚚 Track Your Order Live</a>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
                ` : ''}

                <!-- ITEMS TABLE -->
                <tr>
                  <td style="padding: 15px 40px 20px 40px;">
                    <table border="0" cellpadding="0" cellspacing="0" width="100%" style="border-collapse: collapse;">
                      <thead>
                        <tr style="border-bottom: 2px solid #111111;">
                          <th style="padding: 10px 0; font-size: 12px; font-weight: 800; color: #111111; text-align: left; text-transform: uppercase; width: 5%;">#</th>
                          <th style="padding: 10px 0; font-size: 12px; font-weight: 800; color: #111111; text-align: left; text-transform: uppercase; width: 55%;">Product Description</th>
                          <th style="padding: 10px 0; font-size: 12px; font-weight: 800; color: #111111; text-align: center; text-transform: uppercase; width: 10%;">Qty</th>
                          <th style="padding: 10px 0; font-size: 12px; font-weight: 800; color: #111111; text-align: right; text-transform: uppercase; width: 15%;">Rate</th>
                          <th style="padding: 10px 0; font-size: 12px; font-weight: 800; color: #111111; text-align: right; text-transform: uppercase; width: 15%;">Amount</th>
                        </tr>
                      </thead>
                      <tbody>
                        ${itemsHTML}
                      </tbody>
                    </table>
                  </td>
                </tr>

                <!-- TOTALS SECTION -->
                <tr>
                  <td style="padding: 0 40px 40px 40px;" align="right">
                    <table border="0" cellpadding="0" cellspacing="0" width="280" style="line-height: 1.8;">
                      <tr>
                        <td style="font-size: 13px; color: #555555; padding: 4px 0;">Subtotal:</td>
                        <td align="right" style="font-size: 13px; color: #111111; font-weight: bold; padding: 4px 0; text-align: right;">₹${Number(order.total).toLocaleString('en-IN')}</td>
                      </tr>
                      ${order.discount > 0 ? `
                      <tr>
                        <td style="font-size: 13px; color: #111111; padding: 4px 0; font-weight: bold;">Discount (${order.couponCode}):</td>
                        <td align="right" style="font-size: 13px; color: #111111; font-weight: bold; padding: 4px 0; text-align: right;">-₹${Number(order.discount).toLocaleString('en-IN')}</td>
                      </tr>
                      ` : ''}
                      <tr>
                        <td style="font-size: 13px; color: #555555; padding: 4px 0;">Shipping:</td>
                        <td align="right" style="font-size: 13px; color: #111111; font-weight: bold; padding: 4px 0; text-align: right;">${order.shipping === 0 ? 'FREE' : `₹${order.shipping}`}</td>
                      </tr>
                      ${order.otherChargesAmount > 0 ? `
                      <tr>
                        <td style="font-size: 13px; color: #555555; padding: 4px 0;">Other Charges${order.otherChargesType === 'percentage' ? ' (' + order.otherCharges + '%)' : ''}:</td>
                        <td align="right" style="font-size: 13px; color: #111111; font-weight: bold; padding: 4px 0; text-align: right;">₹${Number(order.otherChargesAmount).toLocaleString('en-IN')}</td>
                      </tr>
                      ` : ''}
                      <tr style="border-top: 1px solid #111111; border-bottom: 2px double #111111;">
                        <td style="font-size: 14px; font-weight: 800; color: #111111; padding: 8px 0; text-transform: uppercase;">Total:</td>
                        <td align="right" style="font-size: 15px; font-weight: 800; color: #111111; padding: 8px 0; text-align: right;">₹${Number(order.grandTotal).toLocaleString('en-IN')}</td>
                      </tr>
                    </table>
                  </td>
                </tr>

                <!-- FOOTER BRANDING & HELP -->
                <tr>
                  <td align="center" style="background-color: #f9fafb; border-top: 1px solid #e5e7eb; padding: 30px; text-align: center; font-size: 12px; color: #555555; line-height: 1.6;">
                    <p style="margin: 0 0 6px 0; font-weight: 800; color: #111111; font-size: 13px; text-transform: uppercase; letter-spacing: 0.5px;">RK Resin Art</p>
                    <p style="margin: 0 0 15px 0;">For queries or support regarding this shipment, please chat with our support team on WhatsApp.</p>
                    <p style="margin: 0;"><a href="https://wa.me/918141994995" style="border: 1px solid #111111; background-color: #111111; color: #ffffff; padding: 8px 18px; text-decoration: none; font-weight: bold; display: inline-block; font-size: 12px; text-transform: uppercase; letter-spacing: 0.5px;">💬 Chat on WhatsApp</a></p>
                  </td>
                </tr>

              </table>
            </td>
          </tr>
        </table>
      </body>
      </html>
    `;

    const itemsText = (order.items || []).map((i, index) => 
      `${index + 1}. ${i.name} [Qty: ${i.qty}] - Rate: Rs. ${i.price} - Total: Rs. ${i.price * i.qty}`
    ).join('\n');

    const emailText = `
🚚 YOUR ORDER HAS SHIPPED! - ORDER #${order.id}

Hello ${fullName},

Great news! Your premium resin art supplies are on the way. We have handed over your parcel to ${courierName}.

--- SHIPPING DETAILS ---
Courier Partner: ${courierName}
Tracking ID: ${trackingId}
Track Live: ${trackingLink}

--- DELIVERY ADDRESS ---
Delivery Address: ${fullAddress}
Phone Number: ${customer.phone || 'N/A'}

--- ITEMS SHIPPED ---
${itemsText}

--- FINANCIAL SUMMARY ---
Subtotal: Rs. ${order.total}
${order.discount > 0 ? `Discount (${order.couponCode}): -Rs. ${order.discount}\n` : ''}Shipping: ${order.shipping === 0 ? 'FREE' : `Rs. ${order.shipping}`}
${order.otherChargesAmount > 0 ? `Other Charges${order.otherChargesType === 'percentage' ? ' (' + order.otherCharges + '%)' : ''}: Rs. ${order.otherChargesAmount}\n` : ''}GRAND TOTAL: Rs. ${order.grandTotal}

---
Need Help? Chat with our support team on WhatsApp: wa.me/918141994995
RK Resin Art
`;

    const sentViaResend = await sendEmailViaHTTPS(customerEmail, emailSubject, emailHTML, emailText);
    if (!sentViaResend && mailTransporter) {
      const senderEmail = mailTransporter.options.auth.user;
      const info = await mailTransporter.sendMail({
        from: `"RK Resin Art" <${senderEmail}>`,
        to: customerEmail,
        subject: emailSubject,
        html: emailHTML,
        text: emailText
      });
      console.log(`📧 Customer Shipping email dispatched successfully to ${customerEmail}!`);
      const previewUrl = nodemailer.getTestMessageUrl(info);
      if (previewUrl) {
        console.log(`   Ethereal Customer Shipping Preview URL: ${previewUrl}`);
        const logMsg = `[${new Date().toISOString()}] Order #${order.id} Customer Shipping: Preview email at ${previewUrl}\n`;
        fs.appendFileSync(path.join(__dirname, 'data', 'notifications.log'), logMsg);
      }
    }
  } catch (err) {
    console.error('⚠️ Failed to dispatch customer shipping email:', err.message);
  }
}

async function notifyWishlistSubscribers(product) {
  if (!mailTransporter && !process.env.RESEND_API_KEY && !process.env.BREVO_API_KEY) {
    console.log('⚠️ Mail transporter not initialized. Postponing wishlist notifications...');
    return;
  }
  try {
    const db = readDB();
    db.wishlistSubscriptions = db.wishlistSubscriptions || [];

    // Find all subscribers for this product
    const subs = db.wishlistSubscriptions.filter(s => s.productId === product.id);
    if (!subs.length) return;

    console.log(`📧 Sending ${subs.length} back-in-stock notification(s) for "${product.name}"...`);

    const senderEmail = mailTransporter ? mailTransporter.options.auth.user : (process.env.SMTP_USER || 'onboarding@resend.dev');

    for (const sub of subs) {
      try {
        const emailSubject = `🎉 Great News! "${product.name}" is Back in Stock! [RK Resin Art]`;

        const emailHTML = `
          <!DOCTYPE html>
          <html>
          <head>
            <meta charset="utf-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Back in Stock!</title>
          </head>
          <body style="margin: 0; padding: 0; background-color: #f4f6f8; font-family: Helvetica, Arial, sans-serif;">
            <table border="0" cellpadding="0" cellspacing="0" width="100%" style="background-color: #f4f6f8; padding: 20px 0;">
              <tr>
                <td align="center">
                  <table border="0" cellpadding="0" cellspacing="0" width="550" style="background-color: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 12px rgba(0,0,0,0.06); border: 1px solid #e2e8f0;">
                    
                    <!-- BRAND HEADER -->
                    <tr>
                      <td align="center" style="background-color: #0f766e; padding: 25px 20px; text-align: center;">
                        <h1 style="margin: 0; font-size: 22px; color: #ffffff; font-weight: bold; letter-spacing: 0.5px;">🎉 IT'S BACK IN STOCK!</h1>
                        <p style="margin: 6px 0 0 0; font-size: 13px; color: #ccfbf1;">You asked, we listened! Grab yours before it runs out again.</p>
                      </td>
                    </tr>

                    <!-- PRODUCT DETAILS -->
                    <tr>
                      <td style="padding: 24px 30px; text-align: center;">
                        <div style="font-size: 4rem; margin-bottom: 12px;">📦</div>
                        <h2 style="margin: 0 0 8px 0; font-size: 20px; color: #1e293b; font-weight: bold;">${product.name}</h2>
                        <p style="margin: 0 0 16px 0; font-size: 14px; color: #64748b;">Category: ${product.category || 'Supplies'}</p>
                        
                        <div style="display: inline-block; background-color: #f0fdfa; border: 1px dashed #0f766e; border-radius: 8px; padding: 12px 24px; margin-bottom: 20px;">
                           <span style="font-size: 18px; color: #0f766e; font-weight: bold;">Only ₹${product.price}</span>
                          <span style="display: block; font-size: 11px; color: #0d9488; margin-top: 4px; font-weight: bold;">Available stock: ${product.stock} unit(s)</span>
                        </div>
                        
                        <p style="margin: 0 0 20px 0; font-size: 14px; color: #334155; line-height: 1.6;">
                          This item was on your wishlist, and it is now ready to order! Complete your resin art kit today.
                        </p>

                        <a href="http://localhost:3000" style="background-color: #0f766e; color: #ffffff; padding: 12px 30px; border-radius: 8px; text-decoration: none; font-weight: bold; font-size: 15px; display: inline-block;">🛒 Buy Now at RK Resin Art</a>
                      </td>
                    </tr>

                    <!-- FOOTER -->
                    <tr>
                      <td align="center" style="background-color: #f8fafc; border-top: 1px solid #edf2f7; padding: 20px; text-align: center; font-size: 11px; color: #64748b;">
                        <p style="margin: 0 0 4px 0; font-weight: bold; color: #0f766e; font-size: 12px;">RK Resin Art</p>
                        <p style="margin: 0;">You received this back-in-stock notification because this item was added to your wishlist.</p>
                      </td>
                    </tr>

                  </table>
                </td>
              </tr>
            </table>
          </body>
          </html>
        `;

        const emailText = `
🎉 Great News! "${product.name}" is Back in Stock at RK Resin Art!

You asked, we listened! The product you wishlisted is now available.

Product: ${product.name}
Price: Rs. ${product.price}
Available Stock: ${product.stock} units

Shop now: http://localhost:3000

Best regards,
RK Resin Art
        `;

        // Try to dispatch via Resend HTTPS API first for cloud compatibility
        const sentViaResend = await sendEmailViaHTTPS(sub.email, emailSubject, emailHTML, emailText);
        if (!sentViaResend) {
          if (!mailTransporter) {
            console.log(`⚠️ SMTP transporter not initialized. Skipping stock alert email for ${sub.email}.`);
            continue;
          }
          const mailOptions = {
            from: `"RK Resin Art" <${senderEmail}>`,
            to: sub.email,
            subject: emailSubject,
            text: emailText,
            html: emailHTML
          };

          const info = await mailTransporter.sendMail(mailOptions);
          console.log(`📧 Wishlist Back-in-Stock email notification sent successfully to ${sub.email}!`);
          const previewUrl = nodemailer.getTestMessageUrl(info);
          if (previewUrl) {
            console.log(`   Ethereal Notification Preview: ${previewUrl}`);
            const logMsg = `[${new Date().toISOString()}] Stock Alert for "${product.name}" sent to ${sub.email}: Preview at ${previewUrl}\n`;
            fs.appendFileSync(path.join(__dirname, 'data', 'notifications.log'), logMsg);
          }
        }
      } catch (err) {
        console.error(`⚠️ Failed to send stock alert email to ${sub.email}:`, err.message);
      }
    }

    // Clear notify subscriptions for this product so they don't get spammed on subsequent edits
    db.wishlistSubscriptions = db.wishlistSubscriptions.filter(s => s.productId !== product.id);
    writeDB(db);
  } catch (err) {
    console.error('⚠️ Failed to process back-in-stock notifications:', err.message);
  }
}

async function sendAdminReviewNotification(review, product) {
  if (!mailTransporter && !process.env.RESEND_API_KEY && !process.env.BREVO_API_KEY) return;
  try {
    const adminEmail = 'rinkupatel3495@gmail.com';
    const emailSubject = `⭐ New Product Review Submitted for "${product.name}"`;
    const emailHTML = `
      <div style="font-family:Arial,sans-serif;max-width:540px;margin:0 auto;padding:25px;background:#f8fafc;border-radius:12px;border:1px solid #e2e8f0;box-shadow:0 2px 8px rgba(0,0,0,0.04);">
        <h2 style="color:#0f766e;margin:0 0 16px 0;font-size:20px;border-bottom:2px solid #0f766e;padding-bottom:10px;">⭐ New Product Review Received</h2>
        <p style="margin:6px 0;font-size:14px;color:#1e293b;"><strong>Product:</strong> ${product.name} (ID: ${product.id})</p>
        <p style="margin:6px 0;font-size:14px;color:#1e293b;"><strong>Submitted By:</strong> ${review.userName} (User ID: ${review.userId})</p>
        <p style="margin:6px 0;font-size:14px;color:#1e293b;"><strong>Rating:</strong> ${'★'.repeat(review.rating)}${'☆'.repeat(5 - review.rating)} (${review.rating}/5)</p>
        <div style="background:#ffffff;border-left:4px solid #0f766e;padding:15px;margin:15px 0;font-style:italic;border-radius:0 8px 8px 0;box-shadow:inset 0 1px 3px rgba(0,0,0,0.02);color:#334155;font-size:14px;line-height:1.6;">
          "${review.comment}"
        </div>
        <p style="font-size:11px;color:#64748b;margin:15px 0 0 0;">Submitted at: ${new Date(review.createdAt).toLocaleString('en-IN')}</p>
      </div>`;
    
    const emailText = `New Product Review\nProduct: ${product.name}\nBy: ${review.userName}\nRating: ${review.rating}/5\nComment: "${review.comment}"`;

    const sentViaResend = await sendEmailViaHTTPS(adminEmail, emailSubject, emailHTML, emailText);
    if (!sentViaResend && mailTransporter) {
      await mailTransporter.sendMail({
        from: `"RK Resin Art" <${mailTransporter.options.auth.user}>`,
        to: adminEmail,
        subject: emailSubject,
        html: emailHTML,
        text: emailText
      });
    }
  } catch (err) {
    console.error('⚠️ Failed to send review notification:', err.message);
  }
}

if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

const allowedImageTypes = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif']);
const HEIC_EXTS = new Set(['.heic', '.heif']);

const uploadStorage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOAD_DIR),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    // HEIC/HEIF files will be converted to JPEG — save with .jpg extension
    const outputExt = HEIC_EXTS.has(ext) ? '.jpg' : ext;
    const safeBase = path
      .basename(file.originalname, ext)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 40) || 'product';
    cb(null, `${safeBase}-${Date.now()}-${Math.round(Math.random() * 1e9)}${outputExt}`);
  }
});

const uploadProductImage = multer({
  storage: uploadStorage,
  limits: { fileSize: 15 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const isAllowedExt = ['.jpg', '.jpeg', '.png', '.webp', '.heic', '.heif'].includes(ext);
    const isAllowedMime = allowedImageTypes.has(file.mimetype);
    // Some browsers send HEIC with octet-stream MIME — allow by extension too
    if (!isAllowedMime && !isAllowedExt) {
      return cb(new Error('Only JPG, PNG, WEBP, HEIC and HEIF images are allowed'));
    }
    cb(null, true);
  }
});

// ── Middleware ──────────────────────────────────────────────
app.use(compression());
app.use(cors());
app.use(
  helmet({
    // Disable Content Security Policy to prevent breaking any third-party script, stylesheet,
    // font, or image loads (e.g., Razorpay, Google Fonts, unpkg, jsdelivr CDN scripts).
    contentSecurityPolicy: false,
    // Disable Cross-Origin Opener and Embedder policies to avoid blocking cross-origin resources or popups.
    crossOriginEmbedderPolicy: false,
    crossOriginOpenerPolicy: false,
    crossOriginResourcePolicy: false,
    // Explicitly set X-Frame-Options to DENY to protect against Clickjacking attacks.
    frameguard: {
      action: 'deny',
    },
  })
);
app.use(bodyParser.json());

// ── IP Geolocation & Security Helpers ──────────────────────────
const failedLoginTracker = {};

function normalizeClientIp(ip) {
  let normalizedIp = Array.isArray(ip) ? ip[0] : (ip || '');
  normalizedIp = String(normalizedIp).split(',')[0].trim();
  if (normalizedIp.startsWith('::ffff:')) {
    normalizedIp = normalizedIp.substring(7);
  }
  return normalizedIp || '127.0.0.1';
}

const DEVELOPER_WHITELIST_IPS = [
  '152.59.2.171', // Developer PC IP
  '127.0.0.1',
  '::1',
  '::ffff:127.0.0.1',
  ...(process.env.DEVELOPER_IPS ? process.env.DEVELOPER_IPS.split(',').map(s => s.trim()) : [])
];

function isWhitelistedIp(ip) {
  if (!ip) return false;
  const norm = normalizeClientIp(ip);
  let customWhitelist = [];
  try {
    const db = readDB();
    if (Array.isArray(db.settings?.whitelistedIps)) {
      customWhitelist = db.settings.whitelistedIps;
    }
  } catch (e) {}
  return DEVELOPER_WHITELIST_IPS.includes(norm) || DEVELOPER_WHITELIST_IPS.includes(ip) || customWhitelist.includes(norm) || customWhitelist.includes(ip);
}


function formatLocationLabel(location) {
  if (!location) return 'Location not available';
  const parts = [location.city, location.region, location.country]
    .map(part => String(part || '').trim())
    .filter(part => part && !/^unknown/i.test(part));
  return parts.length ? parts.join(', ') : 'Location not available';
}

function getIpLocation(ip) {
  let normalizedIp = normalizeClientIp(ip);

  // Handle local development testing (localhost and local ranges)
  if (normalizedIp === '127.0.0.1' || normalizedIp === '::1' || normalizedIp === 'localhost' || normalizedIp.startsWith('10.') || normalizedIp.startsWith('192.168.') || normalizedIp.startsWith('172.16.')) {
    const cities = [
      { country: 'IN', region: 'GJ', city: 'Ahmedabad', isp: 'Reliance Jio Infocomm' },
      { country: 'IN', region: 'MH', city: 'Mumbai', isp: 'Tata Communications' },
      { country: 'IN', region: 'DL', city: 'New Delhi', isp: 'Airtel India' },
      { country: 'US', region: 'CA', city: 'San Francisco', isp: 'Comcast Cable' },
      { country: 'GB', region: 'ENG', city: 'London', isp: 'British Telecom' }
    ];
    let hash = 0;
    for (let i = 0; i < normalizedIp.length; i++) {
      hash = normalizedIp.charCodeAt(i) + ((hash << 5) - hash);
    }
    const idx = Math.abs(hash) % cities.length;
    return cities[idx];
  }

  try {
    const geo = geoip.lookup(normalizedIp);
    if (geo) {
      const ispMap = {
        'IN': ['Reliance Jio', 'Airtel India', 'Vodafone Idea', 'BSNL Bharat Fiber'],
        'US': ['Comcast Xfinity', 'AT&T Internet', 'Verizon Fios', 'Spectrum'],
        'GB': ['BT Broadband', 'Virgin Media', 'Sky Broadband', 'TalkTalk'],
        'DE': ['Deutsche Telekom', 'Vodafone Germany', '1&1 Internet'],
        'CA': ['Rogers Broadband', 'Bell Canada', 'Shaw Communications']
      };
      const list = ispMap[geo.country] || ['Local ISP', 'Enterprise Network', 'Cloud Provider'];
      let hash = 0;
      for (let i = 0; i < normalizedIp.length; i++) {
        hash = normalizedIp.charCodeAt(i) + ((hash << 5) - hash);
      }
      const isp = list[Math.abs(hash) % list.length];

      return {
        country: geo.country || '',
        region: geo.region || '',
        city: geo.city || '',
        isp: isp
      };
    }
  } catch (err) {
    console.error('GeoIP lookup error:', err.message);
  }

  return {
    country: '',
    region: '',
    city: '',
    isp: 'Network not available'
  };
}

function logVisitorRequest(logEntry) {
  try {
    let logs = [];
    if (fs.existsSync(VISITOR_LOGS_PATH)) {
      try {
        logs = JSON.parse(fs.readFileSync(VISITOR_LOGS_PATH, 'utf8'));
      } catch (e) {
        logs = [];
      }
    }
    logs.push(logEntry);
    if (logs.length > 1000) {
      logs = logs.slice(logs.length - 1000);
    }
    fs.writeFileSync(VISITOR_LOGS_PATH, JSON.stringify(logs, null, 2));
  } catch (err) {
    console.error('Error writing to visitor logs:', err.message);
  }
}

function logSecurityEvent(ip, type, message) {
  const db = readDB();
  db.securityLogs = db.securityLogs || [];
  const logEntry = {
    timestamp: new Date().toISOString(),
    ip,
    type,
    message,
    location: getIpLocation(ip)
  };
  db.securityLogs.push(logEntry);
  if (db.securityLogs.length > 200) {
    db.securityLogs.shift();
  }
  writeDB(db);
}

function autoBlockIp(ip) {
  if (isWhitelistedIp(ip)) {
    console.log(`🛡️ Security: Skipping auto-block for whitelisted developer IP ${ip}.`);
    return;
  }
  const db = readDB();
  db.blockedIps = db.blockedIps || [];
  if (!db.blockedIps.includes(ip)) {
    db.blockedIps.push(ip);
    writeDB(db);
    console.warn(`🚨 Security: Automatically blocked IP ${ip} due to suspicious brute-force activity.`);
  }
}

function trackFailedLogin(ip) {
  const now = Date.now();
  if (!failedLoginTracker[ip]) {
    failedLoginTracker[ip] = [];
  }
  failedLoginTracker[ip] = failedLoginTracker[ip].filter(timestamp => now - timestamp < 15 * 60 * 1000);
  failedLoginTracker[ip].push(now);
  
  if (failedLoginTracker[ip].length >= 5) {
    logSecurityEvent(ip, 'BRUTE_FORCE_DETECTED', `Brute force login attempts detected. Automatically blocking IP.`);
    autoBlockIp(ip);
  }
}

async function sendSecurityAlertEmail(user, geo, ip) {
  if (!mailTransporter && !process.env.RESEND_API_KEY && !process.env.BREVO_API_KEY) {
    console.log(`⚠️ SMTP/Resend not configured. Security alert email skipped for ${user.email}.`);
    return;
  }
  
  const htmlContent = `
    <div style="font-family: Arial, sans-serif; padding: 20px; line-height: 1.6; max-width: 600px; margin: 0 auto; border: 1px solid #e2e8f0; border-radius: 8px;">
      <h2 style="color: #dc2626; margin-top: 0;">⚠️ Security Notice</h2>
      <p>Hello ${user.firstName || 'User'},</p>
      <p>We detected a login to your RK Resin Art account from a location or device we don't recognize:</p>
      <table style="width: 100%; border-collapse: collapse; margin: 20px 0; background: #f8fafc; border-radius: 6px;">
        <tr>
          <td style="padding: 10px; font-weight: bold; width: 35%;">Location:</td>
          <td style="padding: 10px;">${geo.city}, ${geo.region}, ${geo.country}</td>
        </tr>
        <tr>
          <td style="padding: 10px; font-weight: bold;">IP Address:</td>
          <td style="padding: 10px;">${ip}</td>
        </tr>
        <tr>
          <td style="padding: 10px; font-weight: bold;">Date/Time:</td>
          <td style="padding: 10px;">${new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })} (IST)</td>
        </tr>
      </table>
      <p>If this was you, you can safely ignore this email.</p>
      <p style="font-weight: bold; color: #dc2626;">If this was NOT you, please change your password immediately in your account settings or contact support.</p>
      <hr style="border: 0; border-top: 1px solid #e2e8f0; margin: 20px 0;" />
      <p style="font-size: 12px; color: #64748b; margin: 0;">RK Resin Art Security Team</p>
    </div>
  `;

  try {
    const senderEmail = mailTransporter ? mailTransporter.options.auth.user : (process.env.SMTP_USER || 'security@rkresinart.com');
    if (mailTransporter) {
      await mailTransporter.sendMail({
        from: `"RK Resin Art Security" <${senderEmail}>`,
        to: user.email,
        subject: `⚠️ Security Alert: Login from a new location [RK Resin Art]`,
        html: htmlContent
      });
      console.log(`📧 Security warning email sent to ${user.email}`);
    }
  } catch (err) {
    console.error('Failed to send security alert email:', err.message);
  }
}

function sanitizeFirebaseKey(key) {
  if (!key) return 'Unknown';
  if (typeof key !== 'string') key = String(key);
  return key.replace(/[\.\$\#\[\]\/]/g, '_');
}

function updateAggregatedAnalytics(visit) {
  const db = readDB();
  db.analytics = db.analytics || {
    totalVisitors: 0,
    newVisitors: 0,
    returningVisitors: 0,
    countries: {},
    regions: {},
    cities: {},
    isps: {},
    recentIps: []
  };
  
  const stats = db.analytics;
  stats.recentIps = stats.recentIps || [];
  
  if (!stats.recentIps.includes(visit.ip)) {
    stats.recentIps.push(visit.ip);
    if (stats.recentIps.length > 2000) {
      stats.recentIps.shift();
    }
    stats.totalVisitors = (stats.totalVisitors || 0) + 1;
    if (visit.isNew) {
      stats.newVisitors = (stats.newVisitors || 0) + 1;
    } else {
      stats.returningVisitors = (stats.returningVisitors || 0) + 1;
    }
    
    const cleanCountry = sanitizeFirebaseKey(visit.country);
    const cleanRegion = sanitizeFirebaseKey(visit.region);
    const cleanCity = sanitizeFirebaseKey(visit.city);
    const cleanIsp = sanitizeFirebaseKey(visit.isp);

    stats.countries[cleanCountry] = (stats.countries[cleanCountry] || 0) + 1;
    stats.regions[cleanRegion] = (stats.regions[cleanRegion] || 0) + 1;
    stats.cities[cleanCity] = (stats.cities[cleanCity] || 0) + 1;
    stats.isps[cleanIsp] = (stats.isps[cleanIsp] || 0) + 1;
    
    writeDB(db);
  }
}

// ── Rate Limiters & Middlewares ─────────────────────────────────

const globalLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 150,
  message: { error: 'Too many requests. Please try again in a minute.' },
  standardHeaders: true,
  legacyHeaders: false,
});

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: { error: 'Too many login or registration attempts. Please try again in 15 minutes.' },
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res, next, options) => {
    const clientIp = normalizeClientIp(req.headers['x-forwarded-for'] || req.ip || req.socket.remoteAddress || '127.0.0.1');
    logSecurityEvent(clientIp, 'RATE_LIMIT_EXCEEDED', `Auth rate limit exceeded on ${req.originalUrl || req.url}`);
    res.status(options.statusCode).send(options.message);
  }
});

const checkoutLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 5,
  message: { error: 'Too many checkout attempts. Please wait 10 minutes before trying again.' },
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res, next, options) => {
    const clientIp = normalizeClientIp(req.headers['x-forwarded-for'] || req.ip || req.socket.remoteAddress || '127.0.0.1');
    logSecurityEvent(clientIp, 'RATE_LIMIT_EXCEEDED', `Checkout rate limit exceeded on ${req.originalUrl || req.url}`);
    res.status(options.statusCode).send(options.message);
  }
});

const wishlistLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 10,
  message: { error: 'Too many subscription attempts. Please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
});

// Manual cookie parser middleware
app.use((req, res, next) => {
  req.cookies = {};
  const rc = req.headers.cookie;
  if (rc) {
    rc.split(';').forEach(cookie => {
      const parts = cookie.split('=');
      req.cookies[parts.shift().trim()] = decodeURI(parts.join('='));
    });
  }
  next();
});

// Blocklist enforcement middleware
app.use((req, res, next) => {
  const normalizedIp = normalizeClientIp(req.headers['x-forwarded-for'] || req.ip || req.socket.remoteAddress || '');
  
  if (isWhitelistedIp(normalizedIp)) {
    return next();
  }

  const db = readDB();
  const blockedIps = db.blockedIps || [];

  if (blockedIps.includes(normalizedIp)) {
    return res.status(403).send(`<h1>403 Forbidden</h1><p>Access denied. Your IP address (${normalizedIp}) has been blocked by the administrator.</p>`);
  }
  next();
});

// Developer request logger & analytics collector middleware
app.use((req, res, next) => {
  const startTime = Date.now();
  const clientIp = normalizeClientIp(req.headers['x-forwarded-for'] || req.ip || req.socket.remoteAddress || '127.0.0.1');
  
  let visitorId = req.cookies.visitor_id;
  let isNewVisitor = false;
  if (!visitorId) {
    visitorId = crypto.randomBytes(16).toString('hex');
    res.cookie('visitor_id', visitorId, { maxAge: 365 * 24 * 60 * 60 * 1000, httpOnly: true });
    isNewVisitor = true;
  }

  const originalEnd = res.end;
  res.end = function(chunk, encoding) {
    res.end = originalEnd;
    res.end(chunk, encoding);
    
    const duration = Date.now() - startTime;
    const statusCode = res.statusCode;
    
    const ext = path.extname(req.url);
    const isAsset = ext && ['.js', '.css', '.png', '.jpg', '.jpeg', '.gif', '.svg', '.ico', '.woff', '.woff2'].includes(ext.toLowerCase());
    
    if (!isAsset && !req.url.startsWith('/uploads/')) {
      const geo = getIpLocation(clientIp);
      
      // Disabled to prevent automatic visitor analytics updates from triggering database writes on every page load, saving Render bandwidth.
      /*
      try {
        updateAggregatedAnalytics({
          ip: clientIp,
          isNew: isNewVisitor,
          country: geo.country,
          region: geo.region,
          city: geo.city,
          isp: geo.isp
        });
      } catch (err) {
        console.error('Error updating analytics:', err.message);
      }
      */

      const logEntry = {
        timestamp: new Date().toISOString(),
        ip: clientIp,
        url: req.originalUrl || req.url,
        method: req.method,
        userAgent: req.headers['user-agent'] || 'Unknown',
        status: statusCode,
        duration: `${duration}ms`,
        location: formatLocationLabel(geo)
      };
      
      logVisitorRequest(logEntry);
    }
  };
  
  next();
});

// Apply global rate limiting to all APIs
app.use('/api/', globalLimiter);

app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(UPLOAD_DIR));


function getFirebaseDbUrl() {
  return process.env.FIREBASE_DB_URL ||
    process.env.FIREBASE_DATABASE_URL ||
    process.env.FIREBASE_RTDB_URL ||
    process.env.FIREBASE_REALTIME_DATABASE_URL ||
    null;
}

function firebaseRestUrl() {
  const dbUrl = getFirebaseDbUrl();
  if (!dbUrl) return null;
  const secret = process.env.FIREBASE_DB_SECRET || process.env.FIREBASE_SECRET;
  const baseUrl = dbUrl.endsWith('/') ? `${dbUrl}.json` : `${dbUrl}/.json`;
  return secret ? `${baseUrl}?auth=${secret}` : baseUrl;
}

function getR2Config() {
  const accountId  = process.env.R2_ACCOUNT_ID;
  const accessKey  = process.env.R2_ACCESS_KEY_ID;
  const secretKey  = process.env.R2_SECRET_ACCESS_KEY;
  const bucketName = process.env.R2_BUCKET_NAME;
  const publicUrl  = process.env.R2_PUBLIC_URL; // e.g. https://pub-xxxx.r2.dev  or your custom domain
  if (!accountId || !accessKey || !secretKey || !bucketName || !publicUrl) return null;
  return { accountId, accessKey, secretKey, bucketName, publicUrl };
}

// Keep legacy ImgBB helper so existing stored URLs still display correctly
function getImgBbApiKey() {
  return process.env.IMGBB_API_KEY ||
    process.env.IMGBB_KEY ||
    process.env.IMG_BB_API_KEY ||
    process.env.IMG_BB_KEY ||
    null;
}

function hasLiveStoreData(data) {
  if (!data || typeof data !== 'object') return false;
  return Boolean(
    (Array.isArray(data.products) && data.products.length > 0) ||
    (Array.isArray(data.orders) && data.orders.length > 0) ||
    (Array.isArray(data.users) && data.users.length > 0) ||
    (Array.isArray(data.banners) && data.banners.length > 0)
  );
}


// Manual cookie parser middleware
app.use((req, res, next) => {
  req.cookies = {};
  const rc = req.headers.cookie;
  if (rc) {
    rc.split(';').forEach(cookie => {
      const parts = cookie.split('=');
      req.cookies[parts.shift().trim()] = decodeURI(parts.join('='));
    });
  }
  next();
});

// Blocklist enforcement middleware
app.use((req, res, next) => {
  const normalizedIp = normalizeClientIp(req.headers['x-forwarded-for'] || req.ip || req.socket.remoteAddress || '');
  
  if (isWhitelistedIp(normalizedIp)) {
    return next();
  }

  const db = readDB();
  const blockedIps = db.blockedIps || [];

  if (blockedIps.includes(normalizedIp)) {
    return res.status(403).send(`<h1>403 Forbidden</h1><p>Access denied. Your IP address (${normalizedIp}) has been blocked by the administrator.</p>`);
  }
  next();
});

// Developer request logger & analytics collector middleware
app.use((req, res, next) => {
  const startTime = Date.now();
  const clientIp = normalizeClientIp(req.headers['x-forwarded-for'] || req.ip || req.socket.remoteAddress || '127.0.0.1');
  
  let visitorId = req.cookies.visitor_id;
  let isNewVisitor = false;
  if (!visitorId) {
    visitorId = crypto.randomBytes(16).toString('hex');
    res.cookie('visitor_id', visitorId, { maxAge: 365 * 24 * 60 * 60 * 1000, httpOnly: true });
    isNewVisitor = true;
  }

  const originalEnd = res.end;
  res.end = function(chunk, encoding) {
    res.end = originalEnd;
    res.end(chunk, encoding);
    
    const duration = Date.now() - startTime;
    const statusCode = res.statusCode;
    
    const ext = path.extname(req.url);
    const isAsset = ext && ['.js', '.css', '.png', '.jpg', '.jpeg', '.gif', '.svg', '.ico', '.woff', '.woff2'].includes(ext.toLowerCase());
    
    if (!isAsset && !req.url.startsWith('/uploads/')) {
      const geo = getIpLocation(clientIp);
      
      // Disabled to prevent automatic visitor analytics updates from triggering database writes on every page load, saving Render bandwidth.
      /*
      try {
        updateAggregatedAnalytics({
          ip: clientIp,
          isNew: isNewVisitor,
          country: geo.country,
          region: geo.region,
          city: geo.city,
          isp: geo.isp
        });
      } catch (err) {
        console.error('Error updating analytics:', err.message);
      }
      */

      const logEntry = {
        timestamp: new Date().toISOString(),
        ip: clientIp,
        url: req.originalUrl || req.url,
        method: req.method,
        userAgent: req.headers['user-agent'] || 'Unknown',
        status: statusCode,
        duration: `${duration}ms`,
        location: formatLocationLabel(geo)
      };
      
      logVisitorRequest(logEntry);
    }
  };
  
  next();
});

// Apply global rate limiting to all APIs
app.use('/api/', globalLimiter);

app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(UPLOAD_DIR));


function getFirebaseDbUrl() {
  return process.env.FIREBASE_DB_URL ||
    process.env.FIREBASE_DATABASE_URL ||
    process.env.FIREBASE_RTDB_URL ||
    process.env.FIREBASE_REALTIME_DATABASE_URL ||
    null;
}

function firebaseRestUrl() {
  const dbUrl = getFirebaseDbUrl();
  if (!dbUrl) return null;
  const secret = process.env.FIREBASE_DB_SECRET || process.env.FIREBASE_SECRET;
  const baseUrl = dbUrl.endsWith('/') ? `${dbUrl}.json` : `${dbUrl}/.json`;
  return secret ? `${baseUrl}?auth=${secret}` : baseUrl;
}

function getR2Config() {
  const accountId  = process.env.R2_ACCOUNT_ID;
  const accessKey  = process.env.R2_ACCESS_KEY_ID;
  const secretKey  = process.env.R2_SECRET_ACCESS_KEY;
  const bucketName = process.env.R2_BUCKET_NAME;
  const publicUrl  = process.env.R2_PUBLIC_URL;
  if (!accountId || !accessKey || !secretKey || !bucketName || !publicUrl) return null;
  return { accountId, accessKey, secretKey, bucketName, publicUrl };
}

function hasLiveStoreData(data) {
  if (!data || typeof data !== 'object') return false;
  return Boolean(
    (Array.isArray(data.products) && data.products.length > 0) ||
    (Array.isArray(data.orders) && data.orders.length > 0) ||
    (Array.isArray(data.users) && data.users.length > 0) ||
    (Array.isArray(data.banners) && data.banners.length > 0)
  );
}

function backupDatabaseSnapshot(data, reason = 'write') {
  try {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const safeReason = String(reason).replace(/[^a-z0-9-]/gi, '-').toLowerCase();
    const backupPath = path.join(DB_BACKUP_DIR, `db-${safeReason}-${timestamp}.json`);
    fs.writeFileSync(backupPath, JSON.stringify(data, null, 2));
    return backupPath;
  } catch (err) {
    console.error('Failed to create DB backup:', err.message);
    return null;
  }
}

async function initPersistentDatabase() {
  const firebaseUrl = firebaseRestUrl();
  if (!firebaseUrl) {
    console.log('No Firebase database URL set. Running in local storage mode.');
    return;
  }

  try {
    console.log('Loading database from Firebase...');
    const res = await fetch(firebaseUrl);
    if (!res.ok) {
      throw new Error(`Firebase load failed with status ${res.status}`);
    }

    const data = await res.json();
    if (data && typeof data === 'object' && Object.keys(data).length > 0) {
      fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2));
      backupDatabaseSnapshot(data, 'firebase-load');
      console.log('Database successfully loaded and synced from Firebase.');
      return;
    }

    console.log('Firebase database is empty.');
    if (!fs.existsSync(DB_PATH)) return;

    const localData = JSON.parse(fs.readFileSync(DB_PATH, 'utf8'));
    if (!hasLiveStoreData(localData) && process.env.ALLOW_EMPTY_FIREBASE_SEED !== 'true') {
      console.warn('Refusing to seed Firebase with an empty local store. Restore products locally first, or set ALLOW_EMPTY_FIREBASE_SEED=true intentionally.');
      return;
    }

    const syncRes = await fetch(firebaseUrl, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(localData)
    });
    if (syncRes.ok) {
      console.log('Successfully seeded Firebase database from local db.json.');
    } else {
      throw new Error(`Firebase seed failed with status ${syncRes.status}`);
    }
  } catch (e) {
    console.error('💥 Failed to load/sync database from Firebase:', e.message);
    throw e; // Crash server startup to prevent running with blank local data
  }
}

// Keep legacy ImgBB helper so existing stored URLs still display correctly
function getImgBbApiKey() {
  return process.env.IMGBB_API_KEY ||
    process.env.IMGBB_KEY ||
    process.env.IMG_BB_API_KEY ||
    process.env.IMG_BB_KEY ||
    null;
}

function hasLiveStoreData(data) {
  if (!data || typeof data !== 'object') return false;
  return Boolean(
    (Array.isArray(data.products) && data.products.length > 0) ||
    (Array.isArray(data.orders) && data.orders.length > 0) ||
    (Array.isArray(data.users) && data.users.length > 0) ||
    (Array.isArray(data.banners) && data.banners.length > 0)
  );
}

function readDB() {
  try {
    if (!fs.existsSync(DB_PATH)) {
      return {
        settings: {},
        banners: [],
        navLinks: [],
        categories: [],
        products: [],
        orders: [],
        cart: [],
        users: [],
        reviews: [],
        wishlistSubscriptions: [],
        coupons: [],
        blockedIps: [],
        securityLogs: []
      };
    }

    const data = JSON.parse(fs.readFileSync(DB_PATH, 'utf-8'));
    
    // Self-healing database structure initialization
    if (!data.settings) data.settings = {};
    if (!data.banners) data.banners = [];
    if (!data.navLinks) data.navLinks = [];
    if (!data.categories) data.categories = [];
    if (!data.products) data.products = [];
    if (!data.orders) data.orders = [];
    if (!data.cart) data.cart = [];
    if (!data.users) data.users = [];
    if (!data.reviews) data.reviews = [];
    if (!data.coupons) data.coupons = [];
    if (!data.blockedIps) data.blockedIps = [];
    if (!data.securityLogs) data.securityLogs = [];

    // Automatically remove whitelisted developer IPs from blocked list if present
    if (Array.isArray(data.blockedIps)) {
      data.blockedIps = data.blockedIps.filter(ip => {
        const norm = normalizeClientIp(ip);
        return !DEVELOPER_WHITELIST_IPS.includes(norm) && !DEVELOPER_WHITELIST_IPS.includes(ip);
      });
    }

    return data;
  } catch (err) {
    console.error("❌ CRITICAL ERROR reading/parsing DB file:", err.message);
    throw err;
  }
}

function writeDB(data) {
  try {
    if (fs.existsSync(DB_PATH)) {
      const previousData = JSON.parse(fs.readFileSync(DB_PATH, 'utf8'));
      const previousProducts = Array.isArray(previousData.products) ? previousData.products.length : 0;
      const nextProducts = Array.isArray(data.products) ? data.products.length : 0;
      if (previousProducts > 0 && nextProducts === 0) {
        const backupPath = backupDatabaseSnapshot(previousData, 'before-empty-products');
        console.warn(`Product list is being written as empty. Previous DB backup saved: ${backupPath || 'backup failed'}`);
      } else if (previousProducts !== nextProducts || nextProducts > 0) {
        backupDatabaseSnapshot(previousData, 'before-write');
      }
    }
  } catch (err) {
    console.error('Could not create pre-write DB backup:', err.message);
  }

  // 1. Crash-safe atomic local write (write to temp file then renameSync to prevent zero-byte corruption)
  const tempPath = DB_PATH + '.tmp.' + Date.now();
  fs.writeFileSync(tempPath, JSON.stringify(data, null, 2), 'utf8');
  fs.renameSync(tempPath, DB_PATH);

  // 2. Queue background push to Firebase to prevent race conditions
  triggerFirebaseSync(data);
}

function triggerFirebaseSync(data) {
  const firebaseUrl = firebaseRestUrl();
  if (!firebaseUrl) return;

  if (isSyncingToFirebase) {
    // If a sync is already running, accumulate the latest state for the next run
    pendingFirebaseSyncData = data;
    return;
  }

  isSyncingToFirebase = true;
  pendingFirebaseSyncData = null;

  fetch(firebaseUrl, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(data)
  }).then(async res => {
    if (!res.ok) {
      let errBody = '';
      try {
        errBody = await res.text();
      } catch (_) {}
      console.error(`❌ Firebase sync failed with status ${res.status}. Response: ${errBody}`);
    } else {
      console.log("☁️ Database background-synced to Firebase successfully!");
    }
  }).catch(err => {
    console.error("❌ Firebase background sync error:", err);
  }).finally(() => {
    isSyncingToFirebase = false;
    if (pendingFirebaseSyncData) {
      const nextData = pendingFirebaseSyncData;
      triggerFirebaseSync(nextData);
    }
  });
}
function nextId(arr) {
  return arr.length ? Math.max(...arr.map(i => i.id)) + 1 : 1;
}
function validatePromoCode(code, subtotal) {
  const db = readDB();
  db.coupons = db.coupons || [];
  const coupon = db.coupons.find(c => c.code === String(code).trim().toUpperCase());

  if (!coupon) {
    return { valid: false, error: 'Coupon code is invalid' };
  }
  if (coupon.isActive === false) {
    return { valid: false, error: 'Coupon is currently inactive' };
  }
  if (coupon.minPurchase && subtotal < Number(coupon.minPurchase)) {
    return { valid: false, error: `Minimum purchase of ₹${coupon.minPurchase} is required for this coupon` };
  }

  // Calculate discount
  let discount = 0;
  if (coupon.type === 'percentage') {
    discount = Math.round((subtotal * Number(coupon.value)) / 100);
  } else {
    discount = Number(coupon.value);
  }

  // Cap discount to subtotal
  discount = Math.min(discount, subtotal);

  return {
    valid: true,
    discount,
    finalTotal: subtotal - discount,
    coupon: {
      id: coupon.id,
      code: coupon.code,
      type: coupon.type,
      value: coupon.value
    }
  };
}
function publicUser(user) {
  if (!user) return null;
  const { passwordHash, ...safeUser } = user;
  return safeUser;
}

// ── Auth middleware ─────────────────────────────────────────
function requireAdmin(req, res, next) {
  const authHeader = req.headers['authorization'];
  if (!authHeader) return res.status(401).json({ error: 'No token' });

  const parts = authHeader.split(' ');
  if (parts.length !== 2 || parts[0] !== 'Bearer') {
    return res.status(401).json({ error: 'Malformed authorization header' });
  }

  const token = parts[1];
  if (!token) return res.status(401).json({ error: 'No token provided' });

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    if (decoded.role !== 'admin') return res.status(403).json({ error: 'Forbidden' });
    next();
  } catch (err) {
    res.status(401).json({ error: 'Invalid or expired token' });
  }
}

function getUserFromRequest(req) {
  const authHeader = req.headers['authorization'];
  if (!authHeader) return null;
  const parts = authHeader.split(' ');
  if (parts.length !== 2 || parts[0] !== 'Bearer') return null;

  try {
    const decoded = jwt.verify(parts[1], JWT_SECRET);
    if (decoded.role !== 'user' && decoded.role !== 'admin') return null;
    return decoded;
  } catch {
    return null;
  }
}

function requireUser(req, res, next) {
  const decoded = getUserFromRequest(req);
  if (!decoded) return res.status(401).json({ error: 'Please login first' });
  req.user = decoded;
  next();
}

// ══════════════════════════════════════════════════════════
// PUBLIC ROUTES
// ══════════════════════════════════════════════════════════

// ── TEST EMAIL ENDPOINT ─────────────────────────────────────
// Visit: http://localhost:3000/api/test-email?to=YOUR_EMAIL
app.get('/api/test-email', async (req, res) => {
  if (!mailTransporter) {
    return res.status(500).json({ success: false, error: 'Mail transporter not initialised. Check SMTP settings in db.json.' });
  }
  try {
    const db = readDB();
    const senderEmail = mailTransporter.options.auth.user;
    const targetEmail = req.query.to || db.settings.adminEmail || senderEmail;
    const info = await mailTransporter.sendMail({
      from: `"RK Resin Art" <${senderEmail}>`,
      to: targetEmail,
      subject: '✅ RK Resin Art — SMTP Test Email',
      html: `
        <div style="font-family:Arial,sans-serif;max-width:480px;margin:0 auto;padding:30px;background:#f0fdfa;border-radius:12px;border:1px solid #0f766e;">
          <h2 style="color:#0f766e;margin:0 0 12px 0;">✅ Email is working!</h2>
          <p style="color:#334155;font-size:15px;">This is a test email from your <strong>RK Resin Art</strong> store.</p>
          <p style="color:#64748b;font-size:13px;">Sent via: <strong>${senderEmail}</strong><br>Sent to: <strong>${targetEmail}</strong><br>Time: ${new Date().toLocaleString('en-IN')}</p>
          <p style="color:#0f766e;font-weight:bold;margin-top:20px;">Your email notifications are set up correctly 🎉</p>
        </div>`,
      text: `RK Resin Art SMTP Test\nEmail is working!\nSent via: ${senderEmail}\nSent to: ${targetEmail}\nTime: ${new Date().toLocaleString('en-IN')}`
    });
    const preview = nodemailer.getTestMessageUrl(info);
    console.log(`📧 Test email dispatched successfully to ${targetEmail}!`);
    res.json({ success: true, message: `Test email sent to ${targetEmail}!`, preview: preview || null });
  } catch (err) {
    console.error('⚠️ Test email failed:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET review summary (public — for rating badges on product cards)
app.get('/api/reviews/summary', (req, res) => {
  const db = readDB();
  const summary = (db.reviews || []).map(r => ({ productId: r.productId, rating: r.rating }));
  res.json(summary);
});

// POST subscribe to stock alert (public)
app.post('/api/wishlist/subscribe', wishlistLimiter, (req, res) => {
  const db = readDB();
  db.wishlistSubscriptions = db.wishlistSubscriptions || [];
  const { email, productId } = req.body;
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!email || !productId || !emailRegex.test(email.trim())) {
    return res.status(400).json({ error: 'A valid email and Product ID are required' });
  }

  const prod = db.products.find(p => p.id === Number(productId));
  if (!prod) return res.status(404).json({ error: 'Product not found' });

  // Prevent duplicate subscriptions
  const exists = db.wishlistSubscriptions.some(s => s.email === email.trim().toLowerCase() && s.productId === Number(productId));
  if (!exists) {
    db.wishlistSubscriptions.push({
      email: email.trim().toLowerCase(),
      productId: Number(productId),
      createdAt: new Date().toISOString()
    });
    writeDB(db);
  }
  res.json({ success: true, message: 'Subscribed to stock alert!' });
});

// Diagnostic DB Endpoint
app.get('/api/debug-db', requireAdmin, (req, res) => {
  res.json({
    firebaseConfigured: !!getFirebaseDbUrl(),
    r2Configured: !!getR2Config(),
    imgbbConfigured: !!getImgBbApiKey(),
    nodeEnv: process.env.NODE_ENV || 'development',
    persistentDisk: !!process.env.PERSISTENT_DISK_PATH
  });
});

// GET site settings (announce bar etc.)
app.get('/api/settings', (req, res) => {
  const db = readDB();
  res.json({
    announce: db.settings.announce,
    cartEnabled: db.settings.cartEnabled !== false,
    trackStock: db.settings.trackStock !== false,
    shippingRate: db.settings.shippingRate !== undefined ? Number(db.settings.shippingRate) : 60,
    shippingThreshold: db.settings.shippingThreshold !== undefined ? Number(db.settings.shippingThreshold) : 999,
    otherCharges: db.settings.otherCharges !== undefined ? Number(db.settings.otherCharges) : 0,
    otherChargesType: db.settings.otherChargesType || 'flat',
    razorpayEnabled: db.settings.razorpayEnabled !== false
  });
});

// GET banners
app.get('/api/banners', (req, res) => {
  res.json(readDB().banners);
});

// GET nav links
app.get('/api/nav', (req, res) => {
  res.json(readDB().navLinks);
});

// GET categories
app.get('/api/categories', (req, res) => {
  res.json(readDB().categories);
});

// GET products (with optional ?category=xxx&search=xxx&badge=xxx&sortBy=xxx&page=1&limit=12)
app.get('/api/products', (req, res) => {
  const db = readDB();
  let prods = [...db.products];
  const { category, search, badge, sortBy, page = 1, limit = 24 } = req.query;

  if (category && category !== 'All') {
    prods = prods.filter(p => p.category === category);
  }
  if (badge) {
    prods = prods.filter(p => p.badge && p.badge.toLowerCase() === badge.toLowerCase());
  }
  if (search) {
    const q = search.toLowerCase();
    prods = prods.filter(p =>
      p.name.toLowerCase().includes(q) ||
      p.category.toLowerCase().includes(q) ||
      (p.description || '').toLowerCase().includes(q)
    );
  }

  if (sortBy) {
    if (sortBy === 'nameAsc') {
      prods.sort((a, b) => (a.name || '').localeCompare(b.name || '', 'en', { sensitivity: 'base' }));
    } else if (sortBy === 'nameDesc') {
      prods.sort((a, b) => (b.name || '').localeCompare(a.name || '', 'en', { sensitivity: 'base' }));
    } else if (sortBy === 'priceAsc') {
      prods.sort((a, b) => Number(a.price || 0) - Number(b.price || 0));
    } else if (sortBy === 'priceDesc') {
      prods.sort((a, b) => Number(b.price || 0) - Number(a.price || 0));
    }
  }

  const total = prods.length;
  const start = (page - 1) * limit;
  const paginated = prods.slice(start, start + Number(limit));

  res.json({ products: paginated, total, page: Number(page), pages: Math.ceil(total / limit) });
});

// GET single product
app.get('/api/products/:id', (req, res) => {
  const db = readDB();
  const prod = db.products.find(p => p.id === Number(req.params.id));
  if (!prod) return res.status(404).json({ error: 'Not found' });
  res.json(prod);
});

// POST admin login
app.post('/api/admin/login', authLimiter, async (req, res) => {
  const db = readDB();
  const { password } = req.body;
  const clientIp = normalizeClientIp(req.headers['x-forwarded-for'] || req.ip || req.socket.remoteAddress || '127.0.0.1');
  const correctPassword = process.env.ADMIN_PASSWORD || db.settings.adminPassword;
  const isDefaultPassword = !correctPassword;
  const DEFAULT_ADMIN_PASS = 'rk2024';

  // If no custom password set, use default; if custom hashed password, use bcrypt
  let passwordMatch = false;
  if (isDefaultPassword) {
    passwordMatch = (password === DEFAULT_ADMIN_PASS);
  } else if (correctPassword.startsWith('$2')) {
    // bcrypt hash
    passwordMatch = await bcrypt.compare(password, correctPassword);
  } else {
    // Legacy plain-text password from old setup — accept but upgrade to hash
    passwordMatch = (password === correctPassword);
    if (passwordMatch) {
      // Upgrade to bcrypt
      db.settings.adminPassword = await bcrypt.hash(password, 10);
      writeDB(db);
    }
  }

  if (!passwordMatch) {
    trackFailedLogin(clientIp);
    logSecurityEvent(clientIp, 'FAILED_ADMIN_LOGIN', 'Failed admin login attempt');
    return res.status(401).json({ error: 'Wrong password' });
  }
  // Clear any failed login tracking on success
  delete failedLoginTracker[clientIp];

  // Record login log
  const geo = getIpLocation(clientIp);
  db.loginLogs = db.loginLogs || [];
  db.loginLogs.push({
    timestamp: new Date().toISOString(),
    email: 'Admin',
    role: 'Admin',
    ip: clientIp,
    location: geo
  });
  if (db.loginLogs.length > 500) {
    db.loginLogs.shift();
  }
  writeDB(db);

  const token = jwt.sign({ role: 'admin' }, JWT_SECRET, { expiresIn: '8h' });
  res.json({ token, message: 'Login successful' });
});

// POST change admin password
app.post('/api/admin/change-password', requireAdmin, async (req, res) => {
  const db = readDB();
  const { currentPassword, newPassword } = req.body;
  const clientIp = normalizeClientIp(req.headers['x-forwarded-for'] || req.ip || req.socket.remoteAddress || '127.0.0.1');

  if (!currentPassword || !newPassword) {
    return res.status(400).json({ error: 'Current password and new password are required' });
  }
  if (newPassword.length < 8) {
    return res.status(400).json({ error: 'New admin password must be at least 8 characters' });
  }

  const correctPassword = process.env.ADMIN_PASSWORD || db.settings.adminPassword;
  const DEFAULT_ADMIN_PASS = 'rk2024';

  let passwordMatch = false;
  if (!correctPassword) {
    passwordMatch = (currentPassword === DEFAULT_ADMIN_PASS);
  } else if (correctPassword.startsWith('$2')) {
    passwordMatch = await bcrypt.compare(currentPassword, correctPassword);
  } else {
    passwordMatch = (currentPassword === correctPassword);
  }

  if (!passwordMatch) {
    logSecurityEvent(clientIp, 'FAILED_ADMIN_PW_CHANGE', 'Attempted admin password change with wrong current password');
    return res.status(401).json({ error: 'Current admin password is incorrect' });
  }

  db.settings = db.settings || {};
  db.settings.adminPassword = await bcrypt.hash(newPassword, 10);
  writeDB(db);
  logSecurityEvent(clientIp, 'ADMIN_PASSWORD_CHANGED', 'Admin password changed successfully');
  res.json({ success: true, message: 'Admin password changed successfully!' });
});


// CUSTOMER AUTH
app.post('/api/auth/register', authLimiter, async (req, res) => {
  const db = readDB();
  db.users = db.users || [];

  const name = (req.body.name || '').trim();
  const email = (req.body.email || '').trim().toLowerCase();
  const phone = (req.body.phone || '').trim();
  const password = req.body.password || '';

  if (!name || !email || !phone || password.length < 8) {
    return res.status(400).json({ error: 'Name, email, phone and 8+ character password are required' });
  }
  if (db.users.some(u => u.email === email)) {
    return res.status(409).json({ error: 'Email is already registered' });
  }

  const user = {
    id: nextId(db.users),
    name,
    email,
    phone,
    address: (req.body.address || '').trim(),
    city: (req.body.city || '').trim(),
    pin: (req.body.pin || '').trim(),
    passwordHash: await bcrypt.hash(password, 10),
    createdAt: new Date().toISOString()
  };
  db.users.push(user);
  writeDB(db);

  const token = jwt.sign({ role: 'user', userId: user.id }, JWT_SECRET, { expiresIn: '30d' });
  res.json({ token, user: publicUser(user) });
});

app.post('/api/auth/login', authLimiter, async (req, res) => {
  const db = readDB();
  db.users = db.users || [];
  const email = (req.body.email || '').trim().toLowerCase();
  const password = req.body.password || '';
  const clientIp = normalizeClientIp(req.headers['x-forwarded-for'] || req.ip || req.socket.remoteAddress || '127.0.0.1');
  const user = db.users.find(u => u.email === email);

  if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
    trackFailedLogin(clientIp);
    logSecurityEvent(clientIp, 'FAILED_LOGIN', `Failed login attempt for email: ${email}`);
    return res.status(401).json({ error: 'Invalid email or password' });
  }

  // Clear failed logins on success
  delete failedLoginTracker[clientIp];

  // Geolocation checks for unusual login activity
  const geo = getIpLocation(clientIp);
  if (user.lastLoginCountry && (user.lastLoginCountry !== geo.country || user.lastLoginRegion !== geo.region)) {
    logSecurityEvent(clientIp, 'UNUSUAL_LOGIN', `User ${user.email} logged in from a new region: ${geo.city}, ${geo.region}, ${geo.country} (Previous: ${user.lastLoginCity || 'Unknown'}, ${user.lastLoginRegion || 'Unknown'}, ${user.lastLoginCountry || 'Unknown'})`);
    sendSecurityAlertEmail(user, geo, clientIp);
  }

  // Update user last login location
  const idx = db.users.findIndex(u => u.id === user.id);
  if (idx !== -1) {
    db.users[idx].lastLoginIp = clientIp;
    db.users[idx].lastLoginCountry = geo.country;
    db.users[idx].lastLoginRegion = geo.region;
    db.users[idx].lastLoginCity = geo.city;
  }

  // Record login log
  db.loginLogs = db.loginLogs || [];
  db.loginLogs.push({
    timestamp: new Date().toISOString(),
    email: user.email,
    role: 'User',
    ip: clientIp,
    location: geo
  });
  if (db.loginLogs.length > 500) {
    db.loginLogs.shift();
  }
  writeDB(db);

  const token = jwt.sign({ role: 'user', userId: user.id }, JWT_SECRET, { expiresIn: '30d' });
  res.json({ token, user: publicUser(db.users[idx] || user) });
});

app.get('/api/auth/me', requireUser, (req, res) => {
  const db = readDB();
  const user = (db.users || []).find(u => u.id === req.user.userId);
  if (!user) return res.status(404).json({ error: 'User not found' });
  res.json({ user: publicUser(user) });
});

app.put('/api/auth/profile', requireUser, (req, res) => {
  const db = readDB();
  db.users = db.users || [];
  const idx = db.users.findIndex(u => u.id === req.user.userId);
  if (idx === -1) return res.status(404).json({ error: 'User not found' });

  ['name', 'phone', 'address', 'city', 'pin'].forEach(field => {
    if (req.body[field] !== undefined) db.users[idx][field] = String(req.body[field]).trim();
  });
  writeDB(db);
  res.json({ user: publicUser(db.users[idx]) });
});

// GET customer cart (sync from db)
app.get('/api/auth/cart', requireUser, (req, res) => {
  const db = readDB();
  const user = (db.users || []).find(u => u.id === req.user.userId);
  if (!user) return res.status(404).json({ error: 'User not found' });
  res.json({ cart: user.cart || [] });
});

// PUT customer cart (sync to db)
app.put('/api/auth/cart', requireUser, (req, res) => {
  const db = readDB();
  const idx = db.users.findIndex(u => u.id === req.user.userId);
  if (idx === -1) return res.status(404).json({ error: 'User not found' });
  
  db.users[idx].cart = req.body.cart || [];
  writeDB(db);
  res.json({ success: true, cart: db.users[idx].cart });
});

// GET my orders (customer)
app.get('/api/auth/orders', requireUser, (req, res) => {
  const db = readDB();
  const myOrders = (db.orders || [])
    .filter(o => o.userId === req.user.userId)
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  res.json(myOrders);
});

// ── ADMIN USER MANAGEMENT ─────────────────────────────────────

// GET all users (admin only)
app.get('/api/admin/users', requireAdmin, (req, res) => {
  const db = readDB();
  const users = (db.users || []).map(u => {
    const { passwordHash, cart, passwordPlain, ...safe } = u;
    // Count orders for this user
    const orderCount = (db.orders || []).filter(o => o.userId === u.id).length;
    return { ...safe, orderCount, hasPassword: !!passwordHash };
  });
  res.json(users);
});

// PUT edit user by id (admin only) — can also reset password
app.put('/api/admin/users/:id', requireAdmin, async (req, res) => {
  const db = readDB();
  db.users = db.users || [];
  const userId = Number(req.params.id);
  const idx = db.users.findIndex(u => u.id === userId);
  if (idx === -1) return res.status(404).json({ error: 'User not found' });

  const allowed = ['name', 'phone', 'address', 'city', 'pin'];
  allowed.forEach(field => {
    if (req.body[field] !== undefined) {
      db.users[idx][field] = String(req.body[field]).trim();
    }
  });

  // Admin editing user's email directly
  if (req.body.email) {
    const newEmail = String(req.body.email).trim().toLowerCase();
    if (newEmail && newEmail !== db.users[idx].email) {
      if (db.users.some(u => u.id !== userId && u.email === newEmail)) {
        return res.status(409).json({ error: 'This email is already in use by another user' });
      }
      db.users[idx].email = newEmail;
    }
  }

  // Admin password reset (direct — no OTP needed for admin)
  if (req.body.password && req.body.password.length >= 8) {
    db.users[idx].passwordHash = await bcrypt.hash(req.body.password, 10);
  }

  writeDB(db);
  const { passwordHash, cart, passwordPlain, ...safe } = db.users[idx];
  const orderCount = (db.orders || []).filter(o => o.userId === userId).length;
  res.json({ user: { ...safe, orderCount, hasPassword: true } });
});

// DELETE user by id (admin only)
app.delete('/api/admin/users/:id', requireAdmin, (req, res) => {
  const db = readDB();
  db.users = db.users || [];
  const userId = Number(req.params.id);
  const idx = db.users.findIndex(u => u.id === userId);
  if (idx === -1) return res.status(404).json({ error: 'User not found' });
  db.users.splice(idx, 1);
  writeDB(db);
  res.json({ success: true });
});

// ── OTP PASSWORD CHANGE (User self-service) ───────────────────
const otpStore = new Map(); // email -> { otp, expiresAt }

// POST request OTP — user must be logged in
app.post('/api/auth/request-password-otp', requireUser, async (req, res) => {
  const db = readDB();
  const user = (db.users || []).find(u => u.id === req.user.userId);
  if (!user) return res.status(404).json({ error: 'User not found' });

  const { newPassword } = req.body;
  if (!newPassword || newPassword.length < 8) {
    return res.status(400).json({ error: 'New password must be at least 8 characters' });
  }

  // Generate 6-digit OTP
  const otp = String(Math.floor(100000 + Math.random() * 900000));
  const expiresAt = Date.now() + 5 * 60 * 1000; // 5 minutes
  otpStore.set(user.email, { otp, expiresAt, userId: user.id });

  // Send OTP email
  const htmlBody = `
    <div style="font-family:Arial,sans-serif;max-width:500px;margin:auto;padding:32px;background:#f9fafb;border-radius:12px">
      <div style="text-align:center;margin-bottom:24px">
        <div style="font-size:2.5rem">🔐</div>
        <h2 style="color:#0f766e;margin:8px 0">Password Change OTP</h2>
        <p style="color:#6b7280;margin:0">RK Resin Art Account Security</p>
      </div>
      <p style="color:#374151">Hi <strong>${user.name}</strong>,</p>
      <p style="color:#374151">You requested a password change. Use the OTP below to confirm. <strong>This OTP expires in 5 minutes.</strong></p>
      <div style="text-align:center;margin:28px 0">
        <div style="display:inline-block;background:#0f766e;color:#fff;font-size:2.2rem;font-weight:900;letter-spacing:10px;padding:16px 32px;border-radius:10px">${otp}</div>
      </div>
      <p style="color:#6b7280;font-size:0.85rem">If you did not request this, please ignore this email. Your password will remain unchanged.</p>
      <hr style="border:none;border-top:1px solid #e5e7eb;margin:20px 0">
      <p style="color:#9ca3af;font-size:0.78rem;text-align:center">RK Resin Art — Crafted with love 🎨</p>
    </div>`;

  const textBody = `Your RK Resin Art password change OTP is: ${otp}\nThis OTP expires in 5 minutes.\nIf you did not request this, ignore this email.`;

  try {
    const sentViaHTTPS = await sendEmailViaHTTPS(user.email, '🔐 Your Password Change OTP — RK Resin Art', htmlBody, textBody);
    if (!sentViaHTTPS && mailTransporter) {
      const senderEmail = mailTransporter.options.auth.user;
      await mailTransporter.sendMail({
        from: `"RK Resin Art" <${senderEmail}>`,
        to: user.email,
        subject: '🔐 Your Password Change OTP — RK Resin Art',
        html: htmlBody,
        text: textBody
      });
    }
    console.log(`[OTP] Sent password change OTP to ${user.email}`);
    res.json({ success: true, message: `OTP sent to ${user.email}` });
  } catch (err) {
    console.error('[OTP] Email send failed:', err.message);
    // Log OTP for dev/debugging (never sent to client)
    if (process.env.NODE_ENV !== 'production' && !process.env.RENDER) {
      console.log(`[OTP DEV] OTP for ${user.email}: ${otp}`);
    }
    res.json({ success: true, message: `OTP sent to ${user.email}` });
  }
});

// POST confirm OTP + change password
app.post('/api/auth/change-password', requireUser, async (req, res) => {
  const { otp, newPassword } = req.body;
  if (!otp || !newPassword || newPassword.length < 8) {
    return res.status(400).json({ error: 'OTP and a new password (8+ chars) are required' });
  }

  const db = readDB();
  const user = (db.users || []).find(u => u.id === req.user.userId);
  if (!user) return res.status(404).json({ error: 'User not found' });

  const stored = otpStore.get(user.email);
  if (!stored) return res.status(400).json({ error: 'No OTP requested. Please request a new one.' });
  if (Date.now() > stored.expiresAt) {
    otpStore.delete(user.email);
    return res.status(400).json({ error: 'OTP has expired. Please request a new one.' });
  }
  if (stored.otp !== String(otp).trim()) {
    return res.status(400).json({ error: 'Incorrect OTP. Please try again.' });
  }
  if (stored.userId !== req.user.userId) {
    return res.status(403).json({ error: 'OTP mismatch. Please request a new one.' });
  }

  // Valid — update password
  otpStore.delete(user.email);
  const idx = db.users.findIndex(u => u.id === req.user.userId);
  db.users[idx].passwordHash = await bcrypt.hash(newPassword, 10);
  writeDB(db);
  res.json({ success: true, message: 'Password changed successfully!' });
});

// ── UNAUTHENTICATED FORGOT PASSWORD VIA OTP (Login screen) ─────────

// POST request forgot password OTP
app.post('/api/auth/forgot-password-otp', authLimiter, async (req, res) => {
  const email = (req.body.email || '').trim().toLowerCase();
  if (!email || !email.includes('@')) {
    return res.status(400).json({ error: 'Please enter a valid registered email address' });
  }

  const db = readDB();
  const user = (db.users || []).find(u => u.email === email);
  if (!user) {
    return res.status(404).json({ error: 'No account found with this email address' });
  }

  // Generate 6-digit OTP
  const otp = String(Math.floor(100000 + Math.random() * 900000));
  const expiresAt = Date.now() + 5 * 60 * 1000; // 5 minutes
  otpStore.set(user.email, { otp, expiresAt, userId: user.id });

  const htmlBody = `
    <div style="font-family:Arial,sans-serif;max-width:500px;margin:auto;padding:32px;background:#f9fafb;border-radius:12px">
      <div style="text-align:center;margin-bottom:24px">
        <div style="font-size:2.5rem">🔑</div>
        <h2 style="color:#0f766e;margin:8px 0">Reset Password OTP</h2>
        <p style="color:#6b7280;margin:0">RK Resin Art Account Security</p>
      </div>
      <p style="color:#374151">Hi <strong>${user.name}</strong>,</p>
      <p style="color:#374151">We received a request to reset your password. Use the 6-digit OTP code below. <strong>This OTP expires in 5 minutes.</strong></p>
      <div style="text-align:center;margin:28px 0">
        <div style="display:inline-block;background:#0f766e;color:#fff;font-size:2.2rem;font-weight:900;letter-spacing:10px;padding:16px 32px;border-radius:10px">${otp}</div>
      </div>
      <p style="color:#6b7280;font-size:0.85rem">If you did not request a password reset, please ignore this email. Your account remains secure.</p>
      <hr style="border:none;border-top:1px solid #e5e7eb;margin:20px 0">
      <p style="color:#9ca3af;font-size:0.78rem;text-align:center">RK Resin Art — Crafted with love 🎨</p>
    </div>`;

  const textBody = `Your RK Resin Art password reset OTP is: ${otp}\nThis OTP expires in 5 minutes.`;

  try {
    const sentViaHTTPS = await sendEmailViaHTTPS(user.email, '🔑 Your Password Reset OTP — RK Resin Art', htmlBody, textBody);
    if (!sentViaHTTPS && mailTransporter) {
      const senderEmail = mailTransporter.options.auth.user;
      await mailTransporter.sendMail({
        from: `"RK Resin Art" <${senderEmail}>`,
        to: user.email,
        subject: '🔑 Your Password Reset OTP — RK Resin Art',
        html: htmlBody,
        text: textBody
      });
    }
    console.log(`[FORGOT OTP] Sent password reset OTP to ${user.email}`);
    res.json({ success: true, message: `OTP sent to ${user.email}` });
  } catch (err) {
    console.error('[FORGOT OTP] Email send failed:', err.message);
    if (process.env.NODE_ENV !== 'production' && !process.env.RENDER) {
      console.log(`[FORGOT OTP DEV] OTP for ${user.email}: ${otp}`);
    }
    res.json({ success: true, message: `OTP sent to ${user.email}` });
  }
});

// POST verify OTP & reset password -> logs user in automatically!
app.post('/api/auth/reset-password-otp', authLimiter, async (req, res) => {
  const email = (req.body.email || '').trim().toLowerCase();
  const { otp, newPassword } = req.body;

  if (!email || !otp || !newPassword || newPassword.length < 8) {
    return res.status(400).json({ error: 'Email, OTP, and a new password (8+ chars) are required' });
  }

  const db = readDB();
  const user = (db.users || []).find(u => u.email === email);
  if (!user) return res.status(404).json({ error: 'User not found' });

  const stored = otpStore.get(user.email);
  if (!stored) return res.status(400).json({ error: 'No OTP requested for this email. Please request a new one.' });
  if (Date.now() > stored.expiresAt) {
    otpStore.delete(user.email);
    return res.status(400).json({ error: 'OTP has expired. Please request a new one.' });
  }
  if (stored.otp !== String(otp).trim()) {
    return res.status(400).json({ error: 'Incorrect OTP code. Please check your email.' });
  }

  // Valid OTP -> update password hash
  otpStore.delete(user.email);
  const idx = db.users.findIndex(u => u.id === user.id);
  db.users[idx].passwordHash = await bcrypt.hash(newPassword, 10);
  writeDB(db);

  // Generate JWT token so user is automatically logged in!
  const token = jwt.sign({ role: 'user', userId: user.id }, JWT_SECRET, { expiresIn: '30d' });
  res.json({ token, user: publicUser(db.users[idx]), message: 'Password reset & logged in successfully!' });
});



app.post('/api/payment/validate-coupon', (req, res) => {
  const { code, subtotal } = req.body;
  if (!code) return res.status(400).json({ error: 'Promo code is required' });
  if (subtotal === undefined || isNaN(subtotal)) return res.status(400).json({ error: 'Subtotal is required and must be a number' });

  const result = validatePromoCode(code, Number(subtotal));
  if (!result.valid) {
    return res.status(400).json({ error: result.error });
  }
  res.json(result);
});

// ── Razorpay Online Payment Routes ──────────────────────────
// 1. Create Razorpay order (secure, server-side calculations)
app.post('/api/payment/create-order', checkoutLimiter, (req, res) => {
  const db = readDB();
  const { items, couponCode } = req.body;
  if (!items || !items.length) return res.status(400).json({ error: 'No items provided' });

  // Stock check & Secure Price calculation
  let subtotal = 0;
  for (const item of items) {
    const prod = db.products.find(p => p.id === item.id);
    if (!prod) {
      return res.status(404).json({ error: `Product "${item.name}" not found` });
    }
    if (item.selectedVariant && prod.variants && prod.variants.length > 0) {
      const variant = prod.variants.find(v => v.label === item.selectedVariant);
      if (variant) {
        if (db.settings.trackStock !== false) {
          if (variant.stock !== undefined && variant.stock < item.qty) {
            return res.status(400).json({ error: `Sorry, only ${variant.stock} unit(s) of "${prod.name} (${item.selectedVariant})" in stock` });
          }
        }
      }
    } else {
      if (db.settings.trackStock !== false) {
        if (prod.stock !== undefined && prod.stock < item.qty) {
          return res.status(400).json({ error: `Sorry, only ${prod.stock} unit(s) of "${prod.name}" in stock` });
        }
      }
    }
    subtotal += prod.price * item.qty;
  }

  let discount = 0;
  if (couponCode) {
    const valResult = validatePromoCode(couponCode, subtotal);
    if (valResult.valid) {
      discount = valResult.discount;
    }
  }

  const shippingRate = db.settings.shippingRate !== undefined ? Number(db.settings.shippingRate) : 60;
  const shippingThreshold = db.settings.shippingThreshold !== undefined ? Number(db.settings.shippingThreshold) : 999;
  const shipping = subtotal >= shippingThreshold ? 0 : shippingRate;
  
  const taxableAmount = Math.max(0, subtotal - discount);
  const otherCharges = db.settings.otherCharges !== undefined ? Number(db.settings.otherCharges) : 0;
  const otherChargesType = db.settings.otherChargesType || 'flat';
  const otherChargesAmount = otherChargesType === 'percentage' 
    ? Math.round(taxableAmount * (otherCharges / 100)) 
    : otherCharges;
  const grandTotal = taxableAmount + shipping + otherChargesAmount;

  const options = {
    amount: grandTotal * 100, // amount in paisa
    currency: 'INR',
    receipt: `receipt_order_${Date.now()}`
  };

  const client = getRazorpayClient();
  client.orders.create(options, (err, order) => {
    if (err) {
      console.error("Razorpay Order Creation Error Object:", err);
      let errMsg = 'Unknown error';
      if (typeof err === 'object' && err !== null) {
        errMsg = err.description || (err.error && err.error.description) || err.message || JSON.stringify(err);
      } else {
        errMsg = String(err);
      }
      return res.status(500).json({ error: 'Failed to create payment order: ' + errMsg });
    }
    res.json({
      success: true,
      keyId: db.settings.razorpayKeyId || process.env.RAZORPAY_KEY_ID || '',
      order
    });
  });
});

// 2. Cryptographically verify signature & place order
app.post('/api/payment/verify', (req, res) => {
  const db = readDB();
  db.orders = db.orders || [];
  const {
    razorpay_payment_id,
    razorpay_order_id,
    razorpay_signature,
    items,
    customer,
    couponCode
  } = req.body;

  if (!razorpay_payment_id || !razorpay_order_id || !razorpay_signature) {
    return res.status(400).json({ error: 'Payment details are incomplete' });
  }

  // Cryptographic SHA-256 HMAC verification
  const keySecret = db.settings.razorpayKeySecret || process.env.RAZORPAY_KEY_SECRET || '';
  const hmac = crypto.createHmac('sha256', keySecret);
  hmac.update(razorpay_order_id + "|" + razorpay_payment_id);
  const generatedSignature = hmac.digest('hex');

  if (generatedSignature !== razorpay_signature) {
    return res.status(400).json({ error: 'Signature verification failed! Potential tampering detected.' });
  }

  // Signature verified successfully! Create order and deduct stock
  if (!items || !items.length) return res.status(400).json({ error: 'No items provided' });

  // Stock deduction & Verification
  for (const item of items) {
    const prodIdx = db.products.findIndex(p => p.id === item.id);
    if (prodIdx === -1) {
      return res.status(400).json({ error: `Product "${item.name}" not found` });
    }
    const prod = db.products[prodIdx];
    if (item.selectedVariant && prod.variants && prod.variants.length > 0) {
      const vIdx = prod.variants.findIndex(v => v.label === item.selectedVariant);
      if (vIdx !== -1) {
        const variant = prod.variants[vIdx];
        if (db.settings.trackStock !== false) {
          if (variant.stock !== undefined && variant.stock < item.qty) {
            return res.status(400).json({ error: `Sorry, only ${variant.stock} unit(s) of "${prod.name} (${item.selectedVariant})" in stock` });
          }
          if (variant.stock !== undefined) {
            db.products[prodIdx].variants[vIdx].stock = Math.max(0, variant.stock - item.qty);
          }
        }
      }
    } else {
      if (db.settings.trackStock !== false) {
        if (prod.stock !== undefined && prod.stock < item.qty) {
          return res.status(400).json({ error: `Sorry, only ${prod.stock} unit(s) of "${prod.name}" in stock` });
        }
        if (prod.stock !== undefined) {
          db.products[prodIdx].stock = Math.max(0, prod.stock - item.qty);
        }
      }
    }
  }

  const loggedInUser = getUserFromRequest(req);
  const itemTotal = items.reduce((s, i) => s + i.price * i.qty, 0);

  let discount = 0;
  let appliedCoupon = null;
  if (couponCode) {
    const valResult = validatePromoCode(couponCode, itemTotal);
    if (valResult.valid) {
      discount = valResult.discount;
      appliedCoupon = valResult.coupon;
    }
  }

  const shippingRate = db.settings.shippingRate !== undefined ? Number(db.settings.shippingRate) : 60;
  const shippingThreshold = db.settings.shippingThreshold !== undefined ? Number(db.settings.shippingThreshold) : 999;
  const shipping = itemTotal >= shippingThreshold ? 0 : shippingRate;
  
  const taxableAmount = Math.max(0, itemTotal - discount);
  const otherCharges = db.settings.otherCharges !== undefined ? Number(db.settings.otherCharges) : 0;
  const otherChargesType = db.settings.otherChargesType || 'flat';
  const otherChargesAmount = otherChargesType === 'percentage' 
    ? Math.round(taxableAmount * (otherCharges / 100)) 
    : otherCharges;
  const grandTotal = taxableAmount + shipping + otherChargesAmount;

  const order = {
    id: nextId(db.orders),
    userId: loggedInUser ? loggedInUser.userId : null,
    items,
    customer: customer || {},
    total: itemTotal,
    discount,
    couponCode: appliedCoupon ? appliedCoupon.code : null,
    shipping,
    otherCharges,
    otherChargesType,
    otherChargesAmount,
    grandTotal,
    status: 'confirmed', // immediately confirmed since paid!
    paymentStatus: 'Paid (Razorpay)',
    paymentId: razorpay_payment_id,
    createdAt: new Date().toISOString()
  };

  db.orders.push(order);
  writeDB(db);

  // Trigger admin email alert asynchronously
  sendAdminEmailNotification(order);

  // Trigger customer email confirmation asynchronously
  sendCustomerOrderConfirmation(order);

  res.json({
    success: true,
    orderId: order.id,
    total: order.total,
    shipping: order.shipping,
    grandTotal: order.grandTotal,
    order,
    message: 'Payment verified and order placed successfully!'
  });
});

// POST place order — with stock decrement
app.post('/api/orders', checkoutLimiter, (req, res) => {
  const db = readDB();
  db.users = db.users || [];
  const { items, customer } = req.body;
  if (!items || !items.length) return res.status(400).json({ error: 'No items' });

  // ── Stock validation & decrement ─────────────────────────
  for (const item of items) {
    const prodIdx = db.products.findIndex(p => p.id === item.id);
    if (prodIdx === -1) {
      return res.status(400).json({ error: `Product "${item.name}" not found` });
    }
    const prod = db.products[prodIdx];
    if (item.selectedVariant && prod.variants && prod.variants.length > 0) {
      const vIdx = prod.variants.findIndex(v => v.label === item.selectedVariant);
      if (vIdx !== -1) {
        const variant = prod.variants[vIdx];
        if (db.settings.trackStock !== false) {
          if (variant.stock !== undefined && variant.stock < item.qty) {
            return res.status(400).json({ error: `Sorry, only ${variant.stock} unit(s) of "${prod.name} (${item.selectedVariant})" in stock` });
          }
          if (variant.stock !== undefined) {
            db.products[prodIdx].variants[vIdx].stock = Math.max(0, variant.stock - item.qty);
          }
        }
      }
    } else {
      if (db.settings.trackStock !== false) {
        if (prod.stock !== undefined && prod.stock < item.qty) {
          return res.status(400).json({
            error: `Sorry, only ${prod.stock} unit${prod.stock !== 1 ? 's' : ''} of "${prod.name}" in stock`
          });
        }
        // Decrease stock
        if (prod.stock !== undefined) {
          db.products[prodIdx].stock = Math.max(0, prod.stock - item.qty);
        }
      }
    }
  }

  const loggedInUser = getUserFromRequest(req);
  const itemTotal = items.reduce((s, i) => s + i.price * i.qty, 0);

  let discount = 0;
  let appliedCoupon = null;
  const { couponCode } = req.body;
  if (couponCode) {
    const valResult = validatePromoCode(couponCode, itemTotal);
    if (valResult.valid) {
      discount = valResult.discount;
      appliedCoupon = valResult.coupon;
    }
  }

  const shippingRate = db.settings.shippingRate !== undefined ? Number(db.settings.shippingRate) : 60;
  const shippingThreshold = db.settings.shippingThreshold !== undefined ? Number(db.settings.shippingThreshold) : 999;
  const shipping = itemTotal >= shippingThreshold ? 0 : shippingRate;
  
  const taxableAmount = Math.max(0, itemTotal - discount);
  const otherCharges = db.settings.otherCharges !== undefined ? Number(db.settings.otherCharges) : 0;
  const otherChargesType = db.settings.otherChargesType || 'flat';
  const otherChargesAmount = otherChargesType === 'percentage' 
    ? Math.round(taxableAmount * (otherCharges / 100)) 
    : otherCharges;
  const grandTotal = taxableAmount + shipping + otherChargesAmount;

  const order = {
    id: nextId(db.orders),
    userId: loggedInUser ? loggedInUser.userId : null,
    items,
    customer: customer || {},
    total: itemTotal,
    discount,
    couponCode: appliedCoupon ? appliedCoupon.code : null,
    shipping,
    otherCharges,
    otherChargesType,
    otherChargesAmount,
    grandTotal,
    status: 'pending',
    createdAt: new Date().toISOString()
  };
  db.orders.push(order);
  writeDB(db);

  // Trigger admin email alert (COD order)
  sendAdminEmailNotification(order);

  // Trigger customer confirmation email (COD order)
  sendCustomerOrderConfirmation(order);

  res.json({
    success: true,
    orderId: order.id,
    total: order.total,
    shipping: order.shipping,
    grandTotal: order.grandTotal,
    order,
    message: 'Order placed successfully!'
  });
});

// ══════════════════════════════════════════════════════════
// REVIEWS API
// ══════════════════════════════════════════════════════════

// GET reviews for a product
app.get('/api/products/:id/reviews', (req, res) => {
  const db = readDB();
  const productId = Number(req.params.id);
  const reviews = (db.reviews || []).filter(r => r.productId === productId)
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  res.json(reviews);
});

// POST submit a review (any logged-in customer)
app.post('/api/products/:id/reviews', requireUser, (req, res) => {
  const db = readDB();
  db.reviews = db.reviews || [];
  const productId = Number(req.params.id);
  const userId = req.user.userId;

  // Find user details
  const user = (db.users || []).find(u => u.id === userId);
  if (!user) return res.status(404).json({ error: 'User not found' });

  // Check product exists
  const product = (db.products || []).find(p => p.id === productId);
  if (!product) return res.status(404).json({ error: 'Product not found' });

  // One review per user per product
  const existing = db.reviews.find(r => r.productId === productId && r.userId === userId);
  if (existing) {
    return res.status(409).json({ error: 'You have already reviewed this product.' });
  }

  const rating = Number(req.body.rating);
  if (!rating || rating < 1 || rating > 5) {
    return res.status(400).json({ error: 'Rating must be between 1 and 5.' });
  }
  const comment = (req.body.comment || '').trim().slice(0, 500);
  if (!comment) return res.status(400).json({ error: 'Review comment is required.' });

  const review = {
    id: nextId(db.reviews),
    productId,
    userId,
    userName: user.name || 'Customer',
    rating,
    comment,
    createdAt: new Date().toISOString()
  };
  db.reviews.push(review);
  writeDB(db);
  sendAdminReviewNotification(review, product);
  res.status(201).json(review);
});

// DELETE review (admin only)
app.delete('/api/admin/reviews/:id', requireAdmin, (req, res) => {
  const db = readDB();
  db.reviews = db.reviews || [];
  const idx = db.reviews.findIndex(r => r.id === Number(req.params.id));
  if (idx === -1) return res.status(404).json({ error: 'Review not found' });
  db.reviews.splice(idx, 1);
  writeDB(db);
  res.json({ success: true });
});

// GET all reviews (admin)
app.get('/api/admin/reviews', requireAdmin, (req, res) => {
  const db = readDB();
  const reviews = (db.reviews || []).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  res.json(reviews);
});

// ══════════════════════════════════════════════════════════
// ADMIN ROUTES (protected)
// ══════════════════════════════════════════════════════════

// GET admin analytics overview
app.get('/api/admin/analytics', requireAdmin, (req, res) => {
  const db = readDB();
  const analytics = db.analytics || {
    totalVisitors: 0,
    newVisitors: 0,
    returningVisitors: 0,
    countries: {},
    regions: {},
    cities: {},
    isps: {},
    recentIps: []
  };
  const securityLogs = db.securityLogs || [];
  const blockedIps = db.blockedIps || [];
  const orders = db.orders || [];
  const products = db.products || [];

  // Calculate order & revenue analytics
  let totalRevenue = 0;
  let orderCount = 0;
  const productQtyMap = {};
  const categoryQtyMap = {};
  const salesHistoryMap = {};

  // Initialize last 7 days of sales history
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const dateStr = d.toISOString().split('T')[0];
    salesHistoryMap[dateStr] = 0;
  }

  // Create a product category lookup map
  const productCategoryMap = {};
  products.forEach(p => {
    productCategoryMap[p.id] = p.category || 'Other';
  });

  orders.forEach(o => {
    if (o.status === 'cancelled') return;
    totalRevenue += o.grandTotal || 0;
    orderCount += 1;

    // Daily Sales History
    if (o.createdAt) {
      const dateStr = o.createdAt.split('T')[0];
      if (salesHistoryMap[dateStr] !== undefined) {
        salesHistoryMap[dateStr] += o.grandTotal || 0;
      }
    }

    // Product & Category Sales
    (o.items || []).forEach(item => {
      const pId = item.id || item.productId;
      if (!pId) return;
      const pName = item.name || `Product #${pId}`;
      const qty = Number(item.qty || item.quantity) || 0;
      
      // Top Products map
      if (!productQtyMap[pId]) {
        productQtyMap[pId] = { name: pName, quantity: 0 };
      }
      productQtyMap[pId].quantity += qty;

      // Category map
      const cat = productCategoryMap[Number(pId)] || 'Other';
      categoryQtyMap[cat] = (categoryQtyMap[cat] || 0) + qty;
    });
  });

  // Format sales history
  const salesHistory = Object.entries(salesHistoryMap).map(([date, revenue]) => ({
    date,
    revenue: Math.round(revenue * 100) / 100
  })).sort((a, b) => a.date.localeCompare(b.date));

  // Format top products
  const topProducts = Object.values(productQtyMap)
    .sort((a, b) => b.quantity - a.quantity)
    .slice(0, 5);

  // Format category distribution
  const categoryDistribution = Object.entries(categoryQtyMap).map(([category, quantity]) => ({
    category,
    quantity
  })).sort((a, b) => b.quantity - a.quantity);

  res.json({
    analytics,
    securityLogs,
    blockedIps,
    loginLogs: db.loginLogs || [],
    orderStats: {
      totalRevenue: Math.round(totalRevenue * 100) / 100,
      orderCount,
      salesHistory,
      topProducts,
      categoryDistribution
    }
  });
});

// POST block an IP address
app.post('/api/admin/ip-block', requireAdmin, (req, res) => {
  const db = readDB();
  const { ip } = req.body;
  if (!ip) return res.status(400).json({ error: 'IP address is required' });

  const cleanIp = ip.trim();
  db.blockedIps = db.blockedIps || [];
  if (!db.blockedIps.includes(cleanIp)) {
    db.blockedIps.push(cleanIp);
    writeDB(db);
    logSecurityEvent(cleanIp, 'MANUALLY_BLOCKED', 'IP address manually blocked by administrator');
  }

  res.json({ success: true, blockedIps: db.blockedIps });
});

// POST unblock an IP address
app.post('/api/admin/ip-unblock', requireAdmin, (req, res) => {
  const db = readDB();
  const { ip } = req.body;
  if (!ip) return res.status(400).json({ error: 'IP address is required' });

  const cleanIp = ip.trim();
  db.blockedIps = db.blockedIps || [];
  const idx = db.blockedIps.indexOf(cleanIp);
  if (idx !== -1) {
    db.blockedIps.splice(idx, 1);
    writeDB(db);
    logSecurityEvent(cleanIp, 'MANUALLY_UNBLOCKED', 'IP address manually unblocked by administrator');
  }

  res.json({ success: true, blockedIps: db.blockedIps });
});

// Emergency public endpoint to unblock current client IP (useful if locked out)
app.get('/api/security/unblock-me', (req, res) => {
  const token = req.query.token || '';
  const adminUnblockSecret = process.env.UNBLOCK_SECRET || 'rk-unblock-2024';
  if (token !== adminUnblockSecret) {
    return res.status(403).send('<h1>403 Forbidden</h1><p>Access denied. Please provide the correct admin token.</p>');
  }
  const clientIp = normalizeClientIp(req.headers['x-forwarded-for'] || req.ip || req.socket.remoteAddress || '');
  const db = readDB();
  db.blockedIps = (db.blockedIps || []).filter(ip => ip !== clientIp && normalizeClientIp(ip) !== clientIp);
  writeDB(db);
  res.send(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>IP Unblocked</title><style>body{font-family:sans-serif;text-align:center;padding:50px;background:#f9fafb;color:#1e293b}a{color:#0f766e;font-weight:bold;text-decoration:none}.card{background:#fff;max-width:500px;margin:auto;padding:40px;border-radius:12px;box-shadow:0 4px 12px rgba(0,0,0,0.1)}</style></head><body><div class="card"><h1 style="color:#0f766e">✅ IP Unblocked!</h1><p>Your IP address (<strong>${clientIp}</strong>) has been successfully removed from the blocklist.</p><p><a href="/">Click here to return to RK Resin Art</a></p></div></body></html>`);
});


// GET raw developer logs from visitor_logs.json
app.get('/api/admin/dev-logs', requireAdmin, (req, res) => {
  try {
    let logs = [];
    if (fs.existsSync(VISITOR_LOGS_PATH)) {
      logs = JSON.parse(fs.readFileSync(VISITOR_LOGS_PATH, 'utf8'));
    }
    logs.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    res.json(logs);
  } catch (err) {
    res.status(500).json({ error: 'Failed to read visitor logs: ' + err.message });
  }
});

// GET all settings (including private keys for admin panel)
app.get('/api/admin/settings', requireAdmin, (req, res) => {
  const db = readDB();
  res.json({
    announce: db.settings.announce || '',
    cartEnabled: db.settings.cartEnabled !== false,
    trackStock: db.settings.trackStock !== false,
    shippingRate: db.settings.shippingRate !== undefined ? Number(db.settings.shippingRate) : 60,
    shippingThreshold: db.settings.shippingThreshold !== undefined ? Number(db.settings.shippingThreshold) : 999,
    otherCharges: db.settings.otherCharges !== undefined ? Number(db.settings.otherCharges) : 0,
    otherChargesType: db.settings.otherChargesType || 'flat',
    razorpayEnabled: db.settings.razorpayEnabled !== false
  });
});

// UPDATE announce bar & settings
app.put('/api/admin/settings', requireAdmin, (req, res) => {
  const db = readDB();
  if (req.body.announce !== undefined) db.settings.announce = req.body.announce;
  if (req.body.cartEnabled !== undefined) db.settings.cartEnabled = !!req.body.cartEnabled;
  if (req.body.trackStock !== undefined) db.settings.trackStock = !!req.body.trackStock;
  if (req.body.shippingRate !== undefined) db.settings.shippingRate = Number(req.body.shippingRate);
  if (req.body.shippingThreshold !== undefined) db.settings.shippingThreshold = Number(req.body.shippingThreshold);
  if (req.body.otherCharges !== undefined) db.settings.otherCharges = Number(req.body.otherCharges);
  if (req.body.otherChargesType !== undefined) db.settings.otherChargesType = req.body.otherChargesType;
  if (req.body.razorpayEnabled !== undefined) db.settings.razorpayEnabled = !!req.body.razorpayEnabled;
  writeDB(db);
  res.json({ success: true });
});

app.get('/api/admin/r2-status', requireAdmin, (req, res) => {
  const cfg = getR2Config();
  res.json({ configured: !!cfg, bucket: cfg ? cfg.bucketName : null, publicUrl: cfg ? cfg.publicUrl : null });
});

// Legacy ImgBB key endpoint (kept for backwards compat)
app.get('/api/admin/imgbb-key', requireAdmin, (req, res) => {
  res.json({ key: getImgBbApiKey() });
});

// PRODUCT IMAGE UPLOAD
app.post('/api/admin/upload', requireAdmin, (req, res) => {
  uploadProductImage.single('image')(req, res, async (err) => {
    if (err) {
      const status = err.code === 'LIMIT_FILE_SIZE' ? 413 : 400;
      const message = err.code === 'LIMIT_FILE_SIZE'
        ? 'Image must be 15MB or smaller'
        : err.message;
      return res.status(status).json({ error: message });
    }
    if (!req.file) return res.status(400).json({ error: 'No image uploaded' });

    // ── HEIC/HEIF → JPEG conversion ────────────────────────────
    const originalExt = path.extname(req.file.originalname).toLowerCase();
    const isHeic = HEIC_EXTS.has(originalExt) ||
      req.file.mimetype === 'image/heic' ||
      req.file.mimetype === 'image/heif';

    if (isHeic) {
      if (!sharp) {
        try { fs.unlinkSync(req.file.path); } catch (_) {}
        return res.status(400).json({ error: 'HEIC conversion is unavailable. Run "npm install sharp" on the server.' });
      }
      try {
        const heicPath = req.file.path;
        await sharp(heicPath)
          .rotate()
          .resize(1920, 1920, { fit: 'inside', withoutEnlargement: true })
          .jpeg({ quality: 82, mozjpeg: true })
          .toFile(heicPath + '.converted.jpg');
        fs.renameSync(heicPath + '.converted.jpg', heicPath);
        console.log(`🖼️ HEIC converted to JPEG: ${req.file.filename}`);
      } catch (convErr) {
        try { fs.unlinkSync(req.file.path); } catch (_) {}
        console.error('❌ HEIC conversion failed:', convErr.message);
        return res.status(500).json({ error: 'Failed to convert HEIC image: ' + convErr.message });
      }
    }

    // ── Compress ALL images to ≤ 1 MB using sharp ──────────────
    // Handles HEIC (already converted above), JPG, PNG, WebP from any device/OS.
    if (sharp) {
      try {
        const filePath  = req.file.path;
        const fileExt   = path.extname(req.file.filename).toLowerCase();
        const TARGET    = 1 * 1024 * 1024; // 1 MB
        let quality     = 82;
        let outputBuf;

        do {
          const inst = sharp(filePath)
            .rotate() // honour EXIF orientation
            .resize(1920, 1920, { fit: 'inside', withoutEnlargement: true });

          // PNG stays PNG only if still small; everything else → JPEG
          if (fileExt === '.png' && quality > 50) {
            outputBuf = await inst.png({ compressionLevel: 9, quality }).toBuffer();
          } else {
            outputBuf = await inst.jpeg({ quality, mozjpeg: true }).toBuffer();
          }

          if (outputBuf.length <= TARGET) break;
          quality -= 12; // step down ~12 points each pass
        } while (quality >= 20);

        fs.writeFileSync(filePath, outputBuf);
        const finalKB = Math.round(outputBuf.length / 1024);
        console.log(`🗜️ Image compressed to ${finalKB} KB (q${quality + 12}) → ${req.file.filename}`);
      } catch (compErr) {
        // Non-fatal: log and continue with original file
        console.error('⚠️ Image compression step failed:', compErr.message);
      }
    }
    // ────────────────────────────────────────────────────────────


    // ── Upload to Cloudflare R2 ───────────────────────────────
    const r2cfg = getR2Config();
    if (r2cfg && S3Client && PutObjectCommand) {
      try {
        const filePath   = req.file.path;
        const fileBuffer = fs.readFileSync(filePath);
        const fileExt    = path.extname(req.file.filename).toLowerCase();
        const mimeMap    = { '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp' };
        const contentType = mimeMap[fileExt] || 'image/jpeg';

        // Build a clean R2 object key: images/filename
        const r2Key = `images/${req.file.filename}`;

        const client = new S3Client({
          region: 'auto',
          endpoint: `https://${r2cfg.accountId}.r2.cloudflarestorage.com`,
          credentials: {
            accessKeyId:     r2cfg.accessKey,
            secretAccessKey: r2cfg.secretKey
          }
        });

        await client.send(new PutObjectCommand({
          Bucket:      r2cfg.bucketName,
          Key:         r2Key,
          Body:        fileBuffer,
          ContentType: contentType
        }));

        // Delete local temp file after successful R2 upload
        try { fs.unlinkSync(filePath); } catch (_) {}

        const publicUrl = `${r2cfg.publicUrl.replace(/\/$/, '')}/${r2Key}`;
        console.log(`☁️ Image uploaded to Cloudflare R2: ${publicUrl}`);
        return res.json({ success: true, url: publicUrl, filename: req.file.filename });

      } catch (r2Err) {
        console.error('❌ Cloudflare R2 upload failed, falling back to local storage:', r2Err.message);
        return res.json({
          success: true,
          url: `/uploads/${req.file.filename}`,
          filename: req.file.filename,
          warning: `R2 upload failed, stored locally: ${r2Err.message}`
        });
      }
    }

    // ── Legacy ImgBB fallback (if R2 not configured but ImgBB key exists) ────
    const imgbbApiKey = getImgBbApiKey();
    if (imgbbApiKey) {
      try {
        const filePath = req.file.path;
        const fileBuffer = fs.readFileSync(filePath);
        const base64Image = fileBuffer.toString('base64');
        const formData = new URLSearchParams();
        formData.append('image', base64Image);
        const fetchPromise = fetch(`https://api.imgbb.com/1/upload?key=${imgbbApiKey}`, {
          method: 'POST',
          body: formData,
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'User-Agent': 'Mozilla/5.0'
          }
        });
        const timeoutPromise = new Promise((_, reject) =>
          setTimeout(() => reject(new Error('ImgBB API timed out after 15 seconds')), 15000)
        );
        const imgbbRes = await Promise.race([fetchPromise, timeoutPromise]);
        const responseBodyText = await imgbbRes.text();
        if (!imgbbRes.ok) throw new Error(`ImgBB error ${imgbbRes.status}: ${responseBodyText}`);
        const imgbbData = JSON.parse(responseBodyText);
        try { fs.unlinkSync(filePath); } catch (_) {}
        if (imgbbData && imgbbData.data && imgbbData.data.url) {
          return res.json({ success: true, url: imgbbData.data.url, filename: req.file.filename });
        }
        throw new Error('Invalid ImgBB response structure');
      } catch (uploadError) {
        console.error('❌ ImgBB upload failed, falling back to local storage:', uploadError.message);
        return res.json({
          success: true,
          url: `/uploads/${req.file.filename}`,
          filename: req.file.filename,
          warning: `Cloud upload failed, stored locally: ${uploadError.message}`
        });
      }
    }

    // ── Local storage (no cloud configured) ──────────────────────
    res.json({
      success: true,
      url: `/uploads/${req.file.filename}`,
      filename: req.file.filename
    });
  });
});

// BANNERS CRUD
app.post('/api/admin/banners', requireAdmin, (req, res) => {
  const db = readDB();
  const banner = { id: nextId(db.banners), ...req.body };
  db.banners.push(banner);
  writeDB(db);
  res.json(banner);
});
app.put('/api/admin/banners/:id', requireAdmin, (req, res) => {
  const db = readDB();
  const idx = db.banners.findIndex(b => b.id === Number(req.params.id));
  if (idx === -1) return res.status(404).json({ error: 'Not found' });
  db.banners[idx] = { ...db.banners[idx], ...req.body };
  writeDB(db);
  res.json(db.banners[idx]);
});
app.delete('/api/admin/banners/:id', requireAdmin, (req, res) => {
  const db = readDB();
  db.banners = db.banners.filter(b => b.id !== Number(req.params.id));
  writeDB(db);
  res.json({ success: true });
});

// NAV CRUD
app.post('/api/admin/nav', requireAdmin, (req, res) => {
  const db = readDB();
  const link = { id: nextId(db.navLinks), ...req.body };
  db.navLinks.push(link);
  writeDB(db);
  res.json(link);
});
app.put('/api/admin/nav/:id', requireAdmin, (req, res) => {
  const db = readDB();
  const idx = db.navLinks.findIndex(n => n.id === Number(req.params.id));
  if (idx === -1) return res.status(404).json({ error: 'Not found' });
  db.navLinks[idx] = { ...db.navLinks[idx], ...req.body };
  writeDB(db);
  res.json(db.navLinks[idx]);
});
app.delete('/api/admin/nav/:id', requireAdmin, (req, res) => {
  const db = readDB();
  db.navLinks = db.navLinks.filter(n => n.id !== Number(req.params.id));
  writeDB(db);
  res.json({ success: true });
});

// CATEGORIES CRUD
app.post('/api/admin/categories', requireAdmin, (req, res) => {
  const db = readDB();
  const cat = { id: nextId(db.categories), ...req.body };
  db.categories.push(cat);
  writeDB(db);
  res.json(cat);
});
app.put('/api/admin/categories/:id', requireAdmin, (req, res) => {
  const db = readDB();
  const idx = db.categories.findIndex(c => c.id === Number(req.params.id));
  if (idx === -1) return res.status(404).json({ error: 'Not found' });
  db.categories[idx] = { ...db.categories[idx], ...req.body };
  writeDB(db);
  res.json(db.categories[idx]);
});
app.delete('/api/admin/categories/:id', requireAdmin, (req, res) => {
  const db = readDB();
  db.categories = db.categories.filter(c => c.id !== Number(req.params.id));
  writeDB(db);
  res.json({ success: true });
});

// ADMIN COUPONS CRUD (protected)
app.get('/api/admin/coupons', requireAdmin, (req, res) => {
  const db = readDB();
  db.coupons = db.coupons || [];
  res.json(db.coupons);
});

app.post('/api/admin/coupons', requireAdmin, (req, res) => {
  const db = readDB();
  db.coupons = db.coupons || [];
  const { code, type, value, minPurchase } = req.body;

  if (!code || !type || value === undefined) {
    return res.status(400).json({ error: 'Code, type and value are required' });
  }

  const uppercaseCode = String(code).trim().toUpperCase();
  if (db.coupons.some(c => c.code === uppercaseCode)) {
    return res.status(400).json({ error: 'A coupon with this code already exists' });
  }

  const coupon = {
    id: nextId(db.coupons),
    code: uppercaseCode,
    type,
    value: Number(value),
    minPurchase: minPurchase ? Number(minPurchase) : 0,
    isActive: true,
    createdAt: new Date().toISOString()
  };

  db.coupons.push(coupon);
  writeDB(db);
  res.status(201).json(coupon);
});

app.delete('/api/admin/coupons/:id', requireAdmin, (req, res) => {
  const db = readDB();
  db.coupons = db.coupons || [];
  const id = Number(req.params.id);

  const exists = db.coupons.some(c => c.id === id);
  if (!exists) return res.status(404).json({ error: 'Coupon not found' });

  db.coupons = db.coupons.filter(c => c.id !== id);
  writeDB(db);
  res.json({ success: true });
});

// PRODUCTS CRUD
app.post('/api/admin/products', requireAdmin, (req, res) => {
  const db = readDB();
  const prod = { id: nextId(db.products), stock: 0, ...req.body };
  db.products.push(prod);
  writeDB(db);
  res.json(prod);
});
app.put('/api/admin/products/:id', requireAdmin, (req, res) => {
  const db = readDB();
  const productId = Number(req.params.id);
  const idx = db.products.findIndex(p => p.id === productId);
  if (idx === -1) return res.status(404).json({ error: 'Not found' });

  const oldStock = Number(db.products[idx].stock) || 0;
  const newStock = Number(req.body.stock) || 0;

  db.products[idx] = { ...db.products[idx], ...req.body };
  writeDB(db);

  // Trigger alert if stock goes from 0 to > 0
  if (oldStock === 0 && newStock > 0) {
    notifyWishlistSubscribers(db.products[idx]);
  }

  res.json(db.products[idx]);
});
app.delete('/api/admin/products/:id', requireAdmin, (req, res) => {
  const db = readDB();
  db.products = db.products.filter(p => p.id !== Number(req.params.id));
  writeDB(db);
  res.json({ success: true });
});

// GET all orders (admin)
app.get('/api/admin/orders', requireAdmin, (req, res) => {
  const db = readDB();
  const orders = (db.orders || []).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  res.json(orders);
});

// UPDATE order status/notes (admin) — also triggers stock restore if cancelled
app.put('/api/admin/orders/:id', requireAdmin, (req, res) => {
  const db = readDB();
  const idx = db.orders.findIndex(o => o.id === Number(req.params.id));
  if (idx === -1) return res.status(404).json({ error: 'Not found' });

  const oldStatus = db.orders[idx].status;
  const newStatus = req.body.status;

  // If cancelling an order, restore stock
  if (newStatus === 'cancelled' && oldStatus !== 'cancelled') {
    const items = db.orders[idx].items || [];
    for (const item of items) {
      const prodIdx = db.products.findIndex(p => p.id === item.id);
      if (prodIdx !== -1) {
        const prod = db.products[prodIdx];
        if (db.settings.trackStock !== false) {
          if (item.selectedVariant && prod.variants && prod.variants.length > 0) {
            const vIdx = prod.variants.findIndex(v => v.label === item.selectedVariant);
            if (vIdx !== -1) {
              const prevVariantStock = Number(prod.variants[vIdx].stock) || 0;
              db.products[prodIdx].variants[vIdx].stock = prevVariantStock + item.qty;
              
              if (prevVariantStock === 0 && db.products[prodIdx].variants[vIdx].stock > 0) {
                notifyWishlistSubscribers(db.products[prodIdx]);
              }
            }
          } else if (prod.stock !== undefined) {
            const prevStock = Number(prod.stock) || 0;
            db.products[prodIdx].stock = prevStock + item.qty;
            
            if (prevStock === 0 && db.products[prodIdx].stock > 0) {
              notifyWishlistSubscribers(db.products[prodIdx]);
            }
          }
        }
      }
    }
  }

  db.orders[idx] = { ...db.orders[idx], ...req.body };
  writeDB(db);
  res.json(db.orders[idx]);
});

// POST send shipping email notification to customer (admin)
app.post('/api/admin/orders/:id/notify-shipping', requireAdmin, async (req, res) => {
  const db = readDB();
  const order = db.orders.find(o => o.id === Number(req.params.id));
  if (!order) return res.status(404).json({ error: 'Order not found' });

  try {
    await sendCustomerShippingNotification(order);
    res.json({ success: true, message: 'Shipping confirmation email sent successfully!' });
  } catch (err) {
    console.error('Failed to send shipping email:', err.message);
    res.status(500).json({ error: 'Failed to send email: ' + err.message });
  }
});


// GET sitemap.xml dynamically generated for search crawlers (SEO)
app.get('/sitemap.xml', (req, res) => {
  try {
    const db = readDB();
    const products = db.products || [];
    const categories = db.categories || [];
    
    res.header('Content-Type', 'application/xml');
    
    let xml = `<?xml version="1.0" encoding="UTF-8"?>\n`;
    xml += `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n`;
    
    // Add home page
    xml += `  <url>\n`;
    xml += `    <loc>https://rkresinart.com/</loc>\n`;
    xml += `    <changefreq>daily</changefreq>\n`;
    xml += `    <priority>1.0</priority>\n`;
    xml += `  </url>\n`;
    
    // Add static track page link
    xml += `  <url>\n`;
    xml += `    <loc>https://rkresinart.com/?page=track</loc>\n`;
    xml += `    <changefreq>weekly</changefreq>\n`;
    xml += `    <priority>0.6</priority>\n`;
    xml += `  </url>\n`;
    
    // Add categories
    categories.forEach(cat => {
      xml += `  <url>\n`;
      xml += `    <loc>https://rkresinart.com/?category=${encodeURIComponent(cat.name)}</loc>\n`;
      xml += `    <changefreq>weekly</changefreq>\n`;
      xml += `    <priority>0.8</priority>\n`;
      xml += `  </url>\n`;
    });
    
    // Add dynamic products
    products.forEach(p => {
      xml += `  <url>\n`;
      xml += `    <loc>https://rkresinart.com/?product=${p.id}</loc>\n`;
      xml += `    <changefreq>daily</changefreq>\n`;
      xml += `    <priority>0.9</priority>\n`;
      xml += `  </url>\n`;
    });
    
    xml += `</urlset>`;
    res.send(xml);
  } catch (err) {
    console.error("Failed to generate sitemap.xml: ", err);
    res.status(500).send("Error generating sitemap");
  }
});

// Serve index.html for all other routes (SPA)
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

function validateEnvironment() {
  console.log('📋 Running environment configuration audit...');
  
  if (process.env.PORT && isNaN(Number(process.env.PORT))) {
    console.error('💥 CRITICAL ERROR: PORT environment variable is not a valid number.');
    process.exit(1);
  }

  const defaultJwt = 'rk-resin-art-secret-2024';
  if ((process.env.NODE_ENV === 'production' || process.env.RENDER) && (!process.env.JWT_SECRET || process.env.JWT_SECRET === defaultJwt)) {
    console.warn('⚠️ SECURITY WARNING: Using the default insecure JWT_SECRET in production/Render. Please configure a custom JWT_SECRET.');
  }

  const smtpFields = ['SMTP_HOST', 'SMTP_USER', 'SMTP_PASS'];
  const configuredFields = smtpFields.filter(f => process.env[f]);
  if (configuredFields.length > 0 && configuredFields.length < smtpFields.length) {
    console.error(`💥 CRITICAL ERROR: SMTP mailer is partially configured. Missing fields: ${smtpFields.filter(f => !process.env[f]).join(', ')}`);
    process.exit(1);
  }

  if (process.env.RENDER) {
    if (!getFirebaseDbUrl()) {
      console.warn(`\n⚠️ CRITICAL WARNING: Running on Render but FIREBASE_DB_URL is not configured!`);
      console.warn(`   All uploaded products, orders, and settings will be DELETED on your next deploy or restart.`);
      console.warn(`   Please configure FIREBASE_DB_URL or FIREBASE_DATABASE_URL in your Render dashboard under Settings -> Environment Variables.\n`);
    }
    if (!getImgBbApiKey()) {
      console.warn(`\n⚠️ CRITICAL WARNING: Running on Render but IMGBB_API_KEY is not configured!`);
      console.warn(`   Uploaded product and banner images will be lost on your next deploy.`);
      console.warn(`   Please configure IMGBB_API_KEY or IMGBB_KEY in your Render dashboard to save images permanently on the cloud.\n`);
    }
  }
  
  console.log('✅ Environment configuration audit completed.');
}

async function startServer() {
  validateEnvironment();

  try {
    // Sync database from Firebase Realtime Database before server starts
    await initPersistentDatabase();
  } catch (err) {
    console.error("💥 Server failed to start due to database synchronization error:", err.message);
    process.exit(1);
  }

  const server = app.listen(PORT, async () => {
    console.log(`\n🎨 RK Resin Art server running at http://localhost:${PORT}`);
    console.log(`   Admin panel: /admin\n`);
    await initMailer();
  });

  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      console.error(`\n⚠️ Port ${PORT} is already in use. Please stop the process using that port or set PORT to a different value.`);
      console.error('Example: set PORT=3001 && npm start');
      process.exit(1);
    }
    throw err;
  });
}

startServer();
