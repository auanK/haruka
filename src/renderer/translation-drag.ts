import { Plane, Ray, Vector3, type Camera } from 'three'
import type { AxisConstraint, LockedAxis } from '../app/direct-manipulation'
import type { Point3 } from '../domain'

export const toNdc = (
  rect: Pick<DOMRect, 'left' | 'top' | 'width' | 'height'>,
  clientPos: readonly [number, number],
): readonly [number, number] => {
  const x = ((clientPos[0] - rect.left) / rect.width) * 2 - 1
  const y = 1 - ((clientPos[1] - rect.top) / rect.height) * 2
  return [x, y]
}

const createRay = (camera: Camera, ndc: readonly [number, number]): Ray => {
  if (
    'isOrthographicCamera' in camera &&
    (camera as { isOrthographicCamera?: boolean }).isOrthographicCamera
  ) {
    const origin = new Vector3(ndc[0], ndc[1], -1).unproject(camera)
    const direction = camera.getWorldDirection(new Vector3()).normalize()
    return new Ray(origin, direction)
  }
  const origin = camera.position.clone()
  const direction = new Vector3(ndc[0], ndc[1], 0.5).unproject(camera).sub(origin).normalize()
  return new Ray(origin, direction)
}

export const deriveTranslationDelta = (
  camera: Camera,
  startNdc: readonly [number, number],
  currentNdc: readonly [number, number],
  pivot: Point3,
  axis: AxisConstraint = 'free',
  lockedAxis: LockedAxis = null,
): Point3 | null => {
  const startRay = createRay(camera, startNdc)
  const currRay = createRay(camera, currentNdc)
  const pivotVec = new Vector3(...pivot)

  if (lockedAxis) {
    const planeNormal = new Vector3(
      lockedAxis === 'x' ? 1 : 0,
      lockedAxis === 'y' ? 1 : 0,
      lockedAxis === 'z' ? 1 : 0,
    )
    if (
      Math.abs(startRay.direction.dot(planeNormal)) < 0.05 ||
      Math.abs(currRay.direction.dot(planeNormal)) < 0.05
    ) {
      return null
    }

    const plane = new Plane().setFromNormalAndCoplanarPoint(planeNormal, pivotVec)
    const hitStart = new Vector3()
    const hitCurr = new Vector3()
    if (!startRay.intersectPlane(plane, hitStart) || !currRay.intersectPlane(plane, hitCurr)) {
      return null
    }

    const delta = hitCurr.sub(hitStart)
    const dx = lockedAxis === 'x' ? 0 : delta.x
    const dy = lockedAxis === 'y' ? 0 : delta.y
    const dz = lockedAxis === 'z' ? 0 : delta.z

    if (axis === 'free') return [dx, dy, dz]
    if (axis === 'x' && lockedAxis !== 'x') return [dx, 0, 0]
    if (axis === 'y' && lockedAxis !== 'y') return [0, dy, 0]
    if (axis === 'z' && lockedAxis !== 'z') return [0, 0, dz]
    return [0, 0, 0]
  }

  if (axis === 'free') {
    const planeNormal = camera.getWorldDirection(new Vector3()).negate()
    const plane = new Plane().setFromNormalAndCoplanarPoint(planeNormal, pivotVec)
    if (plane.distanceToPoint(camera.position) <= 0.01) {
      return null
    }

    const hitStart = new Vector3()
    const hitCurr = new Vector3()
    if (!startRay.intersectPlane(plane, hitStart) || !currRay.intersectPlane(plane, hitCurr)) {
      return null
    }
    const delta = hitCurr.sub(hitStart)
    return [delta.x, delta.y, delta.z]
  }

  const axisDir = new Vector3(axis === 'x' ? 1 : 0, axis === 'y' ? 1 : 0, axis === 'z' ? 1 : 0)

  const closestParam = (ray: Ray): number | null => {
    const w0 = new Vector3().subVectors(pivotVec, ray.origin)
    const b = axisDir.dot(ray.direction)
    const d = axisDir.dot(w0)
    const e = ray.direction.dot(w0)
    const denom = 1 - b * b
    if (denom < 0.05) return null
    const s = (b * e - d) / denom
    const t = (e - b * d) / denom
    if (t < 0) return null
    return s
  }

  const sStart = closestParam(startRay)
  const sCurr = closestParam(currRay)
  if (sStart === null || sCurr === null) return null

  const delta = sCurr - sStart
  switch (axis) {
    case 'x':
      return [delta, 0, 0]
    case 'y':
      return [0, delta, 0]
    case 'z':
      return [0, 0, delta]
  }
}
