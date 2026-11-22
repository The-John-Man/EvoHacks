/*
 * Claimable — site configuration.
 *
 * MojoAuth (passwordless login) setup:
 *   1. Create a free project at https://mojoauth.com (dashboard).
 *   2. Add your site URL(s) to the project's allowed domains,
 *      e.g. http://localhost:5317 and your GitHub Pages URL.
 *   3. Turn on Email OTP under Authentication settings.
 *   4. Paste the project's API key below. This key is meant to be public:
 *      MojoAuth's browser SDK needs it in the page. NEVER put the API *secret* here.
 *
 * Leave the key empty and login is hidden. The screener works fully without it.
 */
window.CLAIMABLE_CONFIG = {
  mojoAuthApiKey: "",
};
