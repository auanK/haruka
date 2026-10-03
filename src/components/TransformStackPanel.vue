<script setup lang="ts">
import { ref } from 'vue'
import {
  addTransformOperation,
  updateTransformOperation,
  removeTransformOperation,
  moveTransformOperation,
  type StackEditResult,
  type TransformStackState,
} from '../app/transform-stack-state'
import type { Transform } from '../domain'
import { createDefaultTransform } from '../ui/transform-stack'
import TransformOperationEditor from './TransformOperationEditor.vue'

const props = defineProps<{ state: TransformStackState }>()
const emit = defineEmits<{ edit: [result: StackEditResult] }>()
const selectedType = ref<Transform['type']>('translation')
let nextOperationId = 1
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
      id: `op-${nextOperationId++}`,
      transform: createDefaultTransform(selectedType.value),
    }),
  )
</script>

<template>
  <aside class="stack-panel" aria-labelledby="stack-title">
    <h1 id="stack-title">Transformation Stack</h1>
    <p>Applied from top to bottom.</p>
    <form @submit.prevent="addOperation">
      <label class="visually-hidden" for="transform-type">Transform type</label>
      <select id="transform-type" v-model="selectedType" name="transform-type">
        <option v-for="(label, type) in transformTypes" :key="type" :value="type">
          {{ label }}
        </option>
      </select>
      <button type="submit" aria-label="Add Transform" title="Add Transform">+</button>
    </form>
    <p v-if="state.operations.length === 0">No transformations.</p>
    <article
      v-for="(operation, index) in state.operations"
      :key="operation.id"
      :data-operation-id="operation.id"
    >
      <TransformOperationEditor
        :operation="operation"
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
