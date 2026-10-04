<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, shallowRef } from 'vue'
import { transformCubeVertices } from './app/didactic-cube'
import {
  beginTranslation,
  cancelManipulation,
  commitManipulation,
  createDirectManipulationState,
  derivePreviewMatrix,
  isEditableKeyboardTarget,
  selectTarget,
  setAxisConstraint,
  setLockedAxis,
  updateTranslationDraft,
  type AxisConstraint,
  type DirectManipulationState,
  type LockedAxis,
} from './app/direct-manipulation'
import {
  addTransformOperation,
  createOperationId,
  createTransformStackState,
  getTransformSequence,
  type StackEditResult,
} from './app/transform-stack-state'
import GeometryPanel from './components/GeometryPanel.vue'
import TransformStackPanel from './components/TransformStackPanel.vue'
import { composeTransforms, type Transform } from './domain'
import { applyHarukaMatrixToObject } from './renderer/three-matrix'
import { mountHarukaViewport, type HarukaViewport } from './renderer/viewport'
import { formatNumber, type DisplayPrecision } from './ui/transform-stack'

const viewportElement = ref<HTMLElement | null>(null)
const stackState = shallowRef(createTransformStackState())
const manipulationState = shallowRef<DirectManipulationState>(createDirectManipulationState())
const displayPrecision = ref<DisplayPrecision>(4)
let viewport: HarukaViewport | undefined

const committedMatrix = computed(() => composeTransforms(getTransformSequence(stackState.value)))
const currentMatrix = computed(() =>
  derivePreviewMatrix(committedMatrix.value, manipulationState.value),
)
const currentVertices = computed(() => transformCubeVertices(currentMatrix.value))
const isDraft = computed(() => manipulationState.value.phase === 'translation-draft')
const draftTransform = computed<Transform | null>(() =>
  manipulationState.value.phase === 'translation-draft'
    ? manipulationState.value.translation
    : null,
)

const hudAxisLabel = computed(() => {
  if (manipulationState.value.phase !== 'translation-draft') return ''
  const locked = manipulationState.value.lockedAxis
  const axis = manipulationState.value.axis
  if (locked) {
    const plane = locked === 'x' ? 'YZ' : locked === 'y' ? 'XZ' : 'XY'
    if (axis === 'free') return `Plane ${plane}`
    return `${axis.toUpperCase()} · Plane ${plane}`
  }
  switch (axis) {
    case 'free':
      return 'Free'
    case 'x':
      return 'X'
    case 'y':
      return 'Y'
    case 'z':
      return 'Z'
    default:
      return ''
  }
})

const hudDeltaText = computed(() => {
  if (manipulationState.value.phase !== 'translation-draft') return ''
  const t = manipulationState.value.translation
  const p = displayPrecision.value
  return `T(${formatNumber(t.x, p)}, ${formatNumber(t.y, p)}, ${formatNumber(t.z, p)})`
})

const syncViewport = () => {
  if (viewport) {
    if ('sync' in viewport && typeof viewport.sync === 'function') {
      viewport.sync({
        matrix: currentMatrix.value,
        vertices: currentVertices.value,
      })
    } else {
      applyHarukaMatrixToObject(viewport.target, currentMatrix.value)
      viewport.updateVertexLabels(currentVertices.value)
    }
  }
}

const setManipulation = (next: DirectManipulationState) => {
  const prev = manipulationState.value
  manipulationState.value = next
  if (viewport) {
    viewport.setManipulation({
      selected: next.selected,
      active: next.phase === 'translation-draft',
    })
  }
  if (prev.phase === 'translation-draft' || next.phase === 'translation-draft') {
    syncViewport()
  }
}

const acceptEdit = (result: StackEditResult) => {
  if (!result.ok) throw new Error(`Stack edit failed: ${result.reason}`)
  stackState.value = result.state
  syncViewport()
}

const referenceSliceText = ref('')

const updateReferenceSlice = () => {
  if (!viewport || !('referenceFrame' in viewport) || !viewport.referenceFrame) {
    referenceSliceText.value = ''
    return
  }
  const frame = viewport.referenceFrame
  const isLocked = manipulationState.value.lockedAxis !== null
  const isDisplaced = Math.abs(frame.normalValue) >= 1e-3
  if (isLocked || isDisplaced) {
    referenceSliceText.value = frame.sliceLabel
  } else {
    referenceSliceText.value = ''
  }
}

const locateCube = () => {
  if (manipulationState.value.phase === 'translation-draft') return
  viewport?.locateCube()
  updateReferenceSlice()
}

let lastViewportPointer: readonly [number, number] | null = null
let pendingPointer: readonly [number, number] | null = null
let draftRafId: number | null = null

const flushDraft = () => {
  if (draftRafId !== null) {
    cancelAnimationFrame(draftRafId)
    draftRafId = null
  }
  if (pendingPointer && manipulationState.value.phase === 'translation-draft' && viewport) {
    const coords = pendingPointer
    pendingPointer = null
    const next = updateTranslationDraft(
      manipulationState.value,
      coords,
      (start, current, pivot, axis, lockedAxis) =>
        viewport!.dragDelta(start, current, pivot, axis, lockedAxis),
    )
    setManipulation(next)
  }
}

const startTranslation = () => {
  if (manipulationState.value.phase !== 'idle' || !manipulationState.value.selected) return
  setManipulation(
    beginTranslation(manipulationState.value, currentVertices.value, lastViewportPointer),
  )
}

const toggleLock = (axis: Exclude<LockedAxis, null>) => {
  if (isDraft.value) return
  const next = setLockedAxis(
    manipulationState.value,
    axis,
    viewport
      ? (start, current, pivot, a, lock) => viewport!.dragDelta(start, current, pivot, a, lock)
      : undefined,
  )
  setManipulation(next)
  viewport?.setViewAxisLock(next.lockedAxis)
  updateReferenceSlice()
}

const setAxis = (axis: AxisConstraint) => {
  if (manipulationState.value.phase !== 'translation-draft' || !viewport) return
  const next = setAxisConstraint(manipulationState.value, axis, (start, current, pivot, a, lock) =>
    viewport!.dragDelta(start, current, pivot, a, lock),
  )
  setManipulation(next)
}

const commitDraft = () => {
  flushDraft()
  lastViewportPointer = null
  const { state, transform } = commitManipulation(manipulationState.value)
  setManipulation(state)
  if (transform) {
    acceptEdit(
      addTransformOperation(stackState.value, {
        id: createOperationId(stackState.value),
        transform,
      }),
    )
  }
}

const cancelDraft = () => {
  if (draftRafId !== null) {
    cancelAnimationFrame(draftRafId)
    draftRafId = null
  }
  pendingPointer = null
  lastViewportPointer = null
  setManipulation(cancelManipulation(manipulationState.value))
}

let pointerDownPos: readonly [number, number] | null = null

const onPointerDown = (event: MouseEvent) => {
  if (event.button !== 0) return

  if (manipulationState.value.phase === 'translation-draft') {
    event.preventDefault()
    commitDraft()
    return
  }

  const canvas = viewportElement.value?.querySelector('canvas')
  if (canvas && (event.target === canvas || canvas.contains(event.target as Node))) {
    pointerDownPos = [event.clientX, event.clientY]
  } else {
    pointerDownPos = null
  }
}

const onPointerUp = (event: MouseEvent) => {
  if (event.button !== 0 || !pointerDownPos) return
  const [downX, downY] = pointerDownPos
  pointerDownPos = null
  if (Math.hypot(event.clientX - downX, event.clientY - downY) > 5) return
  if (!viewport) return
  const hit = viewport.pick(event.clientX, event.clientY)
  setManipulation(selectTarget(manipulationState.value, hit))
}

const onPointerMove = (event: MouseEvent) => {
  lastViewportPointer = [event.clientX, event.clientY]
  if (manipulationState.value.phase !== 'translation-draft' || !viewport) return
  pendingPointer = [event.clientX, event.clientY]
  if (draftRafId === null) {
    draftRafId = requestAnimationFrame(() => {
      draftRafId = null
      flushDraft()
    })
  }
}

const onKeyDown = (event: KeyboardEvent) => {
  const editable = isEditableKeyboardTarget(event.target)

  if (manipulationState.value.phase === 'translation-draft') {
    if (event.key === 'Escape') {
      event.preventDefault()
      cancelDraft()
      return
    }
    if (editable) return

    const key = event.key.toLowerCase()
    if (key === 'enter') {
      event.preventDefault()
      commitDraft()
    } else if (key === 'x' || key === 'y' || key === 'z') {
      event.preventDefault()
      setAxis(key as AxisConstraint)
    } else if (key === 'g') {
      event.preventDefault()
    }
    return
  }

  if (editable) return

  if (event.key.toLowerCase() === 'g' && !event.repeat) {
    if (manipulationState.value.selected) {
      event.preventDefault()
      startTranslation()
    }
  }
}

onMounted(() => {
  const container = viewportElement.value
  if (!container) throw new Error('Haruka viewport container is missing')
  viewport = mountHarukaViewport(container)
  if (import.meta.env.DEV) {
    ;(window as unknown as { __harukaViewport?: HarukaViewport }).__harukaViewport = viewport
  }
  syncViewport()
  viewport?.controls?.addEventListener?.('change', updateReferenceSlice)
  updateReferenceSlice()

  window.addEventListener('keydown', onKeyDown)
  window.addEventListener('pointermove', onPointerMove)
  window.addEventListener('pointerdown', onPointerDown)
  window.addEventListener('pointerup', onPointerUp)
})

onBeforeUnmount(() => {
  if (draftRafId !== null) {
    cancelAnimationFrame(draftRafId)
    draftRafId = null
  }
  viewport?.controls?.removeEventListener?.('change', updateReferenceSlice)
  window.removeEventListener('keydown', onKeyDown)
  window.removeEventListener('pointermove', onPointerMove)
  window.removeEventListener('pointerdown', onPointerDown)
  window.removeEventListener('pointerup', onPointerUp)

  if (import.meta.env.DEV) {
    delete (window as unknown as { __harukaViewport?: HarukaViewport }).__harukaViewport
  }
  viewport?.dispose()
})
</script>

<template>
  <main>
    <GeometryPanel
      :vertices="currentVertices"
      :final-matrix="currentMatrix"
      :caption="isDraft ? 'Preview' : 'Final Matrix'"
      :precision="displayPrecision"
      @update:precision="displayPrecision = $event"
    />
    <div ref="viewportElement" class="viewport" role="region" aria-label="Haruka 3D viewport">
      <div class="camera-toolbar" role="toolbar" aria-label="Camera controls">
        <button type="button" aria-label="Locate Cube" title="Locate Cube" @click="locateCube">
          ◎ Locate Cube
        </button>
      </div>
      <div
        class="view-lock-controls axis-lock-toolbar"
        role="toolbar"
        aria-label="View axis lock controls"
      >
        <button
          type="button"
          :aria-pressed="manipulationState.lockedAxis === 'x'"
          :class="{ active: manipulationState.lockedAxis === 'x' }"
          :disabled="isDraft"
          title="Lock X (View YZ plane)"
          aria-label="Lock X axis"
          @click="toggleLock('x')"
        >
          X
        </button>
        <button
          type="button"
          :aria-pressed="manipulationState.lockedAxis === 'y'"
          :class="{ active: manipulationState.lockedAxis === 'y' }"
          :disabled="isDraft"
          title="Lock Y (View XZ plane)"
          aria-label="Lock Y axis"
          @click="toggleLock('y')"
        >
          Y
        </button>
        <button
          type="button"
          :aria-pressed="manipulationState.lockedAxis === 'z'"
          :class="{ active: manipulationState.lockedAxis === 'z' }"
          :disabled="isDraft"
          title="Lock Z (View XY plane)"
          aria-label="Lock Z axis"
          @click="toggleLock('z')"
        >
          Z
        </button>
      </div>
      <div
        v-if="referenceSliceText"
        class="slice-indicator"
        data-testid="slice-indicator"
        role="status"
        aria-live="polite"
      >
        {{ referenceSliceText }}
      </div>
      <div
        v-if="!isDraft"
        class="grab-hint"
        :class="{ selected: manipulationState.selected }"
        aria-hidden="true"
      >
        G — Grab
      </div>
      <div v-if="isDraft" class="tool-hud" role="status" aria-live="polite">
        <div>Translate · {{ hudAxisLabel }}</div>
        <div>{{ hudDeltaText }}</div>
      </div>
    </div>
    <TransformStackPanel
      :state="stackState"
      :draft-transform="draftTransform"
      :precision="displayPrecision"
      @edit="acceptEdit"
    />
  </main>
</template>

<style>
main {
  width: 100%;
  height: 100%;
  margin: 0;
  display: flex;
  overflow: hidden;
}

.viewport {
  position: relative;
  flex: 1;
  min-width: 0;
  height: 100%;
}

.viewport canvas {
  display: block;
  width: 100%;
  height: 100%;
}

.camera-toolbar {
  position: absolute;
  top: 10px;
  left: 10px;
  display: flex;
  gap: 4px;
  z-index: 10;
}

.camera-toolbar button {
  font-size: 11px;
  padding: 0.15rem 0.4rem;
  min-height: 22px;
  background: color-mix(in srgb, var(--color-interaction) 8%, rgba(28, 29, 32, 0.88));
  backdrop-filter: blur(4px);
  border: 1px solid color-mix(in srgb, var(--color-interaction) 40%, var(--color-border));
  color: var(--color-interaction-light);
}

.camera-toolbar button:hover:enabled {
  background: color-mix(in srgb, var(--color-interaction) 20%, var(--color-surface-hover));
  border-color: var(--color-interaction);
  color: var(--color-text);
}

.camera-toolbar button.active {
  background: var(--color-interaction);
  color: var(--color-background);
  font-weight: 600;
  border-color: var(--color-interaction);
}

.view-lock-controls {
  position: absolute;
  top: 10px;
  right: 112px;
  display: flex;
  align-items: center;
  gap: 4px;
  background: transparent;
  border: none;
  z-index: 10;
  user-select: none;
}

.view-lock-controls button {
  position: relative;
  min-width: 20px;
  height: 22px;
  padding: 0 4px;
  background: transparent;
  border: none;
  color: var(--color-interaction);
  font-family: inherit;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  line-height: 22px;
  border-radius: 3px;
  transition:
    opacity 0.15s ease,
    background 0.15s ease;
}

.view-lock-controls button:hover:not(:disabled) {
  background: rgba(255, 255, 255, 0.08);
}

.view-lock-controls button:disabled {
  opacity: 0.35;
  cursor: not-allowed;
}

.view-lock-controls button.active::after {
  content: '';
  position: absolute;
  bottom: 1px;
  left: 4px;
  right: 4px;
  height: 2px;
  background: var(--color-interaction);
  border-radius: 1px;
}

.grab-hint {
  position: absolute;
  bottom: 12px;
  left: 12px;
  font-family: monospace;
  font-size: 11px;
  line-height: 1.4;
  color: var(--color-text);
  opacity: 0.35;
  pointer-events: none;
  user-select: none;
  z-index: 5;
  transition: opacity 0.15s ease;
}

.grab-hint.selected {
  opacity: 0.75;
}

.tool-hud {
  position: absolute;
  bottom: 12px;
  left: 12px;
  padding: 0.35rem 0.6rem;
  background: color-mix(in srgb, var(--color-panel) 88%, transparent);
  border: 1px solid var(--color-border);
  border-left: 3px solid var(--color-interaction);
  border-radius: 3px;
  font-family: monospace;
  font-size: 11px;
  line-height: 1.4;
  color: var(--color-text);
  pointer-events: none;
  z-index: 10;
}

.slice-indicator {
  position: absolute;
  top: 36px;
  right: 112px;
  font-family: monospace;
  font-size: 11px;
  color: var(--color-interaction);
  opacity: 0.85;
  background: color-mix(in srgb, var(--color-panel) 80%, transparent);
  padding: 2px 6px;
  border-radius: 3px;
  border: 1px solid var(--color-border);
  pointer-events: none;
  user-select: none;
  z-index: 10;
}

@media (max-width: 640px) {
  main {
    flex-direction: column;
  }
  .viewport {
    flex: 0 0 45%;
    height: auto;
    min-height: 0;
  }
}
</style>
