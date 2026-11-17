// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { mount, type VueWrapper } from '@vue/test-utils'
import { nextTick } from 'vue'
import type { TransformStackState } from '../../app/transform-stack-state'
import { createPivotOperation } from '../../app/transform-stack-state'
import { deriveDestinationIndex } from '../../ui/transform-stack-dnd'
import TransformStackPanel from '../TransformStackPanel.vue'

let wrapper: VueWrapper<InstanceType<typeof TransformStackPanel>>
afterEach(() => wrapper?.unmount())
const initialState: TransformStackState = {
  operations: ['A', 'B', 'C'].map((id) => ({
    id,
    transform: { type: 'translation', x: 0, y: 0, z: 0 },
  })),
}
const startDrag = async (id = 'C') => {
  wrapper = mount(TransformStackPanel, { props: { state: initialState } })
  await wrapper.get(`article[data-operation-id="${id}"] h2`).trigger('dragstart')
}
const hover = async (clientY: number) => {
  wrapper.findAll('article').forEach((card, index) => {
    vi.spyOn(card.element, 'getBoundingClientRect').mockReturnValue({
      top: index * 100,
      height: 100,
    } as DOMRect)
  })
  await wrapper.get('.stack-panel').trigger('dragover', { clientY })
}
const expectClean = () => {
  expect(wrapper.find('.dragging, .drop-indicator').exists()).toBe(false)
}

describe('transformation stack drag identity', () => {
  it('opens one composition at a time and closes it when clicking outside its card', async () => {
    const rotation = { type: 'rotation', axis: 'z', angle: 0.5 } as const
    const state = {
      operations: [
        createPivotOperation('A', rotation, [1, 2, 3]),
        createPivotOperation('B', rotation, [1, 2, 3]),
      ],
    }
    wrapper = mount(TransformStackPanel, { props: { state }, attachTo: document.body })
    const first = wrapper.get('article[data-operation-id="A"]')
    const second = wrapper.get('article[data-operation-id="B"]')
    await first.get('button[aria-label="Expand composition"]').trigger('click')
    expect(wrapper.findAll('.composition')).toHaveLength(1)
    await second.get('button[aria-label="Expand composition"]').trigger('click')
    expect(first.find('.composition').exists()).toBe(false)
    expect(second.find('.composition').exists()).toBe(true)
    await second.get('input[aria-label="Use own center"]').trigger('click')
    expect(second.find('.composition').exists()).toBe(true)
    document.body.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await nextTick()
    expect(wrapper.findAll('.composition')).toHaveLength(0)
    await first.get('button[aria-label="Expand composition"]').trigger('click')
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    await nextTick()
    expect(wrapper.findAll('.composition')).toHaveLength(0)
  })
  it('adds a normal scale on top with pivot compensation disabled', async () => {
    const state: TransformStackState = {
      operations: [{ id: 'r', transform: { type: 'rotation', axis: 'x', angle: Math.PI / 4 } }],
    }
    wrapper = mount(TransformStackPanel, { props: { state } })
    await wrapper.get('select[name="transform-type"]').setValue('scale')
    await wrapper.get('form').trigger('submit')
    const edit = wrapper.emitted('edit')![0]![0] as { ok: true; state: TransformStackState }
    expect(edit.state.operations[1]).toEqual(state.operations[0])
    expect(edit.state.operations[0]).toMatchObject({
      transform: { type: 'scale' },
      joint: { pivotEnabled: false },
    })
  })
  it('adds pure rotations with pivot compensation disabled by default and has no display-mode selector', async () => {
    const state: TransformStackState = {
      operations: [{ id: 't', transform: { type: 'translation', x: 2, y: 3, z: 4 } }],
    }
    wrapper = mount(TransformStackPanel, { props: { state } })
    await wrapper.get('select[name="transform-type"]').setValue('rotation')
    await wrapper.get('form').trigger('submit')
    const edit = wrapper.emitted('edit')![0]![0] as { ok: true; state: TransformStackState }
    expect(edit.state.operations[0]!.joint!.pivot).toEqual([2, 3, 4])
    expect(edit.state.operations[0]!.joint!.pivotEnabled).toBe(false)
    expect(wrapper.find('select[aria-label="Composed matrix view"]').exists()).toBe(false)
  })
  it('resolves the current source index by stable ID at drop, ignoring DataTransfer identity', async () => {
    await startDrag()
    await wrapper.setProps({
      state: {
        operations: [
          initialState.operations[2]!,
          initialState.operations[0]!,
          initialState.operations[1]!,
        ],
      },
    })
    await hover(210)
    await wrapper.get('.stack-panel').trigger('drop', { dataTransfer: { getData: () => 'A' } })
    expect(wrapper.emitted('edit')).toEqual([
      [
        {
          ok: true,
          state: {
            operations: [
              initialState.operations[0],
              initialState.operations[2],
              initialState.operations[1],
            ],
          },
        },
      ],
    ])
    expectClean()
  })

  it('fails closed when the source ID was removed during drag', async () => {
    await startDrag()
    await wrapper.setProps({ state: { operations: initialState.operations.slice(0, 2) } })
    await hover(300)
    await wrapper.get('.stack-panel').trigger('drop')
    expect(wrapper.emitted('edit')).toBeUndefined()
    expectClean()
  })

  it('rejects a slot that became out of range when props changed', async () => {
    await startDrag('B')
    await hover(300)
    expect(wrapper.get('.drop-indicator').attributes('data-insertion-slot')).toBe('3')
    await wrapper.setProps({
      state: { operations: [initialState.operations[1]!, initialState.operations[2]!] },
    })
    await wrapper.get('.stack-panel').trigger('drop')
    expect(wrapper.emitted('edit')).toBeUndefined()
    expectClean()
  })

  it('cleans up a drop without a chosen insertion slot', async () => {
    await startDrag()
    expect(wrapper.find('.dragging').exists()).toBe(true)
    await wrapper.get('.stack-panel').trigger('drop')
    expect(wrapper.emitted('edit')).toBeUndefined()
    expectClean()
  })
})

describe('transformation stack drag ergonomics', () => {
  it('keeps the three reorder controls and draggable cards without a separate drag handle', () => {
    wrapper = mount(TransformStackPanel, { props: { state: initialState } })
    expect(wrapper.find('.drag-handle').exists()).toBe(false)
    for (const card of wrapper.findAll('article')) {
      expect(card.attributes('draggable')).toBe('true')
      expect(
        card.findAll('.operation-controls button').map((button) => button.attributes('aria-label')),
      ).toEqual(['Move up', 'Move down', 'Remove'])
    }
  })

  it.each(['h2', '.notation', 'td[data-index="0"] span', 'article'])(
    'starts native card dragging from %s',
    async (surface) => {
      wrapper = mount(TransformStackPanel, { props: { state: initialState } })
      const card = wrapper.get('article[data-operation-id="B"]')
      expect(card.attributes('draggable')).toBe('true')
      await (surface === 'article' ? card : card.get(surface)).trigger('dragstart')
      expect(card.classes()).toContain('dragging')
      expect(
        wrapper.findAll('article.dragging').map((source) => source.attributes('data-operation-id')),
      ).toEqual(['B'])
      await hover(70)
      expect(wrapper.get('.drop-indicator').attributes('data-insertion-slot')).toBe('0')
      await wrapper.get('.stack-panel').trigger('drop')
      expect(wrapper.emitted('edit')).toEqual([
        [
          {
            ok: true,
            state: {
              operations: [
                initialState.operations[1],
                initialState.operations[0],
                initialState.operations[2],
              ],
            },
          },
        ],
      ])
      expectClean()
    },
  )

  it.each([
    'input',
    'select',
    'button',
    'textarea',
    'div[contenteditable]',
    'a[href]',
    'label[for]',
    'span[data-no-drag]',
  ])('explicitly cancels native dragstart from %s', async (selector) => {
    wrapper = mount(TransformStackPanel, { props: { state: initialState } })
    const card = wrapper.get('article')
    const [tag, attribute] = selector.replace(']', '').split('[')
    const control = document.createElement(tag!)
    if (attribute) control.setAttribute(attribute, '')
    card.element.append(control)
    const event = new Event('dragstart', { bubbles: true, cancelable: true })
    control.dispatchEvent(event)
    await nextTick()
    expect(event.defaultPrevented).toBe(true)
    expectClean()
    expect(wrapper.emitted('edit')).toBeUndefined()
  })

  it('blocks an interactive mouse origin even when the browser targets dragstart at the article', async () => {
    wrapper = mount(TransformStackPanel, { props: { state: initialState } })
    const card = wrapper.get('article[data-operation-id="B"]')
    await card.get('input').trigger('mousedown')
    const event = new Event('dragstart', { bubbles: true, cancelable: true })
    card.element.dispatchEvent(event)
    await nextTick()
    expect(event.defaultPrevented).toBe(true)
    expectClean()
    await card.get('h2').trigger('mousedown')
    await card.trigger('dragstart')
    expect(card.classes()).toContain('dragging')
  })

  it('excludes the source bounds and responds shortly after entering the lower neighbor', async () => {
    wrapper = mount(TransformStackPanel, { props: { state: initialState } })
    await wrapper.get('article[data-operation-id="B"] h2').trigger('dragstart')
    wrapper.findAll('article').forEach((card, index) => {
      vi.spyOn(card.element, 'getBoundingClientRect').mockReturnValue({
        top: index * 100,
        height: index === 1 ? 10000 : 100,
      } as DOMRect)
    })
    await wrapper.get('.stack-panel').trigger('dragover', { clientY: 230 })
    expect(wrapper.get('.drop-indicator').attributes('data-insertion-slot')).toBe('3')
    expect(
      wrapper.get('article[data-operation-id="B"]').element.getBoundingClientRect,
    ).not.toHaveBeenCalled()
    await wrapper.get('.stack-panel').trigger('drop')
    expect(wrapper.emitted('edit')).toEqual([
      [
        {
          ok: true,
          state: {
            operations: [
              initialState.operations[0],
              initialState.operations[2],
              initialState.operations[1],
            ],
          },
        },
      ],
    ])
  })

  it.each([
    [0, 130, ['B', 'A', 'C']],
    [1, 70, ['B', 'A', 'C']],
    [1, 230, ['A', 'C', 'B']],
    [2, 170, ['A', 'C', 'B']],
  ] as const)(
    'the indicator for source %s at pointer %s matches the drop result',
    async (source, pointer, expected) => {
      wrapper = mount(TransformStackPanel, { props: { state: initialState } })
      const id = initialState.operations[source]!.id
      await wrapper.get(`article[data-operation-id="${id}"] h2`).trigger('dragstart')
      await hover(pointer)
      expect(wrapper.findAll('.drop-indicator')).toHaveLength(1)
      const slot = Number(wrapper.get('.drop-indicator').attributes('data-insertion-slot'))
      const destination = deriveDestinationIndex(source, slot, initialState.operations.length)
      expect(destination).not.toBe(source)
      expect(expected.indexOf(id as 'A' | 'B' | 'C')).toBe(destination)
      await wrapper.get('.stack-panel').trigger('drop')
      const result = wrapper.emitted('edit')![0]![0] as { ok: true; state: TransformStackState }
      expect(result.state.operations.map((op) => op.id)).toEqual(expected)
      expectClean()
    },
  )

  it('hides the indicator when dropping at the original position would be a no-op', async () => {
    wrapper = mount(TransformStackPanel, { props: { state: initialState } })
    await wrapper.get('article[data-operation-id="B"] h2').trigger('dragstart')
    await hover(150)
    expect(wrapper.find('.drop-indicator').exists()).toBe(false)
    await wrapper.get('.stack-panel').trigger('drop')
    expect(wrapper.emitted('edit')).toBeUndefined()
    expectClean()
  })

  it('keeps the indicator stable near a boundary and removes it when returning to the original slot', async () => {
    wrapper = mount(TransformStackPanel, { props: { state: initialState } })
    await wrapper.get('article[data-operation-id="A"] h2').trigger('dragstart')
    await hover(150)
    const slots = []
    for (const pointer of [225, 228, 226, 229, 228, 226]) {
      await wrapper.get('.stack-panel').trigger('dragover', { clientY: pointer })
      slots.push(wrapper.get('.drop-indicator').attributes('data-insertion-slot'))
    }
    expect(slots).toEqual(['2', '2', '2', '3', '3', '3'])
    await wrapper.get('.stack-panel').trigger('dragover', { clientY: 90 })
    expect(wrapper.find('.drop-indicator').exists()).toBe(false)
    await wrapper.get('.stack-panel').trigger('drop')
    expect(wrapper.emitted('edit')).toBeUndefined()
    expectClean()
  })

  it.each([
    ['A', 300, '3', 'C', undefined],
    ['C', 70, '0', undefined, 'A'],
    ['C', 170, '1', 'A', 'B'],
  ] as const)(
    'renders the slot for %s at pointer %s as one gap between cards',
    async (id, pointer, slot, before, after) => {
      await startDrag(id)
      await hover(pointer)
      const indicators = wrapper.findAll('.drop-indicator')
      expect(indicators).toHaveLength(1)
      const indicator = indicators[0]!.element as HTMLElement
      expect(indicator.dataset.insertionSlot).toBe(slot)
      expect(indicator.parentElement).toBe(wrapper.get('.stack-panel').element)
      const previous = indicator.previousElementSibling as HTMLElement | null
      const next = indicator.nextElementSibling as HTMLElement | null
      expect(previous?.tagName === 'ARTICLE' ? previous.dataset.operationId : undefined).toBe(
        before,
      )
      expect(next?.dataset.operationId).toBe(after)
      await wrapper.get('article').trigger('dragend')
      expectClean()
      expect(wrapper.emitted('edit')).toBeUndefined()
    },
  )

  it('shows no reorder indicator or edit when dragging the only card', async () => {
    wrapper = mount(TransformStackPanel, {
      props: { state: { operations: [initialState.operations[0]!] } },
    })
    await wrapper.get('article h2').trigger('dragstart')
    await hover(300)
    expect(wrapper.find('.drop-indicator').exists()).toBe(false)
    await wrapper.get('.stack-panel').trigger('drop')
    expect(wrapper.emitted('edit')).toBeUndefined()
    expectClean()
  })
})
