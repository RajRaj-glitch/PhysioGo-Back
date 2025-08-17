# PhysioAtYourDoor Backend Setup Guide

## Prerequisites
- Node.js (v14 or higher)
- MongoDB Atlas account
- Gmail account (for email service)
- Stripe account (for payments)

## Step-by-Step Setup

### 1. MongoDB Atlas Setup
1. Go to [MongoDB Atlas](https://www.mongodb.com/atlas)
2. Create a free account and cluster
3. Create a database user with read/write permissions
4. Whitelist your IP address (or use 0.0.0.0/0 for development)
5. Get your connection string and replace in `.env` file

### 2. Gmail SMTP Setup
1. Enable 2-factor authentication on your Gmail account
2. Generate an "App Password" (not your regular password)
3. Use this app password in the `.env` file for `EMAIL_PASS`

### 3. Stripe Setup (Optional for testing)
1. Create a Stripe account at [stripe.com](https://stripe.com)
2. Get your test API keys from the dashboard
3. Add them to your `.env` file

### 4. Create Required Directories
```bash
mkdir uploads
mkdir uploads/documents
mkdir uploads/profiles
```

### 5. Run the Application
```bash
# Development mode with auto-restart
npm run dev

# Or production mode
npm start
```

### 6. Test the API
The server will run on `http://localhost:5000`

Test endpoints:
- Health check: `GET http://localhost:5000/api/health`
- Register: `POST http://localhost:5000/api/auth/register`
- Login: `POST http://localhost:5000/api/auth/login`

## API Documentation

### Authentication Endpoints
- `POST /api/auth/register` - Register new user
- `POST /api/auth/login` - Login user
- `GET /api/auth/verify-email/:token` - Verify email
- `POST /api/auth/forgot-password` - Request password reset
- `PUT /api/auth/reset-password/:token` - Reset password

### User Endpoints
- `GET /api/users/profile` - Get user profile
- `PUT /api/users/profile` - Update profile
- `GET /api/users/physiotherapists` - Get verified physiotherapists

### Appointment Endpoints
- `POST /api/appointments` - Create appointment
- `GET /api/appointments` - Get user appointments
- `PUT /api/appointments/:id/status` - Update appointment status

### Admin Endpoints
- `GET /api/admin/users` - Get all users
- `PUT /api/admin/verify-physiotherapist/:id` - Verify physiotherapist

## Troubleshooting

### Common Issues:
1. **MongoDB Connection Error**: Check your connection string and IP whitelist
2. **Email Not Sending**: Verify Gmail app password and SMTP settings
3. **JWT Errors**: Ensure JWT_SECRET is set and complex
4. **File Upload Issues**: Check if uploads directory exists

### Development Tips:
- Use Postman or Thunder Client for API testing
- Check server logs for detailed error messages
- Use MongoDB Compass to view database data
- Enable development logging by setting NODE_ENV=development