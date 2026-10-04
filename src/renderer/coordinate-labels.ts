import {
  CanvasTexture,
  DynamicDrawUsage,
  Frustum,
  Group,
  InstancedBufferAttribute,
  InstancedMesh,
  LinearFilter,
  Matrix4,
  MeshBasicMaterial,
  OrthographicCamera,
  PerspectiveCamera,
  PlaneGeometry,
  Vector3,
  type Camera,
} from 'three'
import {
  chooseCoordinateLabelStride,
  computeWorldAnchoredCandidates,
  COORDINATE_LABEL_OFFSET,
  deriveVisibleAxisInterval,
  MAX_LABEL_CANDIDATES_PER_AXIS,
  type CoordinateAxis,
} from './coordinate-stride'

export const MAX_LABELS_PER_AXIS = MAX_LABEL_CANDIDATES_PER_AXIS
const GLYPHS = '0123456789-.+e'
// String(number) needs at most 24 characters, including sign and exponent.
const MAX_GLYPHS_PER_LABEL = 24

type CoordinateLabelSlot = {
  readonly position: Vector3
  readonly axis: CoordinateAxis | undefined
  readonly offsets: Float32Array
  value: number | undefined
  text: string
  squash: number
  visible: boolean
  used: boolean
}

export type CoordinateLabels = {
  readonly group: Group
  readonly slots: readonly CoordinateLabelSlot[]
  readonly mesh: InstancedMesh<PlaneGeometry, MeshBasicMaterial>
  readonly texture: CanvasTexture
  readonly update: (camera: Camera, focus: Vector3, width: number, height: number) => void
  readonly dispose: () => void
}

export const createCoordinateLabels = (): CoordinateLabels => {
  const group = new Group()
  group.name = 'coordinate-labels'
  const axes = ['x', 'y', 'z'] as const
  const colors = ['#dd6b70', '#80be89', '#6e9ddf', '#9baabc']
  const canvas = document.createElement('canvas')
  canvas.width = GLYPHS.length * 32
  canvas.height = colors.length * 64
  const context = canvas.getContext('2d')
  if (!context) throw new Error('Coordinate labels require a 2D canvas context')
  context.font = '500 28px system-ui, sans-serif'
  context.textAlign = 'center'
  context.textBaseline = 'middle'
  context.shadowColor = 'rgba(0, 0, 0, 0.9)'
  context.shadowBlur = 4
  context.shadowOffsetY = 1
  const advances: number[] = []
  for (let i = 0; i < GLYPHS.length; i++) {
    advances.push(context.measureText(GLYPHS[i]!).width)
    // Canvas font coverage depends on the paint color. Bake the approved colors.
    for (let c = 0; c < colors.length; c++) {
      context.fillStyle = colors[c]!
      context.fillText(GLYPHS[i]!, i * 32 + 16, c * 64 + 32)
    }
  }
  const texture = new CanvasTexture(canvas)
  texture.generateMipmaps = false
  texture.minFilter = LinearFilter
  const uniforms = {
    uViewScale: { value: 1.0 },
  }
  const material = new MeshBasicMaterial({
    map: texture,
    transparent: true,
    depthTest: false,
    depthWrite: false,
    opacity: 0.85,
  })
  material.userData = { uniforms, viewScale: 1.0 }
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uViewScale = uniforms.uViewScale
    shader.vertexShader =
      'attribute vec4 glyph;\n' +
      'uniform float uViewScale;\n' +
      shader.vertexShader
        .replace(
          '#include <uv_vertex>',
          `#include <uv_vertex>
        vMapUv = (vMapUv + vec2(glyph.x, glyph.w)) / vec2(${GLYPHS.length}.0, 4.0);`,
        )
        .replace(
          '#include <project_vertex>',
          `
        vec4 mvPosition = modelViewMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
        mvPosition.xy += (position.xy * vec2(0.1 * glyph.z, 0.2) + vec2(glyph.y, 0.0)) * uViewScale;
        gl_Position = projectionMatrix * mvPosition;`,
        )
  }
  const capacity = (3 * MAX_LABELS_PER_AXIS + 1) * MAX_GLYPHS_PER_LABEL
  const geometry = new PlaneGeometry(1, 1)
  const glyph = new InstancedBufferAttribute(new Float32Array(capacity * 4), 4)
  glyph.setUsage(DynamicDrawUsage)
  geometry.setAttribute('glyph', glyph)
  const mesh = new InstancedMesh(geometry, material, capacity)
  mesh.name = 'coordinate-glyphs'
  // A batch's distant bounds must not sort its annotations behind the transparent grid.
  mesh.renderOrder = 1
  mesh.frustumCulled = false
  mesh.instanceMatrix.setUsage(DynamicDrawUsage)
  mesh.count = 0
  group.add(mesh)

  const slots: CoordinateLabelSlot[] = []
  for (let i = 0; i < 3 * MAX_LABELS_PER_AXIS + 1; i++) {
    slots.push({
      position: new Vector3(),
      axis: axes[Math.floor(i / MAX_LABELS_PER_AXIS)],
      offsets: new Float32Array(MAX_GLYPHS_PER_LABEL),
      value: undefined,
      text: '',
      squash: 1,
      visible: false,
      used: false,
    })
  }
  const frustum = new Frustum()
  const projectionView = new Matrix4()
  const instance = new Matrix4()
  const candidates: number[] = []
  const strides = [1, 1, 1]
  const origin = new Vector3(-COORDINATE_LABEL_OFFSET, COORDINATE_LABEL_OFFSET, 0)
  let contentDirty = false

  const show = (index: number, value: number) => {
    const slot = slots[index]!
    slot.used = true
    if (slot.value === value) return
    contentDirty = true
    slot.value = value
    slot.text = String(value)
    const textWidth = context.measureText(slot.text).width
    slot.squash = Math.min(1, 120 / Math.max(textWidth, 1))
    for (let i = 0; i < slot.text.length; i++) {
      const advance = advances[GLYPHS.indexOf(slot.text[i]!)]!
      const end = context.measureText(slot.text.slice(0, i + 1)).width
      slot.offsets[i] = (end - advance / 2 - textWidth / 2) * slot.squash * (0.4 / 128)
    }
    if (slot.axis === 'x') slot.position.set(value, COORDINATE_LABEL_OFFSET, 0)
    else if (slot.axis === 'y') slot.position.set(COORDINATE_LABEL_OFFSET, value, 0)
    else if (slot.axis === 'z') slot.position.set(0, COORDINATE_LABEL_OFFSET, value)
    else slot.position.copy(origin)
  }

  const updateBatch = (focus: Vector3) => {
    for (const slot of slots) {
      if (slot.visible !== slot.used) contentDirty = true
      slot.visible = slot.used
    }
    if (!contentDirty) return
    contentDirty = false
    // Keep GPU translations near the focus; Three cancels the world translation on the CPU.
    mesh.position.copy(focus)
    let count = 0
    for (let s = 0; s < slots.length; s++) {
      const slot = slots[s]!
      if (!slot.visible) continue
      instance.makeTranslation(
        slot.position.x - focus.x,
        slot.position.y - focus.y,
        slot.position.z - focus.z,
      )
      for (let i = 0; i < slot.text.length; i++) {
        mesh.setMatrixAt(count, instance)
        glyph.setXYZW(
          count,
          GLYPHS.indexOf(slot.text[i]!),
          slot.offsets[i]!,
          slot.squash,
          colors.length - 1 - Math.floor(s / MAX_LABELS_PER_AXIS),
        )
        count++
      }
    }
    mesh.count = count
    mesh.instanceMatrix.needsUpdate = true
    glyph.needsUpdate = true
  }

  return {
    group,
    slots,
    mesh,
    texture,
    update: (camera, focus, width, height) => {
      if (slots.length === 0) return
      for (const slot of slots) slot.used = false
      if (width <= 0 || height <= 0) {
        updateBatch(focus)
        return
      }
      camera.updateMatrixWorld()
      frustum.setFromProjectionMatrix(
        projectionView.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse),
      )
      const distance = Math.max(
        Math.hypot(
          camera.position.x - focus.x,
          camera.position.y - focus.y,
          camera.position.z - focus.z,
        ),
        1e-6,
      )
      let halfHeight: number
      let aspect = 1
      if (
        'isOrthographicCamera' in camera &&
        (camera as { isOrthographicCamera?: boolean }).isOrthographicCamera
      ) {
        const ortho = camera as OrthographicCamera
        halfHeight = (ortho.top - ortho.bottom) / (2 * ortho.zoom)
        aspect = (ortho.right - ortho.left) / (ortho.top - ortho.bottom)
      } else {
        const persp = camera as PerspectiveCamera
        halfHeight = (distance * Math.tan((persp.fov * Math.PI) / 360)) / persp.zoom
        aspect = persp.aspect
      }
      const pixelsPerUnit = height / (2 * halfHeight)
      const viewScale = 48 / Math.max(pixelsPerUnit, 1e-4)
      uniforms.uViewScale.value = viewScale
      material.userData.viewScale = viewScale
      const span = Math.max(distance + 2 * halfHeight * Math.max(1, aspect), 1)
      for (let a = 0; a < axes.length; a++) {
        const axis = axes[a]!
        const interval = deriveVisibleAxisInterval(
          frustum,
          axis,
          focus[axis] - span,
          focus[axis] + span,
        )
        if (!interval) continue
        const forward = camera.matrixWorld.elements[8 + a]!
        const axisPPU = pixelsPerUnit * Math.sqrt(Math.max(0, 1 - forward * forward))
        strides[a] = chooseCoordinateLabelStride({
          pixelsPerUnit: axisPPU,
          currentStride: strides[a],
        })
        computeWorldAnchoredCandidates(interval.min, interval.max, strides[a]!, candidates)
        const start = a * MAX_LABELS_PER_AXIS
        const end = start + MAX_LABELS_PER_AXIS
        for (let i = start; i < end; i++) {
          const value = slots[i]!.value
          if (value !== undefined && value !== 0 && candidates.includes(value)) show(i, value)
        }
        let free = start
        for (const value of candidates) {
          if (value === 0) continue
          let retained = false
          for (let i = start; i < end; i++) {
            if (slots[i]!.used && slots[i]!.value === value) {
              retained = true
              break
            }
          }
          if (retained) continue
          while (slots[free]!.used) free++
          show(free, value)
        }
      }
      if (frustum.containsPoint(origin)) show(3 * MAX_LABELS_PER_AXIS, 0)
      updateBatch(focus)
    },
    dispose: () => {
      if (slots.length === 0) return
      mesh.dispose()
      texture.dispose()
      material.dispose()
      geometry.dispose()
      slots.length = 0
      group.clear()
    },
  }
}
