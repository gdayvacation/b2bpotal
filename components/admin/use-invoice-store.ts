'use client'

import { useCallback, useEffect, useState } from 'react'
import {
  DEFAULT_INVOICE_SETTINGS,
  nextDocumentNumber,
  type AgencyInvoiceRates,
  type InvoiceDocument,
  type InvoiceSettings,
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

  useEffect(() => {
    let cancelled = false
    loadInvoiceStore()
      .then((snapshot) => {
        if (cancelled) return
        setSettings(snapshot.settings)
        setRates(snapshot.rates)
        setInvoices(snapshot.invoices)
        setCloud(snapshot.cloud)
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
    await saveInvoiceSettings(next)
  }, [])

  const updateRates = useCallback(async (next: AgencyInvoiceRates) => {
    setRates((current) => [...current.filter((row) => row.agentSlug !== next.agentSlug), next])
    await saveAgencyRates(next)
  }, [])

  const addDocuments = useCallback(async (docs: InvoiceDocument[]) => {
    if (docs.length === 0) return
    setInvoices((current) => [...docs, ...current])
    await saveInvoiceDocuments(docs)
  }, [])

  const replaceDocument = useCallback(async (doc: InvoiceDocument) => {
    setInvoices((current) => current.map((row) => (row.id === doc.id ? doc : row)))
    await saveInvoiceDocument(doc)
  }, [])

  const removeDocument = useCallback(async (id: string) => {
    setInvoices((current) => current.filter((row) => row.id !== id))
    await deleteInvoiceDocument(id)
  }, [])

  const markPaid = useCallback(async (ids: string[], extras: InvoiceDocument[] = []) => {
    const wanted = new Set(ids)
    const paidAt = new Date().toISOString()
    const issueDate = todayISO()
    const pool = [...extras, ...invoices].filter(
      (doc, index, list) => list.findIndex((row) => row.id === doc.id) === index,
    )
    let working = pool
    const updated: InvoiceDocument[] = []
    for (const doc of pool) {
      if (!wanted.has(doc.id) || doc.status === 'paid') continue
      const receiptNo = doc.receiptNo ?? nextDocumentNumber(working, 'receipt', issueDate)
      const next = { ...doc, status: 'paid' as const, paidAt, receiptNo }
      working = working.map((row) => (row.id === doc.id ? next : row))
      updated.push(next)
    }
    if (updated.length === 0) return updated
    setInvoices(working)
    await saveInvoiceDocuments(updated)
    return updated
  }, [invoices])

  return {
    settings,
    rates,
    invoices,
    loading,
    cloud,
    updateSettings,
    updateRates,
    addDocuments,
    replaceDocument,
    removeDocument,
    markPaid,
  }
}
