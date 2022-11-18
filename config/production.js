const defer = require('config/defer').deferConfig;

module.exports = {
  backend_host: 'api.openfollow.me',
  storage: {
    url: 'gcs://credentials/cloudCredentials:openfollow@persist-openfollow'
  },
};