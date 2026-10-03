// @vitest-environment jsdom
import { mount, type VueWrapper } from '@vue/test-utils'
import { afterEach, describe, expect, it } from 'vitest'
import type { Transform } from '../../domain'
import type { TransformOperation } from '../../app/transform-stack-state'
import TransformOperationEditor from '../TransformOperationEditor.vue'

const operationWith = (transform: Transform): TransformOperation =>
  Object.freeze({ id: 'op-1', transform: Object.freeze(transform) })

let wrapper: VueWrapper
const render = (transform: Transform) => {
  const operation = operationWith(transform)
  wrapper = mount(TransformOperationEditor, { props: { operation }, attachTo: document.body })
  return operation
}
afterEach(() => wrapper?.unmount())

describe('TransformOperationEditor', () => {
  it.each([
    {
      transform: { type: 'translation', x: 2, y: 3, z: 4 },
      fields: [
        [3, 'x'],
        [7, 'y'],
        [11, 'z'],
      ],
      notation: 'T(x, y, z)',
    },
    {
      transform: { type: 'scale', x: 1, y: 2, z: 3 },
      fields: [
        [0, 'x'],
        [5, 'y'],
        [10, 'z'],
      ],
      notation: 'S(sx, sy, sz)',
    },
    {
      transform: { type: 'shear', kxy: 0, kxz: 0, kyx: 0, kyz: 0, kzx: 0, kzy: 0 },
      fields: [
        [1, 'kxy'],
        [2, 'kxz'],
        [4, 'kyx'],
        [6, 'kyz'],
        [8, 'kzx'],
        [9, 'kzy'],
      ],
      notation: 'H(kᵢⱼ)',
    },
  ] as const)(
    'edits only the semantic $transform.type cells of a frozen transform',
    async ({ transform, fields, notation }) => {
      const operation = render(transform)
      expect(wrapper.get('.notation').text()).toContain(notation)
      expect(wrapper.find('caption').exists()).toBe(false)
      expect(wrapper.findAll('td')).toHaveLength(16)
      expect(
        wrapper
          .findAll('td')
          .filter((cell) => cell.find('input').exists())
          .map((cell) => Number(cell.attributes('data-index'))),
      ).toEqual(fields.map(([index]) => index))
      let current: Transform = transform
      for (const [offset, [index, field]] of fields.entries()) {
        const input = wrapper.get(`td[data-index="${index}"] input`)
        expect(input.attributes('name')).toBe(field)
        expect(input.attributes('type')).toBe('number')
        expect(input.attributes('step')).toBe('any')
        expect(input.attributes('aria-label')).toContain('matrix cell')
        expect(input.attributes('title')).toBe(input.attributes('aria-label'))
        await input.setValue(String(offset - 2.5))
        const replacement: Transform = { ...current, [field]: offset - 2.5 }
        const emitted = wrapper.emitted('update-transform')?.slice(-1)[0]?.[0]
        expect(emitted).toEqual(replacement)
        expect(emitted).not.toBe(current)
        current = replacement
        await wrapper.setProps({ operation: operationWith(current) })
      }
      expect(wrapper.emitted('update-transform')).toHaveLength(fields.length)
      expect(operation.transform).toEqual(transform)
      for (const cell of wrapper.findAll('td')) {
        if (fields.some(([index]) => index === Number(cell.attributes('data-index')))) continue
        expect(cell.find('input, button, [tabindex], [contenteditable]').exists()).toBe(false)
      }
      expect(wrapper.findAll('input').every((input) => input.element.closest('td'))).toBe(true)
      expect(wrapper.find('select, label').exists()).toBe(false)
    },
  )

  it.each(['0', '-2.5', '0.25'])('allows scale.y = %s through diagonal cell 5', async (value) => {
    render({ type: 'scale', x: 1, y: 2, z: 3 })
    await wrapper.get('td[data-index="5"] input').setValue(value)
    expect(wrapper.emitted('update-transform')).toEqual([
      [{ type: 'scale', x: 1, y: Number(value), z: 3 }],
    ])
  })

  it.each([
    { transform: { type: 'translation', x: 2.5, y: 2, z: 3 }, index: 3, field: 'x' },
    { transform: { type: 'rotation', axis: 'z', angle: Math.PI / 6 }, index: 0, field: 'angle' },
    {
      transform: { type: 'shear', kxy: 2.5, kxz: 0, kyx: 0, kyz: 0, kzx: 0, kzy: 0 },
      index: 1,
      field: 'kxy',
    },
  ] as const)(
    'keeps $transform.type drafts out of authoritative mathematical state',
    async ({ transform, index, field }) => {
      const operation = render(transform)
      if (transform.type === 'rotation')
        await wrapper.get(`td[data-index="${index}"] button`).trigger('click')
      const input = wrapper.get(`td[data-index="${index}"] input`)
      for (const value of ['', 'abc', 'NaN', 'Infinity', '-Infinity', '-', '.', '1.', '1e309']) {
        await input.setValue(value)
        expect(wrapper.emitted('update-transform')).toBeUndefined()
        expect([value, '']).toContain((input.element as HTMLInputElement).value)
        expect(operation.transform).toEqual(transform)
      }
      await input.setValue('8.25')
      const value = field === 'angle' ? 8.25 * (Math.PI / 180) : 8.25
      expect(wrapper.emitted('update-transform')).toEqual([[{ ...transform, [field]: value }]])
    },
  )

  it('preserves an incomplete coordinate draft while another cell updates', async () => {
    render({ type: 'translation', x: 2.5, y: 2, z: 3 })
    const x = wrapper.get('td[data-index="3"] input')
    await x.setValue('')
    await wrapper.get('td[data-index="7"] input').setValue('5')
    expect(wrapper.emitted('update-transform')).toEqual([
      [{ type: 'translation', x: 2.5, y: 5, z: 3 }],
    ])
    await wrapper.setProps({
      operation: operationWith({ type: 'translation', x: 2.5, y: 5, z: 3 }),
    })
    expect((x.element as HTMLInputElement).value).toBe('')
    await x.setValue('7')
    expect(wrapper.emitted('update-transform')?.slice(-1)[0]).toEqual([
      { type: 'translation', x: 7, y: 5, z: 3 },
    ])
  })

  it('uses exclusive reflection diagonal selectors and ignores the active choice', async () => {
    const operation = render({ type: 'reflection', plane: 'yz' })
    expect(wrapper.get('.notation').text()).toBe('RefYZ')
    expect(wrapper.find('input, select').exists()).toBe(false)
    expect(wrapper.findAll('td button').map((button) => button.attributes('aria-label'))).toEqual([
      'Reflect across YZ',
      'Reflect across XZ',
      'Reflect across XY',
    ])
    await wrapper.get('td[data-index="0"] button').trigger('click')
    expect(wrapper.emitted('update-transform')).toBeUndefined()
    for (const [index, plane, diagonal] of [
      [5, 'xz', ['1', '-1', '1']],
      [10, 'xy', ['1', '1', '-1']],
      [0, 'yz', ['-1', '1', '1']],
    ] as const) {
      await wrapper.get(`td[data-index="${index}"] button`).trigger('click')
      expect(wrapper.emitted('update-transform')?.slice(-1)[0]).toEqual([
        { type: 'reflection', plane },
      ])
      await wrapper.setProps({ operation: operationWith({ type: 'reflection', plane }) })
      expect([0, 5, 10].map((i) => wrapper.get(`td[data-index="${i}"]`).text())).toEqual(diagonal)
      expect(wrapper.get(`td[data-index="${index}"] button`).attributes('aria-pressed')).toBe(
        'true',
      )
      expect(wrapper.findAll('td button[aria-pressed="true"]')).toHaveLength(1)
      expect(wrapper.get('.notation').text()).toBe(`Ref${plane.toUpperCase()}`)
    }
    expect(operation.transform).toEqual({ type: 'reflection', plane: 'yz' })
  })

  it.each([
    ['x', [5, 6, 9, 10], ['cos(90°)', '-sen(90°)', 'sen(90°)', 'cos(90°)']],
    ['y', [0, 2, 8, 10], ['cos(90°)', 'sen(90°)', '-sen(90°)', 'cos(90°)']],
    ['z', [0, 1, 4, 5], ['cos(90°)', '-sen(90°)', 'sen(90°)', 'cos(90°)']],
  ] as const)(
    'renders %s rotation cells symbolically with no permanent inputs',
    (axis, indices, text) => {
      render({ type: 'rotation', axis, angle: Math.PI / 2 })
      expect(
        wrapper
          .findAll('td button')
          .map((button) => Number(button.element.closest('td')!.dataset.index)),
      ).toEqual(indices)
      expect(indices.map((index) => wrapper.get(`td[data-index="${index}"]`).text())).toEqual(text)
      expect(wrapper.find('input, select, caption').exists()).toBe(false)
      expect(wrapper.get('.notation').text()).toContain(`R${axis}(θ)`)
      expect(wrapper.get('.notation sub').text()).toBe(axis)
      for (const cell of wrapper.findAll('td')) {
        if (indices.some((index) => index === Number(cell.attributes('data-index')))) continue
        expect(cell.find('input, button, [tabindex], [contenteditable]').exists()).toBe(false)
      }
    },
  )

  it.each([0, 1, 4, 5])(
    'edits the same angle through symbolic cell %s and links all expressions',
    async (index) => {
      const operation = render({ type: 'rotation', axis: 'z', angle: Math.PI / 6 })
      await wrapper.get(`td[data-index="${index}"] button`).trigger('click')
      const input = wrapper.get('input[name="angle"]')
      expect(wrapper.findAll('input')).toHaveLength(1)
      expect((input.element as HTMLInputElement).value).toBe('30')
      expect(document.activeElement).toBe(input.element)
      expect(input.attributes('aria-label')).toContain('Rotation angle through')
      await input.setValue('45')
      expect(wrapper.emitted('update-transform')).toEqual([
        [{ type: 'rotation', axis: 'z', angle: Math.PI / 4 }],
      ])
      await wrapper.setProps({
        operation: operationWith({ type: 'rotation', axis: 'z', angle: Math.PI / 4 }),
      })
      expect((input.element as HTMLInputElement).value).toBe('45')
      await input.trigger('blur')
      expect(wrapper.find('input').exists()).toBe(false)
      expect([0, 1, 4, 5].map((i) => wrapper.get(`td[data-index="${i}"]`).text())).toEqual([
        'cos(45°)',
        '-sen(45°)',
        'sen(45°)',
        'cos(45°)',
      ])
      expect(operation.transform).toEqual({ type: 'rotation', axis: 'z', angle: Math.PI / 6 })
    },
  )

  it('opens with Enter and discards an invalid draft with Escape, Enter or blur without reverting a valid edit', async () => {
    render({ type: 'rotation', axis: 'z', angle: Math.PI / 6 })
    await wrapper.get('td[data-index="0"] button').trigger('keydown', { key: 'Enter' })
    await wrapper.get('input[name="angle"]').setValue('45')
    await wrapper.setProps({
      operation: operationWith({ type: 'rotation', axis: 'z', angle: Math.PI / 4 }),
    })
    for (const action of ['Escape', 'Enter', 'blur']) {
      if (!wrapper.find('input').exists())
        await wrapper.get('td[data-index="0"] button').trigger('click')
      const input = wrapper.get('input[name="angle"]')
      await input.setValue('')
      if (action === 'blur') await input.trigger('blur')
      else await input.trigger('keydown', { key: action })
      expect(wrapper.find('input').exists()).toBe(false)
      expect(wrapper.get('td[data-index="0"] button').text()).toBe('cos(45°)')
      expect(wrapper.emitted('update-transform')).toHaveLength(1)
      expect(document.activeElement).toBe(
        action === 'blur' ? document.body : wrapper.get('td[data-index="0"] button').element,
      )
    }
  })

  it('keeps only one angle input when another symbolic cell is activated', async () => {
    render({ type: 'rotation', axis: 'z', angle: Math.PI / 6 })
    await wrapper.get('td[data-index="0"] button').trigger('click')
    await wrapper.get('input[name="angle"]').setValue('')
    await wrapper.get('td[data-index="4"] button').trigger('click')
    expect(wrapper.findAll('input')).toHaveLength(1)
    expect(wrapper.find('td[data-index="0"] input').exists()).toBe(false)
    expect((wrapper.get('td[data-index="4"] input').element as HTMLInputElement).value).toBe('30')
    expect(wrapper.emitted('update-transform')).toBeUndefined()
  })

  it('offers compact axis buttons while preserving the exact angle and switching symbolic cells', async () => {
    const angle = Math.PI / 6 + 1e-12
    render({ type: 'rotation', axis: 'z', angle })
    expect(wrapper.findAll('.axis-selector button').map((button) => button.text())).toEqual([
      'X',
      'Y',
      'Z',
    ])
    for (const [axis, indices] of [
      ['x', [5, 6, 9, 10]],
      ['y', [0, 2, 8, 10]],
      ['z', [0, 1, 4, 5]],
    ] as const) {
      await wrapper.get(`button[aria-label="Rotation axis ${axis.toUpperCase()}"]`).trigger('click')
      expect(wrapper.emitted('update-transform')?.slice(-1)[0]).toEqual([
        { type: 'rotation', axis, angle },
      ])
      await wrapper.setProps({ operation: operationWith({ type: 'rotation', axis, angle }) })
      expect(
        wrapper
          .findAll('td button')
          .map((button) => Number(button.element.closest('td')!.dataset.index)),
      ).toEqual(indices)
      expect(
        wrapper
          .get(`button[aria-label="Rotation axis ${axis.toUpperCase()}"]`)
          .attributes('aria-pressed'),
      ).toBe('true')
    }
    expect(wrapper.find('input, select').exists()).toBe(false)
  })

  it('preserves exact lexical drafts during continuous numeric typing and skips redundant semantic emits', async () => {
    render({ type: 'translation', x: 0, y: 0, z: 0 })
    const input = wrapper.get('td[data-index="3"] input')
    await input.trigger('focus')

    await input.setValue('0.0')
    expect((input.element as HTMLInputElement).value).toBe('0.0')
    expect(wrapper.emitted('update-transform')).toBeUndefined()

    await input.setValue('0.00')
    expect((input.element as HTMLInputElement).value).toBe('0.00')
    expect(wrapper.emitted('update-transform')).toBeUndefined()

    await input.setValue('0.01')
    expect((input.element as HTMLInputElement).value).toBe('0.01')
    expect(wrapper.emitted('update-transform')).toEqual([
      [{ type: 'translation', x: 0.01, y: 0, z: 0 }],
    ])
  })

  it('preserves active draft across parent prop updates and canonicalizes on blur', async () => {
    render({ type: 'translation', x: 0, y: 0, z: 0 })
    const xInput = wrapper.get('td[data-index="3"] input')
    await xInput.setValue('0.00')

    await wrapper.setProps({
      operation: operationWith({ type: 'translation', x: 0, y: 5, z: 0 }),
    })

    expect((xInput.element as HTMLInputElement).value).toBe('0.00')

    await xInput.trigger('blur')
    expect((xInput.element as HTMLInputElement).value).toBe('0')
  })

  it('preserves angle draft during continuous rotation editing, skips redundant emits, and restores canonical symbol on blur', async () => {
    render({ type: 'rotation', axis: 'z', angle: 0 })
    await wrapper.get('td[data-index="0"] button').trigger('click')
    const angleInput = wrapper.get('input[name="angle"]')

    await angleInput.setValue('0.0')
    expect((angleInput.element as HTMLInputElement).value).toBe('0.0')
    expect(wrapper.emitted('update-transform')).toBeUndefined()

    await angleInput.setValue('0.00')
    expect((angleInput.element as HTMLInputElement).value).toBe('0.00')
    expect(wrapper.emitted('update-transform')).toBeUndefined()

    await angleInput.setValue('0.01')
    expect((angleInput.element as HTMLInputElement).value).toBe('0.01')
    const expectedAngle = 0.01 * (Math.PI / 180)
    expect(wrapper.emitted('update-transform')).toEqual([
      [{ type: 'rotation', axis: 'z', angle: expectedAngle }],
    ])

    await angleInput.setValue('45.00')
    expect((angleInput.element as HTMLInputElement).value).toBe('45.00')
    const angle45 = 45 * (Math.PI / 180)
    expect(wrapper.emitted('update-transform')?.slice(-1)[0]).toEqual([
      { type: 'rotation', axis: 'z', angle: angle45 },
    ])
    await wrapper.setProps({
      operation: operationWith({ type: 'rotation', axis: 'z', angle: angle45 }),
    })
    expect((angleInput.element as HTMLInputElement).value).toBe('45.00')

    await angleInput.trigger('blur')
    expect(wrapper.find('input').exists()).toBe(false)
    expect(wrapper.get('td[data-index="0"] button').text()).toBe('cos(45°)')
  })
})
