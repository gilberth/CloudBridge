import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Clock3,
  Download,
  FileCog,
  LoaderCircle,
  Plug,
  Plus,
  SlidersHorizontal,
  Trash2,
  Upload,
  Users,
  Webhook,
  type LucideIcon,
} from 'lucide-react';
import { toast } from 'sonner';
import type { SessionUser } from '@cloudbridge/shared';
import { ApiError, api } from '@/lib/api';
import { PageHeader } from '@/components/layout/PageHeader';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input, Textarea } from '@/components/ui/input';
import { FieldHelp } from '@/components/ui/field-help';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { useAuth } from '@/hooks/useAuth';
import { cn } from '@/lib/utils';

export default function SettingsPage() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const settings = useQuery({ queryKey: ['settings'], queryFn: api.settings.get });

  const [form, setForm] =
    useState<
      ReturnType<typeof api.settings.get> extends Promise<infer T> ? T | null : never
    >(null);
  useEffect(() => {
    if (settings.data) setForm(settings.data);
  }, [settings.data]);

  const [rclonePassword, setRclonePassword] = useState('');
  const [testResult, setTestResult] = useState<{
    online: boolean;
    error: string | null;
  } | null>(null);

  const testConnection = useMutation({
    mutationFn: () =>
      api.settings.testRclone(
        form
          ? {
              url: form.rclone.url,
              user: form.rclone.user,
              ...(rclonePassword ? { password: rclonePassword } : {}),
            }
          : undefined,
      ),
    onSuccess: (result) => setTestResult({ online: result.online, error: result.error }),
  });

  const save = useMutation({
    mutationFn: () => {
      if (!form) throw new Error('unreachable');
      return api.settings.update({
        rclone: {
          url: form.rclone.url,
          user: form.rclone.user,
          ...(rclonePassword ? { password: rclonePassword } : {}),
        },
        defaults: form.defaults,
        historyRetentionDays: form.historyRetentionDays,
        webhookUrl: form.webhookUrl,
        webhookTemplate: form.webhookTemplate,
        timezone: form.timezone,
        accentColor: form.accentColor,
      });
    },
    onSuccess: (updated) => {
      setForm(updated);
      setRclonePassword('');
      queryClient.setQueryData(['settings'], updated);
      document.documentElement.style.setProperty('--accent-hue', updated.accentColor);
      toast.success('Ajustes guardados');
    },
    onError: (error) =>
      toast.error('No se pudieron guardar los ajustes', {
        description: error instanceof ApiError ? error.message : String(error),
      }),
  });

  const timezones = useQuery({
    queryKey: ['timezones'],
    queryFn: api.settings.timezones,
    staleTime: Infinity,
  });

  if (settings.isPending || !form) {
    return (
      <div className="space-y-3 p-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-48 w-full" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <PageHeader
        title="Settings"
        actions={
          <Button size="sm" onClick={() => save.mutate()} disabled={save.isPending}>
            {save.isPending && <LoaderCircle className="animate-spin" />}
            Guardar cambios
          </Button>
        }
      />

      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-[1440px] space-y-4 p-4">
          <Section
            title="Conexión con rclone"
            description="Acceso a la API remota que CloudBridge utiliza para ejecutar operaciones."
            icon={Plug}
          >
            <div className="grid gap-4 lg:grid-cols-3">
              <Field
                label="URL de la RC API"
                help="Dirección HTTP del servicio rclone RC. Ejemplo: http://127.0.0.1:5572."
              >
                <Input
                  value={form.rclone.url}
                  onChange={(event) =>
                    setForm({
                      ...form,
                      rclone: { ...form.rclone, url: event.target.value },
                    })
                  }
                />
              </Field>
              <Field
                label="Usuario"
                help="Usuario configurado al iniciar el servicio rclone RC."
              >
                <Input
                  value={form.rclone.user}
                  onChange={(event) =>
                    setForm({
                      ...form,
                      rclone: { ...form.rclone, user: event.target.value },
                    })
                  }
                />
              </Field>
              <Field
                label={`Contraseña ${form.rclone.passwordSet ? '(configurada)' : ''}`}
                help="Credencial de la RC API. Déjala vacía para conservar la contraseña configurada."
              >
                <Input
                  type="password"
                  placeholder={form.rclone.passwordSet ? '••••••••' : ''}
                  value={rclonePassword}
                  onChange={(event) => setRclonePassword(event.target.value)}
                />
              </Field>
            </div>
            <div className="flex min-h-10 flex-wrap items-center gap-2 border-t border-border/70 pt-4">
              <Button
                variant="outline"
                size="sm"
                onClick={() => testConnection.mutate()}
                disabled={testConnection.isPending}
              >
                {testConnection.isPending ? (
                  <LoaderCircle className="animate-spin" />
                ) : (
                  <Plug />
                )}
                Probar conexión
              </Button>
              {testResult && (
                <Badge variant={testResult.online ? 'success' : 'danger'}>
                  {testResult.online ? 'conectado' : (testResult.error ?? 'error')}
                </Badge>
              )}
            </div>
          </Section>

          <Section
            title="Valores por defecto"
            description="Parámetros base aplicados a las nuevas transferencias."
            icon={SlidersHorizontal}
          >
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <Field
                label="--transfers"
                help="Cantidad máxima de archivos transferidos en paralelo. Un valor mayor consume más red y CPU."
              >
                <Input
                  type="number"
                  min={1}
                  value={form.defaults.transfers}
                  onChange={(event) =>
                    setForm({
                      ...form,
                      defaults: {
                        ...form.defaults,
                        transfers: Number(event.target.value) || 1,
                      },
                    })
                  }
                />
              </Field>
              <Field
                label="--checkers"
                help="Cantidad de comprobaciones paralelas que rclone usa al comparar origen y destino."
              >
                <Input
                  type="number"
                  min={1}
                  value={form.defaults.checkers}
                  onChange={(event) =>
                    setForm({
                      ...form,
                      defaults: {
                        ...form.defaults,
                        checkers: Number(event.target.value) || 1,
                      },
                    })
                  }
                />
              </Field>
              <Field
                label="--bwlimit global"
                help="Límite global de ancho de banda. Ejemplos: 10M o 500K; vacío significa sin límite."
              >
                <Input
                  placeholder="p. ej. 10M"
                  value={form.defaults.bwlimit ?? ''}
                  onChange={(event) =>
                    setForm({
                      ...form,
                      defaults: { ...form.defaults, bwlimit: event.target.value || null },
                    })
                  }
                />
              </Field>
              <Field
                label="Nivel de log"
                help="Define cuánto detalle se guarda en los logs. info es adecuado para el uso normal."
              >
                <Select
                  value={form.defaults.logLevel}
                  onValueChange={(logLevel) =>
                    setForm({
                      ...form,
                      defaults: {
                        ...form.defaults,
                        logLevel: logLevel as typeof form.defaults.logLevel,
                      },
                    })
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {(['debug', 'info', 'warn', 'error'] as const).map((level) => (
                      <SelectItem key={level} value={level}>
                        {level}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
            </div>
          </Section>

          <Section
            title="Historial y zona horaria"
            description="Controla la conservación de actividad y la referencia horaria de los jobs."
            icon={Clock3}
          >
            <div className="grid gap-4 md:grid-cols-3">
              <Field
                label="Retención del historial (días)"
                help="Días que se conservan ejecuciones y eventos antes de limpiar el historial."
              >
                <Input
                  type="number"
                  min={1}
                  value={form.historyRetentionDays}
                  onChange={(event) =>
                    setForm({
                      ...form,
                      historyRetentionDays: Number(event.target.value) || 1,
                    })
                  }
                />
              </Field>
              <Field
                label="Zona horaria del scheduler"
                help="Zona usada para interpretar y ejecutar los horarios programados de los jobs."
              >
                <Select
                  value={form.timezone}
                  onValueChange={(timezone) => setForm({ ...form, timezone })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {(timezones.data ?? [form.timezone]).map((zone) => (
                      <SelectItem key={zone} value={zone}>
                        {zone}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field
                label="Color de acento"
                help="Color principal de botones y estados activos, expresado en formato hexadecimal."
              >
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    value={form.accentColor}
                    onChange={(event) =>
                      setForm({ ...form, accentColor: event.target.value })
                    }
                    className="h-8 w-10 rounded border border-input bg-transparent"
                  />
                  <Input
                    className="mono"
                    value={form.accentColor}
                    onChange={(event) =>
                      setForm({ ...form, accentColor: event.target.value })
                    }
                  />
                </div>
              </Field>
            </div>
          </Section>

          <Section
            title="Webhook global"
            description="Envía una notificación HTTP cuando finaliza una tarea."
            icon={Webhook}
          >
            <div className="grid gap-4 lg:grid-cols-12">
              <Field
                className="lg:col-span-5"
                label="URL"
                help="Endpoint HTTP que recibe una notificación al finalizar una tarea."
              >
                <Input
                  placeholder="https://…"
                  value={form.webhookUrl ?? ''}
                  onChange={(event) =>
                    setForm({ ...form, webhookUrl: event.target.value || null })
                  }
                />
              </Field>
              <Field
                className="lg:col-span-7"
                label="Plantilla del payload JSON (opcional)"
                help="JSON enviado al webhook. Puedes insertar los placeholders mostrados debajo."
              >
                <Textarea
                  className="mono"
                  rows={2}
                  placeholder='{"text":"{{job}} terminó: {{status}}"}'
                  value={form.webhookTemplate ?? ''}
                  onChange={(event) =>
                    setForm({ ...form, webhookTemplate: event.target.value || null })
                  }
                />
              </Field>
            </div>
            <p className="text-[11px] text-muted-foreground">
              Placeholders:{' '}
              <code className="mono">
                {
                  '{{job}} {{status}} {{mode}} {{files}} {{bytesHuman}} {{duration}} {{error}}'
                }
              </code>
            </p>
          </Section>

          <Section
            title="Importar / exportar rclone.conf"
            description="Descarga la configuración actual o incorpora remotos desde otro archivo."
            icon={FileCog}
          >
            <ConfigTransfer />
          </Section>

          {user?.role === 'admin' && (
            <Section
              title="Usuarios"
              description="Administra las cuentas que pueden acceder a CloudBridge."
              icon={Users}
            >
              <UsersManager />
            </Section>
          )}
        </div>
      </div>
    </div>
  );
}

function Section({
  title,
  description,
  icon: Icon,
  children,
}: {
  title: string;
  description: string;
  icon: LucideIcon;
  children: React.ReactNode;
}) {
  return (
    <section
      data-settings-card="true"
      className="overflow-hidden rounded-lg border border-border/80 bg-card/40 shadow-sm"
    >
      <div className="flex items-start gap-3 border-b border-border/70 bg-muted/20 px-4 py-3">
        <div className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-md border border-primary/20 bg-primary/10 text-primary">
          <Icon className="size-4" />
        </div>
        <div className="min-w-0">
          <h2 className="text-[13px] font-semibold leading-5">{title}</h2>
          <p className="text-[11px] leading-4 text-muted-foreground">{description}</p>
        </div>
      </div>
      <div className="space-y-4 p-4">{children}</div>
    </section>
  );
}

function Field({
  label,
  help,
  className,
  children,
}: {
  label: string;
  help: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={cn('grid min-w-0 content-start gap-1.5', className)}>
      <div className="flex min-h-5 items-center gap-1.5">
        <Label className="leading-4">{label}</Label>
        <FieldHelp label={label}>{help}</FieldHelp>
      </div>
      {children}
    </div>
  );
}

function ConfigTransfer() {
  const queryClient = useQueryClient();
  const exportConfig = useMutation({
    mutationFn: api.remotes.exportConfig,
    onSuccess: ({ config }) => {
      const blob = new Blob([config], { type: 'text/plain' });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = 'rclone.conf';
      anchor.click();
      URL.revokeObjectURL(url);
    },
  });
  const importConfig = useMutation({
    mutationFn: (config: string) => api.remotes.importConfig(config),
    onSuccess: ({ imported }) => {
      void queryClient.invalidateQueries({ queryKey: ['remotes'] });
      toast.success(`${imported} remotos importados`);
    },
    onError: (error) =>
      toast.error('No se pudo importar', {
        description: error instanceof ApiError ? error.message : String(error),
      }),
  });

  return (
    <div className="flex gap-2">
      <Button variant="outline" size="sm" onClick={() => exportConfig.mutate()}>
        <Download />
        Exportar
      </Button>
      <Button
        variant="outline"
        size="sm"
        onClick={() => {
          const input = document.createElement('input');
          input.type = 'file';
          input.accept = '.conf,.txt,text/plain';
          input.onchange = async () => {
            const file = input.files?.[0];
            if (file) importConfig.mutate(await file.text());
          };
          input.click();
        }}
      >
        <Upload />
        Importar
      </Button>
    </div>
  );
}

function UsersManager() {
  const queryClient = useQueryClient();
  const { user: me } = useAuth();
  const users = useQuery({ queryKey: ['users'], queryFn: api.users.list });
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [deleting, setDeleting] = useState<SessionUser | null>(null);

  const create = useMutation({
    mutationFn: () => api.users.create({ username, password, role: 'user' }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['users'] });
      setUsername('');
      setPassword('');
      toast.success('Usuario creado');
    },
    onError: (error) =>
      toast.error('No se pudo crear el usuario', {
        description: error instanceof ApiError ? error.message : String(error),
      }),
  });

  const remove = useMutation({
    mutationFn: (id: string) => api.users.remove(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['users'] });
      setDeleting(null);
    },
    onError: (error) =>
      toast.error('No se pudo eliminar', {
        description: error instanceof ApiError ? error.message : String(error),
      }),
  });

  return (
    <div className="space-y-3">
      <div className="divide-y divide-border rounded-md border border-border">
        {users.data?.map((row) => (
          <div key={row.id} className="flex items-center gap-2 px-2.5 py-1.5 text-[12px]">
            <span className="font-medium">{row.username}</span>
            <Badge variant="outline">{row.role}</Badge>
            {row.id === me?.id && <Badge variant="accent">tú</Badge>}
            <Button
              variant="ghost"
              size="icon-sm"
              className="ml-auto text-destructive"
              disabled={row.id === me?.id}
              onClick={() => setDeleting(row)}
            >
              <Trash2 />
            </Button>
          </div>
        ))}
      </div>

      <div className="grid items-end gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]">
        <Field
          label="Nuevo usuario"
          help="Nombre con el que la persona iniciará sesión en CloudBridge."
        >
          <Input value={username} onChange={(event) => setUsername(event.target.value)} />
        </Field>
        <Field
          label="Contraseña"
          help="Contraseña inicial del usuario; debe contener al menos 8 caracteres."
        >
          <Input
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
        </Field>
        <Button
          size="sm"
          disabled={!username || password.length < 8 || create.isPending}
          onClick={() => create.mutate()}
        >
          <Plus />
          Crear
        </Button>
      </div>

      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(open) => !open && setDeleting(null)}
        title={`Eliminar a "${deleting?.username}"`}
        confirmLabel="Eliminar"
        destructive
        pending={remove.isPending}
        onConfirm={() => deleting && remove.mutate(deleting.id)}
      />
    </div>
  );
}
