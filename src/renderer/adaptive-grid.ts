import {
  BufferAttribute,
  BufferGeometry,
  Color,
  DoubleSide,
  Group,
  LineBasicMaterial,
  LineSegments,
  Mesh,
  OrthographicCamera,
  PerspectiveCamera,
  PlaneGeometry,
  ShaderMaterial,
  Vector2,
  Vector3,
  type Camera,
} from 'three'
import { chooseGridStep } from './grid-step'
import { viewportTheme } from './viewport-theme'

export type ActiveGridPlane = 'xz' | 'yz' | 'xy'

export type AdaptiveGrid = {
  readonly group: Group
  readonly update: (
    camera: Camera,
    width: number,
    height: number,
    focusTarget?: Vector3,
    activePlane?: ActiveGridPlane,
  ) => void
  readonly dispose: () => void
  readonly planeGeometry: PlaneGeometry
  readonly shaderMaterial: ShaderMaterial
  readonly yAxisGeometry: BufferGeometry
  readonly yAxisMaterial: LineBasicMaterial
}

const vertexShader = /* glsl */ `
  varying vec2 vGridPosition;
  uniform vec2 uPlaneScale;

  void main() {
    vGridPosition = position.xy * uPlaneScale;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`

const fragmentShader = /* glsl */ `
  varying vec2 vGridPosition;

  uniform float uGridStep;
  uniform vec2 uCenter;
  uniform vec2 uMinorPhase;
  uniform vec2 uMajorPhase;
  uniform vec2 uPlaidPhase;
  uniform float uFadeRadius;
  uniform vec3 uGroundColor;
  uniform vec3 uGridColor;
  uniform vec3 uMajorColor;
  uniform vec3 uPlaidColor;
  uniform vec3 uAxis1Color;
  uniform vec3 uAxis2Color;

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

    // Plaid accent grid lines (every 10 steps)
    vec2 plaidCoord = pos / (uGridStep * 10.0) + uPlaidPhase;
    vec2 plaidGrid = abs(fract(plaidCoord - 0.5) - 0.5) / (dPos / (uGridStep * 10.0));
    float plaidLine = 1.0 - min(min(plaidGrid.x, plaidGrid.y), 1.0);

    // In-plane Axis 1 line (pos.y + uCenter.y == 0)
    float axis1 = 1.0 - min(abs(pos.y + uCenter.y) / dPos.y, 1.0);

    // In-plane Axis 2 line (pos.x + uCenter.x == 0)
    float axis2 = 1.0 - min(abs(pos.x + uCenter.x) / dPos.x, 1.0);

    // Balanced plaid checkerboard cells for didactic spatial depth
    float check = mod(floor(plaidCoord.x) + floor(plaidCoord.y), 2.0);
    vec3 baseFill = mix(uGroundColor, uGroundColor * 1.25 + vec3(0.015), check * 0.35);
    vec4 color = vec4(baseFill, 0.55 * alpha);

    if (minorLine > 0.05) {
      vec4 minorCol = vec4(uGridColor, max(color.a, minorLine * 0.5 * alpha));
      color = mix(color, minorCol, minorLine);
    }
    if (majorLine > 0.05) {
      vec4 majorCol = vec4(uMajorColor, max(color.a, majorLine * 0.75 * alpha));
      color = mix(color, majorCol, majorLine);
    }
    if (plaidLine > 0.05) {
      vec4 plaidCol = vec4(uPlaidColor, max(color.a, plaidLine * 0.9 * alpha));
      color = mix(color, plaidCol, plaidLine);
    }
    if (axis1 > 0.05) {
      vec4 a1Col = vec4(uAxis1Color, max(color.a, axis1 * 0.95 * alpha));
      color = mix(color, a1Col, axis1);
    }
    if (axis2 > 0.05) {
      vec4 a2Col = vec4(uAxis2Color, max(color.a, axis2 * 0.95 * alpha));
      color = mix(color, a2Col, axis2);
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
    uPlaneScale: { value: new Vector2(1, 1) },
    uGridStep: { value: 1.0 },
    uCenter: { value: new Vector2(0, 0) },
    uMinorPhase: { value: new Vector2() },
    uMajorPhase: { value: new Vector2() },
    uPlaidPhase: { value: new Vector2() },
    uFadeRadius: { value: 50.0 },
    uGroundColor: { value: new Color(viewportTheme.ground) },
    uGridColor: { value: new Color(viewportTheme.gridMinor) },
    uMajorColor: { value: new Color(viewportTheme.gridMajor) },
    uPlaidColor: { value: new Color(viewportTheme.gridPlaid) },
    uAxis1Color: { value: new Color(viewportTheme.axisX) },
    uAxis2Color: { value: new Color(viewportTheme.axisZ) },
    uXAxisColor: { value: new Color(viewportTheme.axisX) },
    uZAxisColor: { value: new Color(viewportTheme.axisZ) },
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
  const yAxisMaterial = new LineBasicMaterial({ color: viewportTheme.axisY, depthWrite: false })
  const yAxisLine = new LineSegments(yAxisGeometry, yAxisMaterial)
  yAxisLine.name = 'adaptive-axis-y'
  group.add(yAxisLine)

  const defaultTarget = new Vector3(0, 0, 0)

  const update = (
    camera: Camera,
    _width: number,
    height: number,
    focusTarget?: Vector3,
    activePlane: ActiveGridPlane = 'xz',
  ) => {
    const target = focusTarget ?? defaultTarget
    const distance = Math.max(camera.position.distanceTo(target), 1)

    // Calculate extent to conservatively cover visible ground frustum
    const extent = Math.max(distance * 6, 20)
    groundMesh.scale.set(extent, extent, 1)

    let centerU: number
    let centerV: number

    if (activePlane === 'yz') {
      groundMesh.position.set(0, target.y, target.z)
      groundMesh.rotation.set(0, Math.PI / 2, 0)
      uniforms.uPlaneScale.value.set(-extent, extent)
      centerU = target.z
      centerV = target.y
      uniforms.uAxis1Color.value.set(viewportTheme.axisZ)
      uniforms.uAxis2Color.value.set(viewportTheme.axisY)
      yAxisLine.visible = false
    } else if (activePlane === 'xy') {
      groundMesh.position.set(target.x, target.y, 0)
      groundMesh.rotation.set(0, 0, 0)
      uniforms.uPlaneScale.value.set(extent, extent)
      centerU = target.x
      centerV = target.y
      uniforms.uAxis1Color.value.set(viewportTheme.axisX)
      uniforms.uAxis2Color.value.set(viewportTheme.axisY)
      yAxisLine.visible = false
    } else {
      groundMesh.position.set(target.x, 0, target.z)
      groundMesh.rotation.set(-Math.PI / 2, 0, 0)
      uniforms.uPlaneScale.value.set(extent, -extent)
      centerU = target.x
      centerV = target.z
      uniforms.uAxis1Color.value.set(viewportTheme.axisX)
      uniforms.uAxis2Color.value.set(viewportTheme.axisZ)
      yAxisLine.visible = true
    }

    // Grid step calculation derived from screen pixel density
    const effectiveHeight = Math.max(height, 1)
    let worldUnitsPerPixel: number
    if (
      'isOrthographicCamera' in camera &&
      (camera as { isOrthographicCamera?: boolean }).isOrthographicCamera
    ) {
      const ortho = camera as unknown as OrthographicCamera
      worldUnitsPerPixel = (ortho.top - ortho.bottom) / (ortho.zoom * effectiveHeight)
    } else {
      const persp = camera as PerspectiveCamera
      const vFovRad = (persp.fov * Math.PI) / 360
      worldUnitsPerPixel = (2 * distance * Math.tan(vFovRad)) / effectiveHeight
    }
    const targetStep = worldUnitsPerPixel * 50
    const gridStep = chooseGridStep(targetStep)

    uniforms.uGridStep.value = gridStep
    uniforms.uCenter.value.set(centerU, centerV)
    // World anchoring without sending huge periodic coordinates to fragment derivatives.
    uniforms.uMinorPhase.value.set((centerU % gridStep) / gridStep, (centerV % gridStep) / gridStep)
    const majorStep = gridStep * 5
    uniforms.uMajorPhase.value.set(
      (centerU % majorStep) / majorStep,
      (centerV % majorStep) / majorStep,
    )
    const plaidStep = gridStep * 10
    uniforms.uPlaidPhase.value.set(
      (centerU % plaidStep) / plaidStep,
      (centerV % plaidStep) / plaidStep,
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
