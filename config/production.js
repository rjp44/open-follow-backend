module.exports = {
  backend_host: process.env.BACKEND_HOST || 'api.openfollow.me',
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