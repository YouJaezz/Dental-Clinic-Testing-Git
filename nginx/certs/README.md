# TLS certificates

Place your clinic TLS files here before starting compose:

- `fullchain.pem` — certificate (or chain)
- `privkey.pem` — private key

Nginx listens on **443** only. Staff must use `https://your-host/...` so session cookies (`Secure` in production) work.

Override the mount directory with `NGINX_CERT_DIR` in `.env` if needed.
