import React, { useState } from 'react'
import { toast } from 'sonner'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useRedis, type NewKeyInput } from '@/store/redis'
import { useConnections } from '@/store/connections'
import type { RedisKeyType } from '../../../shared/types'

type CreatableType = NewKeyInput['type']

const TYPES: { value: CreatableType; label: string }[] = [
  { value: 'string', label: 'String' },
  { value: 'hash', label: 'Hash' },
  { value: 'set', label: 'Set' },
  { value: 'zset', label: 'Sorted set' },
  { value: 'list', label: 'List' },
  { value: 'stream', label: 'Stream' }
]

/**
 * Create a new Redis key. Redis can't hold an empty key, so the dialog collects
 * the first value/member for the chosen type; creation runs through the same
 * WATCH+MULTI commit (expectedType 'none'), so an existing name is rejected.
 */
export function RedisAddKeyDialog({
  open,
  onOpenChange
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
}): React.JSX.Element {
  const createKey = useRedis((s) => s.createKey)
  const currentDb = useRedis((s) => s.dbInfo?.current ?? 0)
  const openRedisKey = useConnections((s) => s.openRedisKey)

  const [name, setName] = useState('')
  const [type, setType] = useState<CreatableType>('string')
  const [value, setValue] = useState('')
  const [field, setField] = useState('')
  const [score, setScore] = useState('0')
  const [ttl, setTtl] = useState('')
  const [busy, setBusy] = useState(false)

  // reset every field whenever the dialog (re)opens
  React.useEffect(() => {
    if (open) {
      setName('')
      setType('string')
      setValue('')
      setField('')
      setScore('0')
      setTtl('')
    }
  }, [open])

  const needsField = type === 'hash' || type === 'stream'
  const needsScore = type === 'zset'
  const memberLabel = type === 'set' || type === 'zset' ? 'Member' : 'Value'

  const buildInput = (): NewKeyInput => {
    switch (type) {
      case 'hash':
        return { type, field, value }
      case 'stream':
        return { type, field, value }
      case 'set':
        return { type, member: value }
      case 'zset':
        return { type, member: value, score: Number(score) || 0 }
      case 'list':
        return { type, value }
      case 'string':
      default:
        return { type: 'string', value }
    }
  }

  const valid = name.trim() !== '' && (!needsField || field.trim() !== '')

  const submit = async (): Promise<void> => {
    if (!valid) return
    setBusy(true)
    const ttlSecs = ttl.trim() ? Number(ttl) : undefined
    const err = await createKey(name.trim(), buildInput(), ttlSecs)
    setBusy(false)
    if (err) {
      toast.error(err)
      return
    }
    toast.success(`Created ${name.trim()}`)
    onOpenChange(false)
    openRedisKey(name.trim(), type as RedisKeyType, currentDb)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>New key</DialogTitle>
          <DialogDescription>Creates a key in DB {currentDb} with its first value.</DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-1">
            <Label htmlFor="newkey-name">Key name</Label>
            <Input
              id="newkey-name"
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. user:42"
              className="font-mono"
            />
          </div>

          <div className="space-y-1">
            <Label>Type</Label>
            <Select value={type} onValueChange={(v) => setType(v as CreatableType)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TYPES.map((t) => (
                  <SelectItem key={t.value} value={t.value}>
                    {t.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {needsField && (
            <div className="space-y-1">
              <Label htmlFor="newkey-field">Field</Label>
              <Input
                id="newkey-field"
                value={field}
                onChange={(e) => setField(e.target.value)}
                placeholder="field name"
                className="font-mono"
              />
            </div>
          )}

          <div className="grid grid-cols-3 gap-2">
            <div className={needsScore ? 'col-span-2 space-y-1' : 'col-span-3 space-y-1'}>
              <Label htmlFor="newkey-value">{memberLabel}</Label>
              <Input
                id="newkey-value"
                value={value}
                onChange={(e) => setValue(e.target.value)}
                placeholder={type === 'string' ? 'value' : 'first member'}
                className="font-mono"
              />
            </div>
            {needsScore && (
              <div className="space-y-1">
                <Label htmlFor="newkey-score">Score</Label>
                <Input
                  id="newkey-score"
                  type="number"
                  value={score}
                  onChange={(e) => setScore(e.target.value)}
                />
              </div>
            )}
          </div>

          <div className="space-y-1">
            <Label htmlFor="newkey-ttl">
              TTL seconds <span className="text-muted-foreground">(optional)</span>
            </Label>
            <Input
              id="newkey-ttl"
              type="number"
              min={0}
              value={ttl}
              onChange={(e) => setTtl(e.target.value)}
              placeholder="no expiry"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button disabled={!valid || busy} onClick={() => void submit()}>
            Create
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
