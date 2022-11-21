const { Client, auth } = require('twitter-api-sdk');
const config = require('config');
const uuid = require('uuid');
const OAUTH_CONFIG = { client_id: config.get('twitter.client_id'), client_secret: config.get('twitter.client_secret'), callback: config.get('twitter.callback_url'), scopes: ['follows.read', 'block.read', 'mute.read', 'users.read', 'tweet.read'] };

now = () => (new Date().valueOf());
staleTime = 30 * 1000;

function authUrl(req, res, next) {

  let { state, url, codeVerifier, authTime } = req.session.twitter || {};
  try {
    if (url && url.includes(codeVerifier) && authTime && now() - authTime < staleTime) {
      res.json({ url, state });
      return;
    }


    let authClient = new auth.OAuth2User(OAUTH_CONFIG);
    let client = new Client(authClient);
    ([codeVerifier, state] = [codeVerifier || uuid.v4(), 'initial']);
    url = authClient.generateAuthURL({
      state,
      code_challenge_method: "plain",
      code_challenge: codeVerifier
    });

    req.session.twitter = { codeVerifier, state: 'initial', url, authTime: now() };
    res.json({ url });
  }
  catch (err) {
    res.status(500).json(err);
  };
}


waiting = {};

async function callback(req, res) {


  const authClient = new auth.OAuth2User(OAUTH_CONFIG);
  const client = new Client(authClient);

  const { state, code } = req.query;
  const { state: sessionState, codeVerifier } = req.session.twitter || {};

  if (!state || !sessionState || !code) {
    req.log.info(req.session.twitter, 'bad session');
    return res.status(400).send('You denied the app or your session expired!');
  }
  if (state !== sessionState || !codeVerifier) {
    req.log.info({ state, sessionState, codeVerifier, session: req.session.twitter }, 'stateMismatch');
    return res.status(400).send(`Stored tokens didnt match! ${codeVerifier && codeVerifier.length}`);
  }
  // This is crap, it turns out that the only method that can set the private code_challenge property
  // is generateAuthURL, so we call it here to make things work. 
  authClient.generateAuthURL({
    state,
    code_challenge_method: "plain",
    code_challenge: codeVerifier
  });
  try {
    let { token } = await authClient.requestAccessToken(code);

    req.session.twitter.token = token;
    req.session.twitter.state = 'showtime';


    const myUser = await client.users.findMyUser({
      'user.fields': [
        'id', 'name', 'description', 'profile_image_url', 'username', 'verified'
      ]
    });
    req.session.twitter = {
      ...req.session.twitter,
      token,
      state: 'showtime',
      id: myUser.data.id,
      myUser: myUser.data
    };
    req.log.info({ savedState: { session: req.session.twitter } }, 'savedState');
    res.send('<script>window.close();</script>');
  }
  catch (error) {
    req.log.error(error);
    res.status(403).send(`Invalid verifier or access tokens!\n${error}`);
  };
};


async function checkLogin(req, res) {
  let { state, codeVerifier, token, id, myUser } = req.session.twitter || {};
  req.log.info('checkLogin session', req.session.twitter);

  let items;
  try {


    if (state === 'initial')
      ({ state, codeVerifier, token, id, myUser } = req.session.twitter = await new Promise((resolve, reject) => {
        waiting[codeVerifier] = [...(waiting[codeVerifier] || []), resolve];

        setTimeout(() => {
          reject(new Error('timed out waiting for login'));
        }, 30000);
      }));

    if (!(state && codeVerifier && token && id))
      throw 'no state';


    if (state && codeVerifier && token && id && myUser) {
      req.session.save(() => res.json(myUser));
    }
    else {
      res.status(400).send('no user data');
    }
  }
  catch (err) {
    req.log.error(err);
    res.status(400).send('something went wrong');
  }

}

async function checkStatus(req, res) {
  let { state, token } = req.session.twitter || {};
  req.log.info({ checkStatus: { state, token } });
  try {
    if (token) {
      const authClient = new auth.OAuth2User({ ...OAUTH_CONFIG, token });
      const client = new Client(authClient);

      const myUser = await client.users.findMyUser({
        'user.fields': [
          'description', 'profile_image_url', 'username', 'verified'
        ]
      });
      req.log.info('twiiter, positive checkStatus', { state, user: myUser });
      res.json({ state, user: myUser });
    }
    else {

      throw new Error('no valid state');
    }

  }
  catch (err) {
    req.log.error({ checkStatus: { err } });
    state = 'initial';
    req.session.twitter.state = state;
    res.json(state);
  }



}

async function lists(req, res) {
  let items;

  try {

    let { state, codeVerifier, token, id } = req.session.twitter || {};
    const { list } = req.params;


    if (!(state === 'showtime' && codeVerifier && token && id))
      throw new Error('no/wrong state', { cause: 401 });

    const authClient = new auth.OAuth2User({ ...OAUTH_CONFIG, token });
    const client = new Client(authClient);
    const listMap = {
      followers: client.users.usersIdFollowers,
      following: client.users.usersIdFollowing,
      blocked: client.users.usersIdBlocking,
      muted: client.users.usersIdMuting,
    };
    let listOperation = listMap[list];

    if (!listOperation) {
      res.status(400).send(`no handler for ${list}`);
      return;
    }


    items = listOperation(id, {
      'user.fields': [
        'description', 'profile_image_url', 'username', 'verified'
      ],
      max_results: 1000
    }, { max_results: 1000 });
    res.type('txt');
    for await (const page of items) {

      page.data && page.data.forEach(data => res.write(JSON.stringify(data) + ','));
    }
    res.end();

  }
  catch (err) {
    req.log.error(err, 'reading list');
    if (err.status === 429) {
      res.end();
    }
    else {

      return res.status(err.cause && parseInt(err.cause) === err.cause ? err.cause : 400).json(err);
    }

  }

};


async function logout(req, res) {

  let { state, codeVerifier, token, id } = req.session.twitter || {};


  if (!state || !state === 'showtime' || !token || !id) {

    return res.status(400).send('Bad session cookie!');
  }

  try {
    const authClient = new auth.OAuth2User({ ...OAUTH_CONFIG, token });
    const client = new Client(authClient);

    const response = await authClient.revokeAccessToken();



    req.session.twitter = { state: 'initial' };

    res.json(true);

  }

  catch (error) {

    res.status(403).send(`Invalid verifier or access tokens!\n${error}`);
  };

}


module.exports = {
  authUrl,
  callback,
  lists,
  checkLogin,
  checkStatus,
  logout
};
