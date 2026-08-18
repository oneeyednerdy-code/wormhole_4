# Wormhole v51

## Firefox Twitch fetch repair

- Fixed `Failed to execute 'fetch' on 'Window': Illegal invocation`.
- The centralized request manager now invokes browser `fetch` with the correct global receiver instead of calling a detached Window method.
- Added a receiver-sensitive regression test that reproduces the Firefox/WebView failure.
- Renamed the active application, configuration, and request-manager files so static hosts and browsers cannot reuse the broken cached JavaScript.
