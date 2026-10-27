// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { LedgerlyPage } from '../LedgerlyPage'

afterEach(cleanup)

describe('Welcome to Ledgerly', () => {
  it('reads like company docs: team, architecture, branching and ownership', () => {
    render(
      <MemoryRouter>
        <LedgerlyPage />
      </MemoryRouter>,
    )
    // Headline + sections
    expect(screen.getByRole('heading', { level: 1, name: 'Ledgerly' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: /The team/ })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: /Architecture/ })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: /How we branch and ship/ })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: /Who owns what/ })).toBeInTheDocument()
    // Team members and the architecture packages
    expect(screen.getByText('Ada Reyes')).toBeInTheDocument()
    expect(screen.getByText('Noah Cohen')).toBeInTheDocument()
    expect(screen.getByText('@ledgerly/shared')).toBeInTheDocument()
    // Ownership mirrors CODEOWNERS
    expect(screen.getByText('/api/src/config.ts')).toBeInTheDocument()
    expect(screen.getAllByText('@ledgerly-eng/platform').length).toBeGreaterThan(0)
  })
})
