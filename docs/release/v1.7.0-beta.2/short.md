# Krust Studio 1.7.0-beta.2

Fixes for the 1.7.0 beta line. **Opt in via Settings → Updates.**

- **Fix:** packaged app crashed at startup with "Cannot find module
  'cluster-key-slot'" — node-redis's transitive dependency is now packed into the
  build.
- **Fix:** the Redis driver is loaded lazily (like MySQL/Postgres), so a driver
  dependency problem surfaces as a connect-time error instead of a fatal crash.
- **New:** startup crash guard — an unexpected main-process error shows a readable
  message and keeps the app running instead of Electron's raw fatal dialog.
- Redis verified working across versions (including v7 and sub-6 servers).
