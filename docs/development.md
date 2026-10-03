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
