import { describe, expect, it, vi } from 'vitest'
import {
  BufferAttribute,
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
})
