# Development

## Requirements

- Git
- Node.js 24
- npm

## Clone

```bash
git clone https://github.com/auanK/haruka.git
cd haruka
```

## Node

With nvm:

```bash
nvm install
nvm use
```

Alternatively, install Node.js 24 using another version manager or the official installer. Verify
the active versions:

```bash
node --version
npm --version
```

## Install dependencies

```bash
npm ci
```

Use `npm ci` for normal installs from the lockfile. Use `npm install` only when adding or changing
dependencies.

## Development

Persistent development server (stop with `Ctrl+C`):

```bash
npm run dev
```

Optional Vue DevTools can be enabled with `HARUKA_DEVTOOLS=1 npm run dev`.
The plugin module is imported only when enabled.

## Type checking

```bash
npm run type-check
```

## Tests

One-shot test run:

```bash
npm run test:unit
```

Persistent watch mode (stop with `Ctrl+C`):

```bash
npm run test:watch
```

Tests use Node by default. Files requiring Vue mounting, canvas or browser APIs declare
`// @vitest-environment jsdom`. File parallelism remains disabled to limit memory pressure.

## Lint

```bash
npm run lint
```

## Format

```bash
npm run format
```

## Production build

Sequential memory-conscious build (`vue-tsc` followed by `vite build`):

```bash
npm run build
```

## GitHub Pages

The Pages workflow runs on pushes to `main` and can also be started manually with
`workflow_dispatch`. It runs `npm ci`, unit tests and the production build, then publishes only
`dist/` using the official GitHub Pages actions.

The build receives `HARUKA_BASE_PATH=/<repository-name>/` from the GitHub repository context.
Without this variable, development and production builds use `/`. Explicit values must be `/`
or an absolute path with a trailing slash, such as `/haruka/`; invalid values fail immediately.
Vue DevTools remains independently opt-in through `HARUKA_DEVTOOLS=1`.

To preview a Project Pages build locally:

```bash
HARUKA_BASE_PATH=/haruka/ npm run build
HARUKA_BASE_PATH=/haruka/ npm run preview
```

Open the preview URL at `/haruka/`. Run `npm run build` without the variable to restore a root build.

In the repository, select **Settings → Pages → Build and deployment → Source → GitHub Actions**.
This setting is manual; local checks do not publish or change remote configuration.
