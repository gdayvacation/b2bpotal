import { Suspense } from 'react'
import { AdminInvoices } from '@/components/admin/admin-invoices'

export default function Page() {
  return (
    <Suspense fallback={<p className="text-sm text-teal-900/50">Loading invoices…</p>}>
      <AdminInvoices />
    </Suspense>
  )
}
