'use client'

import { AdminDailyJobOrder } from '@/components/admin/admin-daily-job-order'

/**
 * Check in Report for marina staff.
 * Uses the same van groups from Arrange vehicles as Driver Job Order,
 * with marina columns (Agent, VC No., Boat, Park, tick box).
 */
export function AdminCheckInReport({ onBack }: { onBack: () => void }) {
  return <AdminDailyJobOrder audience="check-in" onBack={onBack} />
}
