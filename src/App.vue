<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'
import { mountHarukaViewport } from './renderer/viewport'

const viewportElement = ref<HTMLElement | null>(null)
let disposeViewport: (() => void) | undefined

onMounted(() => {
  const container = viewportElement.value
  if (!container) throw new Error('Haruka viewport container is missing')
  disposeViewport = mountHarukaViewport(container).dispose
})

onBeforeUnmount(() => disposeViewport?.())
</script>

<template>
  <main>
    <div ref="viewportElement" class="viewport" role="region" aria-label="Haruka 3D viewport" />
  </main>
</template>

<style>
html,
body,
#app,
main,
.viewport {
  width: 100%;
  height: 100%;
  margin: 0;
}

.viewport canvas {
  display: block;
  width: 100%;
  height: 100%;
}
</style>
