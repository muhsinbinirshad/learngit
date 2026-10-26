// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { Button, Dialog, Markdown, Tabs, SegmentedControl, ProgressBar } from '../components'

describe('design system components', () => {
  it('Button renders states: default, loading, disabled', () => {
    const onClick = vi.fn()
    const { rerender } = render(<Button onClick={onClick}>Save</Button>)
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(onClick).toHaveBeenCalledTimes(1)
    rerender(<Button loading>Save</Button>)
    const btn = screen.getByRole('button', { name: /Save/ })
    expect(btn).toBeDisabled()
    expect(btn).toHaveAttribute('aria-busy', 'true')
    rerender(<Button disabled>Save</Button>)
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled()
  })

  it('Tabs support arrow-key navigation', () => {
    const onChange = vi.fn()
    render(
      <Tabs
        ariaLabel="Files"
        value="a"
        onChange={onChange}
        items={[
          { id: 'a', label: 'a.txt' },
          { id: 'b', label: 'b.txt' },
        ]}
      />,
    )
    const tab = screen.getByRole('tab', { name: 'a.txt' })
    expect(tab).toHaveAttribute('aria-selected', 'true')
    fireEvent.keyDown(screen.getByRole('tablist'), { key: 'ArrowRight' })
    expect(onChange).toHaveBeenCalledWith('b')
  })

  it('SegmentedControl exposes a radiogroup', () => {
    const onChange = vi.fn()
    render(
      <SegmentedControl
        ariaLabel="Mode"
        value="terminal"
        onChange={onChange}
        options={[
          { value: 'terminal', label: 'Terminal' },
          { value: 'ui', label: 'UI' },
        ]}
      />,
    )
    fireEvent.click(screen.getByRole('radio', { name: 'UI' }))
    expect(onChange).toHaveBeenCalledWith('ui')
    expect(screen.getByRole('radio', { name: 'Terminal' })).toHaveAttribute('aria-checked', 'true')
  })

  it('ProgressBar exposes values to assistive tech', () => {
    render(<ProgressBar value={2} max={4} label="Objectives" />)
    const bar = screen.getByRole('progressbar', { name: 'Objectives' })
    expect(bar).toHaveAttribute('aria-valuenow', '2')
    expect(bar).toHaveAttribute('aria-valuemax', '4')
  })

  it('Markdown renders paragraphs, lists, code and bold', () => {
    render(<Markdown text={'First **bold**, *italic* and `code`.\n\n- one\n- two'} />)
    expect(screen.getByText('bold').tagName).toBe('STRONG')
    expect(screen.getByText('italic').tagName).toBe('EM')
    expect(screen.getByText('code').tagName).toBe('CODE')
    expect(screen.getAllByRole('listitem')).toHaveLength(2)
  })

  it('Dialog is labelled and closes from its action', () => {
    HTMLDialogElement.prototype.showModal = HTMLDialogElement.prototype.showModal || vi.fn()
    HTMLDialogElement.prototype.close = HTMLDialogElement.prototype.close || vi.fn()
    const onClose = vi.fn()
    render(<Dialog open onClose={onClose} title="Reset lab?" description="All work is discarded." actions={<Button onClick={onClose}>Confirm</Button>} />)
    const dialog = screen.getByRole('dialog', { hidden: true })
    const labelId = dialog.getAttribute('aria-labelledby')!
    expect(document.getElementById(labelId)).toHaveTextContent('Reset lab?')
    fireEvent.click(screen.getByRole('button', { name: 'Confirm', hidden: true }))
    expect(onClose).toHaveBeenCalled()
  })
})
