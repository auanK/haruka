// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { mount, type VueWrapper } from '@vue/test-utils'
import { Matrix4, Vector3 } from 'three'
import type { CubeVertex } from '../app/didactic-cube'
import { transformCubeVertices } from '../app/didactic-cube'
import {
  composeTransforms,
  identity,
  multiply,
  toMatrix,
  transformPoint,
  type Matrix4 as HarukaMatrix4,
} from '../domain'
import { getTransformSequence } from '../app/transform-stack-state'
import { formatMatrixValue } from '../ui/transform-stack'
import { applyHarukaMatrixToObject } from '../renderer/three-matrix'
import App from '../App.vue'
import TransformStackPanel from '../components/TransformStackPanel.vue'
import { mountHarukaViewport, type HarukaViewport } from '../renderer/viewport'

vi.mock('../renderer/viewport', async () => {
  const { Group } = await import('three')
  return {
    mountHarukaViewport: vi.fn<(container: HTMLElement) => HarukaViewport>((container) => {
      const target = new Group()
      target.matrixAutoUpdate = false
      target.matrix.makeTranslation(99, 99, 99)
      const canvas = document.createElement('canvas')
      container.append(canvas)
      const updateVertexLabels = vi.fn<(vertices: readonly CubeVertex[]) => void>()
      const locateCube = vi.fn<() => void>()
      const sync = vi.fn<
        (data: { readonly matrix: HarukaMatrix4; readonly vertices: readonly CubeVertex[] }) => void
      >(
        ({
          matrix,
          vertices,
        }: {
          readonly matrix: HarukaMatrix4
          readonly vertices: readonly CubeVertex[]
        }) => {
          applyHarukaMatrixToObject(target, matrix)
          updateVertexLabels(vertices)
        },
      )
      return {
        target,
        updateVertexLabels,
        locateCube,
        sync,
        // Client x < 100 hits the cube; deltas are pixel offsets / 100 on X, Y and X+Y.
        pick: vi.fn<HarukaViewport['pick']>((x) => x < 100),
        dragDelta: vi.fn<HarukaViewport['dragDelta']>(
          ([sx, sy], [x, y], _pivot, _axis, lockedAxis) => {
            const dx = (x - sx) / 100
            const dy = (y - sy) / 100
            const dz = (x - sx + y - sy) / 100
            if (lockedAxis === 'x') return [0, dy, dz]
            if (lockedAxis === 'y') return [dx, 0, dz]
            if (lockedAxis === 'z') return [dx, dy, 0]
            return [dx, dy, dz]
          },
        ),
        setManipulation: vi.fn<HarukaViewport['setManipulation']>(),
        setViewAxisLock: vi.fn<HarukaViewport['setViewAxisLock']>(),
        controls: {
          addEventListener: vi.fn<(type: string, listener: () => void) => void>(),
          removeEventListener: vi.fn<(type: string, listener: () => void) => void>(),
          target: new Vector3(),
        },
        referenceFrame: {
          plane: 'xz',
          normalAxis: 'y',
          normalValue: 0,
          origin: [0, 0, 0],
          sliceLabel: 'XZ · Y = 0',
        },
        dispose: vi.fn<() => void>(() => canvas.remove()),
      } as unknown as HarukaViewport
    }),
  }
})

let wrapper: VueWrapper

afterEach(() => {
  wrapper?.unmount()
  vi.clearAllMocks()
})

const target = () => vi.mocked(mountHarukaViewport).mock.results[0]!.value.target
const resultPanel = () => wrapper.getComponent({ name: 'GeometryPanel' })
const expectResultsInSync = () => {
  const matrix: HarukaMatrix4 = resultPanel().props('finalMatrix')
  const vertices: readonly CubeVertex[] = resultPanel().props('vertices')
  expect(wrapper.findAll('.geometry-panel td[data-index]').map((cell) => cell.text())).toEqual(
    matrix.map(formatMatrixValue),
  )
  expect(target().matrix).toEqual(new Matrix4().set(...matrix))
  const update = vi.mocked(mountHarukaViewport).mock.results[0]!.value.updateVertexLabels
  expect(vi.mocked(update).mock.calls.slice(-1)[0]?.[0]).toBe(vertices)
  const sync = vi.mocked(mountHarukaViewport).mock.results[0]!.value.sync
  expect(vi.mocked(sync).mock.calls.slice(-1)[0]?.[0].matrix).toBe(matrix)
  expect(vi.mocked(sync).mock.calls.slice(-1)[0]?.[0].vertices).toBe(vertices)
  return { matrix, vertices }
}

const add = async (type: string) => {
  await wrapper.get('select[name="transform-type"]').setValue(type)
  await wrapper.get('form').trigger('submit')
}

const cardIds = () => wrapper.findAll('article').map((card) => card.attributes('data-operation-id'))
const stackPanel = () => wrapper.getComponent(TransformStackPanel)
const viewportSync = () => vi.mocked(mountHarukaViewport).mock.results[0]!.value.sync
const startDrag = async (id: string, surface = 'h2') => {
  wrapper.findAll('article').forEach((card, index) => {
    vi.spyOn(card.element, 'getBoundingClientRect').mockReturnValue({
      top: 200 + index * 100,
      height: 100,
    } as DOMRect)
  })
  const dataTransfer = {
    effectAllowed: 'uninitialized',
    setData: vi.fn<(format: string, data: string) => void>(),
  }
  await wrapper.get(`article[data-operation-id="${id}"] ${surface}`).trigger('dragstart', {
    dataTransfer,
  })
  return dataTransfer
}
const hoverCard = async (id: string, side: 'before' | 'after') => {
  const index = cardIds().indexOf(id)
  await wrapper.get(`article[data-operation-id="${id}"]`).trigger('dragover', {
    clientY: 200 + index * 100 + (side === 'before' ? 10 : 90),
  })
}
const drop = () => wrapper.get('.stack-panel').trigger('drop')
const expectDragCleanedUp = () => {
  expect(wrapper.find('.dragging').exists()).toBe(false)
  expect(wrapper.find('.drop-indicator').exists()).toBe(false)
}

describe('transformation stack integration', () => {
  it('only changes the insertion indicator during dragover, preserving state, matrix, vertices and renderer', async () => {
    wrapper = mount(App)
    for (const type of ['translation', 'rotation', 'scale']) await add(type)
    const state = stackPanel().props('state')
    const results = expectResultsInSync()
    const matrix = target().matrix.clone()
    const syncCount = vi.mocked(viewportSync()).mock.calls.length
    const editCount = stackPanel().emitted('edit')!.length

    const dataTransfer = await startDrag('op-2')
    expect(dataTransfer.effectAllowed).toBe('move')
    expect(dataTransfer.setData).toHaveBeenCalledWith('text/plain', 'op-2')
    expect(wrapper.get('article[data-operation-id="op-2"]').attributes('draggable')).toBe('true')
    expect(wrapper.get('article[data-operation-id="op-2"]').classes()).toContain('dragging')
    expect(wrapper.findAll('article.dragging')).toHaveLength(1)
    await hoverCard('op-1', 'after')
    expect(wrapper.get('.drop-indicator').attributes('data-insertion-slot')).toBe('3')
    await hoverCard('op-3', 'before')
    expect(wrapper.get('.drop-indicator').attributes('data-insertion-slot')).toBe('0')

    expect(stackPanel().props('state')).toBe(state)
    expect(cardIds()).toEqual(['op-3', 'op-2', 'op-1'])
    expect(expectResultsInSync().matrix).toBe(results.matrix)
    expect(expectResultsInSync().vertices).toBe(results.vertices)
    expect(target().matrix).toEqual(matrix)
    expect(vi.mocked(viewportSync())).toHaveBeenCalledTimes(syncCount)
    expect(stackPanel().emitted('edit')).toHaveLength(editCount)
  })

  it('drops T before R and synchronizes non-commutative DOM, state, Final Matrix, vertices and Three results', async () => {
    wrapper = mount(App)
    await add('translation')
    await wrapper.get('article input[name="x"]').setValue('2')
    await add('rotation')
    await wrapper
      .get('article[data-operation-id="op-2"] td[data-index="0"] button')
      .trigger('click')
    await wrapper.get('article[data-operation-id="op-2"] input[name="angle"]').setValue('90')
    const translation = toMatrix({ type: 'translation', x: 2, y: 0, z: 0 })
    const rotation = toMatrix({ type: 'rotation', axis: 'z', angle: Math.PI / 2 })
    const before = expectResultsInSync()
    expect(cardIds()).toEqual(['op-2', 'op-1'])
    expect(before.matrix).toEqual(multiply(rotation, translation))
    const origin = new Vector3().applyMatrix4(target().matrix)
    expect(origin.x).toBeCloseTo(0, 12)
    expect(origin.y).toBeCloseTo(2, 12)
    expect(origin.z).toBe(0)

    await startDrag('op-1', 'h2')
    await wrapper.get('article[data-operation-id="op-2"]').trigger('dragover', { clientY: 270 })
    expect(wrapper.get('.drop-indicator').attributes('data-insertion-slot')).toBe('0')
    await drop()

    expect(cardIds()).toEqual(['op-1', 'op-2'])
    expect(
      stackPanel()
        .props('state')
        .operations.map(({ id }) => id),
    ).toEqual(cardIds())
    const after = expectResultsInSync()
    const expected = multiply(translation, rotation)
    expect(after.matrix).toEqual(expected)
    expect(after.vertices).toEqual(transformCubeVertices(expected))
    for (const vertex of after.vertices) {
      expect(
        wrapper
          .get(`tr[data-vertex-id="${vertex.id}"]`)
          .findAll('td')
          .map((cell) => cell.text()),
      ).toEqual(vertex.point.map(formatMatrixValue))
    }
    expect(new Vector3().applyMatrix4(target().matrix).toArray()).toEqual([2, 0, 0])
    expectDragCleanedUp()
  })

  it('drops T after S in T, R, S using the final destination index', async () => {
    wrapper = mount(App)
    for (const type of ['scale', 'rotation', 'translation']) await add(type)
    const state = stackPanel().props('state')
    await startDrag('op-3')
    await hoverCard('op-1', 'after')
    expect(wrapper.get('.drop-indicator').attributes('data-insertion-slot')).toBe('3')
    await drop()

    expect(cardIds()).toEqual(['op-2', 'op-1', 'op-3'])
    expect(stackPanel().props('state').operations).toEqual([
      state.operations[1],
      state.operations[2],
      state.operations[0],
    ])
    expectResultsInSync()
    expectDragCleanedUp()
  })

  it.each(['before', 'after'] as const)(
    'treats dropping immediately %s the source as a no-op',
    async (side) => {
      wrapper = mount(App)
      for (const type of ['translation', 'rotation', 'scale']) await add(type)
      const state = stackPanel().props('state')
      const syncCount = vi.mocked(viewportSync()).mock.calls.length
      const editCount = stackPanel().emitted('edit')!.length
      await startDrag('op-2')
      await hoverCard('op-2', side)
      expect(wrapper.find('.drop-indicator').exists()).toBe(false)
      await drop()

      expect(stackPanel().props('state')).toBe(state)
      expect(cardIds()).toEqual(['op-3', 'op-2', 'op-1'])
      expect(stackPanel().emitted('edit')).toHaveLength(editCount)
      expect(vi.mocked(viewportSync())).toHaveBeenCalledTimes(syncCount)
      expectDragCleanedUp()
    },
  )

  it('cleans up cancellation through dragend and allows the next drag to succeed', async () => {
    wrapper = mount(App)
    for (const type of ['translation', 'rotation', 'scale']) await add(type)
    const state = stackPanel().props('state')
    const syncCount = vi.mocked(viewportSync()).mock.calls.length
    await startDrag('op-1')
    await hoverCard('op-3', 'before')
    expect(wrapper.find('.drop-indicator').exists()).toBe(true)
    await wrapper.get('article[data-operation-id="op-1"]').trigger('dragend')

    expect(stackPanel().props('state')).toBe(state)
    expect(cardIds()).toEqual(['op-3', 'op-2', 'op-1'])
    expect(vi.mocked(viewportSync())).toHaveBeenCalledTimes(syncCount)
    expectDragCleanedUp()
    await startDrag('op-1')
    await hoverCard('op-3', 'before')
    await drop()
    expect(cardIds()).toEqual(['op-1', 'op-3', 'op-2'])
    expect(vi.mocked(viewportSync())).toHaveBeenCalledTimes(syncCount + 1)
    expectResultsInSync()
    expectDragCleanedUp()
  })

  it('accepts the panel space above the first card and below the last as extreme slots', async () => {
    wrapper = mount(App)
    for (const type of ['translation', 'rotation', 'scale']) await add(type)
    await startDrag('op-1')
    await wrapper.get('.stack-panel').trigger('dragover', { clientY: 100 })
    expect(wrapper.get('.drop-indicator').attributes('data-insertion-slot')).toBe('0')
    await drop()
    expect(cardIds()).toEqual(['op-1', 'op-3', 'op-2'])
    await startDrag('op-1')
    await wrapper.get('.stack-panel').trigger('dragover', { clientY: 600 })
    expect(wrapper.get('.drop-indicator').attributes('data-insertion-slot')).toBe('3')
    await drop()
    expect(cardIds()).toEqual(['op-3', 'op-2', 'op-1'])
    expectResultsInSync()
  })

  it('excludes editor controls from reorder and leaves the same card header draggable', async () => {
    wrapper = mount(App)
    for (const type of ['translation', 'rotation', 'scale', 'shear', 'reflection']) await add(type)
    await wrapper
      .get('article[data-operation-id="op-2"] td[data-index="0"] button')
      .trigger('click')
    await wrapper.get('article[data-operation-id="op-2"] input[name="angle"]').setValue('37.25')
    await wrapper.get('article[data-operation-id="op-1"] input[name="x"]').setValue('0.0100')
    const state = stackPanel().props('state')
    const syncCount = vi.mocked(viewportSync()).mock.calls.length
    expect(wrapper.findAll('[draggable="true"]')).toHaveLength(5)
    for (const control of wrapper.findAll('input, select, .axis-selector button, .cell-control')) {
      expect(control.attributes('draggable')).toBeUndefined()
      await control.trigger('dragstart', { dataTransfer: { getData: () => 'op-1' } })
      await wrapper.get('.stack-panel').trigger('dragover', { clientY: 0 })
      await drop()
      expectDragCleanedUp()
    }
    expect(stackPanel().props('state')).toBe(state)
    expect(vi.mocked(viewportSync())).toHaveBeenCalledTimes(syncCount)
    expect(
      (wrapper.get('article[data-operation-id="op-1"] input[name="x"]').element as HTMLInputElement)
        .value,
    ).toBe('0.0100')
    await startDrag('op-1', 'h2')
    await hoverCard('op-2', 'before')
    await drop()
    expect(cardIds()).toEqual(['op-5', 'op-4', 'op-3', 'op-1', 'op-2'])
    expectResultsInSync()
    expectDragCleanedUp()
  })

  it('shows identity and the eight base vertices for an empty stack and sends the same results to the renderer', () => {
    wrapper = mount(App)

    const { matrix, vertices } = expectResultsInSync()
    expect(matrix).toEqual(identity())
    expect(vertices.map(({ id }) => id)).toEqual(['V1', 'V2', 'V3', 'V4', 'V5', 'V6', 'V7', 'V8'])
    expect(vertices[0]?.point).toEqual([-0.5, -0.5, -0.5])
    expect(wrapper.get('.geometry-panel').findAll('tr[data-vertex-id]')).toHaveLength(8)
    expect(wrapper.get('.geometry-panel caption').text()).toBe('Final Matrix')
    expect(wrapper.get('.geometry-panel').find('input, [contenteditable]').exists()).toBe(false)
  })

  it('updates Final Matrix, current vertex coordinates and the renderer together when Translation X becomes 2', async () => {
    wrapper = mount(App)
    await add('translation')
    await wrapper.get('article td[data-index="3"] input').setValue('2')

    const { matrix, vertices } = expectResultsInSync()
    expect(matrix).toEqual(toMatrix({ type: 'translation', x: 2, y: 0, z: 0 }))
    expect(vertices[0]?.point).toEqual([1.5, -0.5, -0.5])
    expect(vertices[1]?.point).toEqual([2.5, -0.5, -0.5])
    expect(
      wrapper
        .get('.geometry-panel tr[data-vertex-id="V1"]')
        .findAll('td')
        .map((cell) => cell.text()),
    ).toEqual(['1.5', '-0.5', '-0.5'])
    expect(wrapper.get('.geometry-panel td[data-index="3"]').text()).toBe('2')
    expect(new Vector3().applyMatrix4(target().matrix).toArray()).toEqual([2, 0, 0])
  })

  it('keeps exact application-order composition for Final Matrix and the target after Translation, Rotation and Scale edits', async () => {
    wrapper = mount(App)
    for (const [index, [type, field, value]] of [
      ['translation', 'x', '2.123456'],
      ['rotation', 'angle', '37.25'],
      ['scale', 'y', '0'],
    ].entries()) {
      await add(type!)
      const card = wrapper.get(`article[data-operation-id="op-${index + 1}"]`)
      if (type === 'rotation') await card.get('td[data-index="0"] button').trigger('click')
      await card.get(`input[name="${field}"]`).setValue(value!)
      const { matrix } = expectResultsInSync()
      const state = wrapper.getComponent(TransformStackPanel).props('state')
      expect(matrix).toEqual(composeTransforms(getTransformSequence(state)))
    }
  })

  it('displays temporal additions T, R, S as visual/product S, R, T while applying T → R → S to a known point', async () => {
    wrapper = mount(App)
    await add('translation')
    await wrapper.get('article[data-operation-id="op-1"] input[name="x"]').setValue('2')
    await add('rotation')
    const rotationCard = wrapper.get('article[data-operation-id="op-2"]')
    await rotationCard.get('td[data-index="0"] button').trigger('click')
    await rotationCard.get('input[name="angle"]').setValue('90')
    await rotationCard.get('input[name="angle"]').trigger('blur')
    await add('scale')
    const scaleCard = wrapper.get('article[data-operation-id="op-3"]')
    for (const [field, value] of [
      ['x', '2'],
      ['y', '3'],
      ['z', '4'],
    ]) {
      await scaleCard.get(`input[name="${field}"]`).setValue(value!)
    }

    expect(wrapper.findAll('article').map((card) => card.attributes('data-operation-id'))).toEqual([
      'op-3',
      'op-2',
      'op-1',
    ])
    expect(wrapper.findAll('article h2').map((title) => title.text())).toEqual([
      'Scale',
      'Rotation',
      'Translation',
    ])
    expect(
      wrapper
        .getComponent(TransformStackPanel)
        .props('state')
        .operations.map(({ id }) => id),
    ).toEqual(['op-3', 'op-2', 'op-1'])
    const expected = multiply(
      toMatrix({ type: 'scale', x: 2, y: 3, z: 4 }),
      multiply(
        toMatrix({ type: 'rotation', axis: 'z', angle: Math.PI / 2 }),
        toMatrix({ type: 'translation', x: 2, y: 0, z: 0 }),
      ),
    )
    const { matrix, vertices } = expectResultsInSync()
    expect(matrix).toEqual(expected)
    const point = [1, 2, 3] as const
    const domainPoint = transformPoint(matrix, point)
    const rendererPoint = new Vector3(...point).applyMatrix4(target().matrix).toArray()
    for (const [axis, value] of [-4, 9, 12].entries()) {
      expect(domainPoint[axis]).toBeCloseTo(value, 12)
      expect(rendererPoint[axis]).toBeCloseTo(value, 12)
    }
    for (const [axis, value] of [1, 4.5, -2].entries()) {
      expect(vertices[0]!.point[axis]).toBeCloseTo(value, 12)
    }
    const copy = wrapper.get('.stack-panel > p').text()
    expect(copy).not.toContain('Applied from top to bottom.')
    expect(copy).toContain('Matrix product: top → bottom.')
    expect(copy).toContain('Applied to points: bottom → top.')

    await add('reflection')
    expect(wrapper.findAll('article').map((card) => card.attributes('data-operation-id'))).toEqual([
      'op-4',
      'op-3',
      'op-2',
      'op-1',
    ])
    const reflected = expectResultsInSync()
    expect(reflected.matrix).toEqual(
      multiply(toMatrix({ type: 'reflection', plane: 'yz' }), expected),
    )
    const reflectedPoint = new Vector3(...point).applyMatrix4(target().matrix).toArray()
    for (const [axis, value] of [4, 9, 12].entries()) {
      expect(reflectedPoint[axis]).toBeCloseTo(value, 12)
    }
    for (const [axis, value] of [-1, 4.5, -2].entries()) {
      expect(reflected.vertices[0]!.point[axis]).toBeCloseTo(value, 12)
    }
  })

  it('updates vertices, Final Matrix and the target when visual/product R · T becomes T · R', async () => {
    wrapper = mount(App)
    await add('translation')
    await wrapper.get('article input[name="x"]').setValue('2')
    await add('rotation')
    await wrapper
      .get('article[data-operation-id="op-2"] td[data-index="0"] button')
      .trigger('click')
    await wrapper.get('article[data-operation-id="op-2"] input[name="angle"]').setValue('90')
    const before = expectResultsInSync()
    expect(before.matrix).toEqual(
      multiply(
        toMatrix({ type: 'rotation', axis: 'z', angle: Math.PI / 2 }),
        toMatrix({ type: 'translation', x: 2, y: 0, z: 0 }),
      ),
    )
    const beforeTarget = target().matrix.clone()

    await wrapper
      .get('article[data-operation-id="op-1"] button[aria-label="Move up"]')
      .trigger('click')

    const after = expectResultsInSync()
    expect(wrapper.findAll('article').map((card) => card.attributes('data-operation-id'))).toEqual([
      'op-1',
      'op-2',
    ])
    expect(after.matrix).toEqual(
      multiply(
        toMatrix({ type: 'translation', x: 2, y: 0, z: 0 }),
        toMatrix({ type: 'rotation', axis: 'z', angle: Math.PI / 2 }),
      ),
    )
    expect(after.matrix).not.toEqual(before.matrix)
    expect(after.vertices[0]?.point).not.toEqual(before.vertices[0]?.point)
    expect(target().matrix).not.toEqual(beforeTarget)
    expect(after.vertices[0]?.point[0]).toBeCloseTo(2.5)
    expect(after.vertices[0]?.point[1]).toBeCloseTo(-0.5)
  })

  it('links symbolic rotation angle edits to numeric Final Matrix, vertices and the same renderer inputs', async () => {
    wrapper = mount(App)
    await add('rotation')
    const operation = wrapper.get('article')
    await operation.get('td[data-index="0"] button').trigger('click')
    await operation.get('input[name="angle"]').setValue('45')
    const state = wrapper.getComponent(TransformStackPanel).props('state')
    expect(state.operations[0]?.transform).toEqual({
      type: 'rotation',
      axis: 'z',
      angle: Math.PI / 4,
    })
    expect(Object.keys(state.operations[0]!)).toEqual(['id', 'transform'])
    expect(expectResultsInSync().matrix).toEqual(
      toMatrix({ type: 'rotation', axis: 'z', angle: Math.PI / 4 }),
    )
    expect(wrapper.get('.geometry-panel td[data-index="0"]').text()).toBe('0.7071')

    const viewport = vi.mocked(mountHarukaViewport).mock.results[0]!.value
    const calls = vi.mocked(viewport.sync).mock.calls.length
    await operation.get('input[name="angle"]').setValue('')
    expect(wrapper.getComponent(TransformStackPanel).props('state')).toBe(state)
    expect(vi.mocked(viewport.sync).mock.calls).toHaveLength(calls)
    expectResultsInSync()
    await operation.get('input[name="angle"]').trigger('blur')
    await operation.get('td[data-index="4"] button').trigger('click')
    await operation.get('input[name="angle"]').setValue('90')
    await operation.get('input[name="angle"]').trigger('blur')

    const { matrix, vertices } = expectResultsInSync()
    expect(matrix).toEqual(toMatrix({ type: 'rotation', axis: 'z', angle: Math.PI / 2 }))
    expect(vertices[0]!.point[0]).toBeCloseTo(0.5)
    expect(vertices[0]!.point[1]).toBeCloseTo(-0.5)
    expect(operation.get('td[data-index="0"]').text()).toBe('cos(90°)')
    expect(operation.get('td[data-index="1"]').text()).toBe('-sen(90°)')
    expect(wrapper.get('.geometry-panel td[data-index="0"]').text()).toBe('0')
    expect(wrapper.get('.geometry-panel td[data-index="1"]').text()).toBe('-1')
    expect(
      wrapper.get('.geometry-panel').find('input, button, [tabindex], [contenteditable]').exists(),
    ).toBe(false)
  })

  it('mounts the viewport and explicitly synchronizes the initial empty stack', () => {
    wrapper = mount(App)

    expect(mountHarukaViewport).toHaveBeenCalledOnce()
    expect(target().matrix.elements).toEqual(new Matrix4().elements)
    expect(target().matrixAutoUpdate).toBe(false)
    expect(wrapper.findAll('article')).toHaveLength(0)
  })

  it('adds a Translation through the UI with a stable session ID and neutral parameters', async () => {
    wrapper = mount(App)

    await add('translation')

    expect(wrapper.findAll('article')).toHaveLength(1)
    const operation = wrapper.get('article')
    expect(operation.attributes('data-operation-id')).toBe('op-1')
    expect(operation.get('h2').text()).toContain('Translation')
    expect(
      operation
        .findAll('input[type="number"]')
        .map((input) => (input.element as HTMLInputElement).value),
    ).toEqual(['0', '0', '0'])
    expect(target().matrix.elements).toEqual(new Matrix4().elements)
  })

  it('keeps compact add and operation controls explicitly named and keyboard accessible', async () => {
    wrapper = mount(App)
    const addButton = wrapper.get('button[aria-label="Add Transform"]')
    expect(addButton.attributes('title')).toBe('Add Transform')
    expect(addButton.attributes('type')).toBe('submit')
    expect(wrapper.get('label[for="transform-type"]').text()).toBe('Transform type')
    await add('translation')

    const header = wrapper.get('article header')
    expect(header.get('h2').text()).toBe('Translation')
    for (const label of ['Move up', 'Move down', 'Remove']) {
      const button = header.get(`button[aria-label="${label}"]`)
      expect(button.attributes('title')).toBe(label)
      expect(button.attributes('type')).toBe('button')
    }
    expect((header.get('button[aria-label="Move up"]').element as HTMLButtonElement).disabled).toBe(
      true,
    )
    expect(
      (header.get('button[aria-label="Move down"]').element as HTMLButtonElement).disabled,
    ).toBe(true)
    expect((header.get('button[aria-label="Remove"]').element as HTMLButtonElement).disabled).toBe(
      false,
    )
  })

  it('keeps each notation and rotation axis controls in the card header above the matrix', async () => {
    wrapper = mount(App)
    for (const [type, title, notation] of [
      ['translation', 'Translation', 'T(x, y, z)'],
      ['rotation', 'Rotation', 'Rz(θ)'],
      ['scale', 'Scale', 'S(sx, sy, sz)'],
      ['reflection', 'Reflection', 'RefYZ'],
      ['shear', 'Shear', 'H(kᵢⱼ)'],
    ]) {
      await add(type!)
      const card = wrapper.findAll('article')[0]!
      const header = card.get('header')
      expect(header.get('h2').text()).toBe(title)
      expect(header.get('.notation').text()).toContain(notation)
      expect(card.findAll('.notation')).toHaveLength(1)
      expect(card.get('.operation-editor').element.firstElementChild?.tagName).toBe('TABLE')
      expect(card.get('.operation-editor').find('.notation, .axis-selector').exists()).toBe(false)
      expect(card.findAll('td')).toHaveLength(16)
    }
    const rotationHeader = wrapper.get('article[data-operation-id="op-2"] header')
    expect(rotationHeader.findAll('.axis-selector button').map((button) => button.text())).toEqual([
      'X',
      'Y',
      'Z',
    ])
    await rotationHeader.get('button[aria-label="Rotation axis X"]').trigger('click')
    expect(rotationHeader.get('.notation sub').text()).toBe('x')
    expectResultsInSync()
  })

  it('prepends all five families in visual/product order without reusing removed IDs', async () => {
    wrapper = mount(App)
    const types = ['translation', 'rotation', 'scale', 'reflection', 'shear']
    for (const type of types) await add(type)

    expect(
      wrapper
        .getComponent(TransformStackPanel)
        .props('state')
        .operations.map(({ transform }) => transform.type),
    ).toEqual([...types].reverse())
    expect(
      wrapper.findAll('article').map((article) => article.attributes('data-operation-id')),
    ).toEqual(['op-5', 'op-4', 'op-3', 'op-2', 'op-1'])

    await wrapper
      .get('article[data-operation-id="op-2"]')
      .get('button[aria-label="Remove"]')
      .trigger('click')
    await add('translation')

    expect(
      wrapper.findAll('article').map((article) => article.attributes('data-operation-id')),
    ).toEqual(['op-6', 'op-5', 'op-4', 'op-3', 'op-1'])
    expect(
      (
        wrapper.get('article[data-operation-id="op-6"] button[aria-label="Move up"]')
          .element as HTMLButtonElement
      ).disabled,
    ).toBe(true)
    expect(
      (
        wrapper.get('article[data-operation-id="op-1"] button[aria-label="Move down"]')
          .element as HTMLButtonElement
      ).disabled,
    ).toBe(true)
  })

  it('edits Translation X immediately through application state and synchronizes the real target', async () => {
    wrapper = mount(App)
    await add('translation')
    const input = wrapper.get('article input[type="number"]')

    await input.setValue('2')

    expect(new Vector3().applyMatrix4(target().matrix).toArray()).toEqual([2, 0, 0])
    expect(
      wrapper.getComponent(TransformStackPanel).props('state').operations[0]?.transform,
    ).toEqual({ type: 'translation', x: 2, y: 0, z: 0 })

    await input.setValue('5')

    expect(new Vector3().applyMatrix4(target().matrix).toArray()).toEqual([5, 0, 0])
    expect(wrapper.get('article').attributes('data-operation-id')).toBe('op-1')
  })

  it('keeps the last valid mathematical state while a numeric input is temporarily empty', async () => {
    wrapper = mount(App)
    await add('translation')
    const input = wrapper.get('article input[type="number"]')
    await input.setValue('5')

    await input.setValue('')

    expect((input.element as HTMLInputElement).value).toBe('')
    expect(new Vector3().applyMatrix4(target().matrix).toArray()).toEqual([5, 0, 0])
    expect(
      wrapper.getComponent(TransformStackPanel).props('state').operations[0]?.transform,
    ).toEqual({ type: 'translation', x: 5, y: 0, z: 0 })
  })

  it('removes the last operation through the UI and restores identity', async () => {
    wrapper = mount(App)
    await add('translation')
    await wrapper.get('article input[type="number"]').setValue('2')

    await wrapper.get('article button[aria-label="Remove"]').trigger('click')

    expect(wrapper.findAll('article')).toHaveLength(0)
    expect(wrapper.getComponent(TransformStackPanel).props('state').operations).toEqual([])
    expect(target().matrix.elements).toEqual(new Matrix4().elements)
  })

  it('moves factors by stable ID in visual/product order and keeps DOM, Final Matrix and renderer synchronized both ways', async () => {
    wrapper = mount(App)
    await add('translation')
    await wrapper.get('article input[type="number"]').setValue('2')
    await add('rotation')
    await wrapper
      .get('article[data-operation-id="op-2"] td[data-index="0"] button')
      .trigger('click')
    await wrapper.get('article[data-operation-id="op-2"] input[type="number"]').setValue('90')
    const first = wrapper.get('article[data-operation-id="op-2"]')
    const last = wrapper.get('article[data-operation-id="op-1"]')
    const up = first.get('button[aria-label="Move up"]')
    const down = last.get('button[aria-label="Move down"]')
    expect((up.element as HTMLButtonElement).disabled).toBe(true)
    expect((down.element as HTMLButtonElement).disabled).toBe(true)
    expect(wrapper.findAll('article').map((card) => card.attributes('data-operation-id'))).toEqual([
      'op-2',
      'op-1',
    ])
    const before = expectResultsInSync()
    expect(before.matrix).toEqual(
      multiply(
        toMatrix({ type: 'rotation', axis: 'z', angle: Math.PI / 2 }),
        toMatrix({ type: 'translation', x: 2, y: 0, z: 0 }),
      ),
    )
    const beforeTarget = target().matrix.clone()
    const point = new Vector3().applyMatrix4(target().matrix)
    expect(point.x).toBeCloseTo(0, 12)
    expect(point.y).toBeCloseTo(2, 12)

    await last.get('button[aria-label="Move up"]').trigger('click')

    expect(
      wrapper.findAll('article').map((article) => article.attributes('data-operation-id')),
    ).toEqual(['op-1', 'op-2'])
    expect(expectResultsInSync().matrix).toEqual(
      multiply(
        toMatrix({ type: 'translation', x: 2, y: 0, z: 0 }),
        toMatrix({ type: 'rotation', axis: 'z', angle: Math.PI / 2 }),
      ),
    )
    expect(new Vector3().applyMatrix4(target().matrix).toArray()).toEqual([2, 0, 0])
    expect(target().matrix).not.toEqual(beforeTarget)
    expect((last.get('button[aria-label="Move up"]').element as HTMLButtonElement).disabled).toBe(
      true,
    )
    expect(
      (first.get('button[aria-label="Move down"]').element as HTMLButtonElement).disabled,
    ).toBe(true)

    await wrapper
      .get('article[data-operation-id="op-1"]')
      .get('button[aria-label="Move down"]')
      .trigger('click')

    expect(
      wrapper.findAll('article').map((article) => article.attributes('data-operation-id')),
    ).toEqual(['op-2', 'op-1'])
    expect(expectResultsInSync().matrix).toEqual(before.matrix)
    expect(target().matrix).toEqual(beforeTarget)
  })

  it.each(['duplicate-operation-id', 'operation-not-found', 'index-out-of-range'] as const)(
    'fails explicitly on %s without accepting a new state',
    (reason) => {
      wrapper = mount(App)
      const panel = wrapper.getComponent(TransformStackPanel)
      const initialState = panel.props('state')
      const warning = vi.spyOn(console, 'warn').mockImplementation(() => {})
      try {
        expect(() => panel.vm.$emit('edit', { ok: false, reason })).toThrow(
          `Stack edit failed: ${reason}`,
        )
        expect(panel.props('state')).toBe(initialState)
        expect(target().matrix.elements).toEqual(new Matrix4().elements)
      } finally {
        warning.mockRestore()
      }
    },
  )

  it('provides a single accessible Locate Cube button that invokes viewport.locateCube', async () => {
    wrapper = mount(App)
    const vp = vi.mocked(mountHarukaViewport).mock.results[0]!.value

    const locateButton = wrapper.get('button[aria-label="Locate Cube"]')
    expect(locateButton.attributes('type')).toBe('button')
    expect(locateButton.attributes('title')).toBe('Locate Cube')
    expect(locateButton.text()).toContain('Locate Cube')

    expect(wrapper.find('button[aria-label="Orbit Cube mode"]').exists()).toBe(false)
    expect(wrapper.find('button[aria-label="Free mode"]').exists()).toBe(false)
    expect(wrapper.find('button[aria-label="Reset Isometric"]').exists()).toBe(false)

    await locateButton.trigger('click')
    expect(vp.locateCube).toHaveBeenCalledOnce()
  })
})

describe('direct manipulation translation', () => {
  const viewport = () => vi.mocked(mountHarukaViewport).mock.results[0]!.value
  const canvas = () => wrapper.get('.viewport canvas')
  const press = async (key: string, init: KeyboardEventInit = {}, on: Element = document.body) => {
    const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...init })
    on.dispatchEvent(event)
    await wrapper.vm.$nextTick()
    return event
  }
  const pointer = async (on: Element, type: string, clientX: number) => {
    on.dispatchEvent(new MouseEvent(type, { button: 0, clientX, clientY: 50, bubbles: true }))
    await wrapper.vm.$nextTick()
  }
  const clickCanvas = async (x: number, drag = 0) => {
    await pointer(canvas().element, 'pointerdown', x)
    await pointer(canvas().element, 'pointerup', x + drag)
  }
  const move = async (x: number, y: number) => {
    window.dispatchEvent(new MouseEvent('pointermove', { clientX: x, clientY: y }))
    await new Promise((resolve) => requestAnimationFrame(resolve))
    await wrapper.vm.$nextTick()
  }
  const lastManipulation = () => vi.mocked(viewport().setManipulation).mock.calls.at(-1)?.[0]
  const hud = () => wrapper.find('.tool-hud')
  const caption = () => wrapper.get('.geometry-panel caption').text()
  const translationOf = (x: number, y: number, z: number) =>
    toMatrix({ type: 'translation', x, y, z })
  const mountWithRT = async () => {
    wrapper = mount(App, { attachTo: document.body })
    await add('translation')
    await wrapper.get('article input[name="x"]').setValue('2')
    await add('rotation')
    await wrapper
      .get('article[data-operation-id="op-2"] td[data-index="0"] button')
      .trigger('click')
    await wrapper.get('article[data-operation-id="op-2"] input[name="angle"]').setValue('90')
    await wrapper.get('article[data-operation-id="op-2"] input[name="angle"]').trigger('blur')
    return { state: stackPanel().props('state'), committed: expectResultsInSync().matrix }
  }

  it('selects by clicking the cube, deselects on background, ignores orbit drags and keeps the stack', async () => {
    const { state } = await mountWithRT()
    const syncs = vi.mocked(viewportSync()).mock.calls.length
    await clickCanvas(50)
    expect(lastManipulation()).toEqual({ selected: true, active: false })
    await clickCanvas(300)
    expect(lastManipulation()).toEqual({ selected: false, active: false })
    const calls = vi.mocked(viewport().setManipulation).mock.calls.length
    await clickCanvas(50, 20)
    const locate = wrapper.get('button[aria-label="Locate Cube"]').element
    await pointer(locate, 'pointerdown', 50)
    await pointer(locate, 'pointerup', 50)
    expect(vi.mocked(viewport().setManipulation).mock.calls).toHaveLength(calls)
    expect(stackPanel().props('state')).toBe(state)
    expect(vi.mocked(viewportSync())).toHaveBeenCalledTimes(syncs)
  })

  it('G previews T · M without editing the stack, X/Y/Z re-derive one draft, and Enter commits it on top', async () => {
    const { state, committed } = await mountWithRT()
    await press('g')
    expect(hud().exists()).toBe(false)
    await clickCanvas(50)
    await press('g')
    expect(hud().text()).toContain('Translate · Free')
    expect(lastManipulation()).toEqual({ selected: true, active: true })
    await move(200, 100)
    await move(500, 300)
    expect(expectResultsInSync().matrix).toEqual(multiply(translationOf(3, 2, 5), committed))
    expect(stackPanel().props('state')).toBe(state)
    expect(caption()).toContain('Preview')
    const cases: readonly (readonly [string, string, readonly [number, number, number]])[] = [
      ['x', 'X', [3, 0, 0]],
      ['Y', 'Y', [0, 2, 0]],
      ['z', 'Z', [0, 0, 5]],
      ['X', 'X', [3, 0, 0]],
    ]
    for (const [key, label, expected] of cases) {
      await press(key)
      expect(hud().text()).toContain(`Translate · ${label}`)
      expect(expectResultsInSync().matrix).toEqual(
        multiply(translationOf(expected[0], expected[1], expected[2]), committed),
      )
    }
    expect(hud().text()).toContain('T(3, 0, 0)')
    expect(stackPanel().props('state')).toBe(state)
    await press('g')
    expect(expectResultsInSync().matrix).toEqual(multiply(translationOf(3, 0, 0), committed))
    const preview = expectResultsInSync().matrix

    const enter = await press('Enter')
    expect(enter.defaultPrevented).toBe(true)
    expect(cardIds()).toEqual(['op-3', 'op-2', 'op-1'])
    expect(stackPanel().props('state').operations[0]?.transform).toEqual({
      type: 'translation',
      x: 3,
      y: 0,
      z: 0,
    })
    expect(stackPanel().props('state').operations.slice(1)).toEqual(state.operations)
    expect(expectResultsInSync().matrix).toEqual(preview)
    expect(hud().exists()).toBe(false)
    expect(caption()).toBe('Final Matrix')
    expect(lastManipulation()).toEqual({ selected: true, active: false })
    await add('scale')
    expect(cardIds()[0]).toBe('op-4')
  })

  it('Escape restores the committed results exactly; a left click commits like Enter', async () => {
    const { state, committed } = await mountWithRT()
    await clickCanvas(50)
    await press('g')
    await move(100, 100)
    await move(400, 100)
    expect(expectResultsInSync().matrix).not.toEqual(committed)
    await press('Escape')
    expect(expectResultsInSync().matrix).toEqual(committed)
    expect(stackPanel().props('state')).toBe(state)
    expect(hud().exists()).toBe(false)
    expect(lastManipulation()).toEqual({ selected: true, active: false })

    await press('g')
    await move(100, 100)
    await move(400, 100)
    const preview = expectResultsInSync().matrix
    await clickCanvas(300)
    expect(cardIds()).toEqual(['op-3', 'op-2', 'op-1'])
    expect(expectResultsInSync().matrix).toEqual(preview)
    expect(lastManipulation()).toEqual({ selected: true, active: false })
  })

  it('does not create a neutral translation for zero or microscopic movement', async () => {
    const { state } = await mountWithRT()
    await clickCanvas(50)
    await press('g')
    await press('Enter')
    await press('g')
    await move(200, 100)
    await move(200 + 1e-9, 100)
    await press('Enter')
    expect(stackPanel().props('state')).toBe(state)
    expect(hud().exists()).toBe(false)
  })

  it('ignores shortcuts typed into editable targets and repeated G, while Escape always cancels', async () => {
    const { state } = await mountWithRT()
    await clickCanvas(50)
    const input = wrapper.get('article input[name="x"]').element
    for (const key of ['g', 'x', 'y', 'z', 'G']) await press(key, {}, input)
    await press('g', { repeat: true })
    expect(hud().exists()).toBe(false)
    const editable = document.createElement('div')
    editable.setAttribute('contenteditable', '')
    document.body.append(editable)
    await press('g', {}, editable)
    expect(hud().exists()).toBe(false)
    editable.remove()

    await press('g')
    await press('x', {}, input)
    await press('Enter', {}, input)
    expect(hud().text()).toContain('Translate · Free')
    await press('Escape', {}, input)
    expect(hud().exists()).toBe(false)
    expect(stackPanel().props('state')).toBe(state)
  })

  it('blocks Locate Cube during a draft and restores it afterwards', async () => {
    await mountWithRT()
    await clickCanvas(50)
    await press('g')
    await wrapper.get('button[aria-label="Locate Cube"]').trigger('click')
    expect(viewport().locateCube).not.toHaveBeenCalled()
    await press('Escape')
    await wrapper.get('button[aria-label="Locate Cube"]').trigger('click')
    expect(viewport().locateCube).toHaveBeenCalledOnce()
  })

  it('removes draft listeners on unmount', async () => {
    await mountWithRT()
    await clickCanvas(50)
    await press('g')
    const syncs = vi.mocked(viewportSync()).mock.calls.length
    const removed = vi.spyOn(window, 'removeEventListener')
    wrapper.unmount()
    expect(removed.mock.calls.map(([type]) => type)).toEqual(
      expect.arrayContaining(['keydown', 'pointermove', 'pointerdown']),
    )
    window.dispatchEvent(new MouseEvent('pointermove', { clientX: 900, clientY: 900 }))
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }))
    expect(vi.mocked(viewportSync())).toHaveBeenCalledTimes(syncs)
    wrapper = undefined as unknown as VueWrapper
  })

  it('keeps repeated axis commits as separate translations without merging', async () => {
    const { state } = await mountWithRT()
    await clickCanvas(50)
    for (const key of ['x', 'y', 'z']) {
      await press('g')
      await press(key)
      await move(100, 100)
      await move(200, 300)
      await press('Enter')
    }
    expect(cardIds()).toEqual(['op-5', 'op-4', 'op-3', 'op-2', 'op-1'])
    expect(
      stackPanel()
        .props('state')
        .operations.slice(0, 3)
        .map(({ transform }: { transform: unknown }) => transform),
    ).toEqual([
      { type: 'translation', x: 0, y: 0, z: 3 },
      { type: 'translation', x: 0, y: 2, z: 0 },
      { type: 'translation', x: 1, y: 0, z: 0 },
    ])
    expect(stackPanel().props('state').operations.slice(3)).toEqual(state.operations)
    expectResultsInSync()
  })

  it('renders live draft card at the top of the stack during translation and commits it with exact continuity', async () => {
    const { committed } = await mountWithRT()
    await clickCanvas(50)
    await press('g')

    const draftCard = wrapper.find('.draft-card')
    expect(draftCard.exists()).toBe(true)
    expect(draftCard.find('.draft-badge').text()).toBe('Preview')
    expect(caption()).toBe('Preview')

    await move(100, 100)
    await move(300, 200)

    expect(draftCard.exists()).toBe(true)
    const expectedPreview = multiply(translationOf(2, 1, 3), committed)
    expect(expectResultsInSync().matrix).toEqual(expectedPreview)

    const enter = await press('Enter')
    expect(enter.defaultPrevented).toBe(true)
    expect(wrapper.find('.draft-card').exists()).toBe(false)
    expect(caption()).toBe('Final Matrix')
    expect(expectResultsInSync().matrix).toEqual(expectedPreview)
    expect(cardIds()[0]).toBe('op-3')
  })

  it('toggles plane locks via toolbar, reflects in HUD, restricts deltas, and persists across sessions', async () => {
    await mountWithRT()
    await clickCanvas(50)

    const btnX = wrapper.get('.axis-lock-toolbar button[aria-label="Lock X axis"]')
    const btnY = wrapper.get('.axis-lock-toolbar button[aria-label="Lock Y axis"]')
    const btnZ = wrapper.get('.axis-lock-toolbar button[aria-label="Lock Z axis"]')

    expect(btnX.attributes('aria-pressed')).toBe('false')
    expect(btnY.attributes('aria-pressed')).toBe('false')
    expect(btnZ.attributes('aria-pressed')).toBe('false')
    expect(btnX.classes()).not.toContain('active')

    await btnX.trigger('click')
    expect(btnX.attributes('aria-pressed')).toBe('true')
    expect(btnX.classes()).toContain('active')
    expect(vi.mocked(viewport().setViewAxisLock)).toHaveBeenLastCalledWith('x')

    await press('g')
    expect(hud().text()).toContain('Translate · Plane YZ')
    // Buttons are disabled during translation draft
    expect(btnX.attributes('disabled')).toBeDefined()
    expect(btnY.attributes('disabled')).toBeDefined()
    expect(btnZ.attributes('disabled')).toBeDefined()

    await move(100, 100)
    await move(200, 300)
    expect(hud().text()).toContain('T(0, 2, 3)')

    // Inside G, Y restricts to Y in YZ plane
    await press('y')
    expect(hud().text()).toContain('Translate · Y · Plane YZ')
    expect(hud().text()).toContain('T(0, 2, 0)')

    // Inside G, pressing X (the locked axis) is contradictory/ignored
    await press('x')
    expect(hud().text()).toContain('Translate · Y · Plane YZ')

    // Commit translation
    await press('Enter')
    expect(cardIds()[0]).toBe('op-3')
    expect(stackPanel().props('state').operations[0]?.transform).toEqual({
      type: 'translation',
      x: 0,
      y: 2,
      z: 0,
    })

    // Now draft is over, buttons enabled again
    expect(btnX.attributes('disabled')).toBeUndefined()
    expect(btnX.attributes('aria-pressed')).toBe('true')

    // Switch to Lock Z
    await btnZ.trigger('click')
    expect(btnX.attributes('aria-pressed')).toBe('false')
    expect(btnZ.attributes('aria-pressed')).toBe('true')
    expect(vi.mocked(viewport().setViewAxisLock)).toHaveBeenLastCalledWith('z')

    await press('g')
    expect(hud().text()).toContain('Translate · Plane XY')
    await move(100, 100)
    await move(200, 300)
    expect(hud().text()).toContain('T(1, 2, 0)')
    await press('Escape')

    // Untoggle Lock Z -> null (free)
    await btnZ.trigger('click')
    expect(btnZ.attributes('aria-pressed')).toBe('false')
    expect(vi.mocked(viewport().setViewAxisLock)).toHaveBeenLastCalledWith(null)
  })

  it('controls display precision from GeometryPanel without modifying underlying mathematical values', async () => {
    await mountWithRT()
    const select = wrapper.get('.geometry-panel select[aria-label="Displayed decimal places"]')
    expect((select.element as HTMLSelectElement).value).toBe('4')

    await select.setValue('1')
    expect(wrapper.getComponent({ name: 'GeometryPanel' }).props('precision')).toBe(1)
    const formattedCell = wrapper.findAll('.geometry-panel td[data-index]')[0]!.text()
    expect(formattedCell).toBe('0')

    await select.setValue('2')
    expect(wrapper.getComponent({ name: 'GeometryPanel' }).props('precision')).toBe(2)
    expect(wrapper.getComponent({ name: 'TransformStackPanel' }).props('precision')).toBe(2)

    // Underlying object matrix in Three is exact and unaffected
    expect(target().matrix.elements[12]).toBeCloseTo(0, 10)
    expect(target().matrix.elements[13]).toBeCloseTo(2, 10)
  })

  it('coalesces rapid pointer moves to 1 update per RAF, flushes latest on commit, and cancels cleanly on Escape', async () => {
    await mountWithRT()
    await clickCanvas(50)
    await press('g')

    const dragDeltaSpy = vi.mocked(viewport().dragDelta)
    dragDeltaSpy.mockClear()

    for (let i = 0; i < 10; i++) {
      window.dispatchEvent(
        new MouseEvent('pointermove', { clientX: 100 + i * 10, clientY: 100 + i * 10 }),
      )
    }
    expect(dragDeltaSpy).toHaveBeenCalledTimes(0)

    await new Promise((resolve) => requestAnimationFrame(resolve))
    await wrapper.vm.$nextTick()
    expect(dragDeltaSpy).toHaveBeenCalledTimes(1)
    expect(dragDeltaSpy.mock.calls[0]![1]).toEqual([190, 190])

    // Rapid event followed immediately by commit flushes without waiting for RAF
    dragDeltaSpy.mockClear()
    window.dispatchEvent(new MouseEvent('pointermove', { clientX: 250, clientY: 250 }))
    expect(dragDeltaSpy).toHaveBeenCalledTimes(0)

    await press('Enter')
    expect(dragDeltaSpy).toHaveBeenCalledTimes(1)
    expect(dragDeltaSpy.mock.calls[0]![1]).toEqual([250, 250])
  })

  it('displays discrete grab hint, highlights when selected, and hides during translation draft', async () => {
    await mountWithRT()
    const hint = wrapper.find('.grab-hint')
    expect(hint.exists()).toBe(true)
    expect(hint.text()).toContain('G — Grab')
    expect(hint.classes()).not.toContain('selected')

    // Click cube to select
    await clickCanvas(50)
    expect(wrapper.find('.grab-hint').classes()).toContain('selected')

    // Start translation draft via G
    await press('g')
    expect(wrapper.find('.grab-hint').exists()).toBe(false)
    expect(wrapper.find('.tool-hud').exists()).toBe(true)

    // Cancel draft via Escape
    await press('Escape')
    expect(wrapper.find('.grab-hint').exists()).toBe(true)
    expect(wrapper.find('.tool-hud').exists()).toBe(false)
  })
})
