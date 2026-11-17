import {
  BoxGeometry,
  ConeGeometry,
  DoubleSide,
  BufferGeometry,
  Float32BufferAttribute,
  Group,
  Line,
  LineBasicMaterial,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  PlaneGeometry,
  Raycaster,
  Sprite,
  SphereGeometry,
  TorusGeometry,
  Vector2,
  Vector3,
  type Camera,
  type Material,
} from 'three'
import {
  getGestureBasis,
  type AxisConstraint,
  type ManipulationDraft,
} from '../app/direct-manipulation'
import { createTextSprite } from './text-sprite'
import { toNdc } from './translation-drag'
import { viewportTheme } from './viewport-theme'

export const createTransformGizmo = () => {
  const group = new Group()
  group.name = 'transform-gizmo'
  group.visible = false
  const objectFrame = new Group()
  objectFrame.name = 'transform-object-frame'
  group.add(objectFrame)
  objectFrame.matrixAutoUpdate = false
  const rotation = new Group(),
    move = new Group(),
    scale = new Group(),
    guides = new Group()
  rotation.name = 'rotation-gizmo'
  scale.name = 'scale-gizmo'
  guides.name = 'transform-axis-guides'
  move.name = 'move-gizmo'
  objectFrame.add(rotation, scale, move, guides)
  const rings: Mesh[] = [],
    handles: Mesh[] = [],
    lines: Line[] = []
  const moveTargets: Mesh[] = []
  const cones: Mesh[] = [],
    scaleDepth: Mesh[] = [],
    moveDepth: Mesh[] = [],
    depthScaleHits: Mesh[] = [],
    depthMoveHits: Mesh[] = []
  const labels: Sprite[] = []
  const axisLines: Line[] = []
  const normalRingGeometry = new TorusGeometry(1, 0.006, 6, 96)
  const highlightRingGeometry = new TorusGeometry(1, 0.014, 8, 96)
  let dragging = false
  let hovered: AxisConstraint | null = null
  let draft: ManipulationDraft | null = null
  const axes = ['x', 'y', 'z'] as const
  const colors = [viewportTheme.axisX, viewportTheme.axisY, viewportTheme.axisZ]
  for (let i = 0; i < 3; i++) {
    const axis = axes[i]!,
      color = colors[i]!
    const material = new MeshBasicMaterial({
      color,
      depthTest: false,
      depthWrite: false,
      transparent: true,
      opacity: 0.85,
    })
    const ring = new Mesh(normalRingGeometry, material)
    ring.name = `rotation-ring-${axis}`
    if (axis === 'x') ring.rotation.y = Math.PI / 2
    if (axis === 'y') ring.rotation.x = Math.PI / 2
    rotation.add(ring)
    rings.push(ring)
    const label = createTextSprite(axis.toUpperCase(), '#ffffff')
    label.material.color.setHex(color)
    label.name = `rotation-label-${axis}`
    labels.push(label)
    const labelPosition = [
      [0, 0.78, 0.78],
      [0.78, 0, 0.78],
      [0.78, 0.78, 0],
    ][i]!
    label.position.set(labelPosition[0]!, labelPosition[1]!, labelPosition[2]!)
    label.scale.set(0.5, 0.25, 1)
    label.renderOrder = 1001
    label.material.depthTest = false
    rotation.add(label)

    const end = new Vector3(i === 0 ? 1 : 0, i === 1 ? 1 : 0, i === 2 ? 1 : 0)
    const handle = new Mesh(new BoxGeometry(0.045, 0.045, 0.045), material.clone())
    handle.position.copy(end)
    handle.name = `scale-handle-${axis}`
    handle.userData.axis = axis
    handles.push(handle)
    const scaleLine = new Line(
      new BufferGeometry().setFromPoints([new Vector3(), end]),
      new LineBasicMaterial({ color, depthTest: false }),
    )
    axisLines.push(scaleLine)
    scale.add(scaleLine, handle)
    const cone = new Mesh(new ConeGeometry(0.025, 0.1, 10), material.clone())
    cone.position.copy(end).multiplyScalar(0.9)
    cone.quaternion.setFromUnitVectors(new Vector3(0, 1, 0), end)
    cone.name = `move-handle-${axis}`
    const moveHit = new Mesh(
      new SphereGeometry(0.07, 8, 8),
      new MeshBasicMaterial({ visible: false }),
    )
    moveHit.position.copy(end)
    moveHit.userData.axis = axis
    moveTargets.push(moveHit)
    cones.push(cone)
    move.add(cone, moveHit, scaleLine.clone())
    const depthRing = new Mesh(new TorusGeometry(0.11, 0.009, 6, 48), material.clone())
    depthRing.name = `scale-depth-${axis}`
    const depthHit = new Mesh(
      new TorusGeometry(0.11, 0.03, 4, 48),
      new MeshBasicMaterial({ visible: false }),
    )
    depthHit.userData.axis = axis
    const moveRing = depthRing.clone(),
      moveDepthHit = depthHit.clone()
    moveRing.name = `move-depth-${axis}`
    depthRing.visible = false
    moveRing.visible = false
    depthHit.visible = false
    moveDepthHit.visible = false
    scaleDepth.push(depthRing)
    moveDepth.push(moveRing)
    depthScaleHits.push(depthHit)
    depthMoveHits.push(moveDepthHit)
    group.add(depthRing, depthHit, moveRing, moveDepthHit)
    const geometry = new BufferGeometry()
    geometry.setAttribute(
      'position',
      new Float32BufferAttribute(
        [-end.x * 100, -end.y * 100, -end.z * 100, end.x * 100, end.y * 100, end.z * 100],
        3,
      ),
    )
    const line = new Line(
      geometry,
      new LineBasicMaterial({
        color,
        transparent: true,
        opacity: 0.65,
        depthTest: false,
        depthWrite: false,
      }),
    )
    line.name = `transform-guide-${axis}`
    lines.push(line)
    guides.add(line)
  }

  const freeMaterial = new MeshBasicMaterial({
    color: 0xd4d4d4,
    depthTest: false,
    depthWrite: false,
  })
  const scaleCenter = new Mesh(new BoxGeometry(0.06, 0.06, 0.06), freeMaterial.clone())
  scaleCenter.material.transparent = true
  scaleCenter.renderOrder = 1000
  scaleCenter.name = 'scale-handle-free'
  scaleCenter.userData.axis = 'free'
  group.add(scaleCenter)
  const moveCenter = new Mesh(
    new PlaneGeometry(0.07, 0.07),
    new MeshBasicMaterial({
      color: 0xd4d4d4,
      side: DoubleSide,
      depthTest: false,
      depthWrite: false,
    }),
  )
  moveCenter.name = 'move-handle-free'
  moveCenter.userData.axis = 'free'
  moveCenter.material.transparent = true
  moveCenter.renderOrder = 1000
  group.add(moveCenter)

  // Draw controls after the grid and its transparent annotations.
  group.traverse((object) => {
    if (object instanceof Mesh || object instanceof Line) object.renderOrder = 1000
  })

  const pickControl = (
    camera: Camera,
    rect: DOMRect,
    x: number,
    y: number,
  ): AxisConstraint | null => {
    if (!draft || !group.visible || rect.width <= 0 || rect.height <= 0) return null
    group.updateMatrixWorld(true)
    if (draft.phase === 'rotation-draft') {
      // Pick the closest drawn arc in pixels, rather than an overlapping invisible tube.
      let closest: AxisConstraint | null = null
      let bestDistance = 7
      const pointer = new Vector2(x - rect.left, y - rect.top)
      for (const [i, ring] of rings.entries()) {
        const axis = axes[i]!
        const radius = 1
        let previous: Vector2 | null = null
        for (let sample = 0; sample <= 96; sample++) {
          const angle = (sample * Math.PI) / 48
          const projected = ring
            .localToWorld(new Vector3(Math.cos(angle) * radius, Math.sin(angle) * radius, 0))
            .project(camera)
          const point = new Vector2(
            ((projected.x + 1) * rect.width) / 2,
            ((1 - projected.y) * rect.height) / 2,
          )
          if (previous) {
            const segment = point.clone().sub(previous)
            const t = Math.max(
              0,
              Math.min(1, pointer.clone().sub(previous).dot(segment) / (segment.lengthSq() || 1)),
            )
            const distance = pointer.distanceTo(previous.clone().addScaledVector(segment, t))
            if (distance < bestDistance) {
              bestDistance = distance
              closest = axis
            }
          }
          previous = point
        }
      }
      return closest
    }
    const ray = new Raycaster()
    const ndc = toNdc(rect, [x, y])
    ray.setFromCamera(new Vector2(...ndc), camera)
    group.updateMatrixWorld(true)
    const center = draft.phase === 'scale-draft' ? scaleCenter : moveCenter
    if (ray.intersectObject(center, false).length > 0) return 'free'
    // A small hit tolerance helps pick small objects without changing their world-space controls.
    let closest: AxisConstraint | null = null
    let bestDistance = 7
    for (const [i, handle] of (draft.phase === 'scale-draft' ? handles : cones).entries()) {
      if (!handle.visible) continue
      const p = handle.getWorldPosition(new Vector3()).project(camera)
      const distance = Math.hypot(
        rect.left + ((p.x + 1) * rect.width) / 2 - x,
        rect.top + ((1 - p.y) * rect.height) / 2 - y,
      )
      if (distance < bestDistance) {
        closest = axes[i]!
        bestDistance = distance
      }
    }
    if (closest) return closest
    const targets =
      draft.phase === 'scale-draft'
        ? [...handles, ...depthScaleHits, scaleCenter]
        : [...moveTargets, ...depthMoveHits, moveCenter]
    const hit = ray.intersectObjects(
      targets.filter((target) => target.visible),
      false,
    )[0]
    return hit ? (hit.object.userData.axis as AxisConstraint) : null
  }

  const updateAppearance = () => {
    if (!draft) return
    const focused = dragging ? draft.axis : hovered
    for (let i = 0; i < 3; i++) {
      const active =
        draft.gesture?.plane && focused !== null && focused !== 'free'
          ? focused !== axes[i]
          : focused === axes[i]
      const opacity = active || focused === null ? 1 : dragging ? 0.16 : 0.4
      const color = active ? viewportTheme.gizmoHighlight : colors[i]!
      for (const object of [rings[i]!, handles[i]!, cones[i]!, scaleDepth[i]!, moveDepth[i]!]) {
        const material = object.material as MeshBasicMaterial
        material.color.setHex(color)
        material.opacity = opacity
      }
      rings[i]!.geometry = active ? highlightRingGeometry : normalRingGeometry
      handles[i]!.scale.setScalar(active ? 1.3 : 1)
      cones[i]!.scale.setScalar(active ? 1.15 : 1)
      labels[i]!.material.color.setHex(color)
      labels[i]!.material.opacity = opacity
      const axisMaterial = axisLines[i]!.material as LineBasicMaterial
      axisMaterial.color.setHex(color)
      axisMaterial.transparent = true
      axisMaterial.opacity = opacity
      ;(lines[i]!.material as LineBasicMaterial).color.setHex(color)
      lines[i]!.visible = draft.gesture?.plane ? draft.axis !== axes[i] : draft.axis === axes[i]
    }
    const freeActive = focused === 'free'
    for (const object of [scaleCenter, moveCenter]) {
      object.material.color.setHex(freeActive ? viewportTheme.gizmoHighlight : 0xd4d4d4)
      object.material.transparent = true
      object.material.opacity = freeActive || focused === null ? 1 : dragging ? 0.16 : 0.4
    }
  }

  return {
    group,
    setDraft: (next: ManipulationDraft | null, active = false) => {
      dragging = active
      draft = next
      hovered = null
      group.visible = next !== null
      if (!next) return
      group.position.set(...next.pivot)
      if (next.phase === 'translation-draft') {
        group.position.add(new Vector3(next.translation.x, next.translation.y, next.translation.z))
      }
      rotation.visible = next.phase === 'rotation-draft'
      scale.visible = next.phase === 'scale-draft'
      move.visible = next.phase === 'translation-draft'
      guides.visible = active && next.axis !== 'free'
      updateAppearance()
    },
    update: (camera: Camera, width: number, height: number, objectMatrix?: Matrix4) => {
      if (!draft || height <= 0 || width <= 0) return
      const blockedMoveAxis = draft.phase === 'translation-draft' ? draft.lockedAxis : null
      const local = draft.gesture?.space === 'local'
      const basis = getGestureBasis(draft)
      const model =
        objectMatrix?.clone() ??
        new Matrix4().makeBasis(
          ...(basis.map((v) => new Vector3(...v)) as [Vector3, Vector3, Vector3]),
        )
      if (objectMatrix) group.position.setFromMatrixPosition(model)
      // All visible dimensions are world-space dimensions of the object, never pixels.
      const margin = 0.8
      const lengths = [0, 1, 2].map((i) => new Vector3().setFromMatrixColumn(model, i).length())
      const frame = local
        ? model.clone()
        : new Matrix4().makeScale(
            Math.abs(model.elements[0]!) +
              Math.abs(model.elements[4]!) +
              Math.abs(model.elements[8]!),
            Math.abs(model.elements[1]!) +
              Math.abs(model.elements[5]!) +
              Math.abs(model.elements[9]!),
            Math.abs(model.elements[2]!) +
              Math.abs(model.elements[6]!) +
              Math.abs(model.elements[10]!),
          )
      frame.setPosition(0, 0, 0)
      objectFrame.matrix.copy(frame).scale(new Vector3(margin, margin, margin))
      objectFrame.matrixWorldNeedsUpdate = true
      group.quaternion.identity()
      group.scale.setScalar(1)
      const depth = group.position
        .clone()
        .sub(camera.position)
        .dot(camera.getWorldDirection(new Vector3()))
      group.visible = depth > 0
      const positiveLengths = lengths.filter((length) => length > 1e-10)
      const controlSize =
        Math.max(1e-6, positiveLengths.length ? Math.min(...positiveLengths) : 0) * margin
      const glyphWidth = Math.max(
        1e-10,
        new Vector3().setFromMatrixColumn(objectFrame.matrix, 0).length(),
      )
      const glyphHeight = Math.max(
        1e-10,
        new Vector3().setFromMatrixColumn(objectFrame.matrix, 1).length(),
      )
      labels.forEach((label) =>
        label.scale.set((0.2 * controlSize) / glyphWidth, (0.1 * controlSize) / glyphHeight, 1),
      )
      const facing = camera.getWorldQuaternion(group.quaternion.clone())
      scaleCenter.scale.setScalar(controlSize)
      scaleCenter.visible = scale.visible
      moveCenter.quaternion.copy(facing)
      moveCenter.scale.setScalar(controlSize)
      moveCenter.visible = move.visible
      const facingDirection =
        'isOrthographicCamera' in camera
          ? camera.getWorldDirection(new Vector3()).negate()
          : camera.position.clone().sub(group.position).normalize()
      for (let i = 0; i < 3; i++) {
        const direction = new Vector3().setFromMatrixColumn(frame, i)
        const collapsed =
          direction.lengthSq() < 1e-20 ||
          Math.abs(direction.normalize().dot(facingDirection)) > 0.996
        handles[i]!.visible = !collapsed
        const moveAllowed = blockedMoveAxis !== axes[i]
        cones[i]!.visible = !collapsed && moveAllowed
        moveTargets[i]!.visible = !collapsed && moveAllowed
        for (const object of [
          scaleDepth[i]!,
          moveDepth[i]!,
          depthScaleHits[i]!,
          depthMoveHits[i]!,
        ]) {
          object.visible =
            collapsed &&
            (object === scaleDepth[i] || object === depthScaleHits[i]
              ? scale.visible
              : move.visible && moveAllowed)
          object.quaternion.copy(facing)
          object.scale.setScalar(controlSize)
        }
      }

      group.updateMatrixWorld(true)
    },
    setHovered: (control: AxisConstraint | null): boolean => {
      if (hovered === control) return false
      hovered = control
      updateAppearance()
      return true
    },
    pickControl,
    dispose: () => {
      const geometries = new Set<BufferGeometry>([normalRingGeometry, highlightRingGeometry]),
        materials = new Set<Material>()
      group.traverse((child) => {
        if (child instanceof Mesh || child instanceof Line) {
          geometries.add(child.geometry)
          for (const material of Array.isArray(child.material) ? child.material : [child.material])
            materials.add(material)
        }
        if (child instanceof Sprite) {
          child.material.map?.dispose()
          materials.add(child.material)
        }
      })
      geometries.forEach((geometry) => geometry.dispose())
      materials.forEach((material) => material.dispose())
      group.clear()
    },
  }
}
