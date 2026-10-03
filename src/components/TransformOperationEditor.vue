<script setup lang="ts">
import { computed, reactive } from 'vue'
import type { TransformOperation } from '../app/transform-stack-state'
import { toMatrix, type Transform } from '../domain'
import Matrix4Grid from './Matrix4Grid.vue'
import { degreesToRadians, parseFiniteNumber, radiansToDegrees } from '../ui/transform-stack'

const props = defineProps<{ operation: TransformOperation }>()
const emit = defineEmits<{ 'update-transform': [transform: Transform] }>()
const coordinates = ['x', 'y', 'z'] as const
const planes = ['xy', 'xz', 'yz'] as const
const shearCoefficients = ['kxy', 'kxz', 'kyx', 'kyz', 'kzx', 'kzy'] as const
const matrix = computed(() => toMatrix(props.operation.transform))
type NumberField = (typeof coordinates)[number] | (typeof shearCoefficients)[number] | 'angle'
const drafts = reactive<Partial<Record<NumberField, string>>>({})

const updateNumber = (field: NumberField, event: Event): void => {
  const text = (event.target as HTMLInputElement).value
  const value = parseFiniteNumber(text)
  if (value === undefined) {
    drafts[field] = text
    return
  }
  delete drafts[field]
  emit('update-transform', {
    ...props.operation.transform,
    [field]: field === 'angle' ? degreesToRadians(value) : value,
  })
}

const updateChoice = (event: Event): void => {
  const value = (event.target as HTMLSelectElement).value
  const transform = props.operation.transform
  if (transform.type === 'rotation') {
    const axis = coordinates.find((axis) => axis === value)
    if (axis) emit('update-transform', { ...transform, axis })
  } else if (transform.type === 'reflection') {
    const plane = planes.find((plane) => plane === value)
    if (plane) emit('update-transform', { ...transform, plane })
  }
}
</script>

<template>
  <div class="operation-editor">
    <div
      v-if="operation.transform.type === 'translation' || operation.transform.type === 'scale'"
      class="number-fields coordinate-fields"
    >
      <label v-for="coordinate in coordinates" :key="coordinate">
        {{ coordinate.toUpperCase() }}
        <input
          type="number"
          step="any"
          :name="coordinate"
          :value="drafts[coordinate] ?? operation.transform[coordinate]"
          @input="updateNumber(coordinate, $event)"
        />
      </label>
    </div>
    <div v-else-if="operation.transform.type === 'rotation'" class="number-fields rotation-fields">
      <label>
        Axis
        <select name="axis" :value="operation.transform.axis" @change="updateChoice">
          <option v-for="axis in coordinates" :key="axis" :value="axis">
            {{ axis.toUpperCase() }}
          </option>
        </select>
      </label>
      <label>
        Angle (°)
        <input
          name="angle"
          type="number"
          step="any"
          :value="drafts.angle ?? radiansToDegrees(operation.transform.angle)"
          @input="updateNumber('angle', $event)"
        />
      </label>
    </div>
    <label v-else-if="operation.transform.type === 'reflection'">
      Plane
      <select name="plane" :value="operation.transform.plane" @change="updateChoice">
        <option v-for="plane in planes" :key="plane" :value="plane">
          {{ plane.toUpperCase() }}
        </option>
      </select>
    </label>
    <div v-else-if="operation.transform.type === 'shear'" class="number-fields shear-fields">
      <label v-for="coefficient in shearCoefficients" :key="coefficient">
        {{ coefficient.charAt(1).toUpperCase() }} ← {{ coefficient.charAt(2).toUpperCase() }} ({{
          coefficient
        }})
        <input
          type="number"
          step="any"
          :name="coefficient"
          :value="drafts[coefficient] ?? operation.transform[coefficient]"
          @input="updateNumber(coefficient, $event)"
        />
      </label>
    </div>
    <Matrix4Grid :matrix="matrix" />
  </div>
</template>

<style scoped>
.number-fields {
  display: grid;
  gap: 0.3rem;
}

.coordinate-fields {
  grid-template-columns: repeat(3, minmax(0, 1fr));
}

.rotation-fields {
  grid-template-columns: minmax(0, 0.8fr) minmax(0, 1.2fr);
}

.shear-fields {
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

label {
  display: flex;
  align-items: center;
  gap: 0.25rem;
  min-width: 0;
  white-space: nowrap;
  color: var(--color-text-muted);
  font-size: 12px;
}

input,
select {
  width: 100%;
  min-width: 0;
  box-sizing: border-box;
  font: inherit;
}
</style>
