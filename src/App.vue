<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, shallowRef } from 'vue'
import { transformCubeVertices } from './app/didactic-cube'
import {
  createTransformStackState,
  getTransformSequence,
  type StackEditResult,
} from './app/transform-stack-state'
import GeometryPanel from './components/GeometryPanel.vue'
import TransformStackPanel from './components/TransformStackPanel.vue'
import { composeTransforms } from './domain'
import { applyHarukaMatrixToObject } from './renderer/three-matrix'
import { mountHarukaViewport, type HarukaViewport } from './renderer/viewport'

const viewportElement = ref<HTMLElement | null>(null)
const stackState = shallowRef(createTransformStackState())
let viewport: HarukaViewport | undefined

const finalMatrix = computed(() => composeTransforms(getTransformSequence(stackState.value)))
const currentVertices = computed(() => transformCubeVertices(finalMatrix.value))

const syncViewport = () => {
  if (viewport) {
    if ('sync' in viewport && typeof viewport.sync === 'function') {
      viewport.sync({
        matrix: finalMatrix.value,
        vertices: currentVertices.value,
      })
    } else {
      applyHarukaMatrixToObject(viewport.target, finalMatrix.value)
      viewport.updateVertexLabels(currentVertices.value)
    }
  }
}

const acceptEdit = (result: StackEditResult) => {
  if (!result.ok) throw new Error(`Stack edit failed: ${result.reason}`)
  stackState.value = result.state
  syncViewport()
}

const locateCube = () => {
  viewport?.locateCube()
}

onMounted(() => {
  const container = viewportElement.value
  if (!container) throw new Error('Haruka viewport container is missing')
  viewport = mountHarukaViewport(container)
  if (import.meta.env.DEV) {
    ;(window as unknown as { __harukaViewport?: HarukaViewport }).__harukaViewport = viewport
  }
  syncViewport()
})

onBeforeUnmount(() => {
  if (import.meta.env.DEV) {
    delete (window as unknown as { __harukaViewport?: HarukaViewport }).__harukaViewport
  }
  viewport?.dispose()
})
</script>

<template>
  <main>
    <GeometryPanel :vertices="currentVertices" :final-matrix="finalMatrix" />
    <div ref="viewportElement" class="viewport" role="region" aria-label="Haruka 3D viewport">
      <div class="camera-toolbar" role="toolbar" aria-label="Camera controls">
        <button type="button" aria-label="Locate Cube" title="Locate Cube" @click="locateCube">
          ◎ Locate Cube
        </button>
      </div>
    </div>
    <TransformStackPanel :state="stackState" @edit="acceptEdit" />
  </main>
</template>

<style>
:root {
  color-scheme: dark;
  --color-background: #121315;
  --color-panel: #1c1d20;
  --color-surface: #25252a;
  --color-surface-hover: #2d2c31;
  --color-border: #3a373d;

  --color-text: #f1ebed;
  --color-text-muted: #aaa4aa;
  --color-text-subtle: #77727b;

  --color-input: #161719;

  --color-selection-strong: #873765;
  --color-selection: #bd5688;

  --color-interaction: #2895c5;
  --color-interaction-light: #5bc2e8;

  --color-danger: #9f293a;
  font:
    13px/1.4 system-ui,
    sans-serif;
  color: var(--color-text);
  background: var(--color-background);
}

html,
body,
#app,
main {
  width: 100%;
  height: 100%;
  margin: 0;
}

main {
  display: flex;
  overflow: hidden;
}

input,
select,
button {
  box-sizing: border-box;
  min-height: 26px;
  padding: 0.2rem 0.35rem;
  border: 1px solid var(--color-border);
  border-radius: 3px;
  color: var(--color-text);
  font: inherit;
}
input,
select {
  background: var(--color-input);
}
button {
  background: var(--color-surface);
  cursor: pointer;
}
button:hover:enabled {
  background: var(--color-surface-hover);
}
button:disabled {
  color: var(--color-text-muted);
  background: var(--color-panel);
  cursor: default;
}
input:focus-visible,
select:focus-visible,
button:focus-visible {
  outline: 2px solid var(--color-interaction);
  outline-offset: 1px;
}
.visually-hidden {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  overflow: hidden;
  clip-path: inset(50%);
  white-space: nowrap;
}

.viewport {
  position: relative;
  flex: 1;
  min-width: 0;
  height: 100%;
}

.viewport canvas {
  display: block;
  width: 100%;
  height: 100%;
}

.camera-toolbar {
  position: absolute;
  top: 10px;
  left: 10px;
  display: flex;
  gap: 4px;
  z-index: 10;
}

.camera-toolbar button {
  font-size: 11px;
  padding: 0.15rem 0.4rem;
  min-height: 22px;
  background: color-mix(in srgb, var(--color-interaction) 8%, rgba(28, 29, 32, 0.88));
  backdrop-filter: blur(4px);
  border: 1px solid color-mix(in srgb, var(--color-interaction) 40%, var(--color-border));
  color: var(--color-interaction-light);
}

.camera-toolbar button:hover:enabled {
  background: color-mix(in srgb, var(--color-interaction) 20%, var(--color-surface-hover));
  border-color: var(--color-interaction);
  color: var(--color-text);
}

.camera-toolbar button.active {
  background: var(--color-interaction);
  color: var(--color-background);
  font-weight: 600;
  border-color: var(--color-interaction);
}

@media (max-width: 640px) {
  main {
    flex-direction: column;
  }
  .viewport {
    flex: 0 0 45%;
    height: auto;
    min-height: 0;
  }
}
</style>
