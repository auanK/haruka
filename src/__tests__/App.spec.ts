// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { mount, type VueWrapper } from '@vue/test-utils'
import { Matrix4, Vector3 } from 'three'
import type { CubeVertex } from '../app/didactic-cube'
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
    mountHarukaViewport: vi.fn<(container: HTMLElement) => HarukaViewport>(() => {
      const target = new Group()
      target.matrixAutoUpdate = false
      target.matrix.makeTranslation(99, 99, 99)
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
        dispose: vi.fn<() => void>(),
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

describe('transformation stack integration', () => {
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
