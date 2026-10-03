<script setup lang="ts">
import type { Matrix4 } from '../domain'
import { formatMatrixValue } from '../ui/transform-stack'

withDefaults(
  defineProps<{
    matrix: Matrix4
    caption?: string
  }>(),
  {
    caption: 'Matrix',
  },
)
const indices = [0, 1, 2, 3] as const
</script>

<template>
  <table>
    <caption v-if="caption">
      {{
        caption
      }}
    </caption>
    <tbody>
      <tr v-for="row in indices" :key="row">
        <td
          v-for="column in indices"
          :key="column"
          :data-row="row"
          :data-column="column"
          :data-index="row * 4 + column"
        >
          <slot name="cell" :index="row * 4 + column" :value="matrix[row * 4 + column]!">
            {{ formatMatrixValue(matrix[row * 4 + column]!) }}
          </slot>
        </td>
      </tr>
    </tbody>
  </table>
</template>

<style scoped>
table {
  width: 100%;
  max-width: none;
  table-layout: auto;
  margin-top: 0.3rem;
  border-collapse: collapse;
  border-inline: 1px solid var(--color-border);
  background: var(--color-input);
  font-family: monospace;
  font-size: 12.5px;
  font-variant-numeric: tabular-nums;
  line-height: 1.4;
}

caption {
  margin-bottom: 0.15rem;
  color: var(--color-text-muted);
  font-family: system-ui, sans-serif;
  font-size: 12px;
  text-align: left;
  white-space: nowrap;
}

td {
  min-width: 5ch;
  padding: 0.2rem 0.4rem;
  text-align: right;
  white-space: nowrap;
}
</style>
