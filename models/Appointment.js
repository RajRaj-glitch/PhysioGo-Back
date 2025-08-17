const mongoose = require('mongoose');

const appointmentSchema = new mongoose.Schema({
  patient: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'Patient is required']
  },
  physiotherapist: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'Physiotherapist is required']
  },
  appointmentDate: {
    type: Date,
    required: [true, 'Appointment date is required']
  },
  timeSlot: {
    startTime: {
      type: String,
      required: [true, 'Start time is required']
    },
    endTime: {
      type: String,
      required: [true, 'End time is required']
    }
  },
  reason: {
    type: String,
    required: [true, 'Reason for appointment is required'],
    maxlength: [500, 'Reason cannot exceed 500 characters']
  },
  symptoms: {
    type: String,
    maxlength: [1000, 'Symptoms description cannot exceed 1000 characters']
  },
  status: {
    type: String,
    enum: ['pending', 'confirmed', 'rejected', 'completed', 'cancelled', 'in-progress'],
    default: 'pending'
  },
  rejectionReason: {
    type: String,
    maxlength: [200, 'Rejection reason cannot exceed 200 characters']
  },
  amount: {
    total: {
      type: Number,
      required: [true, 'Total amount is required']
    },
    platformFee: {
      type: Number,
      required: [true, 'Platform fee is required']
    },
    physiotherapistAmount: {
      type: Number,
      required: [true, 'Physiotherapist amount is required']
    }
  },
  payment: {
    paymentId: String,
    paymentIntent: String,
    status: {
      type: String,
      enum: ['pending', 'paid', 'failed', 'refunded', 'partially_refunded'],
      default: 'pending'
    },
    refundId: String,
    refundAmount: Number,
    refundStatus: {
      type: String,
      enum: ['none', 'pending', 'processed', 'failed'],
      default: 'none'
    }
  },
  consultation: {
    type: {
      type: String,
      enum: ['home-visit', 'video-call', 'clinic'],
      default: 'home-visit'
    },
    address: {
      street: String,
      city: String,
      state: String,
      zipCode: String,
      landmark: String
    },
    videoCallLink: String,
    videoCallScheduled: Date
  },
  prescriptions: [{
    medicine: String,
    dosage: String,
    frequency: String,
    duration: String,
    notes: String,
    prescribedAt: {
      type: Date,
      default: Date.now
    }
  }],
  exercises: [{
    name: String,
    description: String,
    sets: Number,
    repetitions: Number,
    duration: String,
    frequency: String,
    notes: String
  }],
  followUp: {
    required: {
      type: Boolean,
      default: false
    },
    scheduledDate: Date,
    notes: String
  },
  rating: {
    patientRating: {
      rating: Number,
      review: String,
      ratedAt: Date
    },
    physiotherapistRating: {
      rating: Number,
      review: String,
      ratedAt: Date
    }
  },
  notes: {
    patientNotes: String,
    physiotherapistNotes: String,
    adminNotes: String
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
});

// Update the updatedAt field before saving
appointmentSchema.pre('save', function(next) {
  this.updatedAt = Date.now();
  next();
});

// Index for efficient queries
appointmentSchema.index({ patient: 1 });
appointmentSchema.index({ physiotherapist: 1 });
appointmentSchema.index({ appointmentDate: 1 });
appointmentSchema.index({ status: 1 });

module.exports = mongoose.model('Appointment', appointmentSchema);