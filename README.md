# Wait For It!

**Don’t Tap Yet.** A real-time reaction party game for 2–8 players, with server-authoritative rounds and scores.

## Run locally

Requires Node.js 20 or newer. The app has no runtime dependencies.

```sh
npm install
npm start
```

Open [http://localhost:3000](http://localhost:3000) in two browser windows. One player creates a room and shares the four-letter code; the other joins. The host starts once at least two players are present.

## Deploy to Railway

Create a Railway service from this repository. Railway detects the Node project and runs `npm start`; `railway.json` sets the health check and restart policy. The server listens on Railway’s `PORT` and binds to `0.0.0.0`. WebSocket upgrades use the same HTTP server, so the public HTTPS site uses secure WebSockets automatically.

The service keeps active rooms in memory. A restart clears current rooms; use a single Railway replica so all players in a room share one authoritative game process.

## Game rules

Ten rounds use randomized server-timed waits and fake-outs. Early taps lock that player out of the current round without losing points. Valid reactions earn 5, 3, 2, and 1 points for the first four places. A tie after round ten starts sudden death among the tied leaders; it awards no match points and repeats if nobody reacts. The first valid sudden-death reaction wins.
