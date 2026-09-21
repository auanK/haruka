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

```bash
npm run dev
```

## Type checking

```bash
npm run type-check
```

## Tests

```bash
npm run test:unit
```

## Lint

```bash
npm run lint
```

## Format

```bash
npm run format
```

## Production build

```bash
npm run build
```
