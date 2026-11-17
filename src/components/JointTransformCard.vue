<script setup lang="ts">
import { computed, ref } from 'vue'
import {
  getOperationDisplayMatrix,
  getOperationLocalPivot,
  type TransformOperation,
} from '../app/transform-stack-state'
import { composeTransforms, type Transform } from '../domain'
import { formatMatrixValue, type DisplayPrecision } from '../ui/transform-stack'
import { basisMatrix } from '../app/transform-gesture-math'
import Matrix4Grid from './Matrix4Grid.vue'
import TransformOperationEditor from './TransformOperationEditor.vue'

const props = withDefaults(
  defineProps<{
    operation: TransformOperation
    precision?: DisplayPrecision
    preview?: boolean
  }>(),
  { precision: 4, preview: false },
)
const emit = defineEmits<{
  'update-transform': [transform: Transform]
  'update-pivot': [enabled: boolean]
}>()
const expanded = ref(false)
const pivotEnabled = computed(() => props.operation.joint?.pivotEnabled !== false)
const matrix = computed(() => getOperationDisplayMatrix(props.operation))
const localFrame = computed(() => props.operation.joint?.basis)
const frameMatrix = computed(() => (localFrame.value ? basisMatrix(localFrame.value) : undefined))
const showFrame = computed(() =>
  localFrame.value?.some((axis, i) => axis.some((n, j) => n !== (i === j ? 1 : 0))),
)
const pivotFactors = computed(() => {
  const p = getOperationLocalPivot(props.operation)
  return [
    {
      key: 'after',
      label: 'T(P)',
      matrix: composeTransforms([{ type: 'translation', x: p[0], y: p[1], z: p[2] }]),
    },
    {
      key: 'before',
      label: 'T(−P)',
      matrix: composeTransforms([{ type: 'translation', x: -p[0], y: -p[1], z: -p[2] }]),
    },
  ]
})
</script>

<template>
  <div class="joint-transform">
    <div class="main-matrix">
      <TransformOperationEditor
        :operation="operation"
        :precision="precision"
        :matrix="matrix"
        :preview="preview"
        @update-transform="emit('update-transform', $event)"
      >
        <template #title>
          <button
            type="button"
            class="composition-toggle"
            :aria-expanded="expanded"
            :aria-label="expanded ? 'Collapse composition' : 'Expand composition'"
            @click="expanded = !expanded"
          >
            <span aria-hidden="true">{{ expanded ? '▾' : '▸' }}</span>
          </button>
          <slot name="title"
            ><h2>{{ operation.transform.type === 'rotation' ? 'Rotation' : 'Scale' }}</h2></slot
          >
          <span
            v-if="localFrame"
            class="pivot-indicator"
            title="Matrix expressed in the fixed local axes of this gesture"
            >Local</span
          >
          <span
            v-if="pivotEnabled"
            class="pivot-indicator"
            :title="
              pivotEnabled
                ? 'Around own center; expand for fixed pivot translations'
                : 'Around world origin; pivot disabled'
            "
            >{{ '↔ P' }}</span
          >
        </template>
        <template #controls>
          <span v-if="preview" class="preview-badge">Preview</span>
          <slot name="controls" />
        </template>
      </TransformOperationEditor>
    </div>
    <section v-if="expanded" class="composition" aria-label="Fixed pivot composition">
      <label class="pivot-toggle">
        <input
          type="checkbox"
          aria-label="Use own center"
          :checked="pivotEnabled"
          :disabled="preview"
          @change="emit('update-pivot', ($event.target as HTMLInputElement).checked)"
        />
        Own center
      </label>
      <span class="pivot-note">{{
        pivotEnabled ? 'Automatic translation · fixed' : 'World origin · pivot bypassed'
      }}</span>
      <div class="pivot-factor-grid" :class="{ inactive: !pivotEnabled }">
        <div v-for="factor in pivotFactors" :key="factor.key" class="fixed-factor">
          <div class="factor-label">{{ factor.label }} <span>Fixed</span></div>
          <div
            class="joint-matrix"
            tabindex="0"
            role="region"
            :aria-label="factor.label + ' matrix, fixed'"
          >
            <Matrix4Grid :matrix="factor.matrix" :precision="precision" caption="" />
          </div>
        </div>
      </div>
      <div v-if="showFrame && frameMatrix" class="fixed-frame">
        <span>Fixed local frame B · M = B · Mlocal · Bᵀ</span>
        <table aria-label="Fixed local coordinate frame">
          <tbody>
            <tr v-for="row in [0, 1, 2]" :key="row">
              <td v-for="column in [0, 1, 2]" :key="column">
                {{ formatMatrixValue(frameMatrix[row * 4 + column]!, precision) }}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>
  </div>
</template>

<style scoped>
.fixed-frame {
  flex: 0 0 100%;
  color: var(--color-text-muted);
  font: 10px monospace;
}
.fixed-frame table {
  width: 100%;
  margin-top: 2px;
  background: var(--color-input);
  border-collapse: collapse;
}
.fixed-frame td {
  padding: 1px 3px;
  text-align: right;
}

.joint-transform :deep(.operation-matrix) {
  font-size: 11px;
}
.joint-transform :deep(.operation-matrix td) {
  min-width: 3ch;
  padding: 2px 3px;
}
.joint-transform :deep(.cell-control) {
  min-height: 22px;
  line-height: 18px;
}
.joint-transform :deep(input.cell-control) {
  min-width: 4ch;
}
.joint-transform,
.main-matrix {
  min-width: 0;
}
.main-matrix {
  position: relative;
}
h2 {
  margin: 0;
  font-size: 13px;
  font-weight: 600;
}
.composition-toggle {
  flex: 0 0 18px;
  width: 18px;
  min-height: 22px;
  padding: 0 2px;
  border: 0;
  background: transparent;
  color: var(--color-text-muted);
  font: 11px monospace;
}
.composition-toggle:hover:enabled {
  color: var(--color-hair-light);
  background: transparent;
}
.pivot-indicator {
  color: var(--color-text-muted);
  font: 10px monospace;
  cursor: help;
}
.composition {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 0.3rem;
  margin-top: 0.3rem;
}
.pivot-toggle {
  display: flex;
  align-items: center;
  gap: 3px;
  font-size: 11px;
  color: var(--color-text-muted);
}
.pivot-toggle input {
  margin: 0;
  accent-color: var(--color-selection);
}
.pivot-note {
  margin-left: auto;
  color: var(--color-text-subtle);
  font-size: 10px;
}
.pivot-factor-grid {
  flex: 0 0 100%;
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0.35rem;
}
.pivot-factor-grid.inactive {
  opacity: 0.45;
}
.fixed-factor {
  min-width: 0;
  padding: 2px;
  border-left: 2px solid var(--color-border);
  background: var(--color-panel);
}
.factor-label {
  display: flex;
  justify-content: space-between;
  color: var(--color-text-muted);
  font-size: 10px;
}
.factor-label span {
  color: var(--color-text-subtle);
}
.joint-matrix {
  min-width: 0;
  overflow-x: auto;
}
.fixed-factor :deep(table) {
  font-size: 10px;
  line-height: 1.15;
  margin-top: 2px;
}
.fixed-factor :deep(td) {
  min-width: 2ch;
  padding: 1px 2px;
}
.preview-badge {
  position: absolute;
  top: 0;
  right: 0;
  padding: 1px 5px;
  color: var(--color-hair-light);
  font-size: 10px;
  border: 1px solid var(--color-selection-strong);
  border-radius: 2px;
}
</style>
