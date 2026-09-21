# Architecture

## Technology Stack

- Vue 3
- TypeScript
- Three.js
- WebGL
- Vite
- Vitest
- ESLint
- Prettier

## Architectural Style

The mathematical domain follows Data-Oriented Design: explicit data, small focused functions,
explicit data flow, and no object-oriented hierarchies in domain code. Object-oriented APIs are
allowed at external boundaries when required, especially for Three.js integration.

## Layers

```text
domain
  ↑
 app
 ↑  ↑
ui  renderer
```

- **Domain:** mathematical data and operations. It knows neither Vue nor Three.js.
- **Application:** application state and interaction coordination. It may use the domain.
- **Renderer:** Three.js and WebGL integration. It receives application/domain data.
- **UI:** Vue presentation and user input. It may use the application and domain as needed.

## Source of Truth

> Three.js scene objects are not the source of truth. Haruka application/domain state is
> authoritative.
