const crypto = require('crypto');
const { validationResult } = require('express-validator');
const User = require('../models/User');
const { generateToken } = require('../utils/jwt');
const { sendEmail } = require('../services/emailService');
const catchAsync = require('../utils/catchAsync');
const AppError = require('../utils/appError');

const register = catchAsync(async (req, res, next) => {
  // Check for validation errors
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return next(new AppError('Validation errors', 400, errors.array()));
  }

  const { name, email, password, phone, role, specialization, experience, licenseNumber } = req.body;

  // Check if user already exists
  const existingUser = await User.findOne({ email });
  if (existingUser) {
    return next(new AppError('User with this email already exists', 400));
  }

  // Create user data
  const userData = {
    name,
    email,
    password,
    phone,
    role
  };

  // Add physiotherapist specific fields if role is physiotherapist
  if (role === 'physiotherapist') {
    userData.specialization = specialization;
    userData.experience = experience;
    userData.licenseNumber = licenseNumber;
  }

  // Create user
  const user = await User.create(userData);

  // Generate email verification token
  const verifyToken = user.generateEmailVerificationToken();
  await user.save({ validateBeforeSave: false });

  // Send verification email
  try {
    const verifyURL = `${process.env.FRONTEND_URL}/verify-email/${verifyToken}`;
    
    await sendEmail({
      email: user.email,
      subject: 'PhysioAtYourDoor - Email Verification',
      template: 'emailVerification',
      data: {
        name: user.name,
        verifyURL
      }
    });

    res.status(201).json({
      status: 'success',
      message: 'User registered successfully! Please check your email to verify your account.',
      data: {
        user: {
          id: user._id,
          name: user.name,
          email: user.email,
          role: user.role,
          isEmailVerified: user.isEmailVerified
        }
      }
    });
  } catch (error) {
    user.emailVerificationToken = undefined;
    user.emailVerificationExpire = undefined;
    await user.save({ validateBeforeSave: false });

    return next(new AppError('There was an error sending the email. Please try again later.', 500));
  }
});

const login = catchAsync(async (req, res, next) => {
  // Check for validation errors
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return next(new AppError('Validation errors', 400, errors.array()));
  }

  const { email, password } = req.body;

  // Check if user exists and password is correct
  const user = await User.findOne({ email }).select('+password');
  
  if (!user || !(await user.comparePassword(password))) {
    return next(new AppError('Incorrect email or password', 401));
  }

  // Check if user is active
  if (!user.isActive) {
    return next(new AppError('Your account has been deactivated. Please contact support.', 401));
  }

  // Check if email is verified
  if (!user.isEmailVerified) {
    return next(new AppError('Please verify your email before logging in.', 401));
  }

  // Check if physiotherapist is verified
  if (user.role === 'physiotherapist' && user.verificationStatus !== 'verified') {
    let message = 'Your account is pending verification.';
    if (user.verificationStatus === 'rejected') {
      message = `Your account verification was rejected. Reason: ${user.rejectionReason || 'Please contact support.'}`;
    }
    return next(new AppError(message, 401));
  }

  // Update last login
  user.lastLogin = Date.now();
  await user.save({ validateBeforeSave: false });

  // Generate JWT token
  const token = generateToken(user._id);

  res.status(200).json({
    status: 'success',
    message: 'Login successful',
    token,
    data: {
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        phone: user.phone,
        role: user.role,
        profilePicture: user.profilePicture,
        isEmailVerified: user.isEmailVerified,
        verificationStatus: user.verificationStatus,
        specialization: user.specialization,
        experience: user.experience
      }
    }
  });
});

const logout = catchAsync(async (req, res) => {
  res.status(200).json({
    status: 'success',
    message: 'Logged out successfully'
  });
});

const verifyEmail = catchAsync(async (req, res, next) => {
  // Hash the token
  const hashedToken = crypto
    .createHash('sha256')
    .update(req.params.token)
    .digest('hex');

  // Find user with the token
  const user = await User.findOne({
    emailVerificationToken: hashedToken,
    emailVerificationExpire: { $gt: Date.now() }
  });

  if (!user) {
    return next(new AppError('Token is invalid or has expired', 400));
  }

  // Verify the email
  user.isEmailVerified = true;
  user.emailVerificationToken = undefined;
  user.emailVerificationExpire = undefined;
  await user.save();

  // Send welcome email
  try {
    await sendEmail({
      email: user.email,
      subject: 'Welcome to PhysioAtYourDoor!',
      template: 'welcome',
      data: {
        name: user.name,
        role: user.role
      }
    });
  } catch (error) {
    console.error('Error sending welcome email:', error);
  }

  res.status(200).json({
    status: 'success',
    message: 'Email verified successfully! You can now log in.'
  });
});

const resendVerification = catchAsync(async (req, res, next) => {
  const { email } = req.body;

  if (!email) {
    return next(new AppError('Email is required', 400));
  }

  const user = await User.findOne({ email });

  if (!user) {
    return next(new AppError('User not found', 404));
  }

  if (user.isEmailVerified) {
    return next(new AppError('Email is already verified', 400));
  }

  // Generate new verification token
  const verifyToken = user.generateEmailVerificationToken();
  await user.save({ validateBeforeSave: false });

  // Send verification email
  try {
    const verifyURL = `${process.env.FRONTEND_URL}/verify-email/${verifyToken}`;
    
    await sendEmail({
      email: user.email,
      subject: 'PhysioAtYourDoor - Email Verification',
      template: 'emailVerification',
      data: {
        name: user.name,
        verifyURL
      }
    });

    res.status(200).json({
      status: 'success',
      message: 'Verification email sent successfully!'
    });
  } catch (error) {
    user.emailVerificationToken = undefined;
    user.emailVerificationExpire = undefined;
    await user.save({ validateBeforeSave: false });

    return next(new AppError('There was an error sending the email. Please try again later.', 500));
  }
});

const forgotPassword = catchAsync(async (req, res, next) => {
  // Check for validation errors
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return next(new AppError('Validation errors', 400, errors.array()));
  }

  const { email } = req.body;

  // Find user by email
  const user = await User.findOne({ email });

  if (!user) {
    return next(new AppError('User not found', 404));
  }

  // Generate reset token
  const resetToken = user.generatePasswordResetToken();
  await user.save({ validateBeforeSave: false });

  // Send reset email
  try {
    const resetURL = `${process.env.FRONTEND_URL}/reset-password/${resetToken}`;
    
    await sendEmail({
      email: user.email,
      subject: 'PhysioAtYourDoor - Password Reset',
      template: 'passwordReset',
      data: {
        name: user.name,
        resetURL
      }
    });

    res.status(200).json({
      status: 'success',
      message: 'Token sent to email!'
    });
  } catch (error) {
    user.passwordResetToken = undefined;
    user.passwordResetExpire = undefined;
    await user.save({ validateBeforeSave: false });

    return next(new AppError('There was an error sending the email. Please try again later.', 500));
  }
});

const resetPassword = catchAsync(async (req, res, next) => {
  // Check for validation errors
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return next(new AppError('Validation errors', 400, errors.array()));
  }

  // Hash the token
  const hashedToken = crypto
    .createHash('sha256')
    .update(req.params.token)
    .digest('hex');

  // Find user with the token
  const user = await User.findOne({
    passwordResetToken: hashedToken,
    passwordResetExpire: { $gt: Date.now() }
  });

  if (!user) {
    return next(new AppError('Token is invalid or has expired', 400));
  }

  // Set new password
  user.password = req.body.password;
  user.passwordResetToken = undefined;
  user.passwordResetExpire = undefined;
  await user.save();

  // Send password change confirmation email
  try {
    await sendEmail({
      email: user.email,
      subject: 'PhysioAtYourDoor - Password Changed',
      template: 'passwordChanged',
      data: {
        name: user.name
      }
    });
  } catch (error) {
    console.error('Error sending password change email:', error);
  }

  res.status(200).json({
    status: 'success',
    message: 'Password reset successful! You can now log in with your new password.'
  });
});

const getMe = catchAsync(async (req, res) => {
  const user = await User.findById(req.user.id).populate({
    path: 'rating',
    select: 'average count'
  });

  res.status(200).json({
    status: 'success',
    data: {
      user
    }
  });
});

const updatePassword = catchAsync(async (req, res, next) => {
  const { currentPassword, newPassword } = req.body;

  if (!currentPassword || !newPassword) {
    return next(new AppError('Please provide current and new password', 400));
  }

  if (newPassword.length < 8) {
    return next(new AppError('New password must be at least 8 characters', 400));
  }

  // Get user with password
  const user = await User.findById(req.user.id).select('+password');

  // Check if current password is correct
  if (!(await user.comparePassword(currentPassword))) {
    return next(new AppError('Your current password is wrong', 401));
  }

  // Update password
  user.password = newPassword;
  await user.save();

  res.status(200).json({
    status: 'success',
    message: 'Password updated successfully!'
  });
});

module.exports = {
  register,
  login,
  logout,
  verifyEmail,
  resendVerification,
  forgotPassword,
  resetPassword,
  getMe,
  updatePassword
};