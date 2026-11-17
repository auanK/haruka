<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, shallowRef } from 'vue'
import { transformCubeVertices } from './app/didactic-cube'
import {
  beginTransform,
  cancelManipulation,
  commitManipulation,
  createDirectManipulationState,
  derivePreviewMatrix,
  createDraftOperation,
  isEditableKeyboardTarget,
  selectTarget,
  setGestureConstraint,
  setGestureModifiers,
  setNumericInput,
  setLockedAxis,
  updateGestureDraft,
  type AxisConstraint,
  type DirectManipulationState,
  type LockedAxis,
  type TransformKind,
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
import { composeTransforms } from './domain'
import { applyHarukaMatrixToObject } from './renderer/three-matrix'
import { mountHarukaViewport, type HarukaViewport } from './renderer/viewport'
import { formatNumber, type DisplayPrecision } from './ui/transform-stack'

const viewportElement = ref<HTMLElement | null>(null)
const stackState = shallowRef(createTransformStackState())
const manipulationState = shallowRef<DirectManipulationState>(createDirectManipulationState())
const displayPrecision = ref<DisplayPrecision>(4)
const activeTool = ref<'select' | TransformKind>('select')
const toolConstraint = ref<{ axis: 'x' | 'y' | 'z'; plane: boolean } | null>(null)
const pendingConstraintLabel = computed(() => {
  const constraint = toolConstraint.value
  if (!constraint) return ''
  const tool =
    activeTool.value === 'rotation' ? 'Rotate' : activeTool.value === 'scale' ? 'Scale' : 'Move'
  const axis = constraint.plane
    ? `Plane ${constraint.axis === 'x' ? 'YZ' : constraint.axis === 'y' ? 'XZ' : 'XY'}`
    : constraint.axis.toUpperCase()
  return `${tool} · ${axis} · ${activeTool.value === 'translation' && manipulationState.value.lockedAxis ? 'Global' : 'Local'}`
})
const hoveredControl = ref<AxisConstraint | null>(null)
const controlHintPosition = ref({ left: '0px', top: '0px' })
const tools = [
  {
    kind: 'select',
    label: 'Selection tool',
    title: 'Select freely',
    icon: 'M4 3 17 11 11 12 8 18Z',
  },
  {
    kind: 'translation',
    label: 'Move tool',
    title: 'Move (G)',
    icon: 'M10 2v16M2 10h16M7 5l3-3 3 3M7 15l3 3 3-3M5 7l-3 3 3 3M15 7l3 3-3 3',
  },
  {
    kind: 'rotation',
    label: 'Rotate tool',
    title: 'Rotate (R)',
    icon: 'M16 6a7 7 0 1 0 1 7M16 2v5h-5',
  },
  {
    kind: 'scale',
    label: 'Scale tool',
    title: 'Scale (S)',
    icon: 'M3 11h6v6H3ZM10 10l7-7M12 3h5v5',
  },
] as const
let viewport: HarukaViewport | undefined

const committedMatrix = computed(() => composeTransforms(getTransformSequence(stackState.value)))
const currentMatrix = computed(() =>
  derivePreviewMatrix(committedMatrix.value, manipulationState.value),
)
const currentVertices = computed(() => transformCubeVertices(currentMatrix.value))
const isDraft = computed(() => manipulationState.value.phase !== 'idle')
const draftOperation = computed(() => createDraftOperation(manipulationState.value, 'draft'))
const hudToolLabel = computed(() =>
  manipulationState.value.phase === 'rotation-draft'
    ? 'Rotate'
    : manipulationState.value.phase === 'scale-draft'
      ? 'Scale'
      : 'Translate',
)

const hudAxisLabel = computed(() => {
  if (manipulationState.value.phase === 'idle') return ''
  const draft = manipulationState.value
  const space = draft.gesture?.space === 'local' ? ' · Local' : ''
  if (draft.gesture?.plane && draft.axis !== 'free') {
    const plane = draft.axis === 'x' ? 'YZ' : draft.axis === 'y' ? 'XZ' : 'XY'
    return `Plane ${plane}${space}`
  }
  if (draft.phase !== 'translation-draft')
    return `${draft.axis === 'free' ? 'Free' : draft.axis.toUpperCase()}${space}`
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
      return `X${space}`
    case 'y':
      return `Y${space}`
    case 'z':
      return `Z${space}`
    default:
      return ''
  }
})

const controlHint = computed(() => {
  if (isDraft.value) return `${hudToolLabel.value} · ${hudAxisLabel.value}`
  if (hoveredControl.value === null || activeTool.value === 'select') return ''
  if (toolConstraint.value) return pendingConstraintLabel.value
  const tool =
    activeTool.value === 'rotation' ? 'Rotate' : activeTool.value === 'scale' ? 'Scale' : 'Move'
  const axis =
    hoveredControl.value === 'free'
      ? activeTool.value === 'scale'
        ? 'Uniform'
        : activeTool.value === 'rotation'
          ? 'View'
          : 'Free'
      : hoveredControl.value.toUpperCase()
  return `${tool} · ${axis}`
})

const hudDeltaText = computed(() => {
  const state = manipulationState.value
  if (state.phase === 'idle') return ''
  const p = displayPrecision.value
  if (state.phase === 'rotation-draft')
    return `R(${formatNumber((state.angle * 180) / Math.PI, p)}°)${state.gesture.numeric ? ` · ${state.gesture.numeric}°` : ''}`
  if (state.phase === 'scale-draft')
    return `S(${formatNumber(state.scale.x, p)}, ${formatNumber(state.scale.y, p)}, ${formatNumber(state.scale.z, p)})`
  const t = state.translation
  return `T(${formatNumber(t.x, p)}, ${formatNumber(t.y, p)}, ${formatNumber(t.z, p)})`
})
const hudInputText = computed(() => {
  const state = manipulationState.value
  if (state.phase === 'idle' || !state.gesture?.numeric) return ''
  const gesture = state.gesture
  const value = gesture.reciprocal ? `1/(${gesture.numeric})` : gesture.numeric
  return `Input${gesture.componentMode ? ` ${['X', 'Y', 'Z'][gesture.component]}` : ''}: ${value}`
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
  if (!next.selected) toolConstraint.value = null
  hoveredControl.value = null
  if (viewport) {
    viewport.setManipulation({
      selected: next.selected,
      active: next.phase !== 'idle',
    })
  }
  if (prev.phase !== 'idle' || next.phase !== 'idle') {
    syncViewport()
  }
  syncToolGizmo()
}

const acceptEdit = (result: StackEditResult) => {
  if (!result.ok) throw new Error(`Stack edit failed: ${result.reason}`)
  stackState.value = result.state
  syncViewport()
  syncToolGizmo()
}

const makeToolDraft = (kind: TransformKind, pointer: readonly [number, number] | null) => {
  const pivot = [currentMatrix.value[3], currentMatrix.value[7], currentMatrix.value[11]] as const
  const view = viewport?.getGestureView(pivot) ?? {
    pivot: [0, 0] as const,
    facing: [0, 0, 1] as const,
    right: [1, 0, 0] as const,
    up: [0, 1, 0] as const,
  }
  let draft = beginTransform(
    manipulationState.value,
    kind,
    currentVertices.value,
    pointer,
    committedMatrix.value,
    view,
    kind === 'translation' && manipulationState.value.lockedAxis ? 'global' : 'local',
  )
  if (toolConstraint.value && draft.phase !== 'idle' && draft.gesture) {
    draft = setGestureConstraint(draft, toolConstraint.value.axis, toolConstraint.value.plane)
    if (draft.phase !== 'idle' && draft.gesture)
      draft = { ...draft, gesture: { ...draft.gesture, constraintActive: true } }
  }
  return draft
}
const syncToolGizmo = () => {
  const state = manipulationState.value
  const draft =
    state.phase !== 'idle'
      ? state
      : state.selected && activeTool.value !== 'select'
        ? makeToolDraft(activeTool.value, null)
        : null
  viewport?.setTransformGizmo?.(draft?.phase === 'idle' ? null : draft, state.phase !== 'idle')
}
const selectTool = (tool: 'select' | TransformKind) => {
  if (isDraft.value) cancelDraft()
  activeTool.value = tool
  toolConstraint.value = null
  hoveredControl.value = null
  syncToolGizmo()
}
const armAxis = (axis: 'x' | 'y' | 'z', plane = false) => {
  if (activeTool.value === 'select' || !manipulationState.value.selected) return
  if (activeTool.value === 'translation' && manipulationState.value.lockedAxis === axis && !plane)
    return
  const usePlane = plane && activeTool.value !== 'rotation'
  toolConstraint.value =
    toolConstraint.value?.axis === axis && toolConstraint.value.plane === usePlane
      ? null
      : { axis, plane: usePlane }
  hoveredControl.value = null
  syncToolGizmo()
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
  if (isDraft.value) return
  viewport?.locateCube()
  updateReferenceSlice()
}

let gizmoDrag = false
let suppressNextContextMenu = false
let pendingPointer: readonly [number, number] | null = null
let draftRafId: number | null = null

const refreshDraft = (state: DirectManipulationState, pointer?: readonly [number, number]) => {
  if (state.phase === 'idle' || !viewport) return state
  const coords = pointer ?? state.current
  if (!coords) return state
  const measured = viewport.measureGesture?.(state, coords)
  const measurement =
    state.phase === 'translation-draft' && measured?.translation === undefined
      ? {
          translation: viewport.dragDelta(
            state.start ?? coords,
            coords,
            state.pivot,
            state.axis,
            state.lockedAxis,
          ),
        }
      : (measured ?? {})
  return updateGestureDraft(state, coords, measurement)
}

const flushDraft = () => {
  if (draftRafId !== null) {
    cancelAnimationFrame(draftRafId)
    draftRafId = null
  }
  if (pendingPointer && manipulationState.value.phase !== 'idle' && viewport) {
    const coords = pendingPointer
    pendingPointer = null
    setManipulation(refreshDraft(manipulationState.value, coords))
  }
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

const setAxis = (axis: Exclude<AxisConstraint, 'free'>, plane = false) => {
  if (!isDraft.value || !viewport) return
  flushDraft()
  setManipulation(refreshDraft(setGestureConstraint(manipulationState.value, axis, plane)))
}

const commitDraft = () => {
  gizmoDrag = false
  flushDraft()
  const operation = createDraftOperation(
    manipulationState.value,
    createOperationId(stackState.value),
  )
  const { state, transform, transforms } = commitManipulation(manipulationState.value)
  setManipulation(state)
  if (operation && (transform || transforms?.length))
    acceptEdit(addTransformOperation(stackState.value, operation))
}

const cancelDraft = () => {
  gizmoDrag = false
  if (draftRafId !== null) {
    cancelAnimationFrame(draftRafId)
    draftRafId = null
  }
  pendingPointer = null
  setManipulation(cancelManipulation(manipulationState.value))
}

let pointerDownPos: readonly [number, number] | null = null

const onViewportPointerDown = (event: PointerEvent) => {
  if (
    event.button !== 0 ||
    isDraft.value ||
    activeTool.value === 'select' ||
    !manipulationState.value.selected
  )
    return
  const canvas = viewportElement.value?.querySelector('canvas')
  if (event.target !== canvas) return
  const control = viewport?.pickTransformControl(event.clientX, event.clientY)
  const onLockedObject = toolConstraint.value && viewport?.pick(event.clientX, event.clientY)
  if (
    (!control && !onLockedObject) ||
    (activeTool.value === 'rotation' && control === 'free' && !toolConstraint.value)
  )
    return
  event.preventDefault()
  event.stopPropagation()
  canvas?.focus({ preventScroll: true })
  if (event.pointerId !== undefined) canvas?.setPointerCapture?.(event.pointerId)
  const pointer = [event.clientX, event.clientY] as const
  pointerDownPos = null
  setManipulation(makeToolDraft(activeTool.value, pointer))
  if (!toolConstraint.value && control && control !== 'free') setAxis(control)
  gizmoDrag = true
}

const onPointerDown = (event: MouseEvent) => {
  const canvas = viewportElement.value?.querySelector('canvas')
  const onCanvas = canvas && (event.target === canvas || canvas.contains(event.target as Node))
  if (isDraft.value && event.button === 2 && onCanvas) {
    event.preventDefault()
    suppressNextContextMenu = true
    cancelDraft()
    return
  }
  if (event.button !== 0) return
  if (manipulationState.value.phase !== 'idle' && onCanvas) {
    event.preventDefault()
    commitDraft()
    return
  }

  if (canvas && (event.target === canvas || canvas.contains(event.target as Node))) {
    pointerDownPos = [event.clientX, event.clientY]
  } else {
    pointerDownPos = null
  }
}

const onPointerUp = (event: MouseEvent) => {
  if (event.button === 0 && gizmoDrag) {
    commitDraft()
    return
  }
  if (event.button !== 0 || !pointerDownPos) return
  const [downX, downY] = pointerDownPos
  pointerDownPos = null
  if (Math.hypot(event.clientX - downX, event.clientY - downY) > 5) return
  if (!viewport) return
  const hit = viewport.pick(event.clientX, event.clientY)
  setManipulation(selectTarget(manipulationState.value, hit))
}

const onPointerMove = (event: MouseEvent) => {
  if (!viewport) return
  const rect = viewportElement.value?.getBoundingClientRect()
  if (rect)
    controlHintPosition.value = {
      left: `${Math.max(4, Math.min(event.clientX - rect.left + 16, rect.width - 160))}px`,
      top: `${Math.max(4, Math.min(event.clientY - rect.top + 18, rect.height - 28))}px`,
    }
  if (manipulationState.value.phase === 'idle') {
    if (activeTool.value !== 'select') {
      const onCanvas = event.target === viewportElement.value?.querySelector('canvas')
      hoveredControl.value =
        viewport.hoverTransformControl?.(onCanvas ? event.clientX : null, event.clientY) ?? null
    }
    return
  }
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
  const axisKey = event.key.toLowerCase()
  if (event.altKey) {
    if (
      !editable &&
      !isDraft.value &&
      !event.repeat &&
      !event.ctrlKey &&
      !event.metaKey &&
      (axisKey === 'x' || axisKey === 'y' || axisKey === 'z')
    ) {
      event.preventDefault()
      toggleLock(axisKey)
    }
    return
  }

  if (manipulationState.value.phase !== 'idle') {
    if (event.key === 'Escape') {
      event.preventDefault()
      cancelDraft()
      return
    }
    if (editable) return

    const key = event.key.toLowerCase()
    if (key === 'shift' || key === 'control') {
      setManipulation(setGestureModifiers(manipulationState.value, event.shiftKey, event.ctrlKey))
      return
    }
    if (key === 'enter') {
      event.preventDefault()
      commitDraft()
    } else if (key === 'x' || key === 'y' || key === 'z') {
      event.preventDefault()
      setAxis(key, event.shiftKey)
    } else if (
      /^\d$/.test(key) ||
      key === '.' ||
      key === ',' ||
      key === '-' ||
      key === '/' ||
      key === 'tab' ||
      key === 'backspace'
    ) {
      event.preventDefault()
      flushDraft()
      setManipulation(
        setNumericInput(
          manipulationState.value,
          key === 'tab' && (event.shiftKey || event.ctrlKey) ? 'PreviousComponent' : event.key,
        ),
      )
    } else if (key === 'g' || key === 'r' || key === 's') {
      event.preventDefault()
      if (!event.repeat)
        selectTool(key === 'g' ? 'translation' : key === 'r' ? 'rotation' : 'scale')
    }
    return
  }

  if (editable || event.ctrlKey || event.metaKey) return

  const key = event.key.toLowerCase()
  if (key === 'escape') {
    if (toolConstraint.value) {
      toolConstraint.value = null
      syncToolGizmo()
    } else if (activeTool.value !== 'select') selectTool('select')
    return
  }
  if ((key === 'x' || key === 'y' || key === 'z') && !event.repeat) {
    event.preventDefault()
    if (activeTool.value === 'select') toggleLock(key)
    else armAxis(key, event.shiftKey)
    return
  }
  const viewAxis =
    event.code === 'Numpad1'
      ? 'z'
      : event.code === 'Numpad3'
        ? 'x'
        : event.code === 'Numpad7'
          ? 'y'
          : null
  if (viewAxis && !event.repeat) {
    event.preventDefault()
    toggleLock(viewAxis)
    return
  }
  if ((key === 'g' || key === 'r' || key === 's') && !event.repeat) {
    event.preventDefault()
    selectTool(key === 'g' ? 'translation' : key === 'r' ? 'rotation' : 'scale')
  }
}

const onKeyUp = (event: KeyboardEvent) => {
  if (isDraft.value && (event.key === 'Shift' || event.key === 'Control'))
    setManipulation(setGestureModifiers(manipulationState.value, event.shiftKey, event.ctrlKey))
}
const onContextMenu = (event: Event) => {
  if (isDraft.value || suppressNextContextMenu) event.preventDefault()
  suppressNextContextMenu = false
}
const onPointerCancel = () => {
  if (gizmoDrag) cancelDraft()
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
  window.addEventListener('keyup', onKeyUp)
  container.addEventListener('contextmenu', onContextMenu)
  window.addEventListener('pointermove', onPointerMove)
  window.addEventListener('pointerdown', onPointerDown)
  window.addEventListener('pointerup', onPointerUp)
  window.addEventListener('pointercancel', onPointerCancel)
})

onBeforeUnmount(() => {
  if (draftRafId !== null) {
    cancelAnimationFrame(draftRafId)
    draftRafId = null
  }
  viewport?.controls?.removeEventListener?.('change', updateReferenceSlice)
  window.removeEventListener('keydown', onKeyDown)
  window.removeEventListener('keyup', onKeyUp)
  viewportElement.value?.removeEventListener('contextmenu', onContextMenu)
  window.removeEventListener('pointermove', onPointerMove)
  window.removeEventListener('pointerdown', onPointerDown)
  window.removeEventListener('pointerup', onPointerUp)
  window.removeEventListener('pointercancel', onPointerCancel)

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
    <div
      ref="viewportElement"
      class="viewport"
      role="region"
      aria-label="Haruka 3D viewport"
      @pointerdown.capture="onViewportPointerDown"
    >
      <div class="camera-toolbar" role="toolbar" aria-label="Camera controls">
        <button type="button" aria-label="Locate Cube" title="Locate Cube" @click="locateCube">
          ◎ Locate Cube
        </button>
      </div>
      <div class="transform-tools" role="toolbar" aria-label="Transform tools">
        <button
          v-for="tool in tools"
          :key="tool.kind"
          type="button"
          :aria-label="tool.label"
          :title="tool.title"
          :aria-pressed="activeTool === tool.kind"
          @click="selectTool(tool.kind)"
        >
          <svg
            viewBox="0 0 20 20"
            width="20"
            height="20"
            fill="none"
            stroke="currentColor"
            stroke-width="1.5"
            stroke-linecap="round"
            stroke-linejoin="round"
            aria-hidden="true"
          >
            <path :d="tool.icon" />
          </svg>
        </button>
      </div>
      <div class="view-axis-controls">
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
            title="Lock X · Alt+X / Numpad 3 · Side view (YZ)"
            aria-keyshortcuts="Alt+X"
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
            title="Lock Y · Alt+Y / Numpad 7 · Top view (XZ)"
            aria-keyshortcuts="Alt+Y"
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
            title="Lock Z · Alt+Z / Numpad 1 · Front view (XY)"
            aria-keyshortcuts="Alt+Z"
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
      </div>
      <div
        v-if="!isDraft && !toolConstraint"
        class="grab-hint"
        :class="{ selected: manipulationState.selected }"
        aria-hidden="true"
      >
        G — Move · R — Rotate · S — Scale<br />X / Y / Z —
        {{ activeTool === 'select' ? 'lock view' : 'constrain axis' }}
      </div>
      <div
        v-if="!isDraft && toolConstraint"
        class="axis-constraint-hint"
        role="status"
        aria-live="polite"
      >
        {{ pendingConstraintLabel }}<br /><span>Drag object or control · Esc to clear</span>
      </div>
      <div v-if="isDraft" class="tool-hud" role="status" aria-live="polite">
        <div>{{ hudToolLabel }} · {{ hudAxisLabel }}</div>
        <div>{{ hudDeltaText }}</div>
        <div v-if="hudInputText">{{ hudInputText }}</div>
      </div>
      <div v-if="controlHint" class="control-hint" :style="controlHintPosition" aria-hidden="true">
        {{ controlHint }}
      </div>
    </div>
    <TransformStackPanel
      :state="stackState"
      :draft-operation="draftOperation"
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
  container-type: inline-size;
}

.viewport canvas {
  display: block;
  width: 100%;
  height: 100%;
}

.control-hint {
  position: absolute;
  z-index: 11;
  max-width: calc(100% - 8px);
  box-sizing: border-box;
  padding: 3px 6px;
  border: 1px solid #8b7946;
  border-radius: 3px;
  background: rgba(20, 21, 23, 0.94);
  color: #ffdf7a;
  font: 11px monospace;
  pointer-events: none;
  overflow-wrap: anywhere;
}

.camera-toolbar {
  position: absolute;
  top: 10px;
  left: 10px;
  pointer-events: none;
  z-index: 10;
}

.camera-toolbar button {
  pointer-events: auto;
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

.view-axis-controls {
  position: absolute;
  top: 10px;
  right: 112px;
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 6px;
  z-index: 10;
}

.view-lock-controls {
  display: flex;
  align-items: center;
  gap: 0;
  padding: 2px;
  background: color-mix(in srgb, var(--color-panel) 92%, transparent);
  border: 1px solid var(--color-border);
  border-radius: 4px;
  z-index: 10;
  user-select: none;
}

.transform-tools {
  position: absolute;
  top: 44px;
  left: 10px;
  display: flex;
  flex-direction: column;
  gap: 3px;
  z-index: 10;
}
.transform-tools button {
  display: grid;
  place-items: center;
  width: 30px;
  height: 30px;
  padding: 3px;
  background: var(--color-panel);
  color: var(--color-text-muted);
}
.transform-tools button[aria-pressed='true'] {
  color: var(--color-hair-light);
  border-color: var(--color-selection);
  background: color-mix(in srgb, var(--color-selection) 18%, var(--color-panel));
}

.view-lock-controls button {
  position: relative;
  min-width: 24px;
  height: 22px;
  padding: 0 4px;
  background: transparent;
  border: none;
  color: var(--color-interaction);
  font-family: inherit;
  font-size: 11px;
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
  max-width: calc(100% - 24px);
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
.axis-constraint-hint {
  position: absolute;
  left: 50px;
  bottom: 12px;
  max-width: calc(100% - 70px);
  padding: 4px 6px;
  border: 1px solid var(--color-selection);
  border-radius: 3px;
  background: var(--color-panel);
  color: var(--color-hair-light);
  font: 11px/1.5 monospace;
  overflow-wrap: anywhere;
  pointer-events: none;
}
.axis-constraint-hint span {
  color: var(--color-text-muted);
  font-size: 10px;
}

.grab-hint.selected {
  color: var(--color-selection);
  opacity: 1;
}

.tool-hud {
  position: absolute;
  bottom: 12px;
  left: 50px;
  max-width: calc(100% - 74px);
  overflow-wrap: anywhere;
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

@container (max-width: 320px) {
  .view-axis-controls {
    top: 44px;
  }
}

@media (max-width: 900px) {
  main {
    flex-direction: column;
    overflow-y: auto;
  }
  .viewport {
    flex: 0 0 40%;
    height: auto;
    min-height: 220px;
  }
}
</style>
