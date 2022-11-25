
const config = require('config');
const express = require("express");
const session = require('express-session');
const cors = require("cors");
const morgan = require("morgan");
const handleErrors = require("./middleware/errors");
const twitter = require("./handlers/twitter");
const mastodon = require("./handlers/mastodon");
const PinoLogger = require('pino-http');

const { store, cache } = require('./middleware/datastore')(session);

const server = express();

server.set('trust proxy', 1);
server.use(session({
  store,
  secret: config.get('session.secret'),
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: config.get('session.cookie.secure'),
    sameSite: true,
    httpOnly: true,
  }
}));
console.log({ secure: config.get("session.cookie.secure") });


if (cache) {
  server.use((req, res, next) => {
    req.cache = cache;
    next();
  });
}

server.use(express.json());

server.use(cors({
  origin: ['http://localhost:3000', 'http://localhost:5001', 'https://openfollow.me', 'https://www.openfollow.me', 'https://simpler-oauth.open-follow.pages.dev'],
  allowedHeaders: ['Cookie', 'Link'],
  exposedHeaders: ['Link'],
  credentials: true,

}));

const pino = PinoLogger({
  serializers: {
    req: (req) => {
      let session = req.raw;
      //let session = res.status !== 200 && req.raw.session;
      return ({
        method: req.method,
        url: req.url,
        //session: req.raw.session,
      });
    },
  },
});

server.use(pino);




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
server.use("/mastodon/account/search", mastodon.accountSearch);
server.use("/admin/directory/load", mastodon.cacheDir);
server.use("/admin/directory/status", mastodon.cacheStatus);


server.get("/ping", (req, res) => {
  let { nonce } = req.query;
  nonce && (req.session.nonce = nonce);
  return res.json(req.session.nonce);
});

server.use((req, res, next) => {
  const error = new Error(`Path '${req.url}' does not exist`);
  error.status = 404;
  next(error);
});

server.use(handleErrors);

process.on("unhandledRejection", (error) => {
  console.error(error);
  cache && cache.doCleanup(error.toString()).then(() => {
    process.exit(1);
  });

});

let sigHandler = function (signal) {
  console.error('handling', { signal });
  cache && cache.doCleanup(signal).then(() => {
    process.exit(0);
  });
};

process.on('SIGTERM', sigHandler); 
process.on('SIGINT', sigHandler);


module.exports = server;
