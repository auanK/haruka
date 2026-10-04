<script setup lang="ts">
import { toRaw } from 'vue'
import type { CubeVertex } from '../app/didactic-cube'
import type { Matrix4 } from '../domain'
import { formatNumber, type DisplayPrecision } from '../ui/transform-stack'
import Matrix4Grid from './Matrix4Grid.vue'

withDefaults(
  defineProps<{
    vertices: readonly CubeVertex[]
    finalMatrix: Matrix4
    caption?: string
    precision?: DisplayPrecision
  }>(),
  {
    caption: 'Final Matrix',
    precision: 4,
  },
)

const emit = defineEmits<{
  'update:precision': [precision: DisplayPrecision]
}>()

const onPrecisionChange = (event: Event) => {
  const value = (event.target as HTMLSelectElement).value
  const next = Number(value) as DisplayPrecision
  emit('update:precision', next)
}
</script>

<template>
  <aside class="geometry-panel" aria-label="Geometry inspector">
    <header class="panel-header">
      <h1>Vertices</h1>
      <label class="precision-control" title="Displayed decimal places">
        <span class="precision-label">Precision</span>
        <select
          :value="precision"
          aria-label="Displayed decimal places"
          title="Displayed decimal places"
          @change="onPrecisionChange"
        >
          <option :value="0">0</option>
          <option :value="1">1</option>
          <option :value="2">2</option>
          <option :value="3">3</option>
          <option :value="4">4</option>
        </select>
      </label>
    </header>

    <div class="panel-content">
      <table class="vertex-table">
        <thead>
          <tr>
            <th>Vertex</th>
            <th>X</th>
            <th>Y</th>
            <th>Z</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="vertex in vertices" :key="vertex.id" :data-vertex-id="vertex.id">
            <th>{{ vertex.id }}</th>
            <td>{{ formatNumber(vertex.point[0], precision) }}</td>
            <td>{{ formatNumber(vertex.point[1], precision) }}</td>
            <td>{{ formatNumber(vertex.point[2], precision) }}</td>
          </tr>
        </tbody>
      </table>

      <Matrix4Grid
        :matrix="toRaw(finalMatrix)"
        :caption="caption ?? 'Final Matrix'"
        :precision="precision"
      />
    </div>
  </aside>
</template>

<style scoped>
.geometry-panel {
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  flex: 0 0 auto;
  width: max-content;
  min-width: 14rem;
  max-width: max(14rem, min(26rem, 30vw));
  height: 100%;
  border-right: 1px solid var(--color-border);
  border-top: 2px solid var(--color-interaction);
  background: var(--color-panel);
  overflow: hidden;
}

.panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
  padding: 0.4rem 0.65rem 0.35rem;
  border-bottom: 1px solid color-mix(in srgb, var(--color-interaction) 25%, var(--color-border));
}

.precision-control {
  display: flex;
  align-items: center;
  gap: 0.35rem;
  font-size: 11px;
  color: var(--color-text-muted);
  cursor: pointer;
}

.precision-control select {
  font-size: 11px;
  font-family: inherit;
  background: var(--color-input);
  color: inherit;
  border: 1px solid var(--color-border);
  border-radius: 2px;
  padding: 1px 4px;
}

h1 {
  margin: 0;
  font-size: 13px;
  font-weight: 600;
  letter-spacing: 0.02em;
}

.panel-content {
  padding: 0.5rem 0.65rem;
  display: flex;
  flex-direction: column;
  gap: 0.65rem;
  flex: 1;
  min-height: 0;
  min-width: 0;
  overflow-x: auto;
  overflow-y: auto;
}

.panel-content :deep(caption) {
  color: var(--color-selection);
  font-weight: 500;
}

.vertex-table {
  width: 100%;
  max-width: none;
  table-layout: fixed;
  border-collapse: collapse;
  font-family: monospace;
  font-size: 12.5px;
  font-variant-numeric: tabular-nums;
  line-height: 1.4;
  background: var(--color-input);
  border: 1px solid var(--color-border);
  border-radius: 3px;
}

.vertex-table thead th {
  padding: 0.2rem 0.4rem;
  color: var(--color-interaction-light);
  font-family: system-ui, sans-serif;
  font-size: 12px;
  font-weight: 500;
  text-align: right;
  border-bottom: 1px solid color-mix(in srgb, var(--color-interaction) 25%, var(--color-border));
  background: color-mix(in srgb, var(--color-interaction) 10%, var(--color-surface));
  white-space: nowrap;
}

.vertex-table thead th:first-child {
  color: var(--color-text-muted);
  text-align: left;
}

.vertex-table tbody tr:not(:last-child) {
  border-bottom: 1px solid var(--color-surface);
}

.vertex-table tbody th {
  padding: 0.2rem 0.4rem;
  color: var(--color-interaction);
  font-weight: 600;
  text-align: left;
  white-space: nowrap;
}

.vertex-table tbody td {
  padding: 0.2rem 0.4rem;
  text-align: right;
  white-space: nowrap;
}

@media (max-width: 640px) {
  .geometry-panel {
    flex: 0 1 auto;
    width: 100%;
    min-width: 0;
    max-width: none;
    height: auto;
    border-right: none;
    border-top: 2px solid var(--color-interaction);
    border-bottom: 1px solid var(--color-border);
  }
}
</style>
