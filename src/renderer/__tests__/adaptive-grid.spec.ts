import { describe, expect, it, vi } from 'vitest'
import {
  BufferAttribute,
  OrthographicCamera,
  PerspectiveCamera,
  Vector3,
  Mesh,
  LineSegments,
  PlaneGeometry,
  ShaderMaterial,
} from 'three'
import { createAdaptiveGrid } from '../adaptive-grid'

describe('createAdaptiveGrid', () => {
  it('keeps the Y buffer clean during micro movement but updates a material extent change', () => {
    const grid = createAdaptiveGrid()
    const camera = new PerspectiveCamera(45, 4 / 3, 0.1, 500)
    camera.position.set(10, 10, 10)
    grid.update(camera, 800, 600)
    const position = grid.yAxisGeometry.getAttribute('position') as BufferAttribute
    const version = position.version
    const previousExtent = position.getY(1)
    for (let i = 0; i < 100; i++) {
      camera.position.x += 0.0001
      grid.update(camera, 800, 600)
    }
    expect(position.version).toBe(version)
    expect(position.getY(1)).toBe(previousExtent)
    camera.position.multiplyScalar(2)
    grid.update(camera, 800, 600)
    expect(position.version).toBe(version + 1)
    expect(position.getY(1)).toBeGreaterThan(previousExtent)
    grid.dispose()
  })

  it('creates an adaptive grid group with constant reusable resources', () => {
    const grid = createAdaptiveGrid()

    expect(grid.group.name).toBe('adaptive-grid')
    expect(grid.planeGeometry).toBeInstanceOf(PlaneGeometry)
    expect(grid.shaderMaterial).toBeInstanceOf(ShaderMaterial)

    const mesh = grid.group.children.find((child) => child instanceof Mesh) as Mesh
    const line = grid.group.children.find((child) => child instanceof LineSegments) as LineSegments

    expect(mesh).toBeDefined()
    expect(line).toBeDefined()
    expect(mesh.geometry).toBe(grid.planeGeometry)
    expect(mesh.material).toBe(grid.shaderMaterial)

    grid.dispose()
  })

  it('updates uniforms and object transforms without reallocating geometry or material', () => {
    const grid = createAdaptiveGrid()
    const camera = new PerspectiveCamera(45, 16 / 9, 0.1, 500)
    camera.position.set(10, 10, 10)

    const geomBefore = grid.planeGeometry
    const matBefore = grid.shaderMaterial
    const yGeomBefore = grid.yAxisGeometry
    const yMatBefore = grid.yAxisMaterial

    // Initial update
    grid.update(camera, 800, 600, new Vector3(0, 0, 0))

    const step1 = grid.shaderMaterial.uniforms.uGridStep?.value
    expect(step1).toBeGreaterThan(0)

    // Camera moves far away (e.g. distance > 500)
    camera.position.set(500, 400, 500)
    grid.update(camera, 800, 600, new Vector3(500, 0, 500))

    const step2 = grid.shaderMaterial.uniforms.uGridStep?.value
    expect(step2).toBeGreaterThan(step1)

    // Confirm EXACT same instances are preserved (zero churn)
    expect(grid.planeGeometry).toBe(geomBefore)
    expect(grid.shaderMaterial).toBe(matBefore)
    expect(grid.yAxisGeometry).toBe(yGeomBefore)
    expect(grid.yAxisMaterial).toBe(yMatBefore)

    grid.dispose()
  })

  it('adapts to locations far beyond the old fixed ±100 extent', () => {
    const grid = createAdaptiveGrid()
    const camera = new PerspectiveCamera(45, 1, 0.1, 2000)
    camera.position.set(1200, 30, 800)
    const target = new Vector3(1200, 0, 800)

    grid.update(camera, 1000, 1000, target)

    const groundMesh = grid.group.children.find((child) => child instanceof Mesh) as Mesh
    expect(groundMesh.position.x).toBeCloseTo(1200)
    expect(groundMesh.position.z).toBeCloseTo(800)
    expect(groundMesh.scale.x).toBeGreaterThan(100)

    grid.dispose()
  })

  it('preserves world anchoring through bounded phases at large coordinates', () => {
    const grid = createAdaptiveGrid()
    const camera = new PerspectiveCamera(45, 4 / 3, 0.1, 1e10)
    const focus = new Vector3(0.25, 0, 0.125)
    camera.position.copy(focus).addScalar(5)
    grid.update(camera, 800, 600, focus)
    const uniforms = grid.shaderMaterial.uniforms
    const minor = uniforms.uMinorPhase!.value.clone()
    const major = uniforms.uMajorPhase!.value.clone()
    expect(minor.x).toBeCloseTo(0.5)
    expect(minor.y).toBeCloseTo(0.25)
    expect(major.x).toBeCloseTo(0.1)
    expect(major.y).toBeCloseTo(0.05)
    focus.set(1e9 + 0.25, 0, 1e6 + 0.125)
    camera.position.copy(focus).addScalar(5)
    grid.update(camera, 800, 600, focus)
    expect(uniforms.uMinorPhase!.value).toEqual(minor)
    expect(uniforms.uMajorPhase!.value).toEqual(major)
    expect(uniforms.uGridStep!.value).toBe(0.5)
    grid.dispose()
  })

  it('preserves plaid phase world-anchoring and boundedness at large coordinates', () => {
    const grid = createAdaptiveGrid()
    const camera = new PerspectiveCamera(45, 4 / 3, 0.1, 1e10)
    const focus = new Vector3(0.25, 0, 0.125)
    camera.position.copy(focus).addScalar(5)
    grid.update(camera, 800, 600, focus)
    const uniforms = grid.shaderMaterial.uniforms
    const plaid = uniforms.uPlaidPhase!.value.clone()
    expect(plaid.x).toBeCloseTo(0.05)
    expect(plaid.y).toBeCloseTo(0.025)
    focus.set(1e9 + 0.25, 0, 1e6 + 0.125)
    camera.position.copy(focus).addScalar(5)
    grid.update(camera, 800, 600, focus)
    expect(uniforms.uPlaidPhase!.value).toEqual(plaid)
    grid.dispose()
  })

  it('disposes all owned resources cleanly on dispose', () => {
    const grid = createAdaptiveGrid()

    const planeGeomSpy = vi.spyOn(grid.planeGeometry, 'dispose')
    const shaderMatSpy = vi.spyOn(grid.shaderMaterial, 'dispose')
    const yGeomSpy = vi.spyOn(grid.yAxisGeometry, 'dispose')
    const yMatSpy = vi.spyOn(grid.yAxisMaterial, 'dispose')

    grid.dispose()

    expect(planeGeomSpy).toHaveBeenCalledOnce()
    expect(shaderMatSpy).toHaveBeenCalledOnce()
    expect(yGeomSpy).toHaveBeenCalledOnce()
    expect(yMatSpy).toHaveBeenCalledOnce()
    expect(grid.group.children).toHaveLength(0)
  })

  it('orients the reference plane mesh and updates axis uniforms according to activePlane', () => {
    const grid = createAdaptiveGrid()
    const camera = new PerspectiveCamera(45, 1, 0.1, 500)
    camera.position.set(10, 10, 10)
    const target = new Vector3(2, 3, 4)

    const groundMesh = grid.group.children.find((child) => child instanceof Mesh) as Mesh

    // Default or XZ plane (Lock Y or free)
    grid.update(camera, 800, 600, target, 'xz')
    expect(groundMesh.position.toArray()).toEqual([2, 3, 4])
    expect(groundMesh.rotation.x).toBeCloseTo(-Math.PI / 2)
    expect(groundMesh.rotation.y).toBeCloseTo(0)

    // YZ plane (Lock X)
    grid.update(camera, 800, 600, target, 'yz')
    expect(groundMesh.position.toArray()).toEqual([2, 3, 4])
    expect(groundMesh.rotation.x).toBeCloseTo(0)
    expect(groundMesh.rotation.y).toBeCloseTo(Math.PI / 2)

    // XY plane (Lock Z)
    grid.update(camera, 800, 600, target, 'xy')
    expect(groundMesh.position.toArray()).toEqual([2, 3, 4])
    expect(groundMesh.rotation.x).toBeCloseTo(0)
    expect(groundMesh.rotation.y).toBeCloseTo(0)

    grid.dispose()
  })

  it('positions reference plane slice at focus normal value without fixing to zero (Requirement 45)', () => {
    const grid = createAdaptiveGrid()
    const camera = new PerspectiveCamera(45, 1, 0.1, 5000)
    camera.position.set(10, 2050, -30)
    const focus = new Vector3(10, 2000, -30)
    const groundMesh = grid.group.children.find((child) => child instanceof Mesh) as Mesh

    // Free view -> plane position y === 2000
    grid.update(camera, 800, 600, focus, 'xz')
    expect(groundMesh.position.y).toBe(2000)

    // Lock X -> plane position x === 10
    grid.update(camera, 800, 600, focus, 'yz')
    expect(groundMesh.position.x).toBe(10)

    // Lock Y -> plane position y === 2000
    grid.update(camera, 800, 600, focus, 'xz')
    expect(groundMesh.position.y).toBe(2000)

    // Lock Z -> plane position z === -30
    grid.update(camera, 800, 600, focus, 'xy')
    expect(groundMesh.position.z).toBe(-30)

    grid.dispose()
  })

  it('anchors the Y axis line strictly at the global world origin X=0, Z=0 regardless of focus target', () => {
    const grid = createAdaptiveGrid()
    const camera = new PerspectiveCamera(45, 1, 0.1, 5000)
    camera.position.set(100, 250, 300)
    const target = new Vector3(100, 200, 300)

    grid.update(camera, 800, 600, target)

    const yAxisLine = grid.group.getObjectByName('adaptive-axis-y') as LineSegments
    expect(yAxisLine.position.toArray()).toEqual([0, 0, 0])
    grid.dispose()
  })

  it('disables radial fade in orthographic view and enables it in perspective view', () => {
    const grid = createAdaptiveGrid()
    const persp = new PerspectiveCamera(45, 1, 0.1, 1000)
    persp.position.set(10, 10, 10)
    grid.update(persp, 800, 600)
    expect(grid.shaderMaterial.uniforms.uFadeEnabled?.value).toBe(1.0)

    const ortho = new OrthographicCamera(-20, 20, 15, -15, 0.1, 1000)
    ortho.position.set(0, 50, 0)
    grid.update(ortho, 800, 600, new Vector3(0, 0, 0), 'xz')
    expect(grid.shaderMaterial.uniforms.uFadeEnabled?.value).toBe(0.0)

    grid.dispose()
  })

  it('calculates rectangular plane extent from exact orthographic frustum and recovers scale after zoom cycles', () => {
    const grid = createAdaptiveGrid()
    const ortho = new OrthographicCamera(-40, 40, 30, -30, 0.1, 1000)
    ortho.zoom = 1
    ortho.position.set(0, 50, 0)

    grid.update(ortho, 800, 600, new Vector3(0, 0, 0), 'xz')
    const groundMesh = grid.group.children.find((child) => child instanceof Mesh) as Mesh
    // visibleWidth = 80 -> extentU = 80 * 1.3 = 104
    // visibleHeight = 60 -> extentV = 60 * 1.3 = 78
    expect(groundMesh.scale.x).toBeCloseTo(104)
    expect(groundMesh.scale.y).toBeCloseTo(78)

    // Zoom way out
    ortho.zoom = 0.01
    grid.update(ortho, 800, 600, new Vector3(0, 0, 0), 'xz')
    expect(groundMesh.scale.x).toBeCloseTo(10400)
    expect(groundMesh.scale.y).toBeCloseTo(7800)

    // Zoom back in -> exactly restores scale without stale state
    ortho.zoom = 1
    grid.update(ortho, 800, 600, new Vector3(0, 0, 0), 'xz')
    expect(groundMesh.scale.x).toBeCloseTo(104)
    expect(groundMesh.scale.y).toBeCloseTo(78)

    grid.dispose()
  })

  it('maintains absolute resource stability across extreme target movements (Requirement 51)', () => {
    const grid = createAdaptiveGrid()
    const camera = new PerspectiveCamera(45, 1, 0.1, 1e8)
    const targets = [0, 200, 2000, 1e6, -1e6].map((y) => new Vector3(y, y, y))

    const geom = grid.planeGeometry
    const mat = grid.shaderMaterial
    const yGeom = grid.yAxisGeometry
    const yMat = grid.yAxisMaterial

    for (const target of targets) {
      camera.position.copy(target).addScalar(50)
      grid.update(camera, 800, 600, target)
      expect(grid.planeGeometry).toBe(geom)
      expect(grid.shaderMaterial).toBe(mat)
      expect(grid.yAxisGeometry).toBe(yGeom)
      expect(grid.yAxisMaterial).toBe(yMat)
    }

    grid.dispose()
  })
})
