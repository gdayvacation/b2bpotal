'use client'

import { useCallback, useEffect, useState } from 'react'
import {
  DEFAULT_INVOICE_SETTINGS,
  nextDocumentNumber,
  normalizeInvoiceSettings,
  type AgencyInvoiceRates,
  type InvoiceDocument,
  type InvoiceSettings,
  type PaymentChannel,
} from '@/lib/invoice'
import {
  loadInvoiceStore,
  saveAgencyRates,
  saveInvoiceDocument,
  saveInvoiceDocuments,
  saveInvoiceSettings,
  deleteInvoiceDocument,
} from '@/lib/supabase/invoice-db'
import { todayISO } from '@/lib/format'

export function useInvoiceStore() {
  const [settings, setSettings] = useState<InvoiceSettings>(DEFAULT_INVOICE_SETTINGS)
  const [rates, setRates] = useState<AgencyInvoiceRates[]>([])
  const [invoices, setInvoices] = useState<InvoiceDocument[]>([])
  const [loading, setLoading] = useState(true)
  const [cloud, setCloud] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function clearError() {
    setError(null)
  }

  useEffect(() => {
    let cancelled = false
    loadInvoiceStore()
      .then((snapshot) => {
        if (cancelled) return
        const settings = normalizeInvoiceSettings(snapshot.settings)
        setSettings(settings)
        setRates(snapshot.rates)
        setInvoices(snapshot.invoices)
        setCloud(snapshot.cloud)
        if (settings.issuerTitle !== snapshot.settings.issuerTitle) {
          void saveInvoiceSettings(settings)
        }
      })
      .catch((err) => {
        if (!cancelled) setError(`Failed to load invoice data: ${String(err)}`)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  const updateSettings = useCallback(async (next: InvoiceSettings) => {
    setSettings(next)
    setError(null)
    const result = await saveInvoiceSettings(next)
    if (result?.error) setError(`Save failed: ${result.error}`)
  }, [])

  const updateRates = useCallback(async (next: AgencyInvoiceRates) => {
    setRates((current) => [...current.filter((row) => row.agentSlug !== next.agentSlug), next])
    setError(null)
    const result = await saveAgencyRates(next)
    if (result?.error) setError(`Save rates failed: ${result.error}`)
  }, [])

  const addDocuments = useCallback(async (docs: InvoiceDocument[]) => {
    if (docs.length === 0) return
    setInvoices((current) => [...docs, ...current])
    setError(null)
    const result = await saveInvoiceDocuments(docs)
    if (result?.error) setError(`Save invoice failed: ${result.error}`)
  }, [])

  const replaceDocument = useCallback(async (doc: InvoiceDocument) => {
    setInvoices((current) => current.map((row) => (row.id === doc.id ? doc : row)))
    setError(null)
    const result = await saveInvoiceDocument(doc)
    if (result?.error) setError(`Update failed: ${result.error}`)
  }, [])

  const removeDocument = useCallback(async (id: string) => {
    setInvoices((current) => current.filter((row) => row.id !== id))
    setError(null)
    const result = await deleteInvoiceDocument(id)
    if (result?.error) setError(`Delete failed: ${result.error}`)
  }, [])

  const markPaid = useCallback(async (
    ids: string[],
    extras: InvoiceDocument[] = [],
    details?: { paidDate?: string; channel?: PaymentChannel },
  ) => {
    const wanted = new Set(ids)
    const paidDate = details?.paidDate || todayISO()
    const paidAt = `${paidDate}T12:00:00.000Z`
    const channel = details?.channel ?? 'deduct_deposit'
    const pool = [...extras, ...invoices].filter(
      (doc, index, list) => list.findIndex((row) => row.id === doc.id) === index,
    )
    let working = pool
    const updated: InvoiceDocument[] = []
    for (const doc of pool) {
      if (!wanted.has(doc.id) || doc.status === 'paid') continue
      const receiptNo = doc.receiptNo ?? nextDocumentNumber(working, 'receipt', paidDate)
      const next = {
        ...doc,
        status: 'paid' as const,
        paidAt,
        paymentChannel: channel,
        receiptNo,
      }
      working = working.map((row) => (row.id === doc.id ? next : row))
      updated.push(next)
    }
    if (updated.length === 0) return updated
    setInvoices(working)
    setError(null)
    const result = await saveInvoiceDocuments(updated)
    if (result?.error) setError(`Mark paid failed: ${result.error}`)
    return updated
  }, [invoices])

  return {
    settings,
    rates,
    invoices,
    loading,
    cloud,
    error,
    clearError,
    updateSettings,
    updateRates,
    addDocuments,
    replaceDocument,
    removeDocument,
    markPaid,
  }
}
