module.exports = {
  backend_method: 'https',
  backend_host: process.env.BACKEND_HOST || 'openfollow.me',
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