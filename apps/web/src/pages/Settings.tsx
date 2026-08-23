import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Download, LoaderCircle, Plug, Plus, Trash2, Upload } from 'lucide-react';
import { toast } from 'sonner';
import type { SessionUser } from '@cloudbridge/shared';
import { ApiError, api } from '@/lib/api';
import { PageHeader } from '@/components/layout/PageHeader';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input, Textarea } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { useAuth } from '@/hooks/useAuth';

export default function SettingsPage() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const settings = useQuery({ queryKey: ['settings'], queryFn: api.settings.get });

  const [form, setForm] = useState<ReturnType<typeof api.settings.get> extends Promise<infer T> ? T | null : never>(
    null,
  );
  useEffect(() => {
    if (settings.data) setForm(settings.data);
  }, [settings.data]);

  const [rclonePassword, setRclonePassword] = useState('');
  const [testResult, setTestResult] = useState<{ online: boolean; error: string | null } | null>(null);

  const testConnection = useMutation({
    mutationFn: () =>
      api.settings.testRclone(
        form
          ? { url: form.rclone.url, user: form.rclone.user, ...(rclonePassword ? { password: rclonePassword } : {}) }
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

  const timezones = useQuery({ queryKey: ['timezones'], queryFn: api.settings.timezones, staleTime: Infinity });

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

      <div className="min-h-0 flex-1 space-y-6 overflow-y-auto p-4">
        <Section title="Conexión con rclone">
          <div className="grid grid-cols-2 gap-3">
            <Field label="URL de la RC API">
              <Input
                value={form.rclone.url}
                onChange={(event) => setForm({ ...form, rclone: { ...form.rclone, url: event.target.value } })}
              />
            </Field>
            <Field label="Usuario">
              <Input
                value={form.rclone.user}
                onChange={(event) => setForm({ ...form, rclone: { ...form.rclone, user: event.target.value } })}
              />
            </Field>
            <Field label={`Contraseña ${form.rclone.passwordSet ? '(configurada)' : ''}`}>
              <Input
                type="password"
                placeholder={form.rclone.passwordSet ? '••••••••' : ''}
                value={rclonePassword}
                onChange={(event) => setRclonePassword(event.target.value)}
              />
            </Field>
            <div className="flex items-end gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => testConnection.mutate()}
                disabled={testConnection.isPending}
              >
                {testConnection.isPending ? <LoaderCircle className="animate-spin" /> : <Plug />}
                Probar conexión
              </Button>
              {testResult && (
                <Badge variant={testResult.online ? 'success' : 'danger'}>
                  {testResult.online ? 'conectado' : (testResult.error ?? 'error')}
                </Badge>
              )}
            </div>
          </div>
        </Section>

        <Section title="Valores por defecto">
          <div className="grid grid-cols-4 gap-3">
            <Field label="--transfers">
              <Input
                type="number"
                min={1}
                value={form.defaults.transfers}
                onChange={(event) =>
                  setForm({
                    ...form,
                    defaults: { ...form.defaults, transfers: Number(event.target.value) || 1 },
                  })
                }
              />
            </Field>
            <Field label="--checkers">
              <Input
                type="number"
                min={1}
                value={form.defaults.checkers}
                onChange={(event) =>
                  setForm({
                    ...form,
                    defaults: { ...form.defaults, checkers: Number(event.target.value) || 1 },
                  })
                }
              />
            </Field>
            <Field label="--bwlimit global">
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
            <Field label="Nivel de log">
              <Select
                value={form.defaults.logLevel}
                onValueChange={(logLevel) =>
                  setForm({ ...form, defaults: { ...form.defaults, logLevel: logLevel as typeof form.defaults.logLevel } })
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

        <Section title="Historial y zona horaria">
          <div className="grid grid-cols-3 gap-3">
            <Field label="Retención del historial (días)">
              <Input
                type="number"
                min={1}
                value={form.historyRetentionDays}
                onChange={(event) =>
                  setForm({ ...form, historyRetentionDays: Number(event.target.value) || 1 })
                }
              />
            </Field>
            <Field label="Zona horaria del scheduler">
              <Select value={form.timezone} onValueChange={(timezone) => setForm({ ...form, timezone })}>
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
            <Field label="Color de acento">
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  value={form.accentColor}
                  onChange={(event) => setForm({ ...form, accentColor: event.target.value })}
                  className="h-8 w-10 rounded border border-input bg-transparent"
                />
                <Input
                  className="mono"
                  value={form.accentColor}
                  onChange={(event) => setForm({ ...form, accentColor: event.target.value })}
                />
              </div>
            </Field>
          </div>
        </Section>

        <Section title="Webhook global">
          <div className="grid grid-cols-2 gap-3">
            <Field label="URL">
              <Input
                placeholder="https://…"
                value={form.webhookUrl ?? ''}
                onChange={(event) => setForm({ ...form, webhookUrl: event.target.value || null })}
              />
            </Field>
            <Field label="Plantilla del payload JSON (opcional)">
              <Textarea
                className="mono"
                rows={2}
                placeholder='{"text":"{{job}} terminó: {{status}}"}'
                value={form.webhookTemplate ?? ''}
                onChange={(event) => setForm({ ...form, webhookTemplate: event.target.value || null })}
              />
            </Field>
          </div>
          <p className="text-[11px] text-muted-foreground">
            Placeholders: <code className="mono">{'{{job}} {{status}} {{mode}} {{files}} {{bytesHuman}} {{duration}} {{error}}'}</code>
          </p>
        </Section>

        <Section title="Importar / exportar rclone.conf">
          <ConfigTransfer />
        </Section>

        {user?.role === 'admin' && (
          <Section title="Usuarios">
            <UsersManager />
          </Section>
        )}
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3">
      <h2 className="text-[12px] font-semibold">{title}</h2>
      {children}
      <Separator />
    </section>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <Label>{label}</Label>
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

      <div className="flex items-end gap-2">
        <Field label="Nuevo usuario">
          <Input value={username} onChange={(event) => setUsername(event.target.value)} />
        </Field>
        <Field label="Contraseña">
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
