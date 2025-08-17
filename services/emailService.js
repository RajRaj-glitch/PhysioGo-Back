const nodemailer = require('nodemailer');
const path = require('path');
const fs = require('fs');

// Create reusable transporter object using SMTP transport
const transporter = nodemailer.createTransporter({
  host: process.env.EMAIL_HOST,
  port: process.env.EMAIL_PORT,
  secure: false, // true for 465, false for other ports
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

// Email templates
const emailTemplates = {
  emailVerification: (data) => `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
      <div style="background-color: #f8f9fa; padding: 30px; border-radius: 10px;">
        <h2 style="color: #2c3e50; text-align: center; margin-bottom: 30px;">
          Welcome to PhysioAtYourDoor!
        </h2>
        <p style="color: #555; font-size: 16px; line-height: 1.6;">
          Hi ${data.name},
        </p>
        <p style="color: #555; font-size: 16px; line-height: 1.6;">
          Thank you for registering with PhysioAtYourDoor. To complete your registration, 
          please verify your email address by clicking the button below:
        </p>
        <div style="text-align: center; margin: 30px 0;">
          <a href="${data.verifyURL}" 
             style="background-color: #3498db; color: white; padding: 15px 30px; 
                    text-decoration: none; border-radius: 5px; font-weight: bold; 
                    display: inline-block;">
            Verify Email Address
          </a>
        </div>
        <p style="color: #888; font-size: 14px; line-height: 1.6;">
          If you didn't create an account, please ignore this email.
        </p>
        <p style="color: #888; font-size: 14px; line-height: 1.6;">
          This verification link will expire in 24 hours.
        </p>
      </div>
    </div>
  `,
  
  welcome: (data) => `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
      <div style="background-color: #f8f9fa; padding: 30px; border-radius: 10px;">
        <h2 style="color: #27ae60; text-align: center; margin-bottom: 30px;">
          Welcome to PhysioAtYourDoor!
        </h2>
        <p style="color: #555; font-size: 16px; line-height: 1.6;">
          Hi ${data.name},
        </p>
        <p style="color: #555; font-size: 16px; line-height: 1.6;">
          Your email has been successfully verified! You can now access all features of PhysioAtYourDoor.
        </p>
        ${data.role === 'physiotherapist' ? `
          <p style="color: #555; font-size: 16px; line-height: 1.6;">
            As a physiotherapist, your account is currently under review. 
            You'll receive an email once your documents are verified and your account is approved.
          </p>
        ` : `
          <p style="color: #555; font-size: 16px; line-height: 1.6;">
            You can now book appointments with verified physiotherapists in your area.
          </p>
        `}
        <div style="text-align: center; margin: 30px 0;">
          <a href="${process.env.FRONTEND_URL}" 
             style="background-color: #27ae60; color: white; padding: 15px 30px; 
                    text-decoration: none; border-radius: 5px; font-weight: bold; 
                    display: inline-block;">
            Get Started
          </a>
        </div>
      </div>
    </div>
  `,
  
  appointmentPending: (data) => `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
      <div style="background-color: #f8f9fa; padding: 30px; border-radius: 10px;">
        <h2 style="color: #f39c12; text-align: center; margin-bottom: 30px;">
          Appointment Pending Confirmation
        </h2>
        <p style="color: #555; font-size: 16px; line-height: 1.6;">
          Hi ${data.patientName},
        </p>
        <p style="color: #555; font-size: 16px; line-height: 1.6;">
          Your appointment request has been submitted and is pending confirmation from the physiotherapist.
        </p>
        <div style="background-color: white; padding: 20px; border-radius: 5px; margin: 20px 0;">
          <h3 style="color: #2c3e50; margin-top: 0;">Appointment Details:</h3>
          <p><strong>Physiotherapist:</strong> ${data.physiotherapistName}</p>
          <p><strong>Date:</strong> ${data.appointmentDate}</p>
          <p><strong>Time:</strong> ${data.timeSlot}</p>
          <p><strong>Service:</strong> ${data.reason}</p>
          <p><strong>Amount:</strong> ₹${data.amount}</p>
        </div>
        <p style="color: #555; font-size: 16px; line-height: 1.6;">
          You'll receive another email once the physiotherapist confirms or declines your request.
        </p>
      </div>
    </div>
  `,
  
  appointmentConfirmed: (data) => `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
      <div style="background-color: #f8f9fa; padding: 30px; border-radius: 10px;">
        <h2 style="color: #27ae60; text-align: center; margin-bottom: 30px;">
          Appointment Confirmed!
        </h2>
        <p style="color: #555; font-size: 16px; line-height: 1.6;">
          Hi ${data.patientName},
        </p>
        <p style="color: #555; font-size: 16px; line-height: 1.6;">
          Great news! Your appointment has been confirmed by ${data.physiotherapistName}.
        </p>
        <div style="background-color: white; padding: 20px; border-radius: 5px; margin: 20px 0;">
          <h3 style="color: #2c3e50; margin-top: 0;">Confirmed Appointment Details:</h3>
          <p><strong>Physiotherapist:</strong> ${data.physiotherapistName}</p>
          <p><strong>Date:</strong> ${data.appointmentDate}</p>
          <p><strong>Time:</strong> ${data.timeSlot}</p>
          <p><strong>Service:</strong> ${data.reason}</p>
          <p><strong>Contact:</strong> ${data.physiotherapistPhone}</p>
        </div>
        <p style="color: #555; font-size: 16px; line-height: 1.6;">
          The physiotherapist will contact you shortly to confirm the exact location and any other details.
        </p>
      </div>
    </div>
  `,
  
  appointmentRejected: (data) => `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
      <div style="background-color: #f8f9fa; padding: 30px; border-radius: 10px;">
        <h2 style="color: #e74c3c; text-align: center; margin-bottom: 30px;">
          Appointment Update
        </h2>
        <p style="color: #555; font-size: 16px; line-height: 1.6;">
          Hi ${data.patientName},
        </p>
        <p style="color: #555; font-size: 16px; line-height: 1.6;">
          Unfortunately, ${data.physiotherapistName} is not available for your requested appointment.
        </p>
        ${data.rejectionReason ? `
          <div style="background-color: #fff3cd; padding: 15px; border-radius: 5px; margin: 20px 0; border-left: 4px solid #ffc107;">
            <p style="margin: 0;"><strong>Reason:</strong> ${data.rejectionReason}</p>
          </div>
        ` : ''}
        <p style="color: #555; font-size: 16px; line-height: 1.6;">
          <strong>Don't worry!</strong> Your payment of ₹${data.amount} will be refunded within 24 hours.
        </p>
        <div style="text-align: center; margin: 30px 0;">
          <a href="${process.env.FRONTEND_URL}/appointments" 
             style="background-color: #3498db; color: white; padding: 15px 30px; 
                    text-decoration: none; border-radius: 5px; font-weight: bold; 
                    display: inline-block;">
            Book Another Appointment
          </a>
        </div>
      </div>
    </div>
  `,
  
  passwordReset: (data) => `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
      <div style="background-color: #f8f9fa; padding: 30px; border-radius: 10px;">
        <h2 style="color: #e74c3c; text-align: center; margin-bottom: 30px;">
          Password Reset Request
        </h2>
        <p style="color: #555; font-size: 16px; line-height: 1.6;">
          Hi ${data.name},
        </p>
        <p style="color: #555; font-size: 16px; line-height: 1.6;">
          We received a request to reset your password. Click the button below to reset it:
        </p>
        <div style="text-align: center; margin: 30px 0;">
          <a href="${data.resetURL}" 
             style="background-color: #e74c3c; color: white; padding: 15px 30px; 
                    text-decoration: none; border-radius: 5px; font-weight: bold; 
                    display: inline-block;">
            Reset Password
          </a>
        </div>
        <p style="color: #888; font-size: 14px; line-height: 1.6;">
          If you didn't request a password reset, please ignore this email.
        </p>
        <p style="color: #888; font-size: 14px; line-height: 1.6;">
          This reset link will expire in 10 minutes for security reasons.
        </p>
      </div>
    </div>
  `,
  
  passwordChanged: (data) => `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
      <div style="background-color: #f8f9fa; padding: 30px; border-radius: 10px;">
        <h2 style="color: #27ae60; text-align: center; margin-bottom: 30px;">
          Password Successfully Changed
        </h2>
        <p style="color: #555; font-size: 16px; line-height: 1.6;">
          Hi ${data.name},
        </p>
        <p style="color: #555; font-size: 16px; line-height: 1.6;">
          Your password has been successfully changed. If you didn't make this change, 
          please contact our support team immediately.
        </p>
        <div style="text-align: center; margin: 30px 0;">
          <a href="${process.env.FRONTEND_URL}/login" 
             style="background-color: #27ae60; color: white; padding: 15px 30px; 
                    text-decoration: none; border-radius: 5px; font-weight: bold; 
                    display: inline-block;">
            Login Now
          </a>
        </div>
      </div>
    </div>
  `
};

const sendEmail = async (options) => {
  try {
    // Get HTML content from template
    const htmlContent = emailTemplates[options.template] ? 
      emailTemplates[options.template](options.data) : 
      `<p>${options.message}</p>`;

    // Define email options
    const mailOptions = {
      from: `PhysioAtYourDoor <${process.env.EMAIL_FROM}>`,
      to: options.email,
      subject: options.subject,
      html: htmlContent
    };

    // Send email
    await transporter.sendMail(mailOptions);
    console.log(`Email sent successfully to ${options.email}`);
  } catch (error) {
    console.error('Email sending failed:', error);
    throw new Error('Email could not be sent');
  }
};

module.exports = {
  sendEmail
};