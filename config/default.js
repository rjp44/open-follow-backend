const defer = require('config/defer').deferConfig;

module.exports = {
  backend_method: 'http',
  backend_host: 'localhost:3000',
  port: process.env.PORT || 8888,
  twitter: {
    callback_url: defer(function () { return `${this.backend_method}://${this.backend_host}/callback/twitter`; }),
    client_id: process.env.TWITTER_CLIENT_KEY || 'dummy_key',
    client_secret: process.env.TWITTER_CLIENT_SECRET || 'dummy_secret',
  },
  mastodon: {
    redirect_uri: defer(function () { return `${this.backend_method}://${this.backend_host}/callback/mastodon`; }),
    client_name: 'OpenFollow',
    lists_key: process.env.MASTODON_LISTS_SECRET || 'dummy_key',
    client_id: process.env.MASTODON_CLIENT_SECRET || 'dummy_secret',
  },
  storage: {
    url: 'local://credentials/storage?mode=700'
  },
  session: {
    secret: 'veedEX2zkPNyMs9YeBgO',
    store: {
      redis: {
        host: process.env.REDIS_IP || 'localhost'
      }
    }
  },
};
