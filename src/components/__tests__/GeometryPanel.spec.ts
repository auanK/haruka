// @vitest-environment jsdom
import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import { cubeVertices, transformCubeVertices } from '../../app/didactic-cube'
import { identity, toMatrix, type Matrix4 } from '../../domain'
import GeometryPanel from '../GeometryPanel.vue'
import Matrix4Grid from '../Matrix4Grid.vue'

describe('GeometryPanel', () => {
  it('presents eight current vertices with X/Y/Z and reuses the read-only final matrix grid', () => {
    const finalMatrix = identity()
    const wrapper = mount(GeometryPanel, { props: { vertices: cubeVertices, finalMatrix } })
    const rows = wrapper.findAll('.vertex-table tbody tr')
    expect(wrapper.get('h1').text()).toBe('Vertices')
    expect(wrapper.findAll('.vertex-table thead th').map((cell) => cell.text())).toEqual([
      'Vertex',
      'X',
      'Y',
      'Z',
    ])
    expect(rows).toHaveLength(8)
    expect(rows.map((row) => row.get('th').text())).toEqual(cubeVertices.map(({ id }) => id))
    expect(rows.map((row) => row.findAll('td').map((cell) => cell.text()))).toEqual(
      cubeVertices.map(({ point }) => point.map(String)),
    )
    const matrixGrid = wrapper.getComponent(Matrix4Grid)
    expect(matrixGrid.props('matrix')).toBe(finalMatrix)
    expect(matrixGrid.get('caption').text()).toBe('Final Matrix')
    const precisionSelect = wrapper.get('select[aria-label="Displayed decimal places"]')
    expect((precisionSelect.element as HTMLSelectElement).value).toBe('4')
    expect(wrapper.find('input, button, [contenteditable]').exists()).toBe(false)
    expect(wrapper.emitted()).toEqual({})
  })

  it('updates its displayed vertices and final matrix directly from derived props', async () => {
    const wrapper = mount(GeometryPanel, {
      props: { vertices: cubeVertices, finalMatrix: identity() },
    })
    const finalMatrix: Matrix4 = Object.freeze(toMatrix({ type: 'translation', x: 2, y: 3, z: 4 }))
    const vertices = transformCubeVertices(finalMatrix)
    await wrapper.setProps({ vertices, finalMatrix })
    expect(
      wrapper
        .get('.vertex-table tbody tr')
        .findAll('td')
        .map((cell) => cell.text()),
    ).toEqual(['1.5', '2.5', '3.5'])
    expect(wrapper.getComponent(Matrix4Grid).props('matrix')).toBe(finalMatrix)
    expect(wrapper.getComponent(Matrix4Grid).get('td[data-index="3"]').text()).toBe('2')
    expect(vertices[0]!.point).toEqual([1.5, 2.5, 3.5])
  })

  it('uses shared display formatting without changing precise vertex coordinates', () => {
    const point = Object.freeze([Math.cos(Math.PI / 2), -0, 1.234567] as const)
    const vertices = Object.freeze([{ id: 'V1' as const, point }])
    const wrapper = mount(GeometryPanel, { props: { vertices, finalMatrix: identity() } })
    expect(wrapper.findAll('.vertex-table tbody td').map((cell) => cell.text())).toEqual([
      '0',
      '0',
      '1.2346',
    ])
    expect(point[0]).toBe(Math.cos(Math.PI / 2))
    expect(Object.is(point[1], -0)).toBe(true)
    expect(point[2]).toBe(1.234567)
  })

  it('controls display precision and emits updates with maximum 4 places (no full option)', async () => {
    const point = Object.freeze([1.234567, -2.876543, 0] as const)
    const vertices = Object.freeze([{ id: 'V1' as const, point }])
    const wrapper = mount(GeometryPanel, {
      props: { vertices, finalMatrix: identity(), precision: 4 },
    })
    const select = wrapper.get('select[aria-label="Displayed decimal places"]')
    const options = select.findAll('option').map((o) => o.text())
    expect(options).toEqual(['0', '1', '2', '3', '4'])
    expect(options).not.toContain('Full')

    expect((select.element as HTMLSelectElement).value).toBe('4')
    expect(wrapper.findAll('.vertex-table tbody td').map((c) => c.text())).toEqual([
      '1.2346',
      '-2.8765',
      '0',
    ])

    await select.setValue('2')
    expect(wrapper.emitted('update:precision')?.[0]).toEqual([2])

    await wrapper.setProps({ precision: 2 })
    expect(wrapper.findAll('.vertex-table tbody td').map((c) => c.text())).toEqual([
      '1.23',
      '-2.88',
      '0',
    ])

    await select.setValue('0')
    expect(wrapper.emitted('update:precision')?.[1]).toEqual([0])
  })
})
