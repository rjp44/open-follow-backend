const defer = require('config/defer').deferConfig;

module.exports = {
  backend_host: 'api-test.openfollow.me',
  port: process.env.PORT || 8888,
  twitter: {
    callback_url: 'https://api-test.openfollow.me/twitter/callback',
    client_id: process.env.TWITTER_CLIENT_KEY || 'dummy_key',
    client_secret: process.env.TWITTER_CLIENT_SECRET || 'dummy_secret' ,
  },
  mastodon: {
    redirect_uri: `https://api-test.openfollow.me/mastodon/callback`,
    client_name: 'OpenFollow',
    lists_key: process.env.MASTODON_LISTS_SECRET || 'dummy_key',
    client_id: process.env.MASTODON_CLIENT_SECRET || 'dummy_secret',
  },
  storage: {
    url: 'local://credentials/storage?mode=700'
  },
};
