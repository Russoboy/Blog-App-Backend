const express = require('express');

const {
  createPaymentIntent,
  createSubscription,
  cancelSubscription,
  getMyPayments,
  getTransactions,        // admin
  handleWebhook,         // public webhook endpoint (signature verified inside)
} = require('../controllers/paymentControllers');

const studentAuth = require('../middlewares/studentAuth');
const adminAuth = require('../middlewares/adminAuth');
const verifyWebhookSignature = require('../middlewares/verifyWebhookSignature'); // optional if you verify in controller

const router = express.Router();

/*
  Client / Authenticated user payment endpoints
*/
router.use(studentAuth)
// Create a one-time payment intent (example for Stripe)
router.post('/create-payment-intent', createPaymentIntent);
// Create a subscription / start a recurring plan
router.post('/subscribe', createSubscription);
// Cancel subscription for current user
router.post('/subscription/cancel', cancelSubscription);
// Get current user's payments / invoices
router.get('/me', getMyPayments);

/*
  Webhook endpoint (public) - verify signature inside middleware/controller
  Do NOT protect with normal auth middleware. Payment providers call this.
*/
router.post('/webhook', express.raw({ type: 'application/json' }), handleWebhook);

/*
  Admin-only endpoints
*/
router.use('/admin', adminAuth);
router.get('/admin/transactions', getTransactions);

module.exports = router;
