// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import { getOperationMatrix, type TransformOperation } from '../../app/transform-stack-state'
import { toMatrix } from '../../domain'
import JointTransformCard from '../JointTransformCard.vue'
import Matrix4Grid from '../Matrix4Grid.vue'

const operation: TransformOperation = {
  id: 'op-1',
  transform: { type: 'rotation', axis: 'z', angle: Math.PI / 6 },
  joint: {
    pivot: [2, -1, 3],
    before: [{ type: 'translation', x: -2, y: 1, z: -3 }],
    after: [{ type: 'translation', x: 2, y: -1, z: 3 }],
  },
}
const mainMatrix = (wrapper: ReturnType<typeof mount>) =>
  wrapper.findAllComponents(Matrix4Grid)[0]!.props('matrix')
describe('editable pivot matrix', () => {
  it('shows one actual equivalent matrix with editing in its linear cells and a derived read-only translation column', () => {
    const wrapper = mount(JointTransformCard, { props: { operation } })
    expect(mainMatrix(wrapper)).toEqual(getOperationMatrix(operation))
    expect(wrapper.findAll('table')).toHaveLength(1)
    expect(wrapper.find('.joint-parameters').exists()).toBe(false)
    for (const index of [3, 7, 11, 12, 13, 14, 15])
      expect(wrapper.get(`td[data-index="${index}"]`).findAll('input,button,select')).toHaveLength(
        0,
      )
    expect(wrapper.find('td[data-index="0"] button').exists()).toBe(true)
    wrapper.unmount()
  })
  it('keeps the same matrix and top toggle while revealing two compact, fixed pivot matrices', async () => {
    const wrapper = mount(JointTransformCard, { props: { operation } })
    const toggle = wrapper.get('.composition-toggle').element
    const table = wrapper.get('table').element
    const matrix = mainMatrix(wrapper)
    await wrapper.get('.composition-toggle').trigger('click')
    expect(wrapper.findAll('.fixed-factor')).toHaveLength(2)
    expect(
      wrapper.findAll('.fixed-factor input,.fixed-factor button,.fixed-factor select'),
    ).toHaveLength(0)
    expect(wrapper.findAll('table')).toHaveLength(3)
    expect(wrapper.get('.composition-toggle').element).toBe(toggle)
    expect(wrapper.get('table').element).toBe(table)
    expect(mainMatrix(wrapper)).toEqual(matrix)
    wrapper.unmount()
  })
  it('edits linked sine/cosine cells as one valid rotation and automatically updates the translation column', async () => {
    const wrapper = mount(JointTransformCard, { props: { operation } })
    await wrapper.get('td[data-index="0"] button').trigger('click')
    await wrapper.get('input[name="angle"]').setValue('45')
    const [transform] = wrapper.emitted('update-transform')![0]!
    const updated = { ...operation, transform: transform as typeof operation.transform }
    await wrapper.setProps({ operation: updated })
    expect(mainMatrix(wrapper)).toEqual(getOperationMatrix(updated))
    expect(mainMatrix(wrapper)![3]).not.toBe(getOperationMatrix(operation)[3])
    expect((transform as { angle: number }).angle).toBe(Math.PI / 4)
    expect(updated.joint).toBe(operation.joint)
    expect(wrapper.get('td[data-index="3"]').findAll('input,button')).toHaveLength(0)
    wrapper.unmount()
  })
  it('keeps every typed digit while editing in a cell', async () => {
    const wrapper = mount(JointTransformCard, { props: { operation, precision: 2 } })
    await wrapper.get('td[data-index="0"] button').trigger('click')
    const text = '23.12345678912345'
    await wrapper.get('input[name="angle"]').setValue(text)
    const [transform] = wrapper.emitted('update-transform')![0]!
    await wrapper.setProps({
      operation: { ...operation, transform: transform as typeof operation.transform },
    })
    expect((wrapper.get('input[name="angle"]').element as HTMLInputElement).value).toBe(text)
    wrapper.unmount()
  })
  it('can disable and restore own-center rotation without modifying its saved pivot factors', async () => {
    const wrapper = mount(JointTransformCard, { props: { operation } })
    await wrapper.get('.composition-toggle').trigger('click')
    const checkbox = wrapper.get('input[aria-label="Use own center"]')
    expect((checkbox.element as HTMLInputElement).checked).toBe(true)
    await checkbox.setValue(false)
    expect(wrapper.emitted('update-pivot')).toEqual([[false]])
    await wrapper.setProps({
      operation: { ...operation, joint: { ...operation.joint!, pivotEnabled: false } },
    })
    expect(mainMatrix(wrapper)).toEqual(toMatrix(operation.transform))
    expect(wrapper.find('.pivot-indicator').exists()).toBe(false)
    await checkbox.setValue(true)
    await wrapper.setProps({ operation })
    expect(mainMatrix(wrapper)).toEqual(getOperationMatrix(operation))
    wrapper.unmount()
  })
  it('edits scale on its diagonal while keeping all automatic offsets read-only', async () => {
    const scale: TransformOperation = {
      ...operation,
      transform: { type: 'scale', x: 2, y: 3, z: 4 },
    }
    const wrapper = mount(JointTransformCard, { props: { operation: scale } })
    expect(wrapper.findAll('td input')).toHaveLength(3)
    await wrapper.get('td[data-index="5"] input').setValue('1.2345678912345')
    expect(wrapper.emitted('update-transform')![0]![0]).toEqual({
      type: 'scale',
      x: 2,
      y: 1.2345678912345,
      z: 4,
    })
    for (const i of [3, 7, 11])
      expect(wrapper.get(`td[data-index="${i}"]`).find('input').exists()).toBe(false)
    wrapper.unmount()
  })
  it('updates live rotation expressions inside the matrix during a mouse preview', async () => {
    const wrapper = mount(JointTransformCard, { props: { operation, preview: true } })
    await wrapper.setProps({
      operation: { ...operation, transform: { type: 'rotation', axis: 'z', angle: Math.PI / 4 } },
    })
    expect(wrapper.get('td[data-index="0"] button').text()).toBe('cos(45°)')
    expect(wrapper.get('td[data-index="0"] button').attributes('disabled')).toBeDefined()
    expect(mainMatrix(wrapper)).toEqual(
      getOperationMatrix({
        ...operation,
        transform: { type: 'rotation', axis: 'z', angle: Math.PI / 4 },
      }),
    )
    wrapper.unmount()
  })
  it('edits one local rotation angle, with its frame and automatic translation read-only', async () => {
    const local = {
      ...operation,
      joint: {
        ...operation.joint!,
        basis: [
          [0, 1, 0],
          [-1, 0, 0],
          [0, 0, 1],
        ] as const,
      },
    }
    const wrapper = mount(JointTransformCard, { props: { operation: local } })
    expect(wrapper.text()).not.toContain('R(θx, θy, θz)')
    await wrapper.get('td[data-index="0"] button').trigger('click')
    expect(wrapper.findAll('input[name="angle"]')).toHaveLength(1)
    await wrapper.get('input[name="angle"]').setValue('60')
    expect(wrapper.emitted('update-transform')![0]).toEqual([
      { type: 'rotation', axis: 'z', angle: Math.PI / 3 },
    ])
    expect(wrapper.get('td[data-index="3"]').findAll('input,button')).toHaveLength(0)
    await wrapper.get('.composition-toggle').trigger('click')
    expect(wrapper.findAll('.fixed-frame input, .fixed-frame button')).toHaveLength(0)
    wrapper.unmount()
  })
})
