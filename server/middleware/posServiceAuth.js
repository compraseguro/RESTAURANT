const { requireBearerApiSecret } = require('../../packages/shared-auth');

/** Bearer API_SECRET_KEY (misma clave en POS y panel SaaS). */
const requirePosServiceAuth = requireBearerApiSecret(() => process.env.API_SECRET_KEY);

module.exports = { requirePosServiceAuth };
