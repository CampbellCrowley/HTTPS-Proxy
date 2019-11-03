// Copyright 2019 Campbell Crowley. All rights reserved.
// Author: Campbell Crowley (web@campbellcrowley.com)

let common;
try {
  common = require('../../common.js');
  common.begin(
      process.argv.includes('--test'), !process.argv.includes('--dev'));
} catch (err) {
  common = {
    log: console.log,
    logDebug: console.log,
    logWarning: console.log,
    error: console.error,
  };
}
const fs = require('fs');
const path = require('path');
const httpProxy = require('http-proxy');
const https = require('https');
let server;
let watchFile = null;

const pathArg = process.argv.find((el) => el.startsWith('--dir='));
const keyPath = pathArg && pathArg.split('=').splice(1).join('=');
if (keyPath) {
  try {
    server = https.createServer({
      key: fs.readFileSync(`${keyPath}privkey.pem`),
      cert: fs.readFileSync(`${keyPath}cert.pem`),
      ca: [
        fs.readFileSync(`${keyPath}chain.pem`),
        fs.readFileSync(`${keyPath}fullchain.pem`),
      ],
    });
    watchFile = `${keyPath}privkey.pem`;
  } catch (err) {
    common.error('Failed to start HTTPS server.');
    console.error(err);
  }
} else {
  try {
    const opts = {};
    const keys = ['key', 'cert', 'ca'];
    for (const k of keys) {
      const tmp = process.argv.filter((el) => el.startsWith(`--${k}=`));
      if (tmp && tmp.length > 0) {
        opts[k] = [];
        tmp.forEach((el) => {
          const fn = el.split('=').slice(1).join('=');
          opts[k].push(fs.readFileSync(fn));
        });
      }
    }
    server = https.createServer(opts);
  } catch (err) {
    common.error('Failed to start HTTPS server.');
    console.error(err);
  }
}
let timeout = null;
if (watchFile) {
  // Watch the cert file, and update current certificates if they change. This
  // is kinda a hack and isn't rechnically supported.
  fs.watch(watchFile, () => {
    clearTimeout(timeout);
    timeout = setTimeout(() => {
      common.log('Swapping certs!!!!');
      server._sharedCreds.context.setCert(
          fs.readFileSync(`${keyPath}cert.pem`));
      server._sharedCreds.context.setKey(
          fs.readFileSync(`${keyPath}privkey.pem`));
    }, 1000);
  });
}
const inArg = process.argv.find((el) => el.startsWith('--in='));
const outArg = process.argv.find((el) => el.startsWith('--out='));
const listenPort = inArg ? inArg.split('=').slice(1).join('=') * 1 : 443;
const outputPort = outArg ? outArg.split('=').slice(1).join('=') * 1 : 80;

const noPrepend = process.argv.find((el) => el === '--disable-domain-prepend');
const noQueries = process.argv.find((el) => el === '--disable-header-queries');
const areYouUpArg = process.argv.find((el) => el.startsWith('--are-you-up='));
let areYouUp = '';
if (areYouUpArg) {
  areYouUp = areYouUpArg.split('=').slice(1).join('=');
}

if (server) {
  server.on('request', (req, res) => {
    const ip = req.headers['x-forwarded-for'] || req.connection.remoteAddress ||
        req.socket.remoteAddress || 'ERRR';

    if (areYouUpArg && req.url === areYouUp) {
      res.writeHead(200);
      res.end('Yes');
      return;
    }

    const headers = {'x-forwarded-for': ip};
    let queries = '';
    if (req.url.indexOf('?') >= 0) {
      const split = req.url.split('?');
      req.url = split[0];
      queries = split[1];
    }
    if (!noQueries) {
      headers.queries = queries;
    }
    if (!noPrepend) {
      let subDomain = 'kamino.spikeybot.com';
      if (req.headers.host) {
        subDomain = req.headers.host;
      }
      req.url = `/${subDomain}${req.url}`;
    }
    common.log(`  : ${req.headers.host}${req.url}`, ip);
    proxy.web(
        req, res, {
          target: {host: 'localhost', port: outputPort},
          headers: headers,
        },
        (e) => {
          if (e) {
            common.error('Error in proxying request: ' + req.url, ip);
            console.error(e);
            res.writeHead(400);
            res.end();
          }
        });
  });
  server.on('upgrade', (req, socket, head) => {
    const ip = req.headers['x-forwarded-for'] || req.connection.remoteAddress ||
        req.socket.remoteAddress || 'ERRR';

    const headers = {'x-forwarded-for': ip};
    let queries = '';
    if (req.url.indexOf('?') >= 0) {
      const split = req.url.split('?');
      req.url = split[0];
      queries = split[1];
    }
    if (!noQueries) {
      headers.queries = queries;
    }
    if (!noPrepend) {
      let subDomain = 'kamino.spikeybot.com';
      if (req.headers.host) {
        subDomain = req.headers.host;
      }
      req.url = `/${subDomain}${req.url}`;
    }
    common.log(`WS: ${req.headers.host}${req.url}`, ip);
    proxy.ws(req, socket, head, {
      target: {host: 'localhost', port: outputPort},
      headers: headers,
    });
  });
  server.on('error', (e) => common.error(e));
  common.logDebug(`HTTPS Listening on port ${listenPort}`);
  server.listen(listenPort, '::');
  common.logDebug(`Proxying to port ${outputPort}`);
  const proxy = httpProxy.createProxyServer({ws: true});
  proxy.on('error', (e) => {
    common.error(e.message);
    if (e.message.indexOf('ENOTFOUND') == -1) console.log(e);
  });
}

const portArg =
    process.argv.find((el) => el.startsWith('--verification-port='));
const verifListenPort = portArg && portArg.split('=').slice(1) * 1;
if (portArg) {
  common.logDebug(`Handling verification on port ${verifListenPort}`);
  const http = require('http');
  const verifServer = http.createServer();
  verifServer.on('request', (req, res) => {
    const ip = req.headers['x-forwarded-for'] || req.connection.remoteAddress ||
        req.socket.remoteAddress || 'ERRR';
    const filename = path.normalize(`.${req.url}`);
    if (filename.startsWith('.well-known/')) {
      fs.readFile(filename, (err, contents) => {
        if (!err) {
          common.log(`SSL Verification (HTTP) (${filename})`, ip);
          res.setHeader('Content-Length', contents.length);
          res.setHeader('Content-Type', 'text/html');
          res.writeHead(200);
          res.end(contents);
        } else if (err.code === 'ENOENT') {
          common.log(`SSL Verification 404 (HTTP) (${filename})`, ip);
          res.writeHead(404);
          res.end('404');
        } else {
          common.error(`Failed to read file (HTTP) (${filename})`, ip);
          console.error(err);
          res.writeHead(500);
          res.end(
              '500 Internal Server Error. Failed to read file that ' +
              'exists.');
        }
      });
    } else {
      res.writeHead(204);
      res.end();
    }
  });
  verifServer.listen(verifListenPort);
}
