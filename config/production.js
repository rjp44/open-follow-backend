const defer = require('config/defer').deferConfig;

module.exports = {
  backend_host: 'api.openfollow.me',
  storage: {
    url: 'gcs://credentials/cloudCredentials:openfollow@persist-openfollow'
  },
  store: {
    redis: {
      host: process.env.REDIS_IP,
    }
  }
};