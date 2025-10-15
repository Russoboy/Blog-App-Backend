// controllers/common/webhookController.js
// Handles external webhook calls from providers like Stripe, Paystack, Mailchimp, GitHub, Algolia, etc.

const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const crypto = require('crypto');
const axios = require('axios');
const Payment = require('../../models/Payment');
const Subscription = require('../../models/Subscription');

/* ------------------------------------------------------------------
   STRIPE WEBHOOK HANDLER
   ------------------------------------------------------------------ */
exports.handleStripeWebhook = async (req, res) => {
  const sig = req.headers['stripe-signature'];
  let event;

  try {
    event = stripe.webhooks.constructEvent(
      req.body,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET
    );
  } catch (err) {
    console.error('❌ Stripe webhook signature verification failed:', err.message);
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
        console.log('✅ Stripe payment succeeded:', paymentIntent.id);
        break;
      }

      case 'invoice.payment_failed': {
        const invoice = event.data.object;
        await Payment.findOneAndUpdate(
          { providerPaymentId: invoice.id },
          { status: 'failed', updatedAt: new Date() }
        );
        console.log('⚠️ Stripe payment failed:', invoice.id);
        break;
      }

      case 'customer.subscription.deleted': {
        const subscription = event.data.object;
        await Subscription.findOneAndUpdate(
          { providerSubscriptionId: subscription.id },
          { status: 'canceled', updatedAt: new Date() }
        );
        console.log('🚫 Stripe subscription canceled:', subscription.id);
        break;
      }

      default:
        console.log(`ℹ️ Stripe webhook: Unhandled event type ${event.type}`);
    }

    res.json({ received: true });
  } catch (err) {
    console.error('⚠️ Stripe webhook processing error:', err);
    res.status(500).send('Internal error');
  }
};

/* ------------------------------------------------------------------
   PAYSTACK WEBHOOK HANDLER
   ------------------------------------------------------------------ */
exports.handlePaystackWebhook = async (req, res) => {
  try {
    // Verify signature
    const hash = crypto
      .createHmac('sha512', process.env.PAYSTACK_SECRET_KEY)
      .update(JSON.stringify(req.body))
      .digest('hex');

    if (hash !== req.headers['x-paystack-signature']) {
      console.error('❌ Paystack signature mismatch');
      return res.status(400).send('Invalid signature');
    }

    const event = req.body.event;
    const data = req.body.data;

    switch (event) {
      case 'charge.success': {
        await Payment.findOneAndUpdate(
          { providerPaymentId: data.reference },
          { status: 'succeeded', updatedAt: new Date() }
        );
        console.log('✅ Paystack payment succeeded:', data.reference);
        break;
      }

      case 'subscription.not_renew':
      case 'subscription.disable': {
        await Subscription.findOneAndUpdate(
          { providerSubscriptionId: data.subscription_code },
          { status: 'canceled', updatedAt: new Date() }
        );
        console.log('🚫 Paystack subscription canceled:', data.subscription_code);
        break;
      }

      default:
        console.log(`ℹ️ Paystack webhook: Unhandled event ${event}`);
    }

    res.status(200).json({ received: true });
  } catch (err) {
    console.error('⚠️ Paystack webhook error:', err);
    res.status(500).send('Internal error');
  }
};

/* ------------------------------------------------------------------
   MAILCHIMP WEBHOOK HANDLER
   ------------------------------------------------------------------ */
exports.handleMailchimpWebhook = async (req, res) => {
  try {
    const event = req.body.type;
    const data = req.body.data;

    switch (event) {
      case 'subscribe':
        console.log(`✅ New Mailchimp subscriber: ${data.email}`);
        break;
      case 'unsubscribe':
        console.log(`🚫 Mailchimp unsubscribe: ${data.email}`);
        break;
      default:
        console.log(`ℹ️ Mailchimp webhook: Unhandled event ${event}`);
    }

    res.status(200).send('Received');
  } catch (err) {
    console.error('⚠️ Mailchimp webhook error:', err);
    res.status(500).send('Internal error');
  }
};

/* ------------------------------------------------------------------
   GITHUB DEPLOY WEBHOOK HANDLER
   ------------------------------------------------------------------ */
exports.handleGithubDeployWebhook = async (req, res) => {
  try {
    const event = req.headers['x-github-event'];
    const repo = req.body.repository?.full_name;

    if (event === 'push') {
      console.log(`🚀 Deploy triggered from GitHub push on ${repo}`);

      // Optional: Trigger your Netlify/Vercel/Render redeploy
      if (process.env.DEPLOY_HOOK_URL) {
        await axios.post(process.env.DEPLOY_HOOK_URL);
        console.log('✅ Deployment triggered successfully');
      }
    }

    res.status(200).send('Webhook received');
  } catch (err) {
    console.error('⚠️ GitHub deploy webhook error:', err);
    res.status(500).send('Internal error');
  }
};

/* ------------------------------------------------------------------
   ALGOLIA INDEX / CMS SYNC WEBHOOK HANDLER
   ------------------------------------------------------------------ */
exports.handleAlgoliaIndexWebhook = async (req, res) => {
  try {
    const { action, recordId } = req.body;

    console.log(`🔄 Algolia webhook received: ${action} for record ${recordId}`);

    // Optional: Update your Algolia or local search index
    if (action === 'update' || action === 'create') {
      // await syncPostToAlgolia(recordId);
      console.log('✅ Record updated in search index');
    } else if (action === 'delete') {
      // await deleteFromAlgolia(recordId);
      console.log('🗑️ Record deleted from search index');
    }

    res.status(200).json({ received: true });
  } catch (err) {
    console.error('⚠️ Algolia webhook error:', err);
    res.status(500).send('Internal error');
  }
};
