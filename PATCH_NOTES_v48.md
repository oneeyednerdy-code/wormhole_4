# Wormhole v48

## Deployment and cache repair

- Confirmed the reported generic profile error exists only in historical builds, not in the active v46/v47 application.
- Removed historical `release/` builds and nested deliverable archives from the deployment package so Netlify cannot accidentally publish an obsolete version.
- Renamed the active entry point to `js/wormhole-app-v48.js` and the Twitch configuration to `js/twitch-config-v48.js`, preventing browsers or CDNs from serving the old filenames.
- Added a visible **Build v48** marker on the login screen so the deployed version can be verified immediately.
- Disabled caching for HTML during development and requires revalidation for JavaScript and CSS on Netlify.
- Retains Twitch Client ID `wigwgqcieffev63tiiwq6j3dozv4o5` and the non-blocking post-login startup repair.
