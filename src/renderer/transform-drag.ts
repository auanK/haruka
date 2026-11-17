import { Plane, Raycaster, Vector2, Vector3, type Camera } from 'three'
import type { ScreenPoint } from '../app/direct-manipulation'
import type { Point3 } from '../domain'
import { toNdc } from './translation-drag'

type ScreenRect = Pick<DOMRect, 'left' | 'top' | 'width' | 'height'>
const pointerRay = (camera: Camera, rect: ScreenRect, pointer: ScreenPoint) => {
  const [x, y] = toNdc(rect, pointer)
  const raycaster = new Raycaster()
  raycaster.setFromCamera(new Vector2(x, y), camera)
  return raycaster.ray
}
const project = (camera: Camera, rect: ScreenRect, point: Point3): ScreenPoint => {
  const p = new Vector3(...point).project(camera)
  return [rect.left + ((p.x + 1) * rect.width) / 2, rect.top + ((1 - p.y) * rect.height) / 2]
}

export const deriveScaleFactor = (
  start: ScreenPoint,
  current: ScreenPoint,
  pivot: ScreenPoint,
): number => {
  const sx = start[0] - pivot[0],
    sy = start[1] - pivot[1]
  const cx = current[0] - pivot[0],
    cy = current[1] - pivot[1]
  const radius = Math.hypot(sx, sy)
  if (radius < 8) return 1 + (current[0] - start[0] - current[1] + start[1]) / 120
  return (Math.hypot(cx, cy) / radius) * (sx * cx + sy * cy < 0 ? -1 : 1)
}

export const deriveRotationAngle = (
  camera: Camera,
  rect: ScreenRect,
  start: ScreenPoint,
  current: ScreenPoint,
  pivot: Point3,
  direction: Point3,
): number | null => {
  if (rect.width <= 0 || rect.height <= 0) return null
  const screenPivot = project(camera, rect, pivot)
  const axis = new Vector3(...direction).normalize()
  const facing = camera.getWorldDirection(new Vector3()).negate()
  if (Math.hypot(start[0] - screenPivot[0], start[1] - screenPivot[1]) < 8)
    return (current[0] - start[0] - current[1] + start[1]) * 0.01
  if (Math.abs(axis.dot(facing)) > 0.08) {
    const plane = new Plane().setFromNormalAndCoplanarPoint(axis, new Vector3(...pivot))
    const a = pointerRay(camera, rect, start).intersectPlane(plane, new Vector3())
    const b = pointerRay(camera, rect, current).intersectPlane(plane, new Vector3())
    if (a && b) {
      a.sub(new Vector3(...pivot)).normalize()
      b.sub(new Vector3(...pivot)).normalize()
      return Math.atan2(axis.dot(a.clone().cross(b)), a.dot(b))
    }
  }
  // Edge-on circles have no stable ray/plane intersection; use a screen tangent.
  const projectedAxis = project(camera, rect, [
    pivot[0] + axis.x,
    pivot[1] + axis.y,
    pivot[2] + axis.z,
  ])
  const dx = projectedAxis[0] - screenPivot[0],
    dy = projectedAxis[1] - screenPivot[1]
  const length = Math.hypot(dx, dy)
  return length > 1e-6
    ? (((current[0] - start[0]) * dy - (current[1] - start[1]) * dx) / length) * 0.01
    : 0
}

export const derivePointerTranslation = (
  camera: Camera,
  rect: ScreenRect,
  start: ScreenPoint,
  current: ScreenPoint,
  pivot: Point3,
  direction: Point3 | null,
  normal: Point3 | null,
): Point3 | null => {
  if (rect.width <= 0 || rect.height <= 0) return null
  const first = pointerRay(camera, rect, start),
    last = pointerRay(camera, rect, current)
  const center = new Vector3(...pivot)
  if (direction) {
    const axis = new Vector3(...direction).normalize()
    const parameter = (ray: typeof first) => {
      const w = center.clone().sub(ray.origin),
        b = axis.dot(ray.direction)
      const denominator = 1 - b * b
      return denominator > 1e-4 ? (b * ray.direction.dot(w) - axis.dot(w)) / denominator : null
    }
    const a = parameter(first),
      b = parameter(last)
    if (a !== null && b !== null) return axis.multiplyScalar(b - a).toArray()
    const screen = project(camera, rect, pivot)
    const atPivot = new Vector3()
      .setFromMatrixColumn(camera.matrixWorld, 0)
      .add(center)
      .project(camera)
    const pixelsPerUnit = Math.hypot(
      rect.left + ((atPivot.x + 1) * rect.width) / 2 - screen[0],
      rect.top + ((1 - atPivot.y) * rect.height) / 2 - screen[1],
    )
    return axis
      .multiplyScalar(
        (current[0] - start[0] - current[1] + start[1]) / Math.max(1e-6, pixelsPerUnit),
      )
      .toArray()
  }
  const n = normal ? new Vector3(...normal) : camera.getWorldDirection(new Vector3())
  const plane = new Plane().setFromNormalAndCoplanarPoint(n, center)
  const a = first.intersectPlane(plane, new Vector3()),
    b = last.intersectPlane(plane, new Vector3())
  return a && b ? b.sub(a).toArray() : null
}
