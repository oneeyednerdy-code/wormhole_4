# Wormhole v49

## Static hosting cleanup

- Removed all host-specific configuration, redirects, serverless functions, environment-variable instructions, and related tests.
- Removed the optional backend-action switch and proxy route from Twitch raid, cancel, and completion-message requests.
- Raid actions now use Twitch's authenticated API directly in every deployment.
- Replaced provider-specific login and deployment language with host-neutral instructions.
- Retains the clean single-build archive structure, Twitch Client ID `wigwgqcieffev63tiiwq6j3dozv4o5`, and the non-blocking post-login startup repair.
