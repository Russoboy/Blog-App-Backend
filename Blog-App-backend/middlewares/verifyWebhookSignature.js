// middlewares/verifyWebhookSignature.js
// Verifies webhook signatures for providers.
// - For Stripe: use stripe webhook secret (STRIPE_WEBHOOK_SECRET).

// Notes:
//  - It's important to use express.raw for stripe routes to preserve the raw body used for signature verification.
//  - If you call this middleware on routes parsed by express.json(), signature checks can fail.

const crypto = require('crypto');

module.exports = function verifyWebhookSignature(provider = 'generic') {
  return async (req, res, next) => {
    try {
      // prefer rawBody set by express.raw; otherwise fall back to Buffer.from(JSON.stringify(req.body))
      // WARNING: If express.json() ran before, the raw signature will not match provider expectations.
      const raw = req.body && req.body instanceof Buffer ? req.body : (req.rawBody || (req.body && typeof req.body === 'object' ? Buffer.from(JSON.stringify(req.body)) : null));

      if (!raw) {
        // If there's no raw body available, warn and reject - webhook signature cannot be validated safely.
        console.warn('verifyWebhookSignature: raw body not available. Ensure express.raw() is used for this route.');
        return res.status(400).json({ error: 'Raw body required for webhook signature verification' });
      }

      if (provider === 'stripe') {
        // Stripe verification using stripe library if available and secret set
        const stripeSecret = process.env.STRIPE_WEBHOOK_SECRET;
        if (!stripeSecret) {
          console.warn('STRIPE_WEBHOOK_SECRET not configured.');
          return res.status(400).json({ error: 'Stripe webhook secret not configured' });
        }

        // try to use stripe library if installed for robust verification
        try {
          const Stripe = require('stripe');
          const stripe = Stripe(process.env.STRIPE_SECRET_KEY || '');
          const sigHeader = req.headers['stripe-signature'];
          if (!sigHeader) return res.status(400).json({ error: 'Missing stripe-signature header' });

          let event;
          try {
            event = stripe.webhooks.constructEvent(raw, sigHeader, stripeSecret);
          } catch (err) {
            console.warn('Stripe webhook signature verification failed:', err.message);
            return res.status(400).json({ error: 'Invalid stripe webhook signature' });
          }

          // attach the parsed event for handler
          req.webhookEvent = event;
          return next();
        } catch (err) {
          // Stripe library not installed - fall back to simple HMAC check (less recommended)
          console.warn('stripe package not found; falling back to basic HMAC check. For best results, install stripe package.');
          const sigHeader = req.headers['stripe-signature'];
          if (!sigHeader) return res.status(400).json({ error: 'Missing stripe-signature header' });

          // naive fallback: check that payload contains the secret anywhere (not secure) — reject
          return res.status(500).json({ error: 'Stripe verification requires stripe SDK. Install stripe package or use generic provider.' });
        }
      }

      // Generic HMAC provider (header: x-signature, algorithm: sha256)
      if (provider === 'generic') {
        const secret = process.env.GENERIC_WEBHOOK_SECRET;
        if (!secret) {
          console.warn('GENERIC_WEBHOOK_SECRET not configured.');
          return res.status(400).json({ error: 'Webhook secret not configured' });
        }

        const signatureHeader = req.headers['x-signature'] || req.headers['x-hub-signature'] || req.headers['signature'];
        if (!signatureHeader) return res.status(400).json({ error: 'Missing signature header' });

        // Support header formats like: sha256=hex or raw hex
        let provided = signatureHeader;
        if (typeof provided === 'string' && provided.includes('=')) {
          provided = provided.split('=')[1];
        }

        const hmac = crypto.createHmac('sha256', secret).update(raw).digest('hex');

        if (!crypto.timingSafeEqual(Buffer.from(hmac, 'hex'), Buffer.from(provided, 'hex'))) {
          console.warn('Generic webhook signature mismatch');
          return res.status(400).json({ error: 'Invalid webhook signature' });
        }

        // attach raw payload for handler convenience
        try {
          req.webhookEvent = JSON.parse(raw.toString('utf8'));
        } catch (e) {
          // if not JSON, pass raw
          req.webhookEvent = raw;
        }

        return next();
      }

      // Unknown provider
      return res.status(400).json({ error: 'Unknown webhook provider for verification' });
    } catch (err) {
      console.error('verifyWebhookSignature error:', err);
      return res.status(500).json({ error: 'Webhook verification failure' });
    }
  };
};
