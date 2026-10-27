import type { InvoiceRow } from './formatInvoice.ts'

/** Renders the invoice table. Presentational only — totals are computed on the API. */
export function InvoiceList({ rows }: { rows: InvoiceRow[] }) {
  return (
    <table className="invoice-list">
      <thead>
        <tr>
          <th>Invoice</th>
          <th>Customer</th>
          <th>Status</th>
          <th>Due</th>
          <th className="num">Total</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={row.id} data-status={row.status}>
            <td>{row.id}</td>
            <td>{row.customer}</td>
            <td>{row.status}</td>
            <td>{row.due}</td>
            <td className="num">{row.total}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}
