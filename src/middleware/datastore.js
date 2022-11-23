const config = require('config');
const redis = require('redis');
const connectRedis = require('connect-redis');
const uuid = require('uuid');

let store, cache;



function attach(session) {

  if (config.has('session.store.redis')) {
    console.log('have redis config', config.get('session.store.redis.host'));

    const RedisStore = connectRedis(session);
    //Configure redis client
    const redisClient = redis.createClient({
      url: `redis://${config.get('session.store.redis.host')}`,
      database: 0,
      ttl: config.get('session.store.redis.ttl'),
      legacyMode: true
    });
    redisClient.on('error', function (err) {
      console.log('Could not establish a connection with redis. ' + err);
    });
    redisClient.on('connect', function (err) {
      console.log('Connected to redis successfully');
      redisClient.set("key", "value!");
    });

    redisClient.connect();
    store = new RedisStore({ client: redisClient });

    cache =
      redis.createClient({
        url: `redis://${config.get('session.store.redis.host')}`,
        database: 1,
        ttl: 86400 * 7
      });
    cache.on('error', function (err) {
      console.log('Could not establish a cache connection with redis. ' + err);
    });
    redisClient.on('connect', function (err) {
      console.log('Cache connected to redis successfully');
      redisClient.set("key", "value!");
    });

    cache.connect().then(() => {

      cache.uniqueId = uuid.v4();

      cache.saveServer = async function (accountName, account) {
        cache && await cache.hSet(`account:${accountName.toLowerCase()}`, Object.entries(account).filter(([k, e]) => (typeof e === 'string' || typeof e === 'number')).reduce((o, [k, v]) => [...o, k, v], []));
        cache && await cache.sAdd(`user:${account.username.toLowerCase()}:matches`, account.acct);
      };
      cache.saveNoMatch = async function (username) {
        cache && await cache.sAdd(`user:${username.replace(/^@/, '').toLowerCase()}:nomatch`, "0");
      };

      cache.findUser = async function (username) {
        const script = `
          local accounts = redis.call('SMEMBERS', KEYS[1]);
          local data = {}
          for i, element in pairs(accounts)
          do 
            table.insert(data, redis.call('HGETALL', 'account:'..element:lower()))
          end;
          return data;
        `;
        let matches;
        let mUser = username.replace(/^@/, '').toLowerCase();
        if (mUser.includes('@')) {
          matches = [await cache.hGetAll(`account:${mUser}`)];
        }
        else {
          matches = await cache.eval(script, { keys: [`user:${mUser}:matches`] });
          matches = matches.map(match => match.reduce((o, m, index) => ((index % 2 === 0) ? { ...o, [m]: match[index + 1] } : o), {}));
        }
        return matches.filter(m => m.id);
      };

      cache.doCleanup = async function (reason) {
        console.log('shutdown cache', { uniqueId: cache.uniqueId, reason });
        if (await cache.get('admin:directory:load') === cache.uniqueId) {
          console.log('shutdown clearing lock', { uniqueId: cache.uniqueId, reason });
          await cache.set('admin:directory:error', `interrupted by ${reason}`);
          await cache.del('admin:directory:load');
        }
      };


    });

  };

  return { store, cache };
}

module.exports = attach;