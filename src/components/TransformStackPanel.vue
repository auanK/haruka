<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import {
  addTransformOperation,
  createOperationId,
  createPivotOperation,
  getTransformSequence,
  resolveTransformStackState,
  setOperationPivotEnabled,
  updateTransformOperation,
  removeTransformOperation,
  moveTransformOperation,
  type StackEditResult,
  type TransformStackState,
  type TransformOperation,
} from '../app/transform-stack-state'
import { composeTransforms, type Transform } from '../domain'
import { createDefaultTransform } from '../ui/transform-stack'
import {
  deriveDestinationIndex,
  deriveRemainingInsertionSlot,
  isInteractiveDragTarget,
  mapRemainingSlotToOriginalSlot,
} from '../ui/transform-stack-dnd'
import TransformOperationEditor from './TransformOperationEditor.vue'
import JointTransformCard from './JointTransformCard.vue'
import type { DisplayPrecision } from '../ui/transform-stack'

const props = withDefaults(
  defineProps<{
    state: TransformStackState
    draftTransform?: Transform | null
    draftOperation?: TransformOperation | null
    precision?: DisplayPrecision
  }>(),
  {
    draftTransform: null,
    precision: 4,
  },
)
const emit = defineEmits<{ edit: [result: StackEditResult] }>()
const selectedType = ref<Transform['type']>('translation')
const expandedOperationId = ref<string | null>(null)
const setExpanded = (id: string, expanded: boolean) => {
  expandedOperationId.value = expanded ? id : null
}
const closeOutsideCard = (event: Event) => {
  if (!expandedOperationId.value || !(event.target instanceof Element)) return
  const card = event.target.closest('[data-operation-id]')
  if (card?.getAttribute('data-operation-id') !== expandedOperationId.value)
    expandedOperationId.value = null
}
const closeOnEscape = (event: KeyboardEvent) => {
  if (event.key === 'Escape') expandedOperationId.value = null
}
onMounted(() => {
  window.addEventListener('click', closeOutsideCard, true)
  window.addEventListener('keydown', closeOnEscape)
})
onBeforeUnmount(() => {
  window.removeEventListener('click', closeOutsideCard, true)
  window.removeEventListener('keydown', closeOnEscape)
})
const previewOperation = computed(
  () =>
    props.draftOperation ??
    (props.draftTransform ? { id: 'draft', transform: props.draftTransform } : null),
)
watch(
  () => [props.state.operations, previewOperation.value],
  () => {
    if (
      expandedOperationId.value &&
      !props.state.operations.some((op) => op.id === expandedOperationId.value) &&
      previewOperation.value?.id !== expandedOperationId.value
    )
      expandedOperationId.value = null
  },
)
const resolvedOperations = computed(() => resolveTransformStackState(props.state).operations)
const editOperation = (operation: TransformOperation, transform: Transform) =>
  emit('edit', updateTransformOperation(props.state, operation.id, transform))
const dragState = ref<{ operationId: string; insertionSlot: number | null } | null>(null)
let dragOrigin: EventTarget | null = null
const indicatorSlot = computed(() => {
  const drag = dragState.value
  if (!drag || drag.insertionSlot === null) return null
  const sourceIndex = props.state.operations.findIndex(({ id }) => id === drag.operationId)
  const destination = deriveDestinationIndex(
    sourceIndex,
    drag.insertionSlot,
    props.state.operations.length,
  )
  return destination === undefined || destination === sourceIndex ? null : drag.insertionSlot
})
const transformTypes = {
  translation: 'Translation',
  rotation: 'Rotation',
  scale: 'Scale',
  reflection: 'Reflection',
  shear: 'Shear',
}

const addOperation = () => {
  const id = createOperationId(props.state)
  const transform = createDefaultTransform(selectedType.value)
  const matrix = composeTransforms(getTransformSequence(props.state))
  const operation =
    transform.type === 'rotation' || transform.type === 'scale'
      ? createPivotOperation(id, transform, [matrix[3], matrix[7], matrix[11]], false)
      : { id, transform }
  emit('edit', addTransformOperation(props.state, operation))
}

const startDrag = (operationId: string, event: DragEvent) => {
  // Native dragstart can target the draggable article instead of the pressed control.
  const interactive = isInteractiveDragTarget(event.target) || isInteractiveDragTarget(dragOrigin)
  dragOrigin = null
  if (interactive) {
    event.preventDefault()
    dragState.value = null
    return
  }
  dragState.value = { operationId, insertionSlot: null }
  if (event.dataTransfer) {
    event.dataTransfer.effectAllowed = 'move'
    event.dataTransfer.setData('text/plain', operationId)
  }
}

const recordDragOrigin = (event: MouseEvent) => {
  dragOrigin = event.target
}

const dragOver = (event: DragEvent) => {
  if (!dragState.value) return
  event.preventDefault()
  if (event.dataTransfer) event.dataTransfer.dropEffect = 'move'
  const drag = dragState.value
  const sourceIndex = props.state.operations.findIndex(({ id }) => id === drag.operationId)
  const cards = Array.from((event.currentTarget as HTMLElement).querySelectorAll('article'))
    .filter((card) => card.dataset.operationId !== drag.operationId)
    .map((card) => {
      const bounds = card.getBoundingClientRect()
      return { top: bounds.top, bottom: bounds.top + bounds.height }
    })
  const currentSlot =
    drag.insertionSlot === null
      ? undefined
      : deriveDestinationIndex(sourceIndex, drag.insertionSlot, props.state.operations.length)
  const remainingSlot = deriveRemainingInsertionSlot(cards, event.clientY, sourceIndex, currentSlot)
  drag.insertionSlot =
    remainingSlot === undefined
      ? null
      : (mapRemainingSlotToOriginalSlot(
          sourceIndex,
          remainingSlot,
          props.state.operations.length,
        ) ?? null)
}

const endDrag = () => {
  dragState.value = null
  dragOrigin = null
}

const dropOperation = (event: DragEvent) => {
  const drag = dragState.value
  endDrag()
  if (!drag) return
  event.preventDefault()
  if (drag.insertionSlot === null) return
  const sourceIndex = props.state.operations.findIndex(({ id }) => id === drag.operationId)
  const destinationIndex = deriveDestinationIndex(
    sourceIndex,
    drag.insertionSlot,
    props.state.operations.length,
  )
  if (destinationIndex === undefined || destinationIndex === sourceIndex) return
  emit('edit', moveTransformOperation(props.state, drag.operationId, destinationIndex))
}
</script>

<template>
  <aside
    class="stack-panel"
    aria-labelledby="stack-title"
    @dragover="dragOver"
    @drop="dropOperation"
    @dragend="endDrag"
    @mouseup.capture="dragOrigin = null"
  >
    <header class="stack-header">
      <h1 id="stack-title">Transformation Stack</h1>
      <p>
        Matrix product: top → bottom.<br />
        Applied to points: bottom → top.
      </p>
      <form @submit.prevent="addOperation">
        <label class="visually-hidden" for="transform-type">Transform type</label>
        <select id="transform-type" v-model="selectedType" name="transform-type">
          <option v-for="(label, type) in transformTypes" :key="type" :value="type">
            {{ label }}
          </option>
        </select>
        <button type="submit" aria-label="Add Transform" title="Add Transform">+</button>
      </form>
    </header>
    <aside
      v-if="previewOperation"
      :data-operation-id="previewOperation.id"
      class="draft-card"
      aria-label="Draft transformation preview"
    >
      <JointTransformCard
        v-if="previewOperation.joint"
        :operation="previewOperation"
        :precision="precision"
        :expanded="expandedOperationId === previewOperation.id"
        @update:expanded="setExpanded(previewOperation.id, $event)"
        preview
      />
      <TransformOperationEditor v-else :operation="previewOperation" :precision="precision" preview>
        <template #title
          ><h2>{{ transformTypes[previewOperation.transform.type] }}</h2></template
        >
        <template #controls><span class="draft-badge">Preview</span></template>
      </TransformOperationEditor>
    </aside>
    <p v-if="state.operations.length === 0 && !previewOperation">No transformations.</p>
    <template v-for="(operation, index) in resolvedOperations" :key="operation.id">
      <div
        v-if="indicatorSlot === index"
        class="drop-indicator"
        :data-insertion-slot="index"
        aria-hidden="true"
      />
      <article
        :data-operation-id="operation.id"
        :class="{ dragging: dragState?.operationId === operation.id }"
        draggable="true"
        @mousedown.capture="recordDragOrigin"
        @dragstart="startDrag(operation.id, $event)"
      >
        <component
          :is="operation.joint ? JointTransformCard : TransformOperationEditor"
          :operation="operation"
          :precision="precision"
          v-bind="operation.joint ? { expanded: expandedOperationId === operation.id } : {}"
          v-on="
            operation.joint
              ? {
                  'update-pivot': (enabled: boolean) =>
                    emit('edit', setOperationPivotEnabled(state, operation.id, enabled)),
                  'update:expanded': (expanded: boolean) => setExpanded(operation.id, expanded),
                }
              : {}
          "
          @update-transform="(transform: Transform) => editOperation(operation, transform)"
        >
          <template #title>
            <h2>{{ transformTypes[operation.transform.type] }}</h2>
          </template>
          <template #controls>
            <div class="operation-controls">
              <button
                type="button"
                aria-label="Move up"
                title="Move up"
                :disabled="index === 0"
                @click="emit('edit', moveTransformOperation(state, operation.id, index - 1))"
              >
                ↑
              </button>
              <button
                type="button"
                aria-label="Move down"
                title="Move down"
                :disabled="index === state.operations.length - 1"
                @click="emit('edit', moveTransformOperation(state, operation.id, index + 1))"
              >
                ↓
              </button>
              <button
                class="remove"
                type="button"
                aria-label="Remove"
                title="Remove"
                @click="emit('edit', removeTransformOperation(state, operation.id))"
              >
                ×
              </button>
            </div>
          </template>
        </component>
      </article>
    </template>
    <div
      v-if="indicatorSlot === state.operations.length"
      class="drop-indicator"
      :data-insertion-slot="state.operations.length"
      aria-hidden="true"
    />
  </aside>
</template>

<style scoped>
.stack-panel {
  box-sizing: border-box;
  flex: 0 0 clamp(18rem, 26vw, 25rem);
  width: clamp(18rem, 26vw, 25rem);
  min-width: 0;
  height: 100%;
  min-height: 0;
  overflow-x: hidden;
  overflow-y: auto;
  padding: 0.5rem 0.6rem;
  border-left: 1px solid var(--color-border);
  border-top: 2px solid var(--color-selection-strong);
  background: var(--color-panel);
}

.stack-header {
  margin: -0.5rem -0.6rem 0.5rem;
  padding: 0.5rem 0.6rem;
  border-bottom: 1px solid var(--color-border);
}

h1 {
  margin: 0 0 0.2rem;
  font-size: 0.95rem;
  color: var(--color-text);
}
h2 {
  min-width: 0;
  margin: 0;
  font-size: 13px;
  font-weight: 600;
}
p {
  margin: 0 0 0.5rem;
  color: var(--color-text-muted);
  font-size: 0.75rem;
}
form {
  display: flex;
  align-items: center;
  gap: 0.25rem;
  margin: 0;
}
form select {
  flex: 1;
  min-width: 0;
  height: 24px;
  min-height: 24px;
  padding: 0.1rem 0.3rem;
  font-size: 11px;
  border-color: color-mix(in srgb, var(--color-selection) 55%, var(--color-border));
}
form select:hover {
  border-color: var(--color-selection);
}
form select option:checked {
  color: var(--color-text);
  background: var(--color-selection-strong);
}
@supports (appearance: base-select) {
  form select,
  form select::picker(select) {
    appearance: base-select;
  }
  form select {
    display: flex;
    align-items: center;
  }
  form select::picker-icon {
    content: '';
    box-sizing: border-box;
    width: 6px;
    height: 6px;
    margin-right: 2px;
    border-right: 1.5px solid currentColor;
    border-bottom: 1.5px solid currentColor;
    transform: translateY(-2px) rotate(45deg);
  }
  form select::picker(select) {
    padding: 0;
    border: 1px solid var(--color-text-subtle);
    border-radius: 0;
    background: var(--color-panel);
    font: inherit;
  }
  form select option {
    min-height: 24px;
    padding: 0 0.5rem;
    background: var(--color-panel);
  }
  form select option::checkmark {
    display: none;
  }
  form select option:checked,
  form select option:hover,
  form select option:focus {
    color: var(--color-text);
    background: var(--color-selection-strong);
    outline: none;
  }
  form select:has(option:hover) option:not(:hover) {
    background: var(--color-panel);
  }
}
select:focus-visible,
button:focus-visible,
.draft-matrix:focus-visible {
  outline: 2px solid var(--color-hair-light);
  outline-offset: 1px;
}
form button {
  width: 24px;
  height: 24px;
  min-height: 24px;
  font-size: 0.85rem;
  color: var(--color-text);
  border: 1px solid var(--color-selection);
  background: var(--color-selection-strong);
}
form button:hover:enabled {
  border-color: var(--color-hair-light);
  background: color-mix(in srgb, var(--color-selection) 25%, var(--color-selection-strong));
}
article {
  position: relative;
  margin-top: 0.4rem;
  padding: 0.25rem 0.35rem;
  border: 1px solid var(--color-border);
  border-left: 3px solid var(--color-selection-strong);
  border-radius: 3px;
  background: var(--color-surface);
  box-sizing: border-box;
  min-width: 0;
  width: 100%;
  cursor: grab;
}
article:has(
  :is(input, select, button, textarea, a, label, [contenteditable], [data-no-drag]):hover
) {
  cursor: auto;
}
.operation-controls {
  position: absolute;
  top: 0;
  right: 0;
  display: flex;
  align-items: center;
  gap: 1px;
  padding: 0;
  border-radius: 2px;
  background: transparent;
  z-index: 2;
}
.operation-controls button {
  width: 15px;
  height: 16px;
  min-height: 16px;
  padding: 0;
  font-size: 10px;
}
.dragging {
  cursor: grabbing;
}
.drop-indicator {
  position: relative;
  height: 2px;
  margin-top: 0.4rem;
  background: var(--color-selection);
  pointer-events: none;
}
.drop-indicator::before {
  content: '';
  position: absolute;
  left: 0;
  top: 50%;
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--color-selection);
  transform: translateY(-50%);
}
.operation-controls button:not(.remove):hover:enabled {
  border-color: var(--color-selection);
  color: var(--color-hair-light);
}
.remove {
  color: var(--color-danger);
}
.remove:hover:enabled {
  border-color: var(--color-danger);
}
.remove:focus-visible {
  outline-color: var(--color-danger);
}
.draft-card {
  box-sizing: border-box;
  margin-top: 0.5rem;
  padding: 0.25rem 0.35rem;
  border: 1px dashed var(--color-border);
  border-radius: 4px;
}
article:focus-within,
article.dragging,
.draft-card {
  border-color: color-mix(in srgb, var(--color-hair-light) 65%, var(--color-border));
  border-left: 3px solid var(--color-hair-light);
  background: color-mix(in srgb, var(--color-selection) 14%, var(--color-surface));
}
.draft-matrix {
  min-width: 0;
  overflow-x: auto;
}
.draft-card-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
  margin-bottom: 0.25rem;
}
.draft-title-group {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}
.draft-title-group h2 {
  margin: 0;
  font-size: 13px;
  font-weight: 600;
}
.draft-title-group .notation {
  color: var(--color-hair-light);
  font-size: 12px;
  font-weight: 500;
}
.draft-badge {
  font-size: 10px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  padding: 1px 6px;
  border-radius: 3px;
  color: var(--color-hair-light);
  background: color-mix(in srgb, var(--color-selection) 20%, transparent);
  border: 1px solid color-mix(in srgb, var(--color-selection) 40%, transparent);
}
@media (max-width: 900px) {
  .stack-panel {
    flex: 1 0 18rem;
    width: 100%;
    min-width: 0;
    max-width: none;
    height: auto;
    border-left: 0;
  }
}
</style>
