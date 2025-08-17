const express = require('express');
const { body } = require('express-validator');
const appointmentController = require('../controllers/appointmentController');
const { protect, restrictTo, verifiedOnly } = require('../middleware/auth');

const router = express.Router();

// Protect all routes after this middleware
router.use(protect);

// Validation rules
const createAppointmentValidation = [
  body('physiotherapist').isMongoId().withMessage('Invalid physiotherapist ID'),
  body('appointmentDate').isISO8601().withMessage('Invalid appointment date'),
  body('timeSlot.startTime').notEmpty().withMessage('Start time is required'),
  body('timeSlot.endTime').notEmpty().withMessage('End time is required'),
  body('reason').trim().isLength({ min: 10, max: 500 }).withMessage('Reason must be between 10-500 characters'),
  body('amount.total').isFloat({ min: 1 }).withMessage('Valid amount is required')
];

// Routes
router.get('/', appointmentController.getAppointments);
router.get('/my-appointments', appointmentController.getMyAppointments);
router.get('/:id', appointmentController.getAppointment);
router.post('/', restrictTo('patient'), createAppointmentValidation, appointmentController.createAppointment);
router.patch('/:id/status', verifiedOnly, appointmentController.updateAppointmentStatus);
router.patch('/:id/notes', appointmentController.updateAppointmentNotes);
router.patch('/:id/rating', appointmentController.rateAppointment);
router.delete('/:id', appointmentController.cancelAppointment);

// Physiotherapist specific routes
router.get('/physio/requests', restrictTo('physiotherapist'), verifiedOnly, appointmentController.getAppointmentRequests);
router.patch('/:id/respond', restrictTo('physiotherapist'), verifiedOnly, appointmentController.respondToAppointment);

module.exports = router;