export const deriveCameraClipping = ({
  cameraDistance,
  objectRadius,
}: {
  readonly cameraDistance: number
  readonly objectRadius: number
}): { readonly near: number; readonly far: number } => {
  const distance = Number.isFinite(cameraDistance) && cameraDistance >= 0 ? cameraDistance : 1
  const radius = Number.isFinite(objectRadius) && objectRadius >= 0 ? objectRadius : 0.866
  // Keep far + near and 2 * far * near finite in Three's perspective projection.
  const far = Math.min(Number.MAX_VALUE / 4, Math.max(100, distance * 8, radius * 4))
  const near = Math.max(
    1e-6,
    Math.min(distance * 1e-4, Math.max(0, distance - radius) * 0.25, Number.MAX_VALUE / far / 4),
  )
  return { near, far }
}
