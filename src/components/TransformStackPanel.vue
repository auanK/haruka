<script setup lang="ts">
import { computed, ref } from 'vue'
import {
  addTransformOperation,
  createOperationId,
  updateTransformOperation,
  removeTransformOperation,
  moveTransformOperation,
  type StackEditResult,
  type TransformStackState,
} from '../app/transform-stack-state'
import { toMatrix, type Transform } from '../domain'
import { createDefaultTransform } from '../ui/transform-stack'
import {
  deriveDestinationIndex,
  deriveRemainingInsertionSlot,
  isInteractiveDragTarget,
  mapRemainingSlotToOriginalSlot,
} from '../ui/transform-stack-dnd'
import Matrix4Grid from './Matrix4Grid.vue'
import TransformOperationEditor from './TransformOperationEditor.vue'
import type { DisplayPrecision } from '../ui/transform-stack'

const props = withDefaults(
  defineProps<{
    state: TransformStackState
    draftTransform?: Transform | null
    precision?: DisplayPrecision
  }>(),
  {
    draftTransform: null,
    precision: 4,
  },
)
const emit = defineEmits<{ edit: [result: StackEditResult] }>()
const selectedType = ref<Transform['type']>('translation')
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

const addOperation = () =>
  emit(
    'edit',
    addTransformOperation(props.state, {
      id: createOperationId(props.state),
      transform: createDefaultTransform(selectedType.value),
    }),
  )

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
    <aside v-if="draftTransform" class="draft-card" aria-label="Draft transformation preview">
      <div class="draft-card-header">
        <div class="draft-title-group">
          <h2>{{ transformTypes[draftTransform.type] }}</h2>
          <span class="notation">{{
            draftTransform.type === 'translation' ? 'T(x, y, z)' : ''
          }}</span>
        </div>
        <span class="draft-badge">Preview</span>
      </div>
      <Matrix4Grid
        :matrix="toMatrix(draftTransform)"
        :precision="precision"
        caption=""
        class="operation-matrix"
      />
    </aside>
    <p v-if="state.operations.length === 0 && !draftTransform">No transformations.</p>
    <template v-for="(operation, index) in state.operations" :key="operation.id">
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
        <TransformOperationEditor
          :operation="operation"
          :precision="precision"
          @update-transform="emit('edit', updateTransformOperation(state, operation.id, $event))"
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
        </TransformOperationEditor>
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
  flex: 0 0 auto;
  width: max-content;
  min-width: 22rem;
  max-width: max(22rem, min(28rem, 32vw));
  height: 100%;
  min-height: 0;
  overflow-x: hidden;
  overflow-y: auto;
  padding: 0.5rem 0.6rem;
  border-left: 1px solid var(--color-border);
  border-top: 2px solid var(--color-selection);
  background: var(--color-panel);
}

h1 {
  margin: 0 0 0.2rem;
  font-size: 0.95rem;
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
  margin-bottom: 0.5rem;
}
form select {
  flex: 1;
  min-width: 0;
  height: 24px;
  min-height: 24px;
  padding: 0.1rem 0.3rem;
  font-size: 11px;
  border-color: color-mix(in srgb, var(--color-interaction) 30%, var(--color-border));
}
form select:hover {
  border-color: var(--color-interaction);
}
form button {
  width: 24px;
  height: 24px;
  min-height: 24px;
  font-size: 0.85rem;
  color: var(--color-interaction-light);
  border: 1px solid color-mix(in srgb, var(--color-interaction) 45%, var(--color-border));
  background: color-mix(in srgb, var(--color-interaction) 14%, var(--color-surface));
}
form button:hover:enabled {
  color: #fff;
  border-color: var(--color-interaction);
  background: color-mix(in srgb, var(--color-interaction) 26%, var(--color-surface));
}
article {
  position: relative;
  margin-top: 0.4rem;
  padding: 0.35rem 0.45rem;
  border: 1px solid var(--color-border);
  border-left: 3px solid var(--color-uniform-red);
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
  top: 0.25rem;
  right: 0.35rem;
  display: flex;
  align-items: center;
  gap: 2px;
  padding: 1px;
  border-radius: 2px;
  background: var(--color-surface);
  z-index: 2;
}
.operation-controls button {
  width: 20px;
  height: 20px;
  min-height: 20px;
  padding: 0;
  font-size: 11px;
}
.dragging {
  cursor: grabbing;
  background: color-mix(in srgb, var(--color-selection) 10%, var(--color-surface));
  border-color: color-mix(in srgb, var(--color-selection) 35%, var(--color-border));
  border-left-color: var(--color-uniform-red);
}
.drop-indicator {
  position: relative;
  height: 2px;
  margin-top: 0.4rem;
  background: var(--color-interaction);
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
  background: var(--color-interaction);
  transform: translateY(-50%);
}
.operation-controls button:not(.remove):hover:enabled {
  border-color: var(--color-interaction);
  color: var(--color-interaction-light);
}
.remove {
  color: var(--color-danger);
}
.remove:hover:enabled {
  border-color: var(--color-danger);
}
.draft-card {
  box-sizing: border-box;
  margin-top: 0.5rem;
  padding: 0.5rem;
  border: 1px dashed var(--color-interaction);
  border-radius: 4px;
  background: color-mix(in srgb, var(--color-interaction) 8%, var(--color-surface));
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
  color: var(--color-selection);
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
  color: var(--color-interaction-light);
  background: color-mix(in srgb, var(--color-interaction) 20%, transparent);
  border: 1px solid color-mix(in srgb, var(--color-interaction) 40%, transparent);
}
@media (max-width: 640px) {
  .stack-panel {
    flex: 1;
    width: 100%;
    min-width: 0;
    max-width: none;
    height: auto;
    border-top: 2px solid var(--color-selection);
    border-left: 0;
  }
}
</style>
