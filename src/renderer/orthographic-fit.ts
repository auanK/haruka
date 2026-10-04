import type { Vector3 } from 'three'
import type { CubeVertex } from '../app/didactic-cube'

export type OrthographicFitOptions = {
  readonly projectedWidth: number
  readonly projectedHeight: number
  readonly viewportAspect: number
  readonly padding?: number
  readonly minSize?: number
}

export type OrthographicFitResult = {
  readonly halfWidth: number
  readonly halfHeight: number
}

export type ProjectedBounds = {
  readonly minX: number
  readonly maxX: number
  readonly minY: number
  readonly maxY: number
  readonly width: number
  readonly height: number
  readonly centerX: number
  readonly centerY: number
}

export const projectVerticesToViewPlane = (
  vertices: readonly CubeVertex[],
  cameraRight: Vector3,
  cameraUp: Vector3,
  viewCenter?: Vector3,
): ProjectedBounds => {
  if (vertices.length === 0) {
    return {
      minX: -0.5,
      maxX: 0.5,
      minY: -0.5,
      maxY: 0.5,
      width: 1,
      height: 1,
      centerX: 0,
      centerY: 0,
    }
  }

  let cx = 0
  let cy = 0
  let cz = 0
  if (viewCenter) {
    cx = viewCenter.x
    cy = viewCenter.y
    cz = viewCenter.z
  } else {
    for (const v of vertices) {
      cx += v.point[0]
      cy += v.point[1]
      cz += v.point[2]
    }
    cx /= vertices.length
    cy /= vertices.length
    cz /= vertices.length
  }

  let minX = Infinity
  let maxX = -Infinity
  let minY = Infinity
  let maxY = -Infinity

  for (const v of vertices) {
    const dx = v.point[0] - cx
    const dy = v.point[1] - cy
    const dz = v.point[2] - cz

    const projX = dx * cameraRight.x + dy * cameraRight.y + dz * cameraRight.z
    const projY = dx * cameraUp.x + dy * cameraUp.y + dz * cameraUp.z

    if (projX < minX) minX = projX
    if (projX > maxX) maxX = projX
    if (projY < minY) minY = projY
    if (projY > maxY) maxY = projY
  }

  const width = Math.max(maxX - minX, 0)
  const height = Math.max(maxY - minY, 0)

  return {
    minX,
    maxX,
    minY,
    maxY,
    width,
    height,
    centerX: (minX + maxX) / 2,
    centerY: (minY + maxY) / 2,
  }
}

export const deriveOrthographicFit = (options: OrthographicFitOptions): OrthographicFitResult => {
  const { projectedWidth, projectedHeight, viewportAspect, padding = 1.8, minSize = 1.0 } = options

  const safeAspect = Number.isFinite(viewportAspect) && viewportAspect > 0 ? viewportAspect : 1.0
  const safePadding = Number.isFinite(padding) && padding > 0 ? padding : 1.8
  const safeMinSize = Number.isFinite(minSize) && minSize > 0 ? minSize : 1.0

  const safeWidth = Math.max(Number.isFinite(projectedWidth) ? projectedWidth : 0, safeMinSize)
  const safeHeight = Math.max(Number.isFinite(projectedHeight) ? projectedHeight : 0, safeMinSize)

  const halfH = Math.max(
    (safeHeight / 2) * safePadding,
    ((safeWidth / 2) * safePadding) / safeAspect,
  )
  const halfW = halfH * safeAspect

  return {
    halfWidth: halfW,
    halfHeight: halfH,
  }
}
