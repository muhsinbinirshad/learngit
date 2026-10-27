import { useEffect, useState } from 'react'
import { InvoiceList } from './InvoiceList.tsx'
import type { InvoiceRow } from './formatInvoice.ts'

export function App() {
  const [rows, setRows] = useState<InvoiceRow[]>([])
  useEffect(() => {
    fetch('/invoices')
      .then((r) => r.json())
      .then(setRows)
      .catch(() => setRows([]))
  }, [])
  return (
    <main className="app">
      <h1>Ledgerly</h1>
      <p>Invoicing for small teams.</p>
      <InvoiceList rows={rows} />
    </main>
  )
}
