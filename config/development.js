const defer = require('config/defer').deferConfig;

module.exports = {

  session: {
    store: {
      redis: {
        host: process.env.REDIS_IP || 'localhost',
        ttl: 86400
      }
    }
  }


};
