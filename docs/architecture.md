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

## Application State

- Application state owns the editable operations and their authoritative identity and order.
- Operations have stable application-level IDs supplied by the caller; mathematical `Transform`
  values remain ID-free and define their mathematical parameters.
- The mathematical sequence is derived from the ordered operations, without merging or storing
  a second copy of the stack. Pure edits return a new state or an explicit failure.
- Three.js scene state is derived from application/domain data, never authoritative.

## Mathematical Conventions

- **Matrix Representation:** 4×4 homogeneous matrices stored in row-major logical order (`readonly [number, ..., number]`).
- **Vector Convention:** Column vectors $[x, y, z, 1]^T$ transformed via $p' = M \cdot p$.
- **Multiplication Order:** `multiply(a, b)` strictly computes $a \cdot b$ via a direct allocating API.
- **Angular Unit:** Radians throughout the domain.
- **Hot-path Operations:** In-place operations (`multiplyInto`, `toMatrixInto`) accept caller-owned mutable buffers for allocation-free composition in hot paths.
