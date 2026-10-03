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
      <header>
        <h2>{{ transformTypes[operation.transform.type] }}</h2>
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
      </header>
      <TransformOperationEditor
        :operation="operation"
        @update-transform="emit('edit', updateTransformOperation(state, operation.id, $event))"
      />
    </article>
  </aside>
</template>

<style scoped>
.stack-panel {
  box-sizing: border-box;
  flex: 0 0 310px;
  min-width: 0;
  min-height: 0;
  overflow-y: auto;
  padding: 0.75rem;
  border-left: 1px solid var(--color-border);
  background: var(--color-panel);
}

h1 {
  margin: 0 0 0.25rem;
  font-size: 1rem;
}
h2 {
  flex: 1;
  min-width: 0;
  margin: 0;
  font-size: 0.85rem;
}
p {
  margin: 0 0 0.75rem;
  color: var(--color-text-muted);
  font-size: 0.8rem;
}
form,
header {
  display: flex;
  align-items: center;
  gap: 0.3rem;
}
form {
  margin-bottom: 0.75rem;
}
form select {
  flex: 1;
  min-width: 0;
}
form button {
  width: 28px;
  font-size: 1rem;
}
article {
  margin-top: 0.5rem;
  padding: 0.5rem;
  border: 1px solid var(--color-border);
  border-radius: 3px;
  background: var(--color-surface);
}
header {
  margin-bottom: 0.4rem;
}
header button {
  width: 24px;
  min-height: 24px;
  padding: 0;
}
.remove {
  color: var(--color-danger);
}
@media (max-width: 640px) {
  .stack-panel {
    flex: 1;
    border-top: 1px solid var(--color-border);
    border-left: 0;
  }
}
</style>
