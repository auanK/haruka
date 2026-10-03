<script setup lang="ts">
import { toRaw } from 'vue'
import type { CubeVertex } from '../app/didactic-cube'
import type { Matrix4 } from '../domain'
import { formatNumber } from '../ui/transform-stack'
import Matrix4Grid from './Matrix4Grid.vue'

defineProps<{
  vertices: readonly CubeVertex[]
  finalMatrix: Matrix4
}>()
</script>

<template>
  <aside class="geometry-panel" aria-label="Geometry inspector">
    <header>
      <h1>Vertices</h1>
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
            <td>{{ formatNumber(vertex.point[0]) }}</td>
            <td>{{ formatNumber(vertex.point[1]) }}</td>
            <td>{{ formatNumber(vertex.point[2]) }}</td>
          </tr>
        </tbody>
      </table>

      <Matrix4Grid :matrix="toRaw(finalMatrix)" caption="Final Matrix" />
    </div>
  </aside>
</template>

<style scoped>
.geometry-panel {
  display: flex;
  flex-direction: column;
  width: 230px;
  min-width: 210px;
  height: 100%;
  border-right: 1px solid var(--color-border);
  background: var(--color-panel);
  overflow-y: auto;
}

header {
  padding: 0.5rem 0.65rem 0.35rem;
  border-bottom: 1px solid var(--color-border);
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
  gap: 0.75rem;
}

.vertex-table {
  width: 100%;
  border-collapse: collapse;
  font-family: monospace;
  font-size: 12px;
  font-variant-numeric: tabular-nums;
  line-height: 1.4;
  background: var(--color-input);
  border: 1px solid var(--color-border);
  border-radius: 3px;
}

.vertex-table thead th {
  padding: 0.2rem 0.3rem;
  color: var(--color-text-muted);
  font-family: system-ui, sans-serif;
  font-size: 11px;
  font-weight: 500;
  text-align: right;
  border-bottom: 1px solid var(--color-border);
  background: var(--color-surface);
}

.vertex-table thead th:first-child {
  text-align: left;
}

.vertex-table tbody tr:not(:last-child) {
  border-bottom: 1px solid var(--color-surface);
}

.vertex-table tbody th {
  padding: 0.12rem 0.3rem;
  color: var(--color-accent);
  font-weight: 600;
  text-align: left;
}

.vertex-table tbody td {
  padding: 0.12rem 0.3rem;
  text-align: right;
  white-space: nowrap;
}

@media (max-width: 640px) {
  .geometry-panel {
    width: 100%;
    min-width: 0;
    height: auto;
    border-right: none;
    border-bottom: 1px solid var(--color-border);
  }
}
</style>
