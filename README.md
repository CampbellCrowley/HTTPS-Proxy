# HTTPS Proxy
This is a proxy for incoming HTTPS requests to handle updating TLS certificates
from Let's Encrypt. This proxies all HTTPS requests on port 443 to localhost
ports 80 as HTTP requests.

By default the requested domain will also be prepended to the requested path.

## Header Modifications
If `X-Forwarded-For` is set in the received request, the same value will be sent
with the proxied request. Otherwise, `request.connection.remoteAddress` or
`request.socket.remoteAddress` will be set.

`Queries` will be set to the entire string that follows the first `?` in the
URL. This is for compatibility with my other projects.

All other headers will be forwarded as-is with the proxied request.

## CLI Arguments
`--in=443` can be used to change the listening port.  
`--out=80` can be used to change the destination port.

`--disable-domain-prepend` will disable prepending the requested domain to the
requested URL path.

`--disable-header-queries` will disable setting the `Queries` header.
`--remove-queries` will remove everything from the URL following the first `?`.

`--dir=/etc/letsencrypt/live/kamino.spikeybot.com/` can be used to change the
default path to search for keys and certs.

If `--dir` is not specified, `--key=./server.key`, `--cert=./server.crt`, and
`--ca=./chain.pem` can be specified instead. They each may be specified multiple
times, once for each file if necessary.  
Each of these arguments correspond to the NodeJS
[https.createServer](https://nodejs.org/api/https.html#https_https_createserver_options_requestlistener)
options.

If `--dir` is used, the proxy will attempt to re-load the cert and key files
when they update. This will not happen with `--key`, `--cert`, or `--ca`.

This can attempt to also manage Let's Encrypt Certbot verification requests via
HTTP. This means we will attempt to bind to `--verification-port=##`, and serve
files from `./.well-known/` as they are requested. It is recommended to use
`--out=80` to change the output forwarding port in this case.

`--are-you-up=/areyouup` reply to all requests with where the url exactly
matches the given path, with "Yes".
