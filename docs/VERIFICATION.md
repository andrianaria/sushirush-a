# Isolated desktop verification

The target environment is Linux with Node 22 and a browser. There is no internet, GPU, Docker, or sound. The project does not need any of those services to run.

## Verified base

On 24 November 2026, all 28 engine, storage, and HTTP tests passed on Node 22.22.2. The same tests, a static build, and a loopback HTTP smoke check passed on Linux with Node 22.23.3 and networking disabled. That test environment used a container on the preparation machine; running this project on the target desktop does not require a container.

Browser verification used Chrome with GPU and WebGL disabled and all non-local requests blocked. It covered cooking and delivering a complete dish, exact earnings, pause, reload/resume, order switching, the end of a 60-second shift, local personal best, a fresh shift, keyboard-accessible direction buttons, and a 390px viewport. A separate browser context with blocked local storage still started, moved the chef, and completed the shift. There were no external requests or application console errors. The actual hosted Alignerr desktop was not accessed.

## Automated checks

From the extracted repository:

```sh
node --version
npm test
npm run build
npm run preview
```

Use Node 22 or newer. Tests cover the deterministic game rules and local HTTP serving. The server tests exercise page/module/image MIME types, HEAD behavior, hidden-file protection, path traversal, symlinks, and unsupported HTTP methods.

## Browser checks

1. Open `http://127.0.0.1:3000` in the desktop browser. The page and menu images should load without a login or external connection.
2. Start a round. Choose the first order and use the arrow keys or WASD to enter the stations in recipe order. Verify that ingredient progress advances only at the expected station.
3. After the last ingredient, enter the serving bar. Verify that earnings and the completed-order count increase.
4. Pick a different order after collecting an ingredient. The new recipe should start at its first step, while the deadline continues.
5. Pause. Wait several seconds. The clock should remain unchanged. Resume and verify it continues from that time.
6. Pause an unfinished round and reload. Resume the saved round and check that its clock, selected order, position, and recipe progress are restored.
7. Let a round finish. Verify that results appear, local records update, and a new round starts at 60 seconds.
8. Check a narrow browser window. Order selection, the kitchen, recipe progress, and direction controls must remain usable without horizontal scrolling.
9. In developer tools, inspect Network and Console. Requests should use only the local origin, with no failed external requests or uncaught application errors.

The UI uses HTML and CSS, so disabling WebGL should not change whether the game is playable. Audio is not part of the game.

## Archive checks

After creating the upload archive, extract it into a fresh directory. Verify:

```sh
git status --short
git log -1 --oneline
git remote -v
npm test
npm start
```

The working tree should be clean, the Git origin should be a credential-free GitHub URL, and the page should run without installing packages. No `.env`, authentication token, database dump, or production configuration belongs in the upload.

Local testing cannot prove that a particular hosted workspace has no platform-specific restrictions. Repeat the browser checks after uploading the archive to that workspace.
