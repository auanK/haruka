<script setup lang="ts">
import { computed, nextTick, reactive, ref } from 'vue'
import type { TransformOperation } from '../app/transform-stack-state'
import {
  toMatrix,
  type Matrix4,
  type ReflectionPlane,
  type RotationAxis,
  type Transform,
} from '../domain'
import Matrix4Grid from './Matrix4Grid.vue'
import { deriveTransformMatrixCells, type TransformNumberField } from '../ui/transform-matrix'
import {
  degreesToRadians,
  formatMatrixValue,
  parseFiniteNumber,
  type DisplayPrecision,
} from '../ui/transform-stack'

const props = withDefaults(
  defineProps<{
    operation: TransformOperation
    precision?: DisplayPrecision
    /** Pivot offsets are derived; only semantic cells in the linear block can emit edits. */
    matrix?: Matrix4
    preview?: boolean
  }>(),
  {
    precision: 4,
    preview: false,
  },
)
const emit = defineEmits<{ 'update-transform': [transform: Transform] }>()
const axes = ['x', 'y', 'z'] as const
const editor = ref<HTMLElement | null>(null)
const transform = computed(() => props.operation.transform)
const matrix = computed(() => props.matrix ?? toMatrix(transform.value))
const cells = computed(() => deriveTransformMatrixCells(transform.value))
const notation = computed(() => {
  const current = transform.value
  if (current.type === 'reflection') return `Ref${current.plane.toUpperCase()}`
  return { translation: 'T(x, y, z)', scale: 'S(sx, sy, sz)', shear: 'H(kᵢⱼ)', rotation: '' }[
    current.type
  ]
})
const drafts = reactive<Partial<Record<string, string>>>({})
const activeRotationCell = ref<number>()
const formatRotationText = (expression: string, degrees: number): string =>
  `${expression}(${formatMatrixValue(degrees, props.precision)}°)`
const hasPivotColumn = computed(
  () =>
    (props.operation.joint?.pivotEnabled !== false &&
      Boolean(props.operation.joint?.pivot.some((n) => Math.abs(n) > 1e-9))) ||
    [3, 7, 11].some((i) => Math.abs(matrix.value[i]!) > 1e-9),
)

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
            :disabled="preview"
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
      :precision="precision"
      caption=""
      class="operation-matrix"
      :class="
        transform.type === 'rotation'
          ? [
              'rotation-matrix',
              `rotation-axis-${transform.axis}`,
              { 'has-pivot-column': hasPivotColumn },
            ]
          : undefined
      "
    >
      <template #cell="{ index }">
        <input
          v-if="cells[index]!.kind === 'number'"
          class="cell-control"
          type="number"
          step="any"
          :name="cells[index]!.field"
          :readonly="preview"
          :value="drafts[cells[index]!.field] ?? formatMatrixValue(cells[index]!.value, precision)"
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
              :value="drafts.angle ?? formatMatrixValue(cells[index]!.degrees, precision)"
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
            class="cell-control rotation-cell"
            type="button"
            :aria-label="cells[index]!.label"
            :title="`${cells[index]!.text} · edit angle`"
            :disabled="preview"
            @click="beginAngleEdit(index)"
            @keydown.enter.prevent="beginAngleEdit(index)"
          >
            <span
              class="rotation-label"
              :style="{
                '--expr-chars':
                  formatRotationText(cells[index]!.expression, cells[index]!.degrees).length * 0.61,
              }"
              >{{ formatRotationText(cells[index]!.expression, cells[index]!.degrees) }}</span
            >
          </button>
        </template>
        <button
          v-else-if="cells[index]!.kind === 'reflection'"
          class="cell-control"
          type="button"
          :aria-label="cells[index]!.label"
          :title="cells[index]!.label"
          :aria-pressed="cells[index]!.active"
          :disabled="preview"
          @click="selectPlane(cells[index]!.plane)"
        >
          {{ cells[index]!.text }}
        </button>
        <span v-else>{{ formatMatrixValue(matrix[index]!, precision) }}</span>
      </template>
    </Matrix4Grid>
  </div>
</template>

<style scoped>
.operation-header {
  position: relative;
  display: flex;
  align-items: center;
  flex-wrap: nowrap;
  gap: 3px;
  box-sizing: border-box;
  margin-bottom: 4px;
  min-height: 20px;
  padding-inline-end: 48px;
}
.operation-header :deep(h2) {
  flex: 0 0 auto;
  margin: 0;
  font-size: clamp(11px, 1vw, 12px);
  line-height: 18px;
  white-space: nowrap;
}
.operation-editor {
  min-width: 0;
}
.notation {
  display: inline-flex;
  align-items: center;
  flex-wrap: nowrap;
  flex: 0 1 auto;
  gap: 2px;
  min-width: 0;
  min-height: 18px;
  color: var(--color-hair-light);
  font-size: 11px;
  white-space: nowrap;
}
.axis-selector {
  display: inline-flex;
  flex: 0 0 auto;
  overflow: hidden;
  border: 1px solid var(--color-border);
  border-radius: 3px;
  background: var(--color-input);
}
.axis-selector button {
  box-sizing: border-box;
  width: 15px;
  height: 16px;
  min-height: 16px;
  padding: 0;
  border: 0;
  border-right: 1px solid var(--color-border);
  border-radius: 0;
  color: var(--color-text-muted);
  background: transparent;
  font-size: 10px;
  line-height: 14px;
}
.axis-selector button:last-child {
  border-right: 0;
}
.operation-matrix {
  margin-top: 0;
}
.operation-matrix :deep(td) {
  height: 27px;
  padding: 2.5px 1.5px;
  text-align: center;
}
.rotation-matrix {
  --rot-trig: 39%;
  --rot-axis: 11%;
  --rot-offset: 11%;
}
.rotation-matrix.has-pivot-column {
  --rot-trig: 34%;
  --rot-axis: 10%;
  --rot-offset: 22%;
}
.rotation-matrix :deep(td[data-column='3']) {
  width: var(--rot-offset);
}
.rotation-axis-x :deep(td[data-column='0']),
.rotation-axis-y :deep(td[data-column='1']),
.rotation-axis-z :deep(td[data-column='2']) {
  width: var(--rot-axis);
}
.rotation-axis-x :deep(td[data-column='1']),
.rotation-axis-x :deep(td[data-column='2']),
.rotation-axis-y :deep(td[data-column='0']),
.rotation-axis-y :deep(td[data-column='2']),
.rotation-axis-z :deep(td[data-column='0']),
.rotation-axis-z :deep(td[data-column='1']) {
  width: var(--rot-trig);
}
.cell-control,
.angle-editor {
  box-sizing: border-box;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  min-width: 0;
  min-height: 22px;
  height: 22px;
  padding: 0 1px;
  border: 1px solid color-mix(in srgb, var(--color-selection) 15%, var(--color-border));
  border-radius: 2px;
  background: color-mix(in srgb, var(--color-selection) 16%, var(--color-input));
  color: inherit;
  font: inherit;
  line-height: 18px;
  text-align: center;
  white-space: nowrap;
}
input.cell-control {
  display: block;
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
  border-color: var(--color-selection);
}
.axis-selector button:not([aria-pressed='true']):hover:enabled {
  color: var(--color-hair-light);
}
.cell-control:focus-visible,
.axis-selector button:focus-visible,
.angle-editor:focus-within {
  outline: 1px solid var(--color-hair-light);
  outline-offset: -1px;
  border-color: var(--color-selection);
}
.cell-control[aria-pressed='true'],
.axis-selector button[aria-pressed='true'] {
  background: var(--color-selection-strong);
  color: var(--color-text);
}
.operation-matrix :deep(td:has(.angle-editor)) {
  position: relative;
  overflow: visible;
}
.angle-editor {
  position: absolute;
  top: 50%;
  left: 0;
  transform: translateY(-50%);
  z-index: 5;
  width: max-content;
  min-width: 100%;
  min-height: 24px;
  height: 24px;
  padding: 0 3px;
  background: var(--color-input);
  box-shadow: 0 0 0 1px var(--color-selection);
}
.operation-matrix :deep(td[data-column='2'] .angle-editor) {
  left: auto;
  right: 0;
}
.rotation-cell {
  display: flex;
  container-type: inline-size;
  overflow: hidden;
  padding: 0 1px;
}
.rotation-label {
  display: block;
  font-size: min(1em, calc((100cqw - 2px) / var(--expr-chars)));
  line-height: 18px;
  white-space: nowrap;
}
.angle-editor input {
  flex: 0 1 auto;
  box-sizing: border-box;
  field-sizing: content;
  width: auto;
  min-width: 5ch;
  max-width: 18ch;
  min-height: 0;
  height: 18px;
  padding: 0 1px;
  border: 0;
  background: transparent;
  color: inherit;
  font: inherit;
  text-align: center;
}
.angle-editor input:focus-visible {
  outline: none;
}
</style>
