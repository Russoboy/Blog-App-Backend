// controllers/paymentControllers.js
// Handles user and admin payment operations + webhook events

const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY); // If using Stripe
const Payment = require('../models/Payment'); // custom model to record transactions
const Subscription = require('../models/Subscription'); // optional
const User = require('../models/User');
const mongoose = require('mongoose');

/* --------------------------- CLIENT / STUDENT ENDPOINTS --------------------------- */

/**
 * POST /create-payment-intent
 * Create a one-time payment (e.g. for a course, e-book, feature, etc.)
 */
exports.createPaymentIntent = async (req, res, next) => {
  try {
    const { amount, currency = 'usd', description } = req.body;
    if (!amount) return res.status(400).json({ error: 'Amount is required' });

    // Example: Stripe Payment Intent
    const paymentIntent = await stripe.paymentIntents.create({
      amount: Math.round(amount * 100), // convert to smallest currency unit
      currency,
      metadata: {
        userId: req.user._id.toString(),
        email: req.user.email,
      },
      description: description || 'Payment from student portal',
    });

    // Save locally in DB
    const newPayment = new Payment({
      userId: req.user._id,
      amount,
      currency,
      status: 'pending',
      provider: 'stripe',
      providerPaymentId: paymentIntent.id,
      description,
    });
    await newPayment.save();

    return res.json({
      clientSecret: paymentIntent.client_secret,
      message: 'Payment intent created',
    });
  } catch (err) {
    next(err);
  }
};

/**
 * POST /subscribe
 * Create or manage a recurring subscription for the user
 */
exports.createSubscription = async (req, res, next) => {
  try {
    const { planId } = req.body;
    if (!planId) return res.status(400).json({ error: 'planId required' });

    // Example: using Stripe subscriptions
    const customer = await stripe.customers.create({
      email: req.user.email,
      metadata: { userId: req.user._id.toString() },
    });

    const subscription = await stripe.subscriptions.create({
      customer: customer.id,
      items: [{ price: planId }],
      payment_behavior: 'default_incomplete',
      expand: ['latest_invoice.payment_intent'],
    });

    // Save locally
    const newSub = new Subscription({
      userId: req.user._id,
      provider: 'stripe',
      providerCustomerId: customer.id,
      providerSubscriptionId: subscription.id,
      planId,
      status: subscription.status,
    });
    await newSub.save();

    return res.json({
      clientSecret: subscription.latest_invoice.payment_intent.client_secret,
      subscriptionId: subscription.id,
    });
  } catch (err) {
    next(err);
  }
};

/**
 * POST /subscription/cancel
 * Cancel the user's active subscription
 */
exports.cancelSubscription = async (req, res, next) => {
  try {
    const sub = await Subscription.findOne({ userId: req.user._id, status: 'active' });
    if (!sub) return res.status(404).json({ error: 'No active subscription found' });

    // Cancel in Stripe
    await stripe.subscriptions.update(sub.providerSubscriptionId, { cancel_at_period_end: true });

    sub.status = 'canceled';
    sub.canceledAt = new Date();
    await sub.save();

    return res.json({ message: 'Subscription cancellation scheduled' });
  } catch (err) {
    next(err);
  }
};

/**
 * GET /me
 * Get all user’s payments and subscriptions
 */
exports.getMyPayments = async (req, res, next) => {
  try {
    const [payments, subscriptions] = await Promise.all([
      Payment.find({ userId: req.user._id }).sort({ createdAt: -1 }),
      Subscription.find({ userId: req.user._id }).sort({ createdAt: -1 }),
    ]);

    return res.json({ payments, subscriptions });
  } catch (err) {
    next(err);
  }
};

/* --------------------------- WEBHOOK ENDPOINT --------------------------- */

/**
 * POST /webhook
 * Handle Stripe or Paystack webhook events securely.
 * ⚠️ Must use express.raw({ type: 'application/json' }) in the route.
 */
exports.handleWebhook = async (req, res, next) => {
  let event;
  try {
    const sig = req.headers['stripe-signature'];
    event = stripe.webhooks.constructEvent(
      req.body,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET
    );
  } catch (err) {
    console.error('Webhook signature error:', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  try {
    switch (event.type) {
      case 'payment_intent.succeeded': {
        const paymentIntent = event.data.object;
        await Payment.findOneAndUpdate(
          { providerPaymentId: paymentIntent.id },
          { status: 'succeeded', updatedAt: new Date() }
        );
        break;
      }
      case 'invoice.payment_failed': {
        const invoice = event.data.object;
        await Payment.findOneAndUpdate(
          { providerPaymentId: invoice.id },
          { status: 'failed', updatedAt: new Date() }
        );
        break;
      }
      case 'customer.subscription.deleted': {
        const subscription = event.data.object;
        await Subscription.findOneAndUpdate(
          { providerSubscriptionId: subscription.id },
          { status: 'canceled', updatedAt: new Date() }
        );
        break;
      }
      default:
        console.log(`Unhandled event type: ${event.type}`);
    }

    res.json({ received: true });
  } catch (err) {
    next(err);
  }
};

/* --------------------------- ADMIN ENDPOINTS --------------------------- */

/**
 * GET /admin/transactions
 * View all transactions with filters and pagination
 */
exports.getTransactions = async (req, res, next) => {
  try {
    const page = Math.max(1, parseInt(req.query.page || '1', 10));
    const limit = Math.min(100, parseInt(req.query.limit || '20', 10));
    const skip = (page - 1) * limit;

    const filter = {};
    if (req.query.status) filter.status = req.query.status;
    if (req.query.userId && mongoose.isValidObjectId(req.query.userId)) {
      filter.userId = mongoose.Types.ObjectId(req.query.userId);
    }
    if (req.query.provider) filter.provider = req.query.provider;

    const [items, total] = await Promise.all([
      Payment.find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .populate('userId', 'name email')
        .lean(),
      Payment.countDocuments(filter),
    ]);

    return res.json({ page, limit, total, items });
  } catch (err) {
    next(err);
  }
};
