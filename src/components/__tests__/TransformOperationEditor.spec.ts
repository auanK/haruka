// @vitest-environment jsdom
import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import type { Transform } from '../../domain'
import type { TransformOperation } from '../../app/transform-stack-state'
import TransformOperationEditor from '../TransformOperationEditor.vue'

const operationWith = (transform: Transform): TransformOperation =>
  Object.freeze({ id: 'op-1', transform: Object.freeze(transform) })

describe('TransformOperationEditor', () => {
  it.each(['translation', 'scale'] as const)(
    'edits all %s coordinates immediately by replacing a frozen transform',
    async (type) => {
      const operation = operationWith({ type, x: 1, y: 2, z: 3 })
      const wrapper = mount(TransformOperationEditor, { props: { operation } })
      expect(wrapper.findAll('label').map((label) => label.text())).toEqual(['X', 'Y', 'Z'])
      expect(wrapper.findAll('input')).toHaveLength(3)
      let transform = operation.transform

      for (const [field, value] of [
        ['x', '0'],
        ['y', '-2.5'],
        ['z', '4'],
      ] as const) {
        const input = wrapper.get(`input[name="${field}"]`)
        expect(input.attributes('type')).toBe('number')
        expect(input.attributes('step')).toBe('any')
        await input.setValue(value)
        const replacement = { ...transform, [field]: Number(value) }
        const emitted = wrapper.emitted('update-transform')?.slice(-1)[0]?.[0]
        expect(emitted).toEqual(replacement)
        expect(emitted).not.toBe(transform)
        transform = replacement
        await wrapper.setProps({ operation: operationWith(transform) })
      }

      expect(wrapper.emitted('update-transform')).toHaveLength(3)
      expect(operation.transform).toEqual({ type, x: 1, y: 2, z: 3 })
      expect(wrapper.find('button').exists()).toBe(false)
    },
  )

  it('keeps the last mathematical state and an empty native draft for invalid numbers', async () => {
    const operation = operationWith({ type: 'translation', x: 2.5, y: 2, z: 3 })
    const wrapper = mount(TransformOperationEditor, { props: { operation } })
    const input = wrapper.get('input[name="x"]')

    for (const value of ['', 'abc', 'NaN', 'Infinity', '-Infinity', '-', '.', '1.']) {
      await input.setValue(value)
      expect(wrapper.emitted('update-transform')).toBeUndefined()
      expect((input.element as HTMLInputElement).value).toBe('')
    }

    expect(operation.transform).toEqual({ type: 'translation', x: 2.5, y: 2, z: 3 })
    await input.setValue('8.25')
    expect(wrapper.emitted('update-transform')).toEqual([
      [{ type: 'translation', x: 8.25, y: 2, z: 3 }],
    ])
  })

  it('preserves an incomplete field draft while another coordinate is updated', async () => {
    const operation = operationWith({ type: 'translation', x: 2.5, y: 2, z: 3 })
    const wrapper = mount(TransformOperationEditor, { props: { operation } })
    const xInput = wrapper.get('input[name="x"]')
    await xInput.setValue('')
    await wrapper.get('input[name="y"]').setValue('5')
    expect(wrapper.emitted('update-transform')).toEqual([
      [{ type: 'translation', x: 2.5, y: 5, z: 3 }],
    ])

    await wrapper.setProps({
      operation: operationWith({ type: 'translation', x: 2.5, y: 5, z: 3 }),
    })
    expect((xInput.element as HTMLInputElement).value).toBe('')
    expect(wrapper.get('table').findAll('td')[3]?.text()).toBe('2.5')
    await xInput.setValue('7')
    expect(wrapper.emitted('update-transform')?.slice(-1)[0]).toEqual([
      { type: 'translation', x: 7, y: 5, z: 3 },
    ])
  })

  it('offers all rotation axes and converts the visible degrees to radians', async () => {
    const operation = operationWith({ type: 'rotation', axis: 'z', angle: Math.PI / 2 })
    const wrapper = mount(TransformOperationEditor, { props: { operation } })
    const axisInput = wrapper.get('select[name="axis"]')
    expect(axisInput.findAll('option').map((option) => option.attributes('value'))).toEqual([
      'x',
      'y',
      'z',
    ])
    expect(wrapper.findAll('label').map((label) => label.text())).toEqual([
      expect.stringContaining('Axis'),
      'Angle (°)',
    ])
    const angleInput = wrapper.get('input[name="angle"]')
    expect((angleInput.element as HTMLInputElement).value).toBe('90')
    expect(angleInput.attributes('type')).toBe('number')
    expect(angleInput.attributes('step')).toBe('any')

    for (const axis of ['x', 'y', 'z']) {
      await axisInput.setValue(axis)
      expect(wrapper.emitted('update-transform')?.slice(-1)[0]).toEqual([
        { type: 'rotation', axis, angle: Math.PI / 2 },
      ])
    }
    for (const [degrees, radians] of [
      ['180', Math.PI],
      ['90', Math.PI / 2],
      ['-90', -Math.PI / 2],
    ] as const) {
      await angleInput.setValue(degrees)
      expect(wrapper.emitted('update-transform')?.slice(-1)[0]).toEqual([
        { type: 'rotation', axis: 'z', angle: radians },
      ])
    }
    expect(operation.transform).toEqual({ type: 'rotation', axis: 'z', angle: Math.PI / 2 })
  })

  it('offers reflection planes and emits a replacement without mutating the operation', async () => {
    const operation = operationWith({ type: 'reflection', plane: 'yz' })
    const wrapper = mount(TransformOperationEditor, { props: { operation } })
    const planeInput = wrapper.get('select[name="plane"]')
    expect(planeInput.findAll('option').map((option) => option.text())).toEqual(['XY', 'XZ', 'YZ'])
    expect(wrapper.get('label').text()).toContain('Plane')

    for (const plane of ['xy', 'xz', 'yz']) {
      await planeInput.setValue(plane)
      expect(wrapper.emitted('update-transform')?.slice(-1)[0]).toEqual([
        { type: 'reflection', plane },
      ])
    }
    expect(wrapper.find('input').exists()).toBe(false)
    expect(operation.transform).toEqual({ type: 'reflection', plane: 'yz' })
  })

  it('exposes and edits all six shear coefficients with their mathematical labels', async () => {
    const operation = operationWith({
      type: 'shear',
      kxy: 0,
      kxz: 0,
      kyx: 0,
      kyz: 0,
      kzx: 0,
      kzy: 0,
    })
    const wrapper = mount(TransformOperationEditor, { props: { operation } })
    const coefficients = ['kxy', 'kxz', 'kyx', 'kyz', 'kzx', 'kzy'] as const
    expect(wrapper.findAll('input')).toHaveLength(6)
    expect(wrapper.findAll('label').map((label) => label.text())).toEqual([
      'X ← Y (kxy)',
      'X ← Z (kxz)',
      'Y ← X (kyx)',
      'Y ← Z (kyz)',
      'Z ← X (kzx)',
      'Z ← Y (kzy)',
    ])

    for (const [index, coefficient] of coefficients.entries()) {
      const input = wrapper.get(`input[name="${coefficient}"]`)
      expect(input.attributes('type')).toBe('number')
      expect(input.attributes('step')).toBe('any')
      await input.setValue(String(index - 2))
      expect(wrapper.emitted('update-transform')?.slice(-1)[0]).toEqual([
        { ...operation.transform, [coefficient]: index - 2 },
      ])
    }
    expect(Object.values(operation.transform).slice(1)).toEqual([0, 0, 0, 0, 0, 0])
  })

  it('derives a read-only 4×4 matrix with presentation-only rounding and clean trigonometric zeros', async () => {
    const rotation = operationWith({ type: 'rotation', axis: 'z', angle: Math.PI / 2 })
    const wrapper = mount(TransformOperationEditor, { props: { operation: rotation } })
    const table = wrapper.get('table')
    expect(table.get('caption').text()).toBe('Matrix')
    expect(table.findAll('tbody tr')).toHaveLength(4)
    for (const row of table.findAll('tbody tr')) expect(row.findAll('td')).toHaveLength(4)
    expect(table.findAll('td').map((cell) => cell.text())).toEqual([
      '0',
      '-1',
      '0',
      '0',
      '1',
      '0',
      '0',
      '0',
      '0',
      '0',
      '1',
      '0',
      '0',
      '0',
      '0',
      '1',
    ])
    expect(table.find('input').exists()).toBe(false)
    expect(table.find('[contenteditable]').exists()).toBe(false)
    expect(rotation.transform).toEqual({ type: 'rotation', axis: 'z', angle: Math.PI / 2 })

    const translation = operationWith({ type: 'translation', x: 1.234567, y: -2, z: 3 })
    await wrapper.setProps({ operation: translation })
    expect(table.findAll('td').map((cell) => cell.text())).toEqual([
      '1',
      '0',
      '0',
      '1.2346',
      '0',
      '1',
      '0',
      '-2',
      '0',
      '0',
      '1',
      '3',
      '0',
      '0',
      '0',
      '1',
    ])
    expect(translation.transform).toEqual({ type: 'translation', x: 1.234567, y: -2, z: 3 })
    expect(wrapper.emitted('update-transform')).toBeUndefined()
  })
})
