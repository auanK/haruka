import {
  BufferAttribute,
  BufferGeometry,
  Color,
  DoubleSide,
  Group,
  LineBasicMaterial,
  LineSegments,
  Mesh,
  PerspectiveCamera,
  PlaneGeometry,
  ShaderMaterial,
  Vector2,
  Vector3,
} from 'three'
import { chooseGridStep } from './grid-step'

export type AdaptiveGrid = {
  readonly group: Group
  readonly update: (
    camera: PerspectiveCamera,
    width: number,
    height: number,
    focusTarget?: Vector3,
  ) => void
  readonly dispose: () => void
  readonly planeGeometry: PlaneGeometry
  readonly shaderMaterial: ShaderMaterial
  readonly yAxisGeometry: BufferGeometry
  readonly yAxisMaterial: LineBasicMaterial
}

const vertexShader = /* glsl */ `
  varying vec2 vGridPosition;

  void main() {
    // Exclude translation from the varying; modelViewMatrix cancels it on the CPU.
    vGridPosition = (modelMatrix * vec4(position, 0.0)).xz;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`

const fragmentShader = /* glsl */ `
  varying vec2 vGridPosition;

  uniform float uGridStep;
  uniform vec3 uCenter;
  uniform vec2 uMinorPhase;
  uniform vec2 uMajorPhase;
  uniform float uFadeRadius;
  uniform vec3 uGroundColor;
  uniform vec3 uGridColor;
  uniform vec3 uMajorColor;
  uniform vec3 uXAxisColor;
  uniform vec3 uZAxisColor;

  void main() {
    vec2 pos = vGridPosition;
    vec2 dPos = fwidth(pos);

    if (dPos.x <= 0.0 || dPos.y <= 0.0) {
      discard;
    }

    float dist = length(pos);
    float alpha = 1.0 - smoothstep(uFadeRadius * 0.65, uFadeRadius, dist);
    if (alpha <= 0.0) {
      discard;
    }

    // Minor grid lines
    vec2 minorCoord = pos / uGridStep + uMinorPhase;
    vec2 minorGrid = abs(fract(minorCoord - 0.5) - 0.5) / (dPos / uGridStep);
    float minorLine = 1.0 - min(min(minorGrid.x, minorGrid.y), 1.0);

    // Major grid lines (every 5 steps)
    vec2 majorCoord = pos / (uGridStep * 5.0) + uMajorPhase;
    vec2 majorGrid = abs(fract(majorCoord - 0.5) - 0.5) / (dPos / (uGridStep * 5.0));
    float majorLine = 1.0 - min(min(majorGrid.x, majorGrid.y), 1.0);

    // X Axis line (z = 0)
    float xAxis = 1.0 - min(abs(pos.y + uCenter.z) / dPos.y, 1.0);

    // Z Axis line (x = 0)
    float zAxis = 1.0 - min(abs(pos.x + uCenter.x) / dPos.x, 1.0);

    // Base ground fill respecting circular fade radius
    vec4 color = vec4(uGroundColor, 0.5 * alpha);

    if (minorLine > 0.05) {
      vec4 minorCol = vec4(uGridColor, max(color.a, minorLine * 0.45 * alpha));
      color = mix(color, minorCol, minorLine);
    }
    if (majorLine > 0.05) {
      vec4 majorCol = vec4(uMajorColor, max(color.a, majorLine * 0.7 * alpha));
      color = mix(color, majorCol, majorLine);
    }
    if (xAxis > 0.05) {
      vec4 xCol = vec4(uXAxisColor, max(color.a, xAxis * 0.9 * alpha));
      color = mix(color, xCol, xAxis);
    }
    if (zAxis > 0.05) {
      vec4 zCol = vec4(uZAxisColor, max(color.a, zAxis * 0.9 * alpha));
      color = mix(color, zCol, zAxis);
    }

    if (color.a <= 0.01) {
      discard;
    }

    gl_FragColor = color;
  }
`

export const createAdaptiveGrid = (): AdaptiveGrid => {
  const group = new Group()
  group.name = 'adaptive-grid'

  const uniforms = {
    uGridStep: { value: 1.0 },
    uCenter: { value: new Vector3(0, 0, 0) },
    uMinorPhase: { value: new Vector2() },
    uMajorPhase: { value: new Vector2() },
    uFadeRadius: { value: 50.0 },
    uGroundColor: { value: new Color(0x181a1d) },
    uGridColor: { value: new Color(0x29323d) },
    uMajorColor: { value: new Color(0x435263) },
    uXAxisColor: { value: new Color(0xdd6b70) },
    uZAxisColor: { value: new Color(0x6e9ddf) },
  }

  const planeGeometry = new PlaneGeometry(1, 1)
  const shaderMaterial = new ShaderMaterial({
    vertexShader,
    fragmentShader,
    transparent: true,
    depthWrite: false,
    side: DoubleSide,
    uniforms,
  })

  const groundMesh = new Mesh(planeGeometry, shaderMaterial)
  groundMesh.rotation.x = -Math.PI / 2
  groundMesh.name = 'adaptive-ground-grid'
  group.add(groundMesh)

  // Vertical Y-axis line (0, -y, 0) to (0, +y, 0)
  const yPositions = new Float32Array([0, -50, 0, 0, 50, 0])
  const yAxisGeometry = new BufferGeometry()
  const yPositionAttr = new BufferAttribute(yPositions, 3)
  let lastYExtent = 50
  yAxisGeometry.setAttribute('position', yPositionAttr)
  const yAxisMaterial = new LineBasicMaterial({ color: 0x80be89, depthWrite: false })
  const yAxisLine = new LineSegments(yAxisGeometry, yAxisMaterial)
  yAxisLine.name = 'adaptive-axis-y'
  group.add(yAxisLine)

  const defaultTarget = new Vector3(0, 0, 0)

  const update = (
    camera: PerspectiveCamera,
    _width: number,
    height: number,
    focusTarget?: Vector3,
  ) => {
    const target = focusTarget ?? defaultTarget
    const distance = Math.max(camera.position.distanceTo(target), 1)

    // Calculate extent to conservatively cover visible ground frustum
    const extent = Math.max(distance * 6, 20)
    groundMesh.position.set(target.x, 0, target.z)
    groundMesh.scale.set(extent, extent, 1)

    // Grid step calculation derived from screen pixel density
    const effectiveHeight = Math.max(height, 1)
    const vFovRad = (camera.fov * Math.PI) / 360
    const worldUnitsPerPixel = (2 * distance * Math.tan(vFovRad)) / effectiveHeight
    const targetStep = worldUnitsPerPixel * 50
    const gridStep = chooseGridStep(targetStep)

    uniforms.uGridStep.value = gridStep
    uniforms.uCenter.value.set(target.x, 0, target.z)
    // World anchoring without sending huge periodic coordinates to fragment derivatives.
    uniforms.uMinorPhase.value.set(
      (target.x % gridStep) / gridStep,
      (target.z % gridStep) / gridStep,
    )
    const majorStep = gridStep * 5
    uniforms.uMajorPhase.value.set(
      (target.x % majorStep) / majorStep,
      (target.z % majorStep) / majorStep,
    )
    uniforms.uFadeRadius.value = extent * 0.48

    // Update Y axis vertical extent without reallocation
    const yExtent = Math.max(Math.abs(camera.position.y) + distance * 2, 20)
    if (Math.abs(yExtent - lastYExtent) > lastYExtent * 0.001) {
      yPositionAttr.setY(0, -yExtent)
      yPositionAttr.setY(1, yExtent)
      yPositionAttr.needsUpdate = true
      lastYExtent = yExtent
    }
  }

  const dispose = () => {
    planeGeometry.dispose()
    shaderMaterial.dispose()
    yAxisGeometry.dispose()
    yAxisMaterial.dispose()
    group.clear()
  }

  return {
    group,
    update,
    dispose,
    planeGeometry,
    shaderMaterial,
    yAxisGeometry,
    yAxisMaterial,
  }
}
