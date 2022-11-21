module.exports = {
  backend_host: 'openfollow.me',
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