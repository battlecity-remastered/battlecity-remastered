# BattleCity Remastered
This is a port/remake based on the code here:

https://github.com/Deceth/Battle-City

Very much a work in progress / hobby project

<img width="3023" height="1724" alt="bc" src="https://github.com/user-attachments/assets/53771408-9e04-4538-8228-18f1295e2d82" />


## How to Play
https://playbattlecity.com

Arrow Keys move, Shift to shoot

Multiplayer will not run without a server running and js changed

## Development

### Client

- cd ./client
- npm install
- npm run dev  # starts Vite dev server on http://localhost:8020
- npm run build  # optional production build to ./client/dist

### Server

- cd ./server
- npm start  # Express + Socket.IO on http://localhost:8021
- npm run dev  # optional: auto-restart with nodemon

### Discord notifications

Player assignment events (e.g. "Alan joined Balkh as Mayor") can be relayed to a Discord channel when a bot is configured:

1. Create a Discord application and bot in the [Discord Developer Portal](https://discord.com/developers/applications), then copy the bot token.
2. Invite the bot to your server with permission to post in the target text channel (the **Send Messages** permission is sufficient).
3. Expose these variables when starting the server:
   - `DISCORD_BOT_TOKEN`: the bot token.
   - `DISCORD_CHANNEL_ID`: the numeric channel ID where notifications should appear.
   - Optional: `DISCORD_MIN_INTERVAL_MS` to rate-limit messages (defaults to 10000 ms) and `DISCORD_REQUEST_TIMEOUT_MS` to control the HTTP timeout (defaults to 5000 ms).
4. Start the server normally (e.g. `npm start --workspace server`). Join messages from real players will post to the configured channel; bots and fake/system players are ignored.

> `discord.js` ships with the server workspace and is used by default for these notifications. If the package is missing for any reason, the notifier will fall back to its HTTPS client so messages keep flowing.

### Google login / registration setup

1. Create a Google Cloud project (or reuse an existing one) and add an **OAuth 2.0 Client ID** for a web application via the [Google Identity Services](https://console.cloud.google.com/apis/credentials). Authorize the JavaScript origins you will use for the client (e.g. `http://localhost:8020`).
2. Copy the generated client ID and expose it to the server by setting `GOOGLE_CLIENT_ID` (or `GOOGLE_CLIENT_IDS` if you have multiple IDs, separated with commas or semicolons) before starting the server. The server reads those values to validate Google tokens and to advertise which IDs clients should use via `/api/identity/config`.
3. Expose the same client ID to the Vite client by adding `=<your-client-id>` (or `VITE_GOOGLE_CLIENT_IDS=...`) to a `.env.local` file inside `client/` or by exporting it in your shell before running `npm run dev`. The identity manager reads those build-time variables to decide whether to render the Google sign-in button.
4. Restart the dev server(s) after changing the environment variables. When both sides are configured, the lobby will show the “Register with Google” button and `/api/auth/google` will accept tokens issued for the configured client IDs.

### Bot Client

- cd ./bot
- npm install
- node index.js --server http://localhost:8021 --city 0  # joins the server as a roaming recruit bot
- The game server now auto-launches a bot process for each fake city (via the same script), so make sure `npm install` has been run in `bot/` before starting the server.
