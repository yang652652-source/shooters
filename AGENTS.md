# Project Overview

This project is a browser-based 2D side-scrolling shooting game. It uses plain HTML, CSS, and JavaScript with a single `<canvas>` rendering loop. There is no build system, package manager, or external runtime dependency currently detected.

The game presents a pixel-style runner/gunner experience with keyboard controls, player movement, bullets, enemies, items, checkpoints, hazards, boss logic, HUD, overlay menus, and simple Web Audio sound effects.

# Important Files

- `index.html`: Main HTML entry point. Defines the canvas, HUD, overlay panel, and loads `style.css` and `game.js`.
- `style.css`: Page layout and visual styling for the canvas shell, HUD, boss health bar, and overlay menu.
- `game.js`: Main game implementation. Contains configuration, input handling, audio, level data, entity creation, update loop, collision logic, drawing code, and HUD updates.
- `cloudflare-worker.js`: Optional Cloudflare Worker backend for the online leaderboard. Requires a KV binding named `SCORES`.
- `.gitignore`: Git ignore rules for local/system/generated files.
- `AGENTS.md`: Project instructions for Codex and future engineering work.

# How to Run

Because this is a static HTML project, it can be run by opening `index.html` directly in a browser.

Recommended local server option from the project root:

```powershell
python -m http.server 8000
```

Then open:

```text
http://localhost:8000
```

Current controls shown by the game:

- `A` / `D`: move
- `W` or `Space`: jump
- `S`: crouch
- `J`: shoot
- `K`: dash
- `P`: pause
- `R`: restart after game over or victory
- `Enter`, `J`, or `Space`: start
- `F3` or backquote: debug toggle

# How to Test

Current project has no automatic test command and no package script.

Suggested manual checks after changes:

1. Open `index.html` in a browser, or serve with `python -m http.server 8000`.
2. Confirm the start overlay appears.
3. Press `Enter` or `J` to start.
4. Verify player movement, jumping, crouching, shooting, dash, pause, enemy interactions, item pickup, boss health UI, and restart flow.
5. Open the browser console and check for JavaScript errors.

For quick syntax validation of JavaScript when Node.js is available:

```powershell
node --check game.js
node --check cloudflare-worker.js
```

Online leaderboard deployment notes:

1. Deploy `cloudflare-worker.js` as a Cloudflare Worker.
2. Create a Cloudflare KV namespace and bind it to the Worker as `SCORES`.
3. Put the Worker URL into `CONFIG.leaderboard.apiUrl` in `game.js`.
4. If the Worker is not configured or is unavailable, the game falls back to the local browser leaderboard.

# Coding Rules

- Keep the project dependency-free unless the user explicitly confirms adding a dependency.
- Preserve the current simple static-file structure unless there is a clear reason to introduce folders.
- Prefer small, focused edits to `game.js`, `style.css`, or `index.html` instead of broad rewrites.
- Maintain canvas dimensions and responsive shell behavior unless the task is specifically about layout or resolution.
- Keep gameplay constants centralized in `CONFIG` when possible.
- Keep level geometry, hazards, enemies, and items in the `level` object unless a refactor is requested.
- Do not delete user files without explicit confirmation.
- Do not use recursive or bulk deletion commands.
- After meaningful changes, run any available checks and describe manual verification steps.

# Task Workflow

When handling future tasks in this project:

1. Read the current file structure and relevant code first.
2. Explain the planned changes before editing.
3. Name the files that will be changed.
4. Make focused code changes.
5. Run available checks, such as `node --check game.js` when applicable.
6. Summarize changed files, implemented behavior, how to run it, and any remaining limitations.

# Codex Auto Notes

- Project root was treated as the current working directory because no Git repository was present when this file was created.
- `codex_workspace_probe.txt` appears to be a local workspace probe file and should not be committed.
