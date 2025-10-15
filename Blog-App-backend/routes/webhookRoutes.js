const express = require('express');
const router = express.Router();

/**
 * Webhooks are called by external services (Stripe, GitHub, Mailchimp, Netlify, etc).
 * IMPORTANT: Most webhook providers require raw request body for signature verification.
 * For example with Stripe you must use express.raw({ type: 'application/json' }) on the route.
 *
 * The controllers referenced below should verify provider signatures internally
 * or you can create small middleware to verify signatures before passing to controllers.
 */

const {
  handleStripeWebhook,
  handlePaystackWebhook,      // if you use Paystack or similar
  handleMailchimpWebhook,
  handleGithubDeployWebhook,
  handleAlgoliaIndexWebhook
} = require('../controllers/common/webhookController');

// If you use Stripe: use express.raw and do NOT use express.json() earlier for this route
router.post('/stripe', express.raw({ type: 'application/json' }), handleStripeWebhook);

// Generic payment provider webhook (example)
router.post('/paystack', express.json({ type: 'application/json' }), handlePaystackWebhook);

// Newsletter / mailing list webhooks
router.post('/mailchimp', express.json({ type: 'application/json' }), handleMailchimpWebhook);

// GitHub/GitLab deploy webhook (e.g., to trigger rebuilds or CI)
router.post('/deploy', express.json({ type: 'application/json' }), handleGithubDeployWebhook);

// Search/indexing webhook (optional) - e.g., CMS triggers to reindex a post
router.post('/index', express.json({ type: 'application/json' }), handleAlgoliaIndexWebhook);

/*
  NOTE: Do NOT protect webhook routes with your auth middlewares.
  Webhooks are external and should be validated using provider-specific signatures.
*/

module.exports = router;
