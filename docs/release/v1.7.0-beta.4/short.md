# Krust Studio 1.7.0-beta.4

Packaging fix for the 1.7.0 beta line. **Opt in via Settings → Updates.**

- **Fix:** MySQL/MariaDB connections failed in the packaged app with "Cannot find
  module 'safer-buffer'" — mysql2's transitive dependency (via `iconv-lite`) was
  not packed into the build's asar. Pinned it as a direct dependency so
  electron-builder includes it, the same fix that shipped `cluster-key-slot` for
  Redis in beta.2. Verified present in the packaged asar this release.
