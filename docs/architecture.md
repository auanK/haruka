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
- Haruka uses column vectors (`p' = M · p`). `TransformStackState.operations` is visual top → bottom,
  matching matrix factors left → right: stack `[T3, T2, T1]` represents `M = T3 · T2 · T1`,
  with application order `T1 → T2 → T3`.
- A newly added transformation is applied after the existing composition, so it left-multiplies
  the accumulated matrix (`Mnew = Tnew · Mold`) and is inserted at the top.
- Operations have stable application-level IDs supplied by the caller; mathematical `Transform`
  values remain ID-free and define their mathematical parameters.
- `getTransformSequence` derives application order bottom → top: `[T, R, S]`, so the point follows
  `p → T → R → S`. Domain stages stay `I → T → R·T → S·R·T`, with no second stored stack.
  Pure edits return a new state or an explicit failure; reorder uses final visual indices.
- Three.js scene state is derived from application/domain data, never authoritative.

## Didactic Cube

- The Haruka didactic object is a single unit cube (1 × 1 × 1) centered at the origin.
- Canonical vertices $V_1 \dots V_8$ have a stable, documented convention:
  - $z = -0.5$: $V_1(-0.5, -0.5, -0.5)$, $V_2(0.5, -0.5, -0.5)$, $V_3(0.5, 0.5, -0.5)$, $V_4(-0.5, 0.5, -0.5)$
  - $z = +0.5$: $V_5(-0.5, -0.5, 0.5)$, $V_6(0.5, -0.5, 0.5)$, $V_7(0.5, 0.5, 0.5)$, $V_8(-0.5, 0.5, 0.5)$
- The cube vertices are defined in `src/app/didactic-cube.ts` with no Three.js dependencies.
- Current vertex positions are purely derived via $V'_i = \text{transformPoint}(M_{\text{final}}, V_i)$.
- A single derivation pipeline feeds all consumers:
  `TransformStackState -> getTransformSequence -> composeTransforms -> finalMatrix -> cube renderer / vertex table / Final Matrix UI / viewport vertex labels`.

## UI Coordination

- UI edits describe semantic transforms; application state remains authoritative.
- Each successful edit replaces the application state and explicitly synchronizes the renderer.
- The viewport handle stays in a plain variable, outside Vue's deep reactivity.
- Degrees and formatted matrix values belong only to presentation; domain angles remain radians
  and matrices remain derived mathematical data.

## Matrix Editing Direction

- The read-only matrix component presents four addressable rows and columns in logical row-major
  order: `index = row * 4 + column`. Display formatting never changes the underlying matrix.
- Operation cells are derived by a pure presentation function from each semantic `Transform`.
  Only family-specific cells edit semantic parameters; reflection diagonals select the plane and
  rotation expressions share one angle editor (degrees in UI, radians in the domain).
- Temporary drafts belong to the editor. Valid edits replace the semantic transform through
  application state; invalid drafts preserve the last valid state. No authoritative matrix is stored
  alongside an operation, and no semantic parameters are inferred from a matrix.
- Operation rotation matrices are symbolic; Final Matrix remains numeric and read-only.

## Renderer Boundary

- Three.js appears only in the renderer layer, which may depend on the application and domain.
- Haruka `Matrix4` values are converted at this boundary using `Three.Matrix4.set`, whose arguments
  accept logical row-major order despite Three.js storing `.elements` in column-major order.
- Haruka-controlled objects reuse and overwrite their `Object3D.matrix` directly, without
  accumulation or decomposition, preserving shear and reflection.
- Explicit local matrix writes set `matrixAutoUpdate = false` and `matrixWorldNeedsUpdate = true`;
  Three.js retains its normal world matrix propagation.
- Composition remains in the domain. Renderer state is derived from application/domain state,
  with no reverse synchronization in this layer yet.

## Scene / Viewport

- The renderer layer owns the Three.js scene, canvas, and WebGL resources.
- Vue only mounts and disposes the viewport through the component lifecycle.
- Viewport rendering operates purely on-demand: frames are scheduled via a coalescing invalidation
  scheduler (`requestRender`) upon OrbitControls change, resize, state synchronization, or Locate Cube.
  In idle, no continuous rendering loop or `setAnimationLoop` runs (0 rendered frames).
- The didactic target consists of a single unit cube (1 × 1 × 1) centered at the origin, with
  its canonical vertices defined by the application layer (`didactic-cube.ts`), not by Three.js.
- One PerspectiveCamera and OrbitControls provide free orbit, pan, and zoom, with
  `minDistance = 0` and `maxDistance = Infinity` throughout their lifetime.
- **Locate Cube** is a one-time framing action derived from current vertices. Synchronization
  updates the target matrix and vertex labels without moving the camera or installing navigation bounds.
- Camera clipping is separate from navigation: `deriveCameraClipping` derives finite positive
  near/far planes from focus distance and scene extent. A comfortable band avoids projection churn.
  Invalid camera/target coordinates restore the last finite position, target, and orientation.
- World grid and axes are camera-adaptive:
  - The ground grid is procedural using a reused `PlaneGeometry` and `ShaderMaterial` anchored to
    world-space coordinates (no sliding).
  - Grid LOD density adjusts smoothly via pure function `chooseGridStep` ($1 / 2 / 5 \times 10^n$).
  - Grid projection uses the CPU-computed model/view matrix and small local coordinates;
    bounded periodic phases preserve world anchoring without large-coordinate shader artifacts.
  - No legacy fixed extent (such as $\pm 100$) or fixed `GridHelper` limits the visible world.
- Coordinate numbers are world-space, perspective-attenuated billboards with fixed axis offsets,
  depth testing/writes disabled, and one origin label. No full-screen 2D canvas or DOM labels exist.
- The pool owns 16 logical slots per axis plus one origin (49 total), preserving slots for surviving
  axis/value pairs. One 448 × 256 glyph atlas, material and instanced quad batch replace individual
  label canvases/sprites. Its four color rows preserve the original canvas font rasterization.
  Navigation never redraws or uploads the atlas; instance buffers change only with label content.
  The atlas backing store is about 0.44 MiB. Vertex labels and gizmo labels retain their own resources.
- Camera invalidation updates the grid, coordinate labels and gizmo; object synchronization renders
  without recalculating those annotations. Clipping still accounts for changed object bounds.
- Identical CSS dimensions/DPR skip resize entirely. Changed dimensions/DPR use one drawing-buffer
  update; unchanged aspect skips projection updates. Y-axis extent has 0.1% upload hysteresis.
- Label LOD uses mathematical $1 / 2 / 5 \times 10^n$ steps, with minimum stride 1 and hysteresis.
  Camera/focus distance and the camera basis determine density independently of world translation;
  focus-relative ranges intersect the frustum before generating at most 16 candidates per axis.
- Vertex labels ($V_1 \dots V_8$) remain 8 billboard sprites in global space at transformed positions.
- The orientation gizmo in the top-right corner runs in the same WebGLRenderer via scissor/viewport
  regions, deriving its orientation purely from the main camera while remaining non-interactive.
- WebGL DPR is capped at 1.5 and constrained by a 2048 × 2048 drawing-buffer pixel budget;
  antialiasing and stencil remain disabled.
- The viewport explicitly disposes its render scheduler, resize observer, controls, gizmo, coordinate
  label pool, renderer, geometries, materials, and textures, and removes its WebGL canvas on unmount.

## Mathematical Conventions

- **Matrix Representation:** 4×4 homogeneous matrices stored in row-major logical order (`readonly [number, ..., number]`).
- **Vector Convention:** Column vectors $[x, y, z, 1]^T$ transformed via $p' = M \cdot p$.
- **Multiplication Order:** `multiply(a, b)` strictly computes $a \cdot b$ via a direct allocating API.
- **Angular Unit:** Radians throughout the domain.
- **Hot-path Operations:** In-place operations (`multiplyInto`, `toMatrixInto`) accept caller-owned mutable buffers for allocation-free composition in hot paths.
