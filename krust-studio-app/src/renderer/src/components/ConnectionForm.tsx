import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import {
  Loader2,
  Check,
  X,
  Plug,
  Save,
  Trash2,
  Copy,
  Eye,
  EyeOff,
  Power
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select'
import { useConnections } from '@/store/connections'
import type {
  ConnectionConfig,
  ConnectionSummary,
  DriverType,
  TestConnectionResult
} from '../../../shared/types'

const schema = z
  .object({
    id: z.string().optional(),
    name: z.string().min(1, 'Name is required'),
    driver: z.enum(['mysql', 'postgres', 'sqlite']),
    host: z.string().optional(),
    port: z.coerce.number().int().positive().optional(),
    database: z.string().optional(),
    user: z.string().optional(),
    password: z.string().optional(),
    sqlitePath: z.string().optional(),
    ssl: z.boolean().optional(),
    readOnly: z.boolean().optional()
  })
  .superRefine((val, ctx) => {
    if (val.driver === 'sqlite') {
      if (!val.sqlitePath)
        ctx.addIssue({
          code: 'custom',
          path: ['sqlitePath'],
          message: 'File path is required'
        })
    } else {
      if (!val.host)
        ctx.addIssue({ code: 'custom', path: ['host'], message: 'Host is required' })
      if (!val.user)
        ctx.addIssue({ code: 'custom', path: ['user'], message: 'User is required' })
    }
  })

type FormValues = z.input<typeof schema>

const DEFAULT_PORTS: Record<DriverType, number | undefined> = {
  mysql: 3306,
  postgres: 5432,
  sqlite: undefined
}

function emptyValues(): FormValues {
  return {
    name: '',
    driver: 'postgres',
    host: 'localhost',
    port: 5432,
    database: '',
    user: '',
    password: '',
    sqlitePath: '',
    ssl: false,
    readOnly: false
  }
}

function toFormValues(c: ConnectionSummary): FormValues {
  return {
    id: c.id,
    name: c.name,
    driver: c.driver,
    host: c.host ?? '',
    port: c.port,
    database: c.database ?? '',
    user: c.user ?? '',
    password: '',
    sqlitePath: c.sqlitePath ?? '',
    ssl: c.ssl ?? false,
    readOnly: c.readOnly ?? false
  }
}

function toConfig(v: FormValues): ConnectionConfig {
  return {
    id: v.id ?? '',
    name: v.name,
    driver: v.driver,
    host: v.host || undefined,
    port: v.port ? Number(v.port) : undefined,
    database: v.database || undefined,
    user: v.user || undefined,
    sqlitePath: v.sqlitePath || undefined,
    ssl: v.ssl,
    readOnly: v.readOnly
  }
}

interface Props {
  /** the existing connection being edited, or null for a new one */
  existing: ConnectionSummary | null
  /** called after a successful save (new or update); receives the saved connection */
  onSaved?: (saved: ConnectionSummary) => void
  /** called when the user clicks Connect (to let the tab close itself) */
  onConnected?: () => void
}

export function ConnectionForm({ existing, onSaved, onConnected }: Props): React.JSX.Element {
  const save = useConnections((s) => s.save)
  const remove = useConnections((s) => s.remove)
  const duplicate = useConnections((s) => s.duplicate)
  const open = useConnections((s) => s.open)
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<TestConnectionResult | null>(null)
  const [showPassword, setShowPassword] = useState(false)

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    reset,
    formState: { errors, isSubmitting }
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: existing ? toFormValues(existing) : emptyValues()
  })

  useEffect(() => {
    reset(existing ? toFormValues(existing) : emptyValues())
    setTestResult(null)
    setShowPassword(false)
  }, [existing, reset])

  const togglePassword = async (): Promise<void> => {
    // reveal the stored password on first show, if not already typed
    if (!showPassword && existing?.hasPassword && !watch('password')) {
      const pw = await window.api.connections.reveal(existing.id)
      setValue('password', pw)
    }
    setShowPassword((s) => !s)
  }

  const driver = watch('driver')
  const isSqlite = driver === 'sqlite'

  const onDriverChange = (value: string): void => {
    const d = value as DriverType
    setValue('driver', d)
    const dp = DEFAULT_PORTS[d]
    if (dp) setValue('port', dp)
  }

  const runTest = async (): Promise<void> => {
    setTesting(true)
    setTestResult(null)
    const values = watch()
    const result = await window.api.connections.test({
      config: toConfig(values),
      password: values.password || undefined
    })
    setTestResult(result)
    setTesting(false)
  }

  const onSubmit = handleSubmit(async (values) => {
    const saved = await save({
      config: toConfig(values),
      password: values.password || undefined
    })
    onSaved?.(saved)
  })

  return (
    <form onSubmit={onSubmit} className="flex h-full flex-col">
      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-xl space-y-3 p-6">
        <div className="space-y-1">
          <Label htmlFor="name">Name</Label>
          <Input id="name" placeholder="My database" {...register('name')} />
          {errors.name && (
            <p className="text-xs text-destructive">{errors.name.message}</p>
          )}
        </div>

        <div className="space-y-1">
          <Label>Driver</Label>
          <Select value={driver} onValueChange={onDriverChange}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="postgres">PostgreSQL</SelectItem>
              <SelectItem value="mysql">MySQL / MariaDB</SelectItem>
              <SelectItem value="sqlite">SQLite</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {isSqlite ? (
          <div className="space-y-1">
            <Label htmlFor="sqlitePath">Database file path</Label>
            <Input
              id="sqlitePath"
              placeholder="C:\\path\\to\\database.db"
              {...register('sqlitePath')}
            />
            {errors.sqlitePath && (
              <p className="text-xs text-destructive">
                {errors.sqlitePath.message}
              </p>
            )}
          </div>
        ) : (
          <>
            <div className="grid grid-cols-3 gap-2">
              <div className="col-span-2 space-y-1">
                <Label htmlFor="host">Host</Label>
                <Input id="host" {...register('host')} />
                {errors.host && (
                  <p className="text-xs text-destructive">{errors.host.message}</p>
                )}
              </div>
              <div className="space-y-1">
                <Label htmlFor="port">Port</Label>
                <Input id="port" type="number" {...register('port')} />
              </div>
            </div>
            <div className="space-y-1">
              <Label htmlFor="database">
                Database{' '}
                <span className="text-muted-foreground">(optional)</span>
              </Label>
              <Input
                id="database"
                placeholder="Leave empty to browse all databases"
                {...register('database')}
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <Label htmlFor="user">User</Label>
                <Input id="user" {...register('user')} />
                {errors.user && (
                  <p className="text-xs text-destructive">{errors.user.message}</p>
                )}
              </div>
              <div className="space-y-1">
                <Label htmlFor="password">Password</Label>
                <div className="relative">
                  <Input
                    id="password"
                    type={showPassword ? 'text' : 'password'}
                    autoComplete="off"
                    className="pr-8"
                    {...register('password')}
                  />
                  <button
                    type="button"
                    onClick={togglePassword}
                    title={showPassword ? 'Hide' : 'Show'}
                    className="absolute right-1.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  >
                    {showPassword ? (
                      <EyeOff className="size-4" />
                    ) : (
                      <Eye className="size-4" />
                    )}
                  </button>
                </div>
              </div>
            </div>
            <label className="flex items-center gap-2 text-xs text-muted-foreground">
              <input type="checkbox" {...register('ssl')} />
              Use SSL/TLS
            </label>
          </>
        )}

        <label className="flex items-center gap-2 text-xs text-muted-foreground">
          <input type="checkbox" {...register('readOnly')} />
          Read-only connection (blocks all writes)
        </label>

        {testResult && (
          <div
            className={
              'flex items-start gap-2 rounded-md border p-2 text-xs ' +
              (testResult.ok
                ? 'border-green-700/40 text-green-400'
                : 'border-destructive/40 text-destructive')
            }
          >
            {testResult.ok ? (
              <Check className="mt-0.5" />
            ) : (
              <X className="mt-0.5" />
            )}
            <span className="break-all">
              {testResult.ok
                ? `Connected in ${testResult.latencyMs}ms — server ${testResult.serverVersion}`
                : testResult.error}
            </span>
          </div>
        )}
        </div>
      </div>

      <div className="border-t border-border">
        <div className="mx-auto flex w-full max-w-xl items-center gap-2 px-6 py-3">
          <Button type="submit" disabled={isSubmitting}>
            <Save />
            Save
          </Button>
          {existing && (
            <Button
              type="button"
              variant="ghost"
              onClick={() => duplicate(existing.id)}
              title="Duplicate (copies password)"
            >
              <Copy />
              Duplicate
            </Button>
          )}
          <Button
            type="button"
            variant="outline"
            onClick={runTest}
            disabled={testing}
          >
            {testing ? <Loader2 className="animate-spin" /> : <Plug />}
            Test
          </Button>
          {existing && (
            <Button
              type="button"
              variant="secondary"
              onClick={() => {
                void open(existing.id)
                onConnected?.()
              }}
              title="Connect and browse schema"
            >
              <Power />
              Connect
            </Button>
          )}
          <div className="flex-1" />
          {existing && (
            <Button
              type="button"
              variant="destructive"
              onClick={() => remove(existing.id)}
            >
              <Trash2 />
              Delete
            </Button>
          )}
        </div>
      </div>
    </form>
  )
}
