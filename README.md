# Clerk Playwright invitation redirect reproduction

Requires Node.js, pnpm, OpenSSL and installed Google Chrome. From this directory:

```sh
pnpm install --frozen-lockfile
openssl req -x509 -newkey rsa:2048 -nodes -keyout key.pem -out cert.pem -days 1 -subj '/CN=localhost'
node reproduce.mjs
node reproduce.mjs --single-use
```

Run the last two commands independently. On 2.3.7 each command passes its control and exits 1 on the with-helper assertion. The first command expects one acceptance request but observes five. The second expects navigation to the app but receives 410 from the fixture ticket endpoint. The HTTPS fixture uses two ephemeral loopback ports, test-only TLS and a synthetic testing token. No Clerk account is needed.
