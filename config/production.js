const defer = require('config/defer').deferConfig;

module.exports = {
  backend_host: ' https://open-follow-backend-ygvsdxvwsq-ew.a.run.app',
  storage: {
    url: 'gcs://credentials/cloudCredentials:openfollow@persist-openfollow'
  },
  session: {
    store: {
      redis: {
        host: process.env.REDIS_IP
      }
    }
  }
};