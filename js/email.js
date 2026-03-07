/**
 * Email Module — EmailJS Integration
 * Handles personalized welcome emails for new users using personal email accounts.
 */

const EmailService = (() => {
  // CONFIGURATION
  // Get these from your EmailJS dashboard: https://dashboard.emailjs.com/
  const EMAILJS_PUBLIC_KEY = 'QyljV4M53Pl69X5Mo'; 
  const EMAILJS_SERVICE_ID = 'service_zzx5xfs';
  const EMAILJS_TEMPLATE_ID = 'template_1xs66vr';

  /**
   * Sends a personalized welcome email.
   * @param {Object} user - The Firebase user object.
   */
  async function sendWelcomeEmail(user) {
    if (!user || !user.email) return;

    // Check if SDK is loaded
    if (typeof emailjs === 'undefined') {
      console.error('[EmailService] EmailJS SDK is not loaded. Make sure the script tag is present.');
      return;
    }

    // Initialize SDK
    if (EMAILJS_PUBLIC_KEY !== 'YOUR_PUBLIC_KEY') {
      emailjs.init(EMAILJS_PUBLIC_KEY);
    } else {
      console.warn('[EmailService] MOCK MODE: EmailJS Public Key is missing.');
      console.log('[EmailService] Content Target:', user.email);
      return;
    }

    console.log(`[EmailService] Sending welcome email to: ${user.email}`);

    const templateParams = {
      user_name: user.displayName || 'Friend',
      user_email: user.email,
      reply_to: 'support@playpulse.app' // Optional
    };

    try {
      const response = await emailjs.send(
        EMAILJS_SERVICE_ID,
        EMAILJS_TEMPLATE_ID,
        templateParams
      );

      console.log('[EmailService] Welcome email sent successfully!', response.status, response.text);
    } catch (error) {
      console.error('[EmailService] Failed to send email:', error);
    }
  }

  return { sendWelcomeEmail };
})();
