import { createServer } from 'node:http'
import { money, type Invoice } from '@ledgerly/shared'
import { total } from './invoice.ts'
import { loadConfig } from './config.ts'

/** A tiny in-memory invoice store so the service runs without a database in development. */
const invoices: Invoice[] = [
  {
    id: 'INV-1001', customer: 'Northwind Traders', currency: 'USD', status: 'sent',
    issuedOn: '2025-03-01', dueOn: '2025-03-31', taxPercent: 7.5,
    lineItems: [{ description: 'Design retainer', quantity: 1, unitPrice: money(120000, 'USD') }],
  },
]

export function createApp(config = loadConfig()) {
  return createServer((req, res) => {
    if (req.url === '/health') {
      res.writeHead(200, { 'content-type': 'application/json' })
      res.end(JSON.stringify({ status: 'ok' }))
      return
    }
    if (req.url === '/invoices') {
      const body = invoices.map((inv) => ({ ...inv, total: total(inv) }))
      res.writeHead(200, { 'content-type': 'application/json' })
      res.end(JSON.stringify(body))
      return
    }
    res.writeHead(404)
    res.end('not found')
    void config
  })
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const config = loadConfig()
  createApp(config).listen(config.port, () => console.log(`Ledgerly API on :${config.port}`))
}
