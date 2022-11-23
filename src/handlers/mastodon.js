const config = require('config');
const axios = require('axios');
const uuid = require('uuid');
const linkParser = require('parse-link-header');
const BlobStorage = require('../lib/blobstorage');
const logger = require('pino-http');



const storage = new BlobStorage();

let waiting = {};

let serverList = [];

const rateLimit = axios.create();
rateLimit.interceptors.request.use(function (config) {
  config.env.X_START_TIME = (new Date()).valueOf();
  return config;
});
rateLimit.interceptors.response.use(async (res) => {
  let [remaining, resetTime] = [parseInt(res.headers['x-ratelimit-remaining']), res.headers['x-ratelimit-reset']];

  if (remaining && resetTime) {
    let startTime = res.config.env.X_START_TIME;
    let now = (new Date()).valueOf();
    let requestTime = now - startTime;
    let timeUntil = (new Date(resetTime)).valueOf() - now;
    let delay = (timeUntil / remaining) - requestTime;
    console.log('ratelimit', { remaining, timeUntil, delay, requestTime});
    delay > 0 && await new Promise(resolve => setTimeout(resolve, delay));
  }
  return res;
});


async function authUrl(req, res) {
  let { server } = req.query;
  let blobname = `${config.get('backend_host')}-${server}`;
  let blob = await storage.fetch(blobname);
  let credentials = undefined;
  const client_name = config.get("mastodon.client_name");
  const redirect_uri = encodeURIComponent(config.get("mastodon.redirect_uri"));
  const scopes = encodeURIComponent("read follow");
  let url;

  if (!server || !server.length) {
    res.status(400).send('No server');
    return;
  }
  if (req.session.mastodon && req.session.mastodon.url && req.session.mastodon?.host === server) {
    url = req.session.mastodon.url;
    res.json({ url });
    return;
  }

  if (blob) {
    try {
      credentials = JSON.parse(blob);
    }
    catch (err) {
      req.log.error(err, 'credentials');
      credentials = undefined;
    }
  }
  if (!credentials) {
    try {
      let request = `https://${server}/api/v1/apps?client_name=${client_name}&redirect_uris=${redirect_uri}&scopes=${scopes}`;
      let data = await axios.post(request);
      credentials = data.data;
      await storage.save(blobname, JSON.stringify(credentials));
    }
    catch (err) {
      req.log.error(err);
      res.status(400).send('Server doesnt support credentials');
      return;
    }
  }

  url = `https://${server}//oauth/authorize?response_type=code&scope=${scopes}&client_id=${encodeURIComponent(credentials.client_id)}&redirect_uri=${redirect_uri}`;


  req.session.mastodon = {
    uid: uuid.v4(),
    client_id: credentials.client_id,
    client_secret: credentials.client_secret,
    state: 'initial',
    url,
    host: server
  };
  res.json({ url });


}


async function servers(req, res) {

  const secret = config.get('mastodon.lists_key');

  if (!serverList.length) {
    let blob = await storage.fetch('serverList');
    blob && (serverList = JSON.parse(blob));
    setTimeout(() => (storage.remove('serverList')), 86400 * 1000);
  }
  if (!serverList.length) {
    try {
      let instances = await axios.get('https://instances.social/api/1.0/instances/list?count=0&sort_by=active_users&sort_order=desc',
        {
          headers: { "Authorization": `Bearer ${secret}` }
        }
      );

      serverList = instances.data.instances.map(instance => instance.name);
      await storage.save('serverList', JSON.stringify(serverList));
      setTimeout(() => (serverList = []), 86400 * 1000);
    }
    catch (err) {

      res.status(500).json(err);
      return;
    }
  }
  res.json(serverList);

}

async function cacheDir(req, res) {
  req.cache && doCache(req.cache);
  cacheStatus(req, res);
}

async function cacheStatus(req, res) {
  if (!req.cache) {
    res.status(400).json({ msg: 'No cache available' });
  }
  else {
    res.json({
      running: await req.cache.get('admin:directory:load'),
      status: await req.cache.get('admin:directory:status'),
      error: await req.cache.get('admin:directory:error'),
      count: await req.cache.get('admin:directory:error:count')
    });
  }
}



async function doCache(cache) {
  const directoryHost = config.get('directory_host');
  let code = false;
  if (await cache.set('admin:directory:load', cache.uniqueId, {NX: true})) {
    let count = 0;
    let lastError = await cache.get('admin:directory:error');
    if (lastError && lastError.length) {
      let errorCount = parseInt(await cache.get('admin:directory:error:count'));
      if (errorCount > 0) {
        count = errorCount;
      }
      cache.del('admin:directory:error');
    }
    let url = `https://${directoryHost}/api/v1/directory?limit=1000`;

    try {
      let dir;
      while ((dir = await rateLimit.get(`${url}&offset=${count}`)) && dir?.status === 200 && dir.data.length > 0) {
        for (account of dir.data) {
          if (!account.acct) {
            console.log({ url, account, data: dir.data, status: dir.status }, 'account error');
            continue;
          }
          if (!account.acct.includes("@")) {
            account.acct = `${account.username}@${directoryHost}`;
          }
          cache && await cache.saveServer(account.acct, account);
        }
        count += dir.data.length;
        let status = `Saved ${dir.data.length} records of ${count}`;
        console.log({ status });
        cache.set('admin:directory:error:count', count);
        cache.set('admin:directory:status', status);
      }
      code = true;
    }
    catch (err) {
      cache.set('admin:directory:error', `error at count ${count} ${err}`);
      cache.set('admin:directory:error:count', count);
      console.log({ err });
      if (err.code === 'ERR_BAD_RESPONSE') {
        const restartTime = config.get('mastodon.request.restart_time');
        restartTime && console.log(`got error ${err} will restart in ${restartTime/1000}s`);
        restartTime && setTimeout(() => doCache(cache), restartTime);
      }
    }
    finally {
      await cache.del('admin:directory:load');
      return code;
    }
  }
}


  async function callback(req, res) {

    const redirect_uri = config.get("mastodon.redirect_uri");
    const scopes = "read follow";

    const { state, url, host, client_id, client_secret, uid } = req.session.mastodon || {};

    const { code } = req.query;

    if (!code) {
      return res.status(400).send('You denied the app or your session expired!');
    }

    if (!state || !state === 'initial' || !host) {
      return res.status(400).send({ msg: 'Bad session cookie!', state, host, session: req.session.mastodon });
    }

    try {
      let { data: token } = await axios.post(`https://${host}/oauth/token`, {
        code, client_id, client_secret, redirect_uri, grant_type: 'authorization_code', scope: scopes
      });



      req.session.mastodon = {
        ...req.session.mastodon, token, state: 'showtime'
      };
      res.send('<script>window.close();</script>');
      //res.json(followers.data);
    }

    catch (error) {

      res.send(`Invalid verifier or access tokens!\n${error}\nclose this window and retry`);
    };
  }

  async function checkStatus(req, res) {
    let { state, token, host, uid } = req.session.mastodon || {};
    try {
      if (token && host) {
        let { data } = await axios.get(`https://${host}/api/v1/accounts/verify_credentials`, {
          headers: { "Authorization": `${token.token_type} ${token.access_token}` }
        });
        req.session.mastodon.state = state = 'showtime';
        this.host = host;
        res.json({ state, user: data, host });
      }
      else {
        req.log.info(err, 'no token');
        res.json(false);
      }

    }
    catch (err) {
      req.log.error({ err });
      req.log.error(err, 'check Status');
      res.json(false);
    }
  }

  async function apiGet(req, query) {
    let { state, token, host } = req.session.mastodon || {};

    if (token && host) {
      let { data } = await rateLimit.get(`https://${host}/${query}`, {
        headers: { "Authorization": `${token.token_type} ${token.access_token}` }
      });
      req.log.info({ data, query });
      return data;
    }
    else {
      req.log.info(err, 'no token');
      throw new Error('no credentials');
    }


  }

  async function checkLogin(req, res) {
    let { state, token, uid } = req.session.mastodon || {};
    try {
      if (uid && !token) {
        (req.session.mastodon = await new Promise((resolve, reject) => {
          waiting[uid] = [...(waiting[uid] || []), resolve];

          setTimeout(() => {
            reject();
          }, 60000);
        }));
      }
      ({ state, token } = req.session.mastodon || {});
      if (token)
        res.json({ state });
      else
        res.status(400).send('not authenticated');
    }
    catch (err) {

      res.status(500).send('request timeout');
    }
  }

  async function passthru(req, res) {
    let { state, token, uid, host } = req.session.mastodon || {};
    let { baseUrl, originalUrl, method, protocol, body } = req;
    let url = originalUrl.slice(baseUrl.length);

    try {
      if (!token || state != 'showtime')
        throw new Error(`bad auth ${state} ${token && token.length} ${uid}, ${host}`);


      let result = await rateLimit({
        method, url: `${protocol}://${host}${url}`, body,
        headers: { "Authorization": `${token.token_type} ${token.access_token}` }
      });
      result.headers.link && res.set('Link', result.headers.link);
      res.status(result.status).json(result.data);

    }
    catch (err) {
      req.log.error({ err }, 'passthru');
      res.status(403).send(err);
    }

  }

  async function accountSearch(req, res) {
    let { account } = req.query;
    let [, raw, host] = [...account.matchAll(/@?([a-zA-Z0-9_]+)@?([a-zA-Z0-9_\-.]+)?/g)][0];
    let term = `${account}`;
    const type = 'accounts';
    try {
      let matches = req.cache && await req.cache.findUser(term);

      let accounts = [];
      if (matches && matches.length) {
        accounts = matches;
      }
      else {
        ({ accounts } = await apiGet(req, `/api/v2/search?q=${encodeURIComponent(term)}${type && ('&type=' + type)}`));

        for (account of accounts) {
          if (!account.acct.includes("@")) {
            account.acct = `${account.username}@${req.session.mastodon.host}`;
          }
          req.cache && await req.cache.saveServer(account.acct, account);
        }
      }
      res.json({ accounts });

    }
    catch (err) {
      req.log.error({ err });
      process.exit(0);
      req.log.error(err);
      res.status(400).json(err);
    }


  }

  async function logout(req, res) {


    const { state, host, client_id, client_secret, uid, token } = req.session.mastodon || {};

    if (!state || !state === 'showtime' || !host || !client_id || !client_secret || !token) {

      return res.status(400).send('Bad session cookie!');
      return;
    }

    try {
      axios.post(`https://${host}/oauth/revoke`, {
        client_id, client_secret, token
      });

      req.session.mastodon = { state: 'initial' };
      res.json(true);
    }
    catch (error) {

    };

  }



  module.exports = {
    authUrl,
    servers,
    callback,
    checkLogin,
    checkStatus,
    logout,
    passthru,
    cacheDir,
    cacheStatus,
    accountSearch

  };
