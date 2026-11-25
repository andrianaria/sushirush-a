# Isolated desktop verification

This copy preserves the original 3D kitchen and interface. The isolated desktop needs Node 22 and a browser; running and rebuilding use only the files in the upload.

## Verified source

On 25 November 2026, all 52 tests passed locally and on Linux Node 22.23.3. The Linux run rebuilt the TypeScript/TSX frontend before testing, with networking disabled, a read-only system filesystem, and no package installation. Built pages, browser modules, local React vendors, font CSS, and the neutral logo returned HTTP 200 with correct content types. The container was a preparation-machine test tool; the target desktop does not need Docker.

Browser checks confirmed the original Three.js scene renders and the chef can move into the first recipe station, advancing ingredient progress. A separate temporary test server simulated WebGL initialization failure without modifying the production frontend. The secondary view completed all four ingredients and delivered one dish for exactly Rp33.000; pause then froze the clock at 57 seconds. The default remains the original 3D scene. The hosted Alignerr desktop itself was not accessed.

Strict TypeScript semantic validation reported zero diagnostics. Local vendor import tests cover React hooks, JSX Fragment, ReactDOM createRoot, Three WebGLRenderer, geometry helpers, and loading the compiled App and kitchen modules.

## Run and edit

```sh
npm start
```

Open `http://127.0.0.1:3000`. Keep the terminal running. Opening `index.html` directly as `file://` prevents browsers from loading its modules; the page then shows local launch instructions.

After editing TS/TSX source:

```sh
npm run build
npm test
```

Refresh the browser. CSS edits need only a refresh. Music is optional, and unsupported audio devices fail without stopping gameplay.

## Manual browser checks

1. Start practice and finish the tutorial dialog.
2. Move with arrows, WASD, or the original drag controller; enter ingredient stations in recipe order.
3. Walk to the serving bar after preparing a dish. Earnings increase on delivery.
4. Switch dishes during prep. Recipe progress resets while the order deadline continues.
5. Pause, wait, and resume. The clock must not advance during pause.
6. Reload an unfinished saved round and continue it.
7. Finish a 60-second round and start another.
8. Check the original responsive layout at a narrow width.
9. Verify all resources load from the local server.

## Upload archives

`npm run package` creates a ZIP and TAR with the same top-level `sushi-rush-alignerr` folder. Both include ready-to-run browser files, source, local vendors, the portable compiler, licenses, and a fresh `.git` directory.

The anonymous snapshot has an empty author/committer address and no previous history, reflogs, personal Git configuration, credentials, or production files. Its commit ID differs from the published source commit; the published repository is not rewritten. Packaging scans every raw file and every decoded Git object before saving either archive. Font name metadata was also inspected for addresses and removed branding.

After extracting an upload, verify:

```sh
git status --short
git fsck --strict
git log -1 --format=fuller
npm start
```

The tree must be clean and the game must run without installing packages. Upload this prepared archive through the workspace's Upload control, with Extract selected; the GitHub automatic source ZIP does not include `.git`.
