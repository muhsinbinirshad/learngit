# Commit Lab

**Learn Git the way teams use it, by doing real work in your browser.**

Commit Lab is an interactive Git and collaboration course. It runs a **real Git engine inside the browser**
(isomorphic-git on an IndexedDB filesystem), so every command you type creates real commits, branches and
history. Lessons explain the ideas in plain language; labs drop you into small, realistic situations and check
the **actual repository state**, never the commands you typed. Any correct approach passes.

- **Built for absolute beginners.** The course starts from "what is Git and why does it exist", explains the
  words everyone uses (repository, working tree, branch, merge, pull request), how software teams work, what a
  hosting site is, what CI/CD means, and how a terminal works, before the first command.
- **One ordered path.** Tracks unlock in order, and inside a track each lesson or lab unlocks when the previous
  one is complete, so nobody lands in the deep end.
- **Three-pane lab workspace.** Mission brief and auto-ticking objectives · code editor and terminal (or a
  button-based UI mode that shows the equivalent command) · live commit graph.
- **Debrief after every lab.** What you did, what Git did underneath (with a graph replay), commands worth
  remembering, common mistakes, how it shows up at work and in interviews.
- **Progressive hints, Undo, Reset.** Experiment freely; nothing in a lab is permanent.
- **Works offline, no account.** Progress stays in your browser.

---

## 1. Install and run

### Option A: Windows with Docker (recommended)

You need **Docker Desktop for Windows**. Nothing else is required.

1. Install Docker Desktop from <https://www.docker.com/products/docker-desktop/> and start it. Wait until the
   whale icon in the system tray shows "Docker Desktop is running". (On first start it may ask to enable WSL 2;
   accept and restart if prompted.)
2. Get the code. Either download the ZIP from the repository page on GitHub (green **Code** button → Download
   ZIP) and extract it, or, if you have Git for Windows installed, open **PowerShell** and run:

   ```powershell
   git clone https://github.com/muhsinbinirshad/learngit.git
   cd learngit
   ```

3. Build and start the app (the first run downloads images and builds; allow a few minutes):

   ```powershell
   docker compose up -d --build
   ```

4. Open **http://localhost:8080** in Chrome, Edge or Firefox.

Everyday commands (run from the `learngit` folder in PowerShell):

| Task | Command |
|------|---------|
| Stop the app | `docker compose down` |
| Start it again later | `docker compose up -d` |
| Update after pulling new code | `docker compose up -d --build` |
| See logs | `docker compose logs -f commit-lab` |
| Use another port, e.g. 3000 | edit `docker-compose.yml`, change `"8080:80"` to `"3000:80"`, then `docker compose up -d` |

Troubleshooting on Windows:

- **"docker: command not found" or "Cannot connect to the Docker daemon"**: Docker Desktop is not running. Start
  it from the Start menu and wait for the tray icon.
- **Port 8080 already in use**: change the port as shown above.
- **Blank page after an update**: hard-refresh the browser (Ctrl+F5).

Your progress is stored by the browser (localStorage and IndexedDB), not inside the container, so rebuilding or
updating the container never loses it. Clearing the browser's site data does.

### Option B: Linux or macOS with Docker

Docker Engine 24+ with the Compose plugin (or Docker Desktop).

```bash
git clone https://github.com/muhsinbinirshad/learngit.git
cd learngit
docker compose up -d --build
# open http://localhost:8080
```

Same everyday commands as above (`docker compose down`, `docker compose up -d --build`, `docker compose logs -f`).

Without Compose:

```bash
docker build -t commit-lab .
docker run -d --name commit-lab -p 8080:80 commit-lab
```

### Option C: Run from source (for developers)

Node.js 20+ and pnpm 9+ (`corepack enable` provides pnpm).

```bash
pnpm install
pnpm dev              # http://localhost:5173 with hot reload
pnpm build            # static site in dist/
pnpm preview          # serve dist/ at http://localhost:4173
```

A development container with hot reload is also available: `docker compose --profile dev up commit-lab-dev`
(serves http://localhost:5173 with the source mounted from your machine).

### What the Docker image contains

A two-stage build: Node 22 compiles the app, then nginx serves the static files with single-page routing, gzip and
long-lived caching for hashed assets. There is no backend and no database. At runtime the only outbound requests
are to Google Fonts for Inter, JetBrains Mono and Material Symbols; the app still works if those are blocked.

### Verify the install

1. Open the app. The home page shows "Welcome back" and the list of tracks.
2. Click **Start** on "Before you start". The first lesson, "What Git is, and why it exists", opens.
3. Answer its three questions. On success a short confetti burst plays and the next lesson opens by itself.

---

## 2. The course

Two kinds of step, in one ordered path:

- **Lessons**: short reads (4–8 minutes) with a three-question self-check. All answers right marks the lesson done.
- **Labs**: hands-on work in a real repository (6–15 minutes). Objectives are checked against repository state.

### Track 01: Before you start (6 lessons, no typing)

What Git is and why it exists · The words you will hear every day (repository, working tree, branch, merge,
pull request) · How software teams actually work · Git versus a hosting site (GitHub, and our Hub) · What CI/CD
is · The terminal, and how this platform works. Each lesson lists optional YouTube videos (plain links).

### Track 02: Foundations (3 lessons, 7 labs)

A small personal project (`my-notes`), one idea per step:

| # | Step | You practise |
|---|------|--------------|
| 01 | Lab: Your first repository | `git config`, `git init`, `git status` |
| 02 | Lesson: Git's three places | working tree, staging area, history |
| 03 | Lab: Your first commit | `git add`, `git commit -m`, `git log` |
| 04 | Lab: Change a file, save it again | the edit → diff → commit loop |
| 05 | Lab: Choose what goes into a commit | staging one file, leaving another |
| 06 | Lesson: What a commit message is for | headline, blank line, why |
| 07 | Lab: Write a commit message people can use | `--amend`, subject + body |
| 08 | Lab: Find out who changed what, and why | `git log`, `git blame`, `git show` |
| 09 | Lesson: What should never go into history | secrets, generated files, .gitignore |
| 10 | Lab: Keep secrets and junk out of history | `.gitignore`, `git rm --cached` |

### Track 03: Branching & Merging (2 lessons, 4 labs)

Branches explained · Build the CSV export in isolation · Merging, and what a conflict really is · Two merges,
two shapes · Two engineers edited the same function · Urgent bug in the middle of a feature.

### Tracks 04–08

Remotes & Collaboration (with the simulated hosting site, **Hub**), Rewriting History, Recovery & Incident
Response, Team Workflows at Scale, Capstones. Visible and locked; their steps arrive in later releases.

---

## 3. Using the lab workspace

| Area | What it does |
|------|--------------|
| **Mission** (left) | Brief, objectives that tick themselves, three levels of hints per objective, "Why this matters at work" |
| **Editor** (centre top) | File tree with change markers, tabs, Ctrl+S to save, conflict toolbar (Accept current / incoming / both). Also opens for commit messages and `git rebase -i` |
| **Terminal** (centre bottom) | Real shell: `ls cd cat echo touch mkdir rm mv cp tree grep head tail wc code <file> clear help`, redirects, `&&`, pipes, globs, Tab completion, history, interactive `git add -p` |
| **UI mode** (toolbar toggle) | Stage/unstage, commit, branches, merge, stash. Every button runs the real command and shows it |
| **Repository** (right) | Working tree → staging → HEAD strip, live commit graph, click a commit for its diff |
| Toolbar | Objective progress, mode switch, **Undo last step**, panel toggles, **Reset lab**, **Debrief** |

Supported Git commands: `init clone status add rm mv restore commit log show diff blame reflog bisect branch
switch checkout tag merge rebase (incl. -i) cherry-pick revert reset stash remote fetch pull push config`.
Anything unsupported is refused with a clear message. `git help <command>` prints a short reference.

### Pages

| Route | Purpose |
|-------|---------|
| `/` | Home: your tracks, progress at a glance |
| `/tracks/<id>` | Track overview with the step list and the learning sidebar |
| `/lessons/<id>` | A lesson with videos, takeaways and its self-check |
| `/labs/<id>` | The three-pane lab workspace |
| `/achievements` | Stats and skills computed from your real progress |
| `/hub` | What the simulated hosting site offers and what unlocks it |
| `/settings` | Reduce motion, terminal font size, export or delete local data |
| `/design` | Internal style guide: every component in every state |

---

## 4. For contributors

```bash
pnpm test             # Vitest: Git engine, shell, validator, every lab's completability, lessons, components
pnpm test:e2e         # Playwright, once: pnpm exec playwright install chromium
pnpm typecheck
pnpm lint
pnpm format
```

### Layout

```
src/design-system   tokens.css (Material-3-inspired tokens via Tailwind v4 @theme), components/
src/engine          fs/  git/ (merge, rebase, stash, reflog, bisect, remotes on isomorphic-git)
                    shell/ (tokenizer, commands, git subcommands)  validator/  scenario/
src/features        lab/  lessons/  tracks/  dashboard/  placeholders/ (achievements, hub, settings)  progress/
src/content         tracks.json (ordered items), lessons/*.json, labs/*.json, lab.schema.json
e2e                 Playwright specs        docker/   nginx config        scripts/   build and audit helpers
```

### Authoring content

- **Lesson**: add `src/content/lessons/<id>.json` with `sections`, `takeaways`, `quiz` and optional `videos`.
- **Lab**: add `src/content/labs/<id>.json` following `src/content/lab.schema.json`. Seed steps build the
  starting repository; objectives are declarative checks (38 types, combinable with `all` / `any` / `not`).
- Register the file in `src/content/index.ts` and place it in the track's ordered `items` list in
  `src/content/tracks.json`.

`pnpm test` seeds every lab, asserts no objective is met at the start, runs the reference `solution` through the
real shell, and asserts every objective is met. A lab that cannot be completed fails the build.

## 5. Data and privacy

Everything runs client-side. Repositories live in IndexedDB (one database per lab), progress in localStorage.
Settings has an export button and a delete-everything button. Nothing is sent anywhere.

## 6. Troubleshooting

| Symptom | Fix |
|---------|-----|
| "The lab could not be started" | Reload. If it persists, open Settings and delete local data, or reset that lab from its track page |
| Port 8080 already in use | Change the host port in `docker-compose.yml` |
| Blank page behind a reverse proxy | Unknown paths must fall back to `/index.html` (see `docker/nginx.conf`) |
| Fonts look different | Google Fonts is blocked; the UI falls back to system fonts and stays usable |

## License

MIT
