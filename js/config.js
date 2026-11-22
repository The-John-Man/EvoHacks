/*
 * Claimable — site configuration.
 *
 * Sign-in uses MojoAuth over OpenID Connect (authorization code flow + PKCE).
 * This is a *public client*: there is no client secret, and none should ever be added here.
 * The issuer and client ID are public values, safe to ship in browser code.
 *
 * (This is a static site with no build step, so these live here instead of in
 * environment variables. To use env vars, add a build step that writes this file.)
 *
 * MojoAuth dashboard setup:
 *   - Allowed redirect URLs: <your site>/auth/callback
 *       e.g. http://localhost:5321/auth/callback and
 *            https://<user>.github.io/<repo>/auth/callback
 *   - Allowed logout URLs: your site's home page
 *
 * Leave either value empty and login is hidden. The screener works fully without it.
 */
window.CLAIMABLE_CONFIG = {
  oidcIssuer: "https://test-claimable-19914bab.auth.mojoauth.com",
  oidcClientId: "test_0918ab42-dae3-4e67-b1e9-a9c1d0f98efa",
};
