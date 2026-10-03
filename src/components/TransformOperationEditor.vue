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
  const value = parseFiniteNumber(text)
  if (value === undefined || field === 'angle') drafts[field] = text
  else delete drafts[field]
  if (value === undefined) return
  emit('update-transform', {
    ...transform.value,
    [field]: field === 'angle' ? degreesToRadians(value) : value,
  })
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
  gap: 0.3rem;
  margin-bottom: 0.2rem;
}

.operation-editor {
  /* x: absurd angles scroll inside the card; y: only sub-pixel table rounding, never content. */
  overflow: auto hidden;
}

.notation {
  display: flex;
  align-items: center;
  gap: 0.3rem;
  min-height: 18px;
  color: var(--color-text-muted);
  font-size: 11px;
  white-space: nowrap;
}

.axis-selector {
  display: flex;
  gap: 2px;
}

.axis-selector button {
  min-height: 18px;
  padding: 0 5px;
  font-size: 10px;
}

.operation-matrix {
  width: 100%;
  margin-top: 0;
  table-layout: fixed;
  font-size: 11px;
  line-height: 1.2;
}

.operation-matrix :deep(td) {
  padding: 0.04rem;
  text-align: center;
}

.rotation-matrix {
  table-layout: auto;
}

.rotation-matrix :deep(td) {
  width: auto;
  min-width: 2ch;
}

.cell-control,
.angle-editor {
  box-sizing: border-box;
  width: 100%;
  min-width: 0;
  min-height: 0;
  height: 16px;
  padding: 0 1px;
  border: 1px solid var(--color-border);
  border-radius: 2px;
  background: color-mix(in srgb, var(--color-accent) 8%, var(--color-input));
  color: inherit;
  font: inherit;
  line-height: 14px;
  text-align: center;
  white-space: nowrap;
}

input {
  appearance: textfield;
  cursor: text;
}

input::-webkit-inner-spin-button,
input::-webkit-outer-spin-button {
  appearance: none;
}

.cell-control:hover {
  border-color: var(--color-accent);
}

.cell-control:focus-visible,
.angle-editor:focus-within {
  outline: 2px solid var(--color-accent);
  outline-offset: -1px;
}

.cell-control[aria-pressed='true'],
.axis-selector button[aria-pressed='true'] {
  background: color-mix(in srgb, var(--color-accent) 25%, var(--color-input));
  color: var(--color-text);
  font-weight: 600;
}

.angle-editor {
  display: flex;
  align-items: center;
  justify-content: center;
  white-space: nowrap;
}

.angle-editor input {
  width: 7ch;
  min-width: 0;
  min-height: 0;
  height: 14px;
  padding: 0;
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
