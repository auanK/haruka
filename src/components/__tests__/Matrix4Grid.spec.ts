// @vitest-environment jsdom
import { mount } from '@vue/test-utils'
import { h } from 'vue'
import { describe, expect, it } from 'vitest'
import { identity, type Matrix4 } from '../../domain'
import Matrix4Grid from '../Matrix4Grid.vue'

describe('Matrix4Grid', () => {
  it('allows generic cell content and an omitted caption without changing matrix ownership', () => {
    const matrix = Object.freeze(identity())
    const wrapper = mount(Matrix4Grid, {
      props: { matrix, caption: '' },
      slots: {
        cell: ({ index, value }: { index: number; value: number }) =>
          h('span', `${index}: ${value}`),
      },
    })
    expect(wrapper.find('caption').exists()).toBe(false)
    expect(wrapper.get('td[data-index="3"]').text()).toBe('3: 0')
    expect(wrapper.get('td[data-index="15"]').text()).toBe('15: 1')
    expect(matrix).toEqual(identity())
    expect(wrapper.emitted()).toEqual({})
  })

  it('accepts a caption while preserving addressable read-only cells', async () => {
    const wrapper = mount(Matrix4Grid, { props: { matrix: identity(), caption: 'Final Matrix' } })
    expect(wrapper.get('caption').text()).toBe('Final Matrix')
    const cell = wrapper.get('td[data-index="15"]')
    expect(cell.attributes('data-row')).toBe('3')
    expect(cell.attributes('data-column')).toBe('3')
    expect(cell.text()).toBe('1')
    expect(wrapper.find('input, [contenteditable]').exists()).toBe(false)
    await wrapper.setProps({ caption: 'Operation Matrix' })
    expect(wrapper.get('caption').text()).toBe('Operation Matrix')
  })

  it('renders four addressable rows of four cells in row-major order', () => {
    const matrix: Matrix4 = Object.freeze([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16])
    const wrapper = mount(Matrix4Grid, { props: { matrix } })
    const rows = wrapper.findAll('tbody tr')
    expect(rows).toHaveLength(4)
    for (const row of rows) expect(row.findAll('td')).toHaveLength(4)
    expect(wrapper.findAll('td').map((cell) => cell.text())).toEqual(matrix.map(String))

    for (const [index, row, column] of [
      [0, 0, 0],
      [3, 0, 3],
      [4, 1, 0],
      [15, 3, 3],
    ] as const) {
      const cell = wrapper.get(`td[data-index="${index}"]`)
      expect(cell.attributes('data-row')).toBe(String(row))
      expect(cell.attributes('data-column')).toBe(String(column))
      expect(cell.text()).toBe(String(matrix[index]))
    }
  })

  it('formats read-only values without changing mathematical precision and follows its matrix prop', async () => {
    const matrix: Matrix4 = Object.freeze([
      Math.cos(Math.PI / 2),
      -1,
      0,
      1.234567,
      1,
      -0,
      0,
      -2.123456,
      0,
      0,
      1,
      3,
      0,
      0,
      0,
      1,
    ])
    const wrapper = mount(Matrix4Grid, { props: { matrix } })
    expect(wrapper.get('caption').text()).toBe('Matrix')
    expect(wrapper.findAll('td').map((cell) => cell.text())).toEqual([
      '0',
      '-1',
      '0',
      '1.2346',
      '1',
      '0',
      '0',
      '-2.1235',
      '0',
      '0',
      '1',
      '3',
      '0',
      '0',
      '0',
      '1',
    ])
    expect(matrix[0]).toBe(Math.cos(Math.PI / 2))
    expect(matrix[3]).toBe(1.234567)
    expect(matrix[7]).toBe(-2.123456)
    expect(Object.is(matrix[5], -0)).toBe(true)
    expect(wrapper.find('input, [contenteditable]').exists()).toBe(false)
    expect(wrapper.emitted()).toEqual({})

    await wrapper.setProps({ matrix: identity() })
    expect(wrapper.findAll('td').map((cell) => cell.text())).toEqual(identity().map(String))
  })
})
