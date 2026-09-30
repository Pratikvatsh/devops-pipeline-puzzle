# DevOps Pipeline Puzzle

Build it. Test it. Deploy it. Monitor it.

A small educational web game for college students. Players enter their name, arrange the six DevOps pipeline stages in the right order, then answer six DevOps questions. The Express server validates every move and calculates every score, and results are saved in Supabase PostgreSQL.

One URL, no installs for players, works on any phone.

## Features

- **Pipeline puzzle**: six shuffled stages (Code → Build → Test → Package → Deploy → Monitor). Tap two cards to swap them; mouse users can also drag and drop.
- **Server-side validation**: the pipeline order and every quiz answer are checked on the server. The browser never sends a score.
- **Quiz**: 6 questions picked at random from a bank of 16, with answer options shuffled per player. Instant feedback with a short explanation.
- **Scoring**: pipeline 20 / 15 / 10 points (1st / 2nd / 3rd+ attempt) plus 10 points per correct answer. Maximum 80.
- **Results screen** built for screenshots, plus a downloadable PNG result card generated in the browser.
- **Leaderboard** of completed games (can be switched off).
- **Refresh-safe**: a player who reloads the page mid-game carries on where they left off.
- **Fair play**: duplicate answers, double clicks, parallel requests and finishing twice never award extra points.
- Mobile-first, keyboard accessible, respects reduced-motion settings.
- No accounts, no emails, no location, no tracking.

## Tech stack

| Layer | Technology |
| --- | --- |
| Frontend | HTML5, CSS3, vanilla JavaScript (Fetch API) |
| Backend | Node.js 18+, Express 4 |
| Database | Supabase PostgreSQL via `@supabase/supabase-js` |
| Hosting | Render (one Web Service serves API and frontend) |

## Project structure

```
devops-pipeline-puzzle/
├── package.json
├── server.js                  # Express app: API routes + static frontend + error handler
├── .env.example               # Copy to .env and fill in
├── .gitignore
├── README.md
├── src/
│   ├── config.js              # Scoring rules and settings
│   ├── db/
│   │   ├── supabase.js        # Server-only Supabase client (service-role key)
│   │   └── gameStore.js       # Game persistence (Supabase, or in-memory for local tries)
│   ├── routes/
│   │   ├── gameRoutes.js      # start, get, pipeline, finish
│   │   ├── quizRoutes.js      # question, answer
│   │   └── leaderboardRoutes.js
│   ├── controllers/
│   │   └── gameController.js  # All game logic, validation and scoring
│   ├── data/
│   │   ├── pipelineStages.js  # The 6 stages + hints
│   │   └── quizQuestions.js   # 16-question bank (answers stay on the server)
│   └── utils/
│       ├── httpError.js
│       └── random.js          # Secure shuffle, game codes
├── public/
│   ├── index.html
│   ├── styles.css
│   ├── app.js
│   └── assets/icons/          # (icons are inline SVG inside app.js)
├── supabase/
│   └── schema.sql             # Run once in the Supabase SQL editor
└── tests/
    └── api.test.js            # End-to-end API tests (npm test)
```

## Local setup

You need [Node.js 18 or newer](https://nodejs.org) (check with `node -v`).

```bash
cd devops-pipeline-puzzle
npm install
cp .env.example .env        # Windows: copy .env.example .env
npm start
```

Open http://localhost:3000.

**Trying it before Supabase is set up?** If `.env` still has the placeholder values, the server falls back to a temporary in-memory store and prints a warning. Everything works, but data disappears when the server stops. This fallback never runs when `NODE_ENV=production`.

For auto-restart while editing code:

```bash
npm run dev
```

Run the automated tests (no Supabase needed):

```bash
npm test
```

## Supabase setup

1. Go to https://supabase.com and sign in (the free plan is enough).
2. Click **New project**. Pick a name (e.g. `devops-pipeline-puzzle`), set a database password, choose the region closest to your players, and create it. Wait a minute or two for it to finish.
3. In the left sidebar open **SQL Editor** → **New query**.
4. Open `supabase/schema.sql` from this project, copy everything, paste it into the editor and click **Run**. You should see "Success. No rows returned".
5. Check **Table Editor**: a `games` table now exists.
6. Copy two values (the **Connect** button at the top of the dashboard shows the URL too):
   - **Project URL** (Settings → Data API), like `https://abcdefgh.supabase.co` → this is `SUPABASE_URL`
   - A **secret key** (Settings → **API Keys** → Secret keys, starts with `sb_secret_`) → this is `SUPABASE_SERVICE_ROLE_KEY`

   Supabase is retiring the old JWT `service_role` key (found under the **Legacy API Keys** tab) by the end of 2026, so prefer the new `sb_secret_` key. Either works with this app today. Never use the publishable or anon key here: it can't write to the locked-down table.
7. Paste both into your `.env` file and restart `npm start`. The console should say `store: supabase`.

The schema turns on Row Level Security with no policies, so the public anon key cannot touch the table. Only the Express server, holding the service-role key, can.

## Environment variables

| Variable | Required | What it is |
| --- | --- | --- |
| `SUPABASE_URL` | Yes | Your project URL, like `https://abcdefgh.supabase.co` |
| `SUPABASE_SERVICE_ROLE_KEY` | Yes | Supabase secret key (`sb_secret_...`, or the legacy `service_role` key). Server only: **never** put it in frontend code or commit it. |
| `PORT` | No | Local port (default 3000). Render sets this automatically. |
| `NODE_ENV` | No | Set to `production` on Render. |
| `LEADERBOARD_ENABLED` | No | `false` hides the leaderboard. Default `true`. |
| `USE_MEMORY_STORE` | No | `true` forces the temporary in-memory store (local testing only). |

`.env` is in `.gitignore`, so it stays on your machine.

## GitHub setup

1. Create a new, empty repository on https://github.com/new (no README, no .gitignore; the project has them).
2. In the project folder:

```bash
git init
git add .
git commit -m "DevOps Pipeline Puzzle"
git branch -M main
git remote add origin https://github.com/<your-username>/devops-pipeline-puzzle.git
git push -u origin main
```

Double-check on GitHub that there is **no** `.env` file and **no** `node_modules` folder in the repository.

## Deploy on Render

1. Sign in at https://render.com (you can log in with GitHub).
2. Click **New +** → **Web Service**.
3. Connect your GitHub account and select the `devops-pipeline-puzzle` repository.
4. Fill in:
   - **Name**: `devops-pipeline-puzzle` (this becomes part of the URL)
   - **Region**: closest to your players
   - **Branch**: `main`
   - **Runtime**: Node
   - **Build Command**: `npm install`
   - **Start Command**: `npm start`
   - **Instance Type**: Free is fine for a class activity
5. Under **Environment Variables** add:
   - `SUPABASE_URL` = your project URL
   - `SUPABASE_SERVICE_ROLE_KEY` = your service-role key
   - `NODE_ENV` = `production`
6. Optional: under **Advanced**, set **Health Check Path** to `/api/health`.
7. Click **Create Web Service** and wait for the log to show `DevOps Pipeline Puzzle running ... (store: supabase)`.
8. Open the URL shown at the top of the page:

```
https://devops-pipeline-puzzle.onrender.com
```

(The exact subdomain depends on the name you chose; Render adds a suffix if the name is taken.)

Share that one link with students. Every later `git push` to `main` redeploys automatically.

**Free-plan tip:** Render's free instances sleep after about 15 minutes without traffic, and the first visit afterwards can take up to a minute. Open the link yourself a few minutes before the activity starts.

## Checking the deployment

Visit `https://<your-app>.onrender.com/api/health`. Expected response:

```json
{ "status": "ok", "service": "devops-pipeline-puzzle", "leaderboardEnabled": true }
```

Or from a terminal:

```bash
curl https://<your-app>.onrender.com/api/health
```

To see results as the organiser, open Supabase **Table Editor** → `games`, or run in the SQL editor:

```sql
select player_name, total_score, percentage, completed_at
from public.games
where completed
order by total_score desc, completed_at;
```

## API reference

All endpoints return JSON. Errors look like `{ "error": "message" }`.

| Method | Path | Body | Purpose |
| --- | --- | --- | --- |
| GET | `/api/health` | | Service status |
| POST | `/api/game/start` | `{ "playerName": "Aisha" }` | Creates a game, returns `gameId` + shuffled stages |
| GET | `/api/game/:gameId` | | Non-sensitive game snapshot (used after refresh) |
| POST | `/api/game/:gameId/pipeline` | `{ "order": ["CODE", ...] }` | Validates the pipeline |
| GET | `/api/game/:gameId/question` | | Current question (no answer included) |
| POST | `/api/game/:gameId/answer` | `{ "questionId": "q4", "answer": "B" }` | Checks the answer, returns explanation |
| POST | `/api/game/:gameId/finish` | | Final result (safe to call twice) |
| GET | `/api/leaderboard` | | Top completed scores |

## Testing checklist

Automated (`npm test`) covers the backend items marked ✓.

**Start**
- [ ] ✓ Empty or symbol-only name is rejected with a friendly message
- [ ] Valid name starts the game and shows the mission briefing

**Pipeline**
- [ ] ✓ Cards arrive shuffled (never already solved)
- [ ] Tapping one card highlights it; tapping a second swaps them
- [ ] Tapping the same card again clears the selection
- [ ] Reset order restores the starting shuffle
- [ ] ✓ Wrong order is rejected with a hint and "n of 6 in the right spot"
- [ ] ✓ Correct order is accepted; score is 20 / 15 / 10 by attempt

**Quiz**
- [ ] ✓ Six different questions, "Question n of 6" and progress bar update
- [ ] ✓ Correct answer gives +10, wrong gives 0, explanation appears
- [ ] ✓ Duplicate or parallel submissions never add points twice
- [ ] Last question shows "See my results"

**Results**
- [ ] ✓ Total and percentage are correct (e.g. 15 + 50 = 65 / 80 = 81.25%)
- [ ] Name, date/time and game code shown
- [ ] Refreshing the page keeps the result
- [ ] Download result card saves a PNG
- [ ] ✓ Finishing twice does not change the score

**Leaderboard**
- [ ] ✓ Completed game appears; unfinished games do not
- [ ] ✓ Sorted by score (ties: earliest finisher first)

**Backend**
- [ ] ✓ `/api/health` returns `status: ok`
- [ ] ✓ Unknown game ID, bad JSON and invalid payloads return clean errors
- [ ] Wrong Supabase URL returns "The game database is unavailable right now…" (no stack trace)
- [ ] New rows appear in the Supabase `games` table

**Responsive** (Chrome DevTools device toolbar)
- [ ] 360, 390, 412 px phones: no sideways scrolling, buttons easy to tap
- [ ] 768 px tablet, 1024 and 1440 px desktop
- [ ] Keyboard only: Tab / Enter / Space can play the whole game

## Assumptions

- The `gameId` UUID acts as the player's private session token. It is kept in the browser's `sessionStorage`, so a refresh resumes the game but a new tab starts fresh.
- Names are not unique; two students called "Rahul" appear as two leaderboard rows.
- The pipeline has no attempt limit (the score floor is 10), because the goal is learning.
- Answers must be submitted in order; skipping ahead is refused.
- No rate limiting is included. For a classroom this is fine; for a public event, put Render behind Cloudflare or add `express-rate-limit`.
- The instructions screen is a single tap, so there is no separate "skip" control.
- Fonts load from Google Fonts; if blocked, the game falls back to system fonts.
- Timestamps are stored in UTC (`timestamptz`) and shown in each player's local time.

## Customising

- **Questions**: edit `src/data/quizQuestions.js`. Keep four options with ids A–D and a `correctAnswer` matching one of them.
- **Scoring**: edit `src/config.js`. If you change the maximums, update the `check` constraints in `supabase/schema.sql` too.
- **Stage descriptions and hints**: edit `src/data/pipelineStages.js`.
