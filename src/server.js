
const config = require('config');
const express = require("express");
const session = require('express-session');
const redis = require('redis');
const connectRedis = require('connect-redis');
const cors = require("cors");
const morgan = require("morgan");
const handleErrors = require("./middleware/errors");
const twitter = require("./handlers/twitter");
const mastodon = require("./handlers/mastodon");

const server = express();

let store = undefined;

if (config.has('session.store.redis')) {
  console.log('have redis config', config.get('session.store.redis.host'));

  const RedisStore = connectRedis(session);
  //Configure redis client
  const redisClient = redis.createClient({
    host: config.get('session.store.redis.host'),
    legacyMode: true
  });
  redisClient.on('error', function (err) {
    console.log('Could not establish a connection with redis. ' + err);
  });
  redisClient.on('connect', function (err) {
    console.log('Connected to redis successfully');
    redisClient.set("key", "value!", redis.print);
  });

  redisClient.connect();
  store = new RedisStore({ client: redisClient });

  }


server.set('trust proxy', 1);
server.use(session({
  store,
  secret: config.get('session.secret'),
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: true,
    sameSite: 'none',
    httpOnly: false,
  }
}));
server.use(express.json());
server.use(
  morgan(":method :url :status :res[content-length] - :response-time ms")
);
server.use(cors({
  origin: ['http://localhost:3000', 'http://localhost:5001', 'https://openfollow.me', 'https://www.openfollow.me'],
  allowedHeaders: ['Cookie', 'Link'],
  exposedHeaders: ['Link'],
  credentials: true,

}));
server.get("/", (req, res) => res.json({ message: "Hello world" }));
server.get("/twitter/authUrl", twitter.authUrl);
server.get("/twitter/callback", twitter.callback);
server.get("/twitter/:list(followers|following|blocked|muted|users)", twitter.lists);
server.get(["/twitter/checkLogin", "/twitter/userInfo"], twitter.checkLogin);
server.get("/twitter/checkStatus", twitter.checkStatus);
server.get("/twitter/logout", twitter.logout);

server.get("/mastodon/authUrl", mastodon.authUrl);
server.get("/mastodon/servers", mastodon.servers);
server.get("/mastodon/callback", mastodon.callback);
server.get("/mastodon/checkLogin", mastodon.checkLogin);
server.get("/mastodon/checkStatus", mastodon.checkStatus);
server.get("/mastodon/logout", mastodon.logout);
server.use("/mastodon/passthru", mastodon.passthru);

server.use((req, res, next) => {
  const error = new Error(`Path '${req.url}' does not exist`);
  error.status = 404;
  next(error);
});

server.use(handleErrors);

module.exports = server;
