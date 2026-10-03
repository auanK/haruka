<script setup lang="ts">
import { computed, nextTick, reactive, ref } from 'vue'
import type { TransformOperation } from '../app/transform-stack-state'
import { toMatrix, type ReflectionPlane, type RotationAxis, type Transform } from '../domain'
import Matrix4Grid from './Matrix4Grid.vue'
import { deriveTransformMatrixCells, type TransformNumberField } from '../ui/transform-matrix'
import { degreesToRadians, formatMatrixValue, parseFiniteNumber } from '../ui/transform-stack'

const props = defineProps<{ operation: TransformOperation }>()
const emit = defineEmits<{ 'update-transform': [transform: Transform] }>()
const axes = ['x', 'y', 'z'] as const
const editor = ref<HTMLElement | null>(null)
const transform = computed(() => props.operation.transform)
const matrix = computed(() => toMatrix(transform.value))
const cells = computed(() => deriveTransformMatrixCells(transform.value))
const notation = computed(() => {
  const current = transform.value
  if (current.type === 'reflection') return `Ref${current.plane.toUpperCase()}`
  return { translation: 'T(x, y, z)', scale: 'S(sx, sy, sz)', shear: 'H(kᵢⱼ)', rotation: '' }[
    current.type
  ]
})
const drafts = reactive<Partial<Record<TransformNumberField | 'angle', string>>>({})
const activeRotationCell = ref<number>()

const updateNumber = (field: TransformNumberField | 'angle', event: Event): void => {
  const text = (event.target as HTMLInputElement).value
  drafts[field] = text
  const value = parseFiniteNumber(text)
  if (value === undefined) return
  if (field === 'angle') {
    if (transform.value.type !== 'rotation') return
    const angle = degreesToRadians(value)
    if (transform.value.angle === angle) return
    emit('update-transform', {
      ...transform.value,
      angle,
    })
    return
  }
  if ((transform.value as Record<string, unknown>)[field] === value) return
  emit('update-transform', {
    ...transform.value,
    [field]: value,
  } as Transform)
}

const blurNumber = (field: TransformNumberField) => {
  delete drafts[field]
}

const beginAngleEdit = async (index: number) => {
  delete drafts.angle
  activeRotationCell.value = index
  await nextTick()
  const input = editor.value?.querySelector<HTMLInputElement>('input[name="angle"]')
  input?.focus()
  input?.select()
}

const endAngleEdit = async (restoreFocus = false) => {
  const index = activeRotationCell.value
  activeRotationCell.value = undefined
  delete drafts.angle
  if (restoreFocus && index !== undefined) {
    await nextTick()
    editor.value?.querySelector<HTMLButtonElement>(`td[data-index="${index}"] button`)?.focus()
  }
}

const selectAxis = (axis: RotationAxis) => {
  const current = transform.value
  if (current.type !== 'rotation' || current.axis === axis) return
  void endAngleEdit()
  emit('update-transform', { ...current, axis })
}

const selectPlane = (plane: ReflectionPlane) => {
  const current = transform.value
  if (current.type === 'reflection' && current.plane !== plane) {
    emit('update-transform', { ...current, plane })
  }
}
</script>

<template>
  <header class="operation-header">
    <slot name="title" />
    <span class="notation">
      <template v-if="transform.type === 'rotation'">
        <span
          >R<sub>{{ transform.axis }}</sub
          >(θ)</span
        >
        <span class="axis-selector" role="group" aria-label="Rotation axis">
          <button
            v-for="axis in axes"
            :key="axis"
            type="button"
            :aria-label="`Rotation axis ${axis.toUpperCase()}`"
            :title="`Rotation axis ${axis.toUpperCase()}`"
            :aria-pressed="transform.axis === axis"
            @click="selectAxis(axis)"
          >
            {{ axis.toUpperCase() }}
          </button>
        </span>
      </template>
      <template v-else>{{ notation }}</template>
    </span>
    <slot name="controls" />
  </header>
  <div ref="editor" class="operation-editor">
    <Matrix4Grid
      :matrix="matrix"
      caption=""
      class="operation-matrix"
      :class="{ 'rotation-matrix': transform.type === 'rotation' }"
    >
      <template #cell="{ index }">
        <input
          v-if="cells[index]!.kind === 'number'"
          class="cell-control"
          type="number"
          step="any"
          :name="cells[index]!.field"
          :value="drafts[cells[index]!.field] ?? cells[index]!.value"
          :aria-label="cells[index]!.label"
          :title="cells[index]!.label"
          @input="updateNumber(cells[index]!.field, $event)"
          @blur="blurNumber(cells[index]!.field)"
        />
        <template v-else-if="cells[index]!.kind === 'rotation'">
          <span v-if="activeRotationCell === index" class="angle-editor">
            <span aria-hidden="true">{{ cells[index]!.expression }}(</span>
            <input
              name="angle"
              type="number"
              step="any"
              :value="drafts.angle ?? formatMatrixValue(cells[index]!.degrees)"
              :aria-label="cells[index]!.label"
              :title="cells[index]!.label"
              @input="updateNumber('angle', $event)"
              @blur="endAngleEdit()"
              @keydown.enter.prevent="endAngleEdit(true)"
              @keydown.esc.prevent="endAngleEdit(true)"
            />
            <span aria-hidden="true">°)</span>
          </span>
          <button
            v-else
            class="cell-control"
            type="button"
            :aria-label="cells[index]!.label"
            :title="cells[index]!.label"
            @click="beginAngleEdit(index)"
            @keydown.enter.prevent="beginAngleEdit(index)"
          >
            {{ cells[index]!.text }}
          </button>
        </template>
        <button
          v-else-if="cells[index]!.kind === 'reflection'"
          class="cell-control"
          type="button"
          :aria-label="cells[index]!.label"
          :title="cells[index]!.label"
          :aria-pressed="cells[index]!.active"
          @click="selectPlane(cells[index]!.plane)"
        >
          {{ cells[index]!.text }}
        </button>
        <span v-else>{{ cells[index]!.text }}</span>
      </template>
    </Matrix4Grid>
  </div>
</template>

<style scoped>
.operation-header {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 0.25rem;
  margin-bottom: 0.2rem;
  min-height: 22px;
  padding-inline-end: 76px;
}

.operation-editor {
  overflow-x: auto;
}

.notation {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 0.25rem;
  min-height: 18px;
  color: var(--color-selection);
  font-size: 12px;
  font-weight: 500;
  white-space: nowrap;
}

.axis-selector {
  display: flex;
  gap: 1px;
}

.axis-selector button {
  min-height: 20px;
  padding: 0 5px;
  font-size: 11px;
}

.operation-matrix {
  margin-top: 0;
}

.operation-matrix :deep(td) {
  text-align: center;
  white-space: nowrap;
}

.cell-control,
.angle-editor {
  box-sizing: border-box;
  min-height: 24px;
  border: 1px solid color-mix(in srgb, var(--color-selection) 15%, var(--color-border));
  border-radius: 2px;
  background: color-mix(in srgb, var(--color-selection) 16%, var(--color-input));
  color: inherit;
  font: inherit;
  line-height: 20px;
  text-align: center;
  white-space: nowrap;
}

input.cell-control {
  field-sizing: content;
  width: auto;
  min-width: 5ch;
  max-width: 24ch;
  padding: 0 0.3rem;
}

button.cell-control {
  width: 100%;
  padding: 0 4px;
}

input {
  appearance: textfield;
  cursor: text;
}

input::-webkit-inner-spin-button,
input::-webkit-outer-spin-button {
  appearance: none;
}

.cell-control:hover,
.axis-selector button:hover:enabled {
  border-color: var(--color-interaction);
}

.axis-selector button:not([aria-pressed='true']):hover:enabled {
  color: var(--color-interaction-light);
}

.cell-control:focus-visible,
.angle-editor:focus-within {
  outline: 2px solid var(--color-interaction);
  outline-offset: -1px;
  border-color: var(--color-interaction);
}

.cell-control[aria-pressed='true'],
.axis-selector button[aria-pressed='true'] {
  background: var(--color-selection-strong);
  border-color: var(--color-selection);
  color: var(--color-text);
  font-weight: 600;
}

.angle-editor {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: max-content;
  padding: 0 4px;
}

.angle-editor input {
  field-sizing: content;
  width: auto;
  min-width: 5ch;
  max-width: 24ch;
  min-height: 0;
  height: 20px;
  padding: 0 0.35rem;
  border: 0;
  border-radius: 0;
  background: transparent;
  color: inherit;
  font: inherit;
  text-align: center;
}

.angle-editor input:focus-visible {
  outline: none;
}
</style>
