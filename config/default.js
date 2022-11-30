const defer = require("config/defer").deferConfig;

module.exports = {
  directory_host: "mastodon.social",
  port: process.env.PORT || 8888,
  twitter: {
    callback_path: 'callback/twitter',
    client_id: process.env.TWITTER_CLIENT_KEY || "dummy_key",
    client_secret: process.env.TWITTER_CLIENT_SECRET || "dummy_secret",
  },
  mastodon: {
    redirect_path: 'callback/mastodon',
    client_name: "OpenFollow",
    lists_key: process.env.MASTODON_LISTS_SECRET || "dummy_key",
    client_id: process.env.MASTODON_CLIENT_SECRET || "dummy_secret",
    request: {
      restart_time: 30000,
    },
    server_list: {
      additional: 'openshare.me'
    }
  },
  storage: {
    url: "local://credentials/storage?mode=700",
  },
  session: {
    cookie: {
      secure: true,
    },
    secret: "veedEX2zkPNyMs9YeBgO",
  },
};
