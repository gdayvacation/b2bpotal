'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Check, Copy, ExternalLink, Pencil, Plus, Trash2 } from 'lucide-react'
import { usePortal } from '@/components/portal-provider'
import { StatusBadge } from '@/components/status-badge'
import { PageHeader, Surface } from '@/components/ui-primitives'
import { Button, buttonVariants } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { cn } from '@/lib/utils'
import type { Agent } from '@/lib/types'

export function AdminAgents() {
  const { agents, bookings, setAgentStatus, addAgent, updateAgent, removeAgent } = usePortal()
  const [copied, setCopied] = useState<string | null>(null)
  const [newName, setNewName] = useState('')
  const [newCountry, setNewCountry] = useState('')
  const [addError, setAddError] = useState('')
  const [editing, setEditing] = useState<Agent | null>(null)
  const [editName, setEditName] = useState('')
  const [editCountry, setEditCountry] = useState('')
  const [editError, setEditError] = useState('')

  async function copyLink(slug: string) {
    const url = `${window.location.origin}/agent/${slug}`
    try {
      await navigator.clipboard.writeText(url)
      setCopied(slug)
      window.setTimeout(() => setCopied(null), 1800)
    } catch {
      window.prompt('Copy this agent link', url)
    }
  }

  function handleAdd() {
    const result = addAgent(newName, newCountry)
    if (result) {
      setAddError(result)
      return
    }
    setNewName('')
    setNewCountry('')
    setAddError('')
  }

  function openEdit(agent: Agent) {
    setEditing(agent)
    setEditName(agent.name)
    setEditCountry(agent.country)
    setEditError('')
  }

  function handleEditSave() {
    if (!editing) return
    const result = updateAgent(editing.slug, editName, editCountry)
    if (result) {
      setEditError(result)
      return
    }
    setEditing(null)
  }

  function handleDelete(agent: Agent) {
    const count = bookings.filter((booking) => booking.agentSlug === agent.slug).length
    const message =
      count > 0
        ? `Remove ${agent.name}? Their booking link will stop working. Existing bookings stay in the list.`
        : `Remove ${agent.name}?`
    if (!window.confirm(message)) return
    removeAgent(agent.slug)
  }

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader
        title="Agents"
        description="Add partner agencies, edit their names, and copy each private booking link."
      />

      <Surface className="mb-4 p-5">
        <h2 className="font-medium text-teal-950">Add agent</h2>
        <p className="mt-1 text-sm text-neutral-500">
          Creates a private booking URL you can send to the partner.
        </p>
        <form
          className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-end"
          onSubmit={(event) => {
            event.preventDefault()
            handleAdd()
          }}
        >
          <div className="min-w-0 flex-1 space-y-1.5">
            <Label htmlFor="new-agent-name" className="text-xs text-neutral-400">
              Agent name
            </Label>
            <Input
              id="new-agent-name"
              value={newName}
              onChange={(event) => {
                setNewName(event.target.value)
                if (addError) setAddError('')
              }}
              placeholder="Sunrise Tours"
              className="h-10"
            />
          </div>
          <div className="w-full max-w-[180px] space-y-1.5">
            <Label htmlFor="new-agent-country" className="text-xs text-neutral-400">
              Country
            </Label>
            <Input
              id="new-agent-country"
              value={newCountry}
              onChange={(event) => {
                setNewCountry(event.target.value)
                if (addError) setAddError('')
              }}
              placeholder="India"
              className="h-10"
            />
          </div>
          <Button type="submit" className="h-10">
            <Plus data-icon="inline-start" />
            Add agent
          </Button>
        </form>
        {addError ? <p className="mt-3 text-sm text-red-600">{addError}</p> : null}
      </Surface>

      <div className="space-y-3 md:hidden">
        {agents.map((agent) => {
          const count = bookings.filter((booking) => booking.agentSlug === agent.slug).length
          return (
            <Surface key={agent.slug} className="p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-semibold text-teal-950">{agent.name}</p>
                  <p className="text-sm text-teal-900/50">{agent.country}</p>
                </div>
                <StatusBadge status={agent.status} />
              </div>
              <p className="mt-3 font-mono text-xs text-teal-800/70">/agent/{agent.slug}</p>
              <p className="mt-1 text-sm text-teal-900/55">{count} bookings</p>
              <div className="mt-4 flex flex-wrap gap-2">
                <Button size="sm" className="h-9" onClick={() => copyLink(agent.slug)}>
                  {copied === agent.slug ? (
                    <>
                      <Check data-icon="inline-start" />
                      Copied
                    </>
                  ) : (
                    <>
                      <Copy data-icon="inline-start" />
                      Copy link
                    </>
                  )}
                </Button>
                <Link
                  href={`/agent/${agent.slug}`}
                  className={cn(buttonVariants({ variant: 'outline', size: 'sm' }), 'h-9')}
                >
                  <ExternalLink data-icon="inline-start" />
                  Open
                </Link>
                <Button variant="outline" size="sm" className="h-9" onClick={() => openEdit(agent)}>
                  <Pencil data-icon="inline-start" />
                  Edit
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-9"
                  onClick={() =>
                    setAgentStatus(agent.slug, agent.status === 'Active' ? 'Inactive' : 'Active')
                  }
                >
                  {agent.status === 'Active' ? 'Deactivate' : 'Activate'}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-9 text-red-600 hover:text-red-700"
                  onClick={() => handleDelete(agent)}
                >
                  <Trash2 data-icon="inline-start" />
                  Delete
                </Button>
              </div>
            </Surface>
          )
        })}
      </div>

      <Surface className="hidden overflow-x-auto md:block">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className="px-4 text-teal-700/45">Agent Name</TableHead>
              <TableHead className="text-teal-700/45">Country</TableHead>
              <TableHead className="text-teal-700/45">Booking Link</TableHead>
              <TableHead className="text-teal-700/45">Bookings</TableHead>
              <TableHead className="text-teal-700/45">Status</TableHead>
              <TableHead className="text-right text-teal-700/45" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {agents.map((agent) => {
              const count = bookings.filter((booking) => booking.agentSlug === agent.slug).length
              return (
                <TableRow key={agent.slug}>
                  <TableCell className="px-4 font-medium">{agent.name}</TableCell>
                  <TableCell>{agent.country}</TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <Link
                        href={`/agent/${agent.slug}`}
                        className="font-mono text-[13px] text-teal-800 hover:underline"
                      >
                        /agent/{agent.slug}
                      </Link>
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-8"
                        onClick={() => copyLink(agent.slug)}
                      >
                        {copied === agent.slug ? (
                          <>
                            <Check data-icon="inline-start" />
                            Copied
                          </>
                        ) : (
                          <>
                            <Copy data-icon="inline-start" />
                            Copy
                          </>
                        )}
                      </Button>
                    </div>
                  </TableCell>
                  <TableCell>{count}</TableCell>
                  <TableCell>
                    <StatusBadge status={agent.status} />
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-2">
                      <Button variant="outline" size="sm" onClick={() => openEdit(agent)}>
                        <Pencil data-icon="inline-start" />
                        Edit
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() =>
                          setAgentStatus(
                            agent.slug,
                            agent.status === 'Active' ? 'Inactive' : 'Active',
                          )
                        }
                      >
                        {agent.status === 'Active' ? 'Deactivate' : 'Activate'}
                      </Button>
                      <Button
                        variant="outline"
                        size="icon-sm"
                        className="text-neutral-400 hover:text-red-600"
                        aria-label={`Delete ${agent.name}`}
                        onClick={() => handleDelete(agent)}
                      >
                        <Trash2 />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      </Surface>

      <Dialog
        open={editing !== null}
        onOpenChange={(open) => {
          if (!open) setEditing(null)
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Edit agent</DialogTitle>
            <DialogDescription>
              Update the partner name and country. The booking URL stays the same.
            </DialogDescription>
          </DialogHeader>
          <form
            className="space-y-4"
            onSubmit={(event) => {
              event.preventDefault()
              handleEditSave()
            }}
          >
            <div className="space-y-1.5">
              <Label htmlFor="edit-agent-name">Agent name</Label>
              <Input
                id="edit-agent-name"
                value={editName}
                onChange={(event) => {
                  setEditName(event.target.value)
                  if (editError) setEditError('')
                }}
                className="h-10"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="edit-agent-country">Country</Label>
              <Input
                id="edit-agent-country"
                value={editCountry}
                onChange={(event) => {
                  setEditCountry(event.target.value)
                  if (editError) setEditError('')
                }}
                className="h-10"
              />
            </div>
            {editing ? (
              <p className="font-mono text-xs text-teal-800/60">/agent/{editing.slug}</p>
            ) : null}
            {editError ? <p className="text-sm text-red-600">{editError}</p> : null}
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setEditing(null)}>
                Cancel
              </Button>
              <Button type="submit">Save changes</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
