import { describe, expect, it } from 'vitest'
import {
  taskIdAfterCompletion,
  taskIdAfterVisibilityChange,
  visibleTaskRows
} from '../../src/renderer/src/features/paper/task-navigation'

describe('taskIdAfterCompletion', () => {
  const tasks = [{ id: 11 }, { id: 22 }, { id: 33 }]

  it('selects the next open task below the completed task', () => {
    expect(taskIdAfterCompletion(tasks, 22)).toBe(33)
  })

  it('falls back to the previous open task after completing the last one', () => {
    expect(taskIdAfterCompletion(tasks, 33)).toBe(22)
  })

  it('leaves no follow-up selection when the final open task is completed', () => {
    expect(taskIdAfterCompletion([{ id: 11 }], 11)).toBeNull()
  })

  it('does not guess when the selected task is not open', () => {
    expect(taskIdAfterCompletion(tasks, 44)).toBeNull()
  })
})

describe('visibleTaskRows', () => {
  const open = [
    { id: 11, status: 'open' },
    { id: 22, status: 'open' }
  ]
  const completed = [
    { id: 33, status: 'done' },
    { id: 44, status: 'dismissed' }
  ]

  it('hides completed and dismissed tasks by default', () => {
    expect(
      visibleTaskRows(open, completed, { open: true, done: false }).map((task) => task.id)
    ).toEqual([11, 22])
  })

  it('appends only completed tasks when they are shown', () => {
    expect(
      visibleTaskRows(open, completed, { open: true, done: true }).map((task) => task.id)
    ).toEqual([11, 22, 33])
  })

  it('zeigt nur Erledigte, wenn Offen abgewählt ist', () => {
    expect(
      visibleTaskRows(open, completed, { open: false, done: true }).map((task) => task.id)
    ).toEqual([33])
  })

  it('beide abgewählt heißt bewusst: leere Liste', () => {
    expect(visibleTaskRows(open, completed, { open: false, done: false })).toEqual([])
  })
})

describe('taskIdAfterVisibilityChange', () => {
  const visible = [{ id: 11 }, { id: 22 }]

  it('keeps a selection that remains visible', () => {
    expect(taskIdAfterVisibilityChange(visible, 22)).toBe(22)
  })

  it('selects the first visible task when the old selection is hidden', () => {
    expect(taskIdAfterVisibilityChange(visible, 33)).toBe(11)
  })

  it('clears the selection when no tasks remain visible', () => {
    expect(taskIdAfterVisibilityChange([], 33)).toBeNull()
  })
})
