'use client'

import { useEffect, useState, type FormEvent } from 'react'
import { KeyRound, Plus, Trash2 } from 'lucide-react'
import { SettingsSubnav } from '@/components/admin/admin-settings'
import { PageHeader, Surface } from '@/components/ui-primitives'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
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
import {
  createPortalUser,
  deletePortalUser,
  listPortalUsers,
  setPortalUserCredentials,
  setPortalUserStatus,
} from '@/lib/supabase/portal-users-db'
import { usePortal } from '@/components/portal-provider'
import type { PortalUser } from '@/lib/types'
import { cn } from '@/lib/utils'

function userLabel(user: Pick<PortalUser, 'email' | 'name' | 'userId'>) {
  return user.name || user.userId || user.email || 'this user'
}

function statusStyle(status: PortalUser['status']) {
  if (status === 'active') return 'border-emerald-200/80 bg-emerald-50 text-emerald-800'
  if (status === 'inactive') return 'border-teal-900/10 bg-teal-950/[0.04] text-teal-900/50'
  return 'border-amber-200/80 bg-amber-50 text-amber-800'
}

function StatusPill({ status }: { status: PortalUser['status'] }) {
  const label = status === 'pending' ? 'Pending' : status === 'active' ? 'Active' : 'Inactive'
  return (
    <Badge
      variant="outline"
      className={cn('rounded-full px-2.5 py-0.5 text-[11px] font-semibold tracking-tight capitalize', statusStyle(status))}
    >
      {label}
    </Badge>
  )
}

export function AdminUsers() {
  const { agents } = usePortal()
  const [users, setUsers] = useState<PortalUser[]>([])
  const [loadError, setLoadError] = useState('')
  const [loading, setLoading] = useState(true)

  const [email, setEmail] = useState('')
  const [name, setName] = useState('')
  const [company, setCompany] = useState('')
  const [newUserId, setNewUserId] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [newAgentSlug, setNewAgentSlug] = useState('')
  const [addError, setAddError] = useState('')
  const [adding, setAdding] = useState(false)

  const [loginFor, setLoginFor] = useState<PortalUser | null>(null)
  const [loginUserId, setLoginUserId] = useState('')
  const [loginPassword, setLoginPassword] = useState('')
  const [loginAgentSlug, setLoginAgentSlug] = useState('')
  const [loginError, setLoginError] = useState('')
  const [savingLogin, setSavingLogin] = useState(false)

  async function refresh() {
    const next = await listPortalUsers()
    setUsers(next)
  }

  useEffect(() => {
    let cancelled = false
    async function load() {
      setLoadError('')
      setLoading(true)
      try {
        const next = await listPortalUsers()
        if (!cancelled) setUsers(next)
      } catch (caught) {
        if (!cancelled) {
          setLoadError(caught instanceof Error ? caught.message : 'Could not load users.')
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [])

  async function handleAdd(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setAddError('')
    if (!newUserId.trim() || !newPassword) {
      setAddError('Enter a User ID and password. Email is optional.')
      return
    }
    setAdding(true)
    try {
      await createPortalUser({
        email,
        name,
        company,
        userId: newUserId,
        password: newPassword,
        agentSlug: newAgentSlug,
      })
      setEmail('')
      setName('')
      setCompany('')
      setNewUserId('')
      setNewPassword('')
      setNewAgentSlug('')
      await refresh()
    } catch (caught) {
      setAddError(caught instanceof Error ? caught.message : 'Could not add that user.')
    } finally {
      setAdding(false)
    }
  }

  function openLogin(user: PortalUser) {
    setLoginFor(user)
    setLoginUserId(user.userId ?? '')
    setLoginPassword('')
    setLoginAgentSlug(user.agentSlug ?? '')
    setLoginError('')
  }

  async function handleSaveLogin() {
    if (!loginFor) return
    setLoginError('')
    setSavingLogin(true)
    try {
      await setPortalUserCredentials({
        id: loginFor.id,
        userId: loginUserId,
        password: loginPassword,
        agentSlug: loginAgentSlug,
      })
      setLoginFor(null)
      await refresh()
    } catch (caught) {
      setLoginError(caught instanceof Error ? caught.message : 'Could not save login.')
    } finally {
      setSavingLogin(false)
    }
  }

  async function toggleStatus(user: PortalUser) {
    const next = user.status === 'active' ? 'inactive' : 'active'
    try {
      await setPortalUserStatus(user.id, next)
      await refresh()
    } catch (caught) {
      window.alert(caught instanceof Error ? caught.message : 'Could not update status.')
    }
  }

  async function handleDelete(user: PortalUser) {
    if (!window.confirm(`Remove ${userLabel(user)}? They will no longer be able to sign in.`)) return
    try {
      await deletePortalUser(user.id)
      await refresh()
    } catch (caught) {
      window.alert(caught instanceof Error ? caught.message : 'Could not remove that user.')
    }
  }

  return (
    <div className="w-full">
      <PageHeader
        title="Users"
        description="Partner logins only. Admin and Accounting already use the passcode on the home page — do not add them here."
      />
      <SettingsSubnav />

      <Surface className="mb-4 p-5">
        <h2 className="font-medium text-teal-950">Add user</h2>
        <p className="mt-1 text-sm text-neutral-500">
          Create a partner User ID and password, then link them to an agent. Email is optional. Do
          not add Admin or Accounting here.
        </p>
        <form className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3" onSubmit={handleAdd}>
          <div className="space-y-1.5">
            <Label htmlFor="new-user-email" className="text-xs text-neutral-400">
              Email
            </Label>
            <Input
              id="new-user-email"
              type="email"
              value={email}
              onChange={(event) => {
                setEmail(event.target.value)
                if (addError) setAddError('')
              }}
              placeholder="Optional"
              className="h-10"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="new-user-name" className="text-xs text-neutral-400">
              Name
            </Label>
            <Input
              id="new-user-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Optional"
              className="h-10"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="new-user-company" className="text-xs text-neutral-400">
              Company
            </Label>
            <Input
              id="new-user-company"
              value={company}
              onChange={(event) => setCompany(event.target.value)}
              placeholder="Optional"
              className="h-10"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="new-user-agent" className="text-xs text-neutral-400">
              Agent
            </Label>
            <select
              id="new-user-agent"
              value={newAgentSlug}
              onChange={(event) => setNewAgentSlug(event.target.value)}
              className="h-10 w-full rounded-lg border border-input bg-transparent px-3 text-sm"
            >
              <option value="">Not linked yet</option>
              {agents.map((agent) => (
                <option key={agent.slug} value={agent.slug}>
                  {agent.name}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="new-user-id" className="text-xs text-neutral-400">
              User ID
            </Label>
            <Input
              id="new-user-id"
              autoComplete="off"
              required
              value={newUserId}
              onChange={(event) => setNewUserId(event.target.value)}
              placeholder="Required"
              className="h-10"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="new-user-password" className="text-xs text-neutral-400">
              Password
            </Label>
            <Input
              id="new-user-password"
              type="password"
              autoComplete="new-password"
              required
              value={newPassword}
              onChange={(event) => setNewPassword(event.target.value)}
              placeholder="Min. 6 characters"
              className="h-10"
            />
          </div>
          <div className="flex items-end">
            <Button type="submit" disabled={adding} className="h-10 w-full">
              <Plus data-icon="inline-start" />
              {adding ? 'Saving…' : 'Add user'}
            </Button>
          </div>
        </form>
        {addError ? <p className="mt-3 text-sm text-red-600">{addError}</p> : null}
      </Surface>

      {loadError ? (
        <p className="mb-4 rounded-2xl border border-red-200 bg-red-50 px-3.5 py-2.5 text-sm text-red-800">
          {loadError} Run <span className="font-mono">supabase/add-portal-users.sql</span> in the
          Supabase SQL editor if this table is new.
        </p>
      ) : null}

      {loading ? <p className="text-sm text-teal-900/50">Loading users…</p> : null}

      {!loading && users.length === 0 && !loadError ? (
        <Surface className="p-6 text-sm text-teal-900/55">
          No sign-ups yet. Partners can register from the home page, or add a user here.
        </Surface>
      ) : null}

      <div className="space-y-3 md:hidden">
        {users.map((user) => (
          <Surface key={user.id} className="p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="font-semibold text-teal-950">{userLabel(user)}</p>
                {user.email ? <p className="text-sm text-teal-900/55">{user.email}</p> : null}
                {user.company ? <p className="text-sm text-teal-900/45">{user.company}</p> : null}
              </div>
              <StatusPill status={user.status} />
            </div>
            <p className="mt-3 font-mono text-xs text-teal-800/70">
              {user.userId ? `User ID · ${user.userId}` : 'User ID not set'}
            </p>
            <p className="mt-1 text-xs text-teal-900/45">
              {user.agentSlug
                ? `Agent · ${agents.find((item) => item.slug === user.agentSlug)?.name ?? user.agentSlug}`
                : 'Agent not linked'}
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              <Button size="sm" className="h-9" onClick={() => openLogin(user)}>
                <KeyRound data-icon="inline-start" />
                Set login
              </Button>
              {user.userId ? (
                <Button variant="outline" size="sm" className="h-9" onClick={() => void toggleStatus(user)}>
                  {user.status === 'active' ? 'Deactivate' : 'Activate'}
                </Button>
              ) : null}
              <Button
                variant="outline"
                size="sm"
                className="h-9 text-red-600 hover:text-red-700"
                onClick={() => void handleDelete(user)}
              >
                <Trash2 data-icon="inline-start" />
                Remove
              </Button>
            </div>
          </Surface>
        ))}
      </div>

      <Surface className="hidden overflow-x-auto md:block">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className="px-4 text-teal-700/45">Email</TableHead>
              <TableHead className="text-teal-700/45">Name / company</TableHead>
              <TableHead className="text-teal-700/45">User ID</TableHead>
              <TableHead className="text-teal-700/45">Agent</TableHead>
              <TableHead className="text-teal-700/45">Status</TableHead>
              <TableHead className="text-right text-teal-700/45" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {users.map((user) => (
              <TableRow key={user.id}>
                <TableCell className="px-4 font-medium">{user.email || '—'}</TableCell>
                <TableCell>
                  <p>{user.name || '—'}</p>
                  {user.company ? <p className="text-xs text-teal-900/45">{user.company}</p> : null}
                </TableCell>
                <TableCell className="font-mono text-[13px] text-teal-800">
                  {user.userId ?? '—'}
                </TableCell>
                <TableCell className="text-sm text-teal-900/70">
                  {user.agentSlug
                    ? (agents.find((item) => item.slug === user.agentSlug)?.name ?? user.agentSlug)
                    : '—'}
                </TableCell>
                <TableCell>
                  <StatusPill status={user.status} />
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex justify-end gap-2">
                    <Button variant="outline" size="sm" onClick={() => openLogin(user)}>
                      <KeyRound data-icon="inline-start" />
                      Set login
                    </Button>
                    {user.userId ? (
                      <Button variant="outline" size="sm" onClick={() => void toggleStatus(user)}>
                        {user.status === 'active' ? 'Deactivate' : 'Activate'}
                      </Button>
                    ) : null}
                    <Button
                      variant="outline"
                      size="icon-sm"
                      className="text-neutral-400 hover:text-red-600"
                      aria-label={`Delete ${userLabel(user)}`}
                      onClick={() => void handleDelete(user)}
                    >
                      <Trash2 />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Surface>

      <Dialog
        open={loginFor !== null}
        onOpenChange={(open) => {
          if (!open) setLoginFor(null)
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Set User ID and password</DialogTitle>
            <DialogDescription>
              {loginFor
                ? `Login for ${userLabel(loginFor)}. Saving this activates the account.`
                : 'Choose a User ID and password.'}
            </DialogDescription>
          </DialogHeader>
          <form
            className="space-y-4"
            onSubmit={(event) => {
              event.preventDefault()
              void handleSaveLogin()
            }}
          >
            <div className="space-y-1.5">
              <Label htmlFor="set-user-id">User ID</Label>
              <Input
                id="set-user-id"
                autoComplete="off"
                value={loginUserId}
                onChange={(event) => {
                  setLoginUserId(event.target.value)
                  if (loginError) setLoginError('')
                }}
                className="h-10"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="set-user-agent">Agent</Label>
              <select
                id="set-user-agent"
                value={loginAgentSlug}
                onChange={(event) => {
                  setLoginAgentSlug(event.target.value)
                  if (loginError) setLoginError('')
                }}
                className="h-10 w-full rounded-lg border border-input bg-transparent px-3 text-sm"
              >
                <option value="">Not linked yet</option>
                {agents.map((agent) => (
                  <option key={agent.slug} value={agent.slug}>
                    {agent.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="set-user-password">Password</Label>
              <Input
                id="set-user-password"
                type="password"
                autoComplete="new-password"
                value={loginPassword}
                onChange={(event) => {
                  setLoginPassword(event.target.value)
                  if (loginError) setLoginError('')
                }}
                className="h-10"
              />
            </div>
            {loginError ? <p className="text-sm text-red-600">{loginError}</p> : null}
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setLoginFor(null)}>
                Cancel
              </Button>
              <Button type="submit" disabled={savingLogin}>
                {savingLogin ? 'Saving…' : 'Save login'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
