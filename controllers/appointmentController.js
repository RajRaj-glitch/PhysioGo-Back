const { validationResult } = require('express-validator');
const Appointment = require('../models/Appointment');
const User = require('../models/User');
const Chat = require('../models/Chat');
const { sendEmail } = require('../services/emailService');
const { processRefund } = require('../services/paymentService');
const catchAsync = require('../utils/catchAsync');
const AppError = require('../utils/appError');

const createAppointment = catchAsync(async (req, res, next) => {
  // Check for validation errors
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return next(new AppError('Validation errors', 400, errors.array()));
  }

  const {
    physiotherapist,
    appointmentDate,
    timeSlot,
    reason,
    symptoms,
    amount,
    consultation
  } = req.body;

  // Verify physiotherapist exists and is verified
  const physio = await User.findById(physiotherapist);
  if (!physio || physio.role !== 'physiotherapist') {
    return next(new AppError('Physiotherapist not found', 404));
  }

  if (physio.verificationStatus !== 'verified') {
    return next(new AppError('This physiotherapist is not yet verified', 400));
  }

  // Check if the time slot is available
  const existingAppointment = await Appointment.findOne({
    physiotherapist,
    appointmentDate,
    'timeSlot.startTime': timeSlot.startTime,
    status: { $in: ['pending', 'confirmed'] }
  });

  if (existingAppointment) {
    return next(new AppError('This time slot is not available', 400));
  }

  // Calculate commission
  const platformCommission = parseFloat(process.env.PLATFORM_COMMISSION) || 0.20;
  const platformFee = amount.total * platformCommission;
  const physiotherapistAmount = amount.total - platformFee;

  // Create appointment
  const appointment = await Appointment.create({
    patient: req.user.id,
    physiotherapist,
    appointmentDate,
    timeSlot,
    reason,
    symptoms,
    amount: {
      total: amount.total,
      platformFee,
      physiotherapistAmount
    },
    consultation,
    payment: {
      status: 'paid' // Assuming payment is processed before this
    }
  });

  // Populate appointment with user details
  await appointment.populate([
    { path: 'patient', select: 'name email phone' },
    { path: 'physiotherapist', select: 'name email phone specialization' }
  ]);

  // Send email notifications
  try {
    // Email to patient
    await sendEmail({
      email: req.user.email,
      subject: 'Appointment Request Submitted - PhysioAtYourDoor',
      template: 'appointmentPending',
      data: {
        patientName: req.user.name,
        physiotherapistName: physio.name,
        appointmentDate: new Date(appointmentDate).toLocaleDateString(),
        timeSlot: `${timeSlot.startTime} - ${timeSlot.endTime}`,
        reason,
        amount: amount.total
      }
    });

    // Email to physiotherapist
    await sendEmail({
      email: physio.email,
      subject: 'New Appointment Request - PhysioAtYourDoor',
      template: 'appointmentRequest',
      data: {
        physiotherapistName: physio.name,
        patientName: req.user.name,
        patientPhone: req.user.phone,
        appointmentDate: new Date(appointmentDate).toLocaleDateString(),
        timeSlot: `${timeSlot.startTime} - ${timeSlot.endTime}`,
        reason,
        symptoms,
        amount: physiotherapistAmount
      }
    });
  } catch (error) {
    console.error('Error sending appointment emails:', error);
  }

  res.status(201).json({
    status: 'success',
    message: 'Appointment request submitted successfully',
    data: {
      appointment
    }
  });
});

const getAppointments = catchAsync(async (req, res) => {
  const { status, page = 1, limit = 10 } = req.query;
  
  const query = {};
  if (req.user.role === 'patient') {
    query.patient = req.user.id;
  } else if (req.user.role === 'physiotherapist') {
    query.physiotherapist = req.user.id;
  }
  
  if (status) {
    query.status = status;
  }

  const appointments = await Appointment.find(query)
    .populate([
      { path: 'patient', select: 'name email phone profilePicture' },
      { path: 'physiotherapist', select: 'name email phone profilePicture specialization rating' }
    ])
    .sort({ createdAt: -1 })
    .limit(limit * 1)
    .skip((page - 1) * limit);

  const total = await Appointment.countDocuments(query);

  res.status(200).json({
    status: 'success',
    data: {
      appointments,
      pagination: {
        currentPage: page,
        totalPages: Math.ceil(total / limit),
        totalItems: total
      }
    }
  });
});

const getMyAppointments = catchAsync(async (req, res) => {
  const { status } = req.query;
  
  const query = {
    $or: [
      { patient: req.user.id },
      { physiotherapist: req.user.id }
    ]
  };
  
  if (status) {
    query.status = status;
  }

  const appointments = await Appointment.find(query)
    .populate([
      { path: 'patient', select: 'name email phone profilePicture' },
      { path: 'physiotherapist', select: 'name email phone profilePicture specialization rating' }
    ])
    .sort({ createdAt: -1 });

  res.status(200).json({
    status: 'success',
    data: {
      appointments
    }
  });
});

const getAppointment = catchAsync(async (req, res, next) => {
  const appointment = await Appointment.findById(req.params.id)
    .populate([
      { path: 'patient', select: 'name email phone profilePicture medicalHistory' },
      { path: 'physiotherapist', select: 'name email phone profilePicture specialization qualifications experience rating' }
    ]);

  if (!appointment) {
    return next(new AppError('Appointment not found', 404));
  }

  // Check if user has access to this appointment
  if (
    req.user.role !== 'admin' &&
    appointment.patient._id.toString() !== req.user.id &&
    appointment.physiotherapist._id.toString() !== req.user.id
  ) {
    return next(new AppError('You do not have access to this appointment', 403));
  }

  res.status(200).json({
    status: 'success',
    data: {
      appointment
    }
  });
});

const respondToAppointment = catchAsync(async (req, res, next) => {
  const { status, rejectionReason } = req.body;

  if (!['confirmed', 'rejected'].includes(status)) {
    return next(new AppError('Invalid status. Use "confirmed" or "rejected"', 400));
  }

  if (status === 'rejected' && !rejectionReason) {
    return next(new AppError('Rejection reason is required', 400));
  }

  const appointment = await Appointment.findById(req.params.id)
    .populate([
      { path: 'patient', select: 'name email phone' },
      { path: 'physiotherapist', select: 'name email phone' }
    ]);

  if (!appointment) {
    return next(new AppError('Appointment not found', 404));
  }

  if (appointment.physiotherapist._id.toString() !== req.user.id) {
    return next(new AppError('You can only respond to your own appointment requests', 403));
  }

  if (appointment.status !== 'pending') {
    return next(new AppError('This appointment has already been responded to', 400));
  }

  // Update appointment status
  appointment.status = status;
  if (status === 'rejected') {
    appointment.rejectionReason = rejectionReason;
  }
  await appointment.save();

  // Create chat if appointment is confirmed
  if (status === 'confirmed') {
    await Chat.create({
      appointment: appointment._id,
      participants: [appointment.patient._id, appointment.physiotherapist._id]
    });
  }

  // Send notification emails
  try {
    if (status === 'confirmed') {
      await sendEmail({
        email: appointment.patient.email,
        subject: 'Appointment Confirmed - PhysioAtYourDoor',
        template: 'appointmentConfirmed',
        data: {
          patientName: appointment.patient.name,
          physiotherapistName: appointment.physiotherapist.name,
          physiotherapistPhone: appointment.physiotherapist.phone,
          appointmentDate: new Date(appointment.appointmentDate).toLocaleDateString(),
          timeSlot: `${appointment.timeSlot.startTime} - ${appointment.timeSlot.endTime}`,
          reason: appointment.reason
        }
      });
    } else {
      // Process refund for rejected appointment
      await processRefund(appointment);
      
      await sendEmail({
        email: appointment.patient.email,
        subject: 'Appointment Update - PhysioAtYourDoor',
        template: 'appointmentRejected',
        data: {
          patientName: appointment.patient.name,
          physiotherapistName: appointment.physiotherapist.name,
          rejectionReason,
          amount: appointment.amount.total
        }
      });
    }
  } catch (error) {
    console.error('Error sending appointment response emails:', error);
  }

  res.status(200).json({
    status: 'success',
    message: `Appointment ${status} successfully`,
    data: {
      appointment
    }
  });
});

const updateAppointmentStatus = catchAsync(async (req, res, next) => {
  const { status } = req.body;
  const validStatuses = ['in-progress', 'completed', 'cancelled'];

  if (!validStatuses.includes(status)) {
    return next(new AppError('Invalid status', 400));
  }

  const appointment = await Appointment.findById(req.params.id);

  if (!appointment) {
    return next(new AppError('Appointment not found', 404));
  }

  // Check permissions
  if (
    req.user.role !== 'admin' &&
    appointment.patient.toString() !== req.user.id &&
    appointment.physiotherapist.toString() !== req.user.id
  ) {
    return next(new AppError('You do not have permission to update this appointment', 403));
  }

  appointment.status = status;
  await appointment.save();

  res.status(200).json({
    status: 'success',
    message: 'Appointment status updated successfully',
    data: {
      appointment
    }
  });
});

const updateAppointmentNotes = catchAsync(async (req, res, next) => {
  const { notes } = req.body;
  const appointment = await Appointment.findById(req.params.id);

  if (!appointment) {
    return next(new AppError('Appointment not found', 404));
  }

  // Check permissions
  if (
    appointment.patient.toString() !== req.user.id &&
    appointment.physiotherapist.toString() !== req.user.id
  ) {
    return next(new AppError('You do not have permission to update this appointment', 403));
  }

  if (req.user.role === 'patient') {
    appointment.notes.patientNotes = notes;
  } else if (req.user.role === 'physiotherapist') {
    appointment.notes.physiotherapistNotes = notes;
  }

  await appointment.save();

  res.status(200).json({
    status: 'success',
    message: 'Appointment notes updated successfully',
    data: {
      appointment
    }
  });
});

const rateAppointment = catchAsync(async (req, res, next) => {
  const { rating, review } = req.body;

  if (!rating || rating < 1 || rating > 5) {
    return next(new AppError('Please provide a rating between 1 and 5', 400));
  }

  const appointment = await Appointment.findById(req.params.id);

  if (!appointment) {
    return next(new AppError('Appointment not found', 404));
  }

  if (appointment.status !== 'completed') {
    return next(new AppError('You can only rate completed appointments', 400));
  }

  // Check permissions and update appropriate rating
  if (req.user.id === appointment.patient.toString()) {
    if (appointment.rating.patientRating.rating) {
      return next(new AppError('You have already rated this appointment', 400));
    }
    
    appointment.rating.patientRating = {
      rating,
      review: review || '',
      ratedAt: Date.now()
    };

    // Update physiotherapist's overall rating
    await updatePhysiotherapistRating(appointment.physiotherapist, rating);
  } else if (req.user.id === appointment.physiotherapist.toString()) {
    if (appointment.rating.physiotherapistRating.rating) {
      return next(new AppError('You have already rated this appointment', 400));
    }
    
    appointment.rating.physiotherapistRating = {
      rating,
      review: review || '',
      ratedAt: Date.now()
    };
  } else {
    return next(new AppError('You do not have permission to rate this appointment', 403));
  }

  await appointment.save();

  res.status(200).json({
    status: 'success',
    message: 'Rating submitted successfully',
    data: {
      appointment
    }
  });
});

const updatePhysiotherapistRating = async (physiotherapistId, newRating) => {
  try {
    const physio = await User.findById(physiotherapistId);
    if (physio) {
      const currentAverage = physio.rating.average;
      const currentCount = physio.rating.count;
      
      const newCount = currentCount + 1;
      const newAverage = ((currentAverage * currentCount) + newRating) / newCount;
      
      physio.rating.average = parseFloat(newAverage.toFixed(2));
      physio.rating.count = newCount;
      
      await physio.save();
    }
  } catch (error) {
    console.error('Error updating physiotherapist rating:', error);
  }
};

const cancelAppointment = catchAsync(async (req, res, next) => {
  const appointment = await Appointment.findById(req.params.id);

  if (!appointment) {
    return next(new AppError('Appointment not found', 404));
  }

  // Check permissions
  if (
    req.user.role !== 'admin' &&
    appointment.patient.toString() !== req.user.id &&
    appointment.physiotherapist.toString() !== req.user.id
  ) {
    return next(new AppError('You do not have permission to cancel this appointment', 403));
  }

  if (!['pending', 'confirmed'].includes(appointment.status)) {
    return next(new AppError('This appointment cannot be cancelled', 400));
  }

  appointment.status = 'cancelled';
  await appointment.save();

  // Process refund if applicable
  if (appointment.payment.status === 'paid') {
    try {
      await processRefund(appointment);
    } catch (error) {
      console.error('Error processing refund:', error);
    }
  }

  res.status(200).json({
    status: 'success',
    message: 'Appointment cancelled successfully',
    data: {
      appointment
    }
  });
});

const getAppointmentRequests = catchAsync(async (req, res) => {
  const appointments = await Appointment.find({
    physiotherapist: req.user.id,
    status: 'pending'
  })
    .populate([
      { path: 'patient', select: 'name email phone profilePicture medicalHistory' }
    ])
    .sort({ createdAt: -1 });

  res.status(200).json({
    status: 'success',
    data: {
      appointments
    }
  });
});

module.exports = {
  createAppointment,
  getAppointments,
  getMyAppointments,
  getAppointment,
  respondToAppointment,
  updateAppointmentStatus,
  updateAppointmentNotes,
  rateAppointment,
  cancelAppointment,
  getAppointmentRequests
};