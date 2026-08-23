import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Check,
  ChevronLeft,
  ChevronRight,
  LoaderCircle,
  Plus,
  TriangleAlert,
  X,
} from 'lucide-react';
import { toast } from 'sonner';
import type { Job, RemotePath, SchedulePreset, TransferOptions } from '@cloudbridge/shared';
import { DEFAULT_TRANSFER_OPTIONS } from '@cloudbridge/shared';
import { ApiError, api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input, Textarea } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { cn, formatDateTime } from '@/lib/utils';
import { FolderBrowser } from './FolderBrowser';

const STEPS = ['Origen', 'Destinos', 'Opciones', 'Programación'] as const;

const PRESETS: Record<Exclude<SchedulePreset, 'custom'>, string | null> = {
  manual: null,
  hourly: '0 * * * *',
  daily: '0 3 * * *',
  weekly: '0 3 * * 1',
  monthly: '0 3 1 * *',
};

interface WizardState {
  name: string;
  mode: Job['mode'];
  source: RemotePath | null;
  destinations: RemotePath[];
  options: TransferOptions;
  preset: SchedulePreset;
  cron: string;
  timezone: string;
  enabled: boolean;
  webhookUrl: string;
  notifyOnSuccess: boolean;
  notifyOnFailure: boolean;
  confirm: string;
}

const emptyState = (timezone: string): WizardState => ({
  name: '',
  mode: 'copy',
  source: null,
  destinations: [],
  options: { ...DEFAULT_TRANSFER_OPTIONS, filters: { include: [], exclude: [] } },
  preset: 'manual',
  cron: '',
  timezone,
  enabled: true,
  webhookUrl: '',
  notifyOnSuccess: false,
  notifyOnFailure: true,
  confirm: '',
});

export function JobWizard({
  open,
  onOpenChange,
  editing,
  defaultTimezone,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editing?: Job | null;
  defaultTimezone: string;
}) {
  const queryClient = useQueryClient();
  const [step, setStep] = useState(0);
  const [state, setState] = useState<WizardState>(() => emptyState(defaultTimezone));

  useEffect(() => {
    if (!open) return;
    setStep(0);
    if (editing) {
      setState({
        name: editing.name,
        mode: editing.mode,
        source: editing.source,
        destinations: editing.destinations,
        options: editing.options,
        preset: editing.cron
          ? ((Object.entries(PRESETS).find(([, value]) => value === editing.cron)?.[0] as
              | SchedulePreset
              | undefined) ?? 'custom')
          : 'manual',
        cron: editing.cron ?? '',
        timezone: editing.timezone,
        enabled: editing.enabled,
        webhookUrl: editing.webhookUrl ?? '',
        notifyOnSuccess: editing.notifyOnSuccess,
        notifyOnFailure: editing.notifyOnFailure,
        confirm: '',
      });
    } else {
      setState(emptyState(defaultTimezone));
    }
  }, [open, editing, defaultTimezone]);

  const patch = (changes: Partial<WizardState>) => setState((previous) => ({ ...previous, ...changes }));
  const patchOptions = (changes: Partial<TransferOptions>) =>
    setState((previous) => ({ ...previous, options: { ...previous.options, ...changes } }));

  const destructive = state.mode === 'sync' && state.options.deleteOnDst && !state.options.dryRun;

  const cronPreview = useQuery({
    queryKey: ['cron-preview', state.cron, state.timezone],
    queryFn: () => api.jobs.cronPreview(state.cron, state.timezone),
    enabled: open && state.preset !== 'manual' && state.cron.trim().length > 0,
  });

  const save = useMutation({
    mutationFn: () => {
      const payload = {
        name: state.name.trim(),
        mode: state.mode,
        source: state.source!,
        destinations: state.destinations,
        options: state.options,
        cron: state.preset === 'manual' ? null : state.cron.trim() || null,
        timezone: state.timezone,
        enabled: state.enabled,
        webhookUrl: state.webhookUrl.trim() || null,
        notifyOnSuccess: state.notifyOnSuccess,
        notifyOnFailure: state.notifyOnFailure,
        ...(destructive ? { confirm: state.confirm.trim() } : {}),
      };
      return editing ? api.jobs.update(editing.id, payload) : api.jobs.create(payload);
    },
    onSuccess: (job) => {
      void queryClient.invalidateQueries({ queryKey: ['jobs'] });
      toast.success(editing ? `Job "${job.name}" actualizado` : `Job "${job.name}" creado`, {
        description: job.scheduleLabel,
      });
      onOpenChange(false);
    },
    onError: (error) =>
      toast.error('No se pudo guardar el job', {
        description: error instanceof ApiError ? error.message : String(error),
      }),
  });

  const stepValid = useMemo(() => {
    switch (step) {
      case 0:
        return Boolean(state.source?.remote) && state.name.trim().length > 0;
      case 1:
        return state.destinations.length > 0 && state.destinations.every((d) => d.remote);
      case 2:
        return true;
      case 3:
        return (
          state.preset === 'manual' ||
          (state.cron.trim().length > 0 && cronPreview.data?.valid !== false)
        );
      default:
        return false;
    }
  }, [step, state, cronPreview.data]);

  const canSave = stepValid && step === STEPS.length - 1 && (!destructive || state.confirm.trim() === state.name.trim());

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{editing ? `Editar "${editing.name}"` : 'Nuevo job'}</DialogTitle>
          <DialogDescription>
            Define el origen, uno o varios destinos, las opciones de transferencia y cuándo se
            ejecuta.
          </DialogDescription>
        </DialogHeader>

        <ol className="mb-1 flex items-center gap-1">
          {STEPS.map((label, index) => (
            <li key={label} className="flex flex-1 items-center gap-1.5">
              <button
                type="button"
                disabled={index > step && !stepValid}
                onClick={() => index <= step && setStep(index)}
                className={cn(
                  'flex size-5 shrink-0 items-center justify-center rounded-full text-[11px] font-medium transition-colors',
                  index < step
                    ? 'bg-primary text-primary-foreground'
                    : index === step
                      ? 'bg-primary/20 text-primary ring-1 ring-primary'
                      : 'bg-muted text-muted-foreground',
                )}
              >
                {index < step ? <Check className="size-3" /> : index + 1}
              </button>
              <span
                className={cn(
                  'truncate text-[12px]',
                  index === step ? 'font-medium' : 'text-muted-foreground',
                )}
              >
                {label}
              </span>
              {index < STEPS.length - 1 && <span className="h-px flex-1 bg-border" />}
            </li>
          ))}
        </ol>

        <div className="min-h-[22rem]">
          {step === 0 && (
            <div className="space-y-3">
              <div className="space-y-1">
                <Label htmlFor="job-name">Nombre del job</Label>
                <Input
                  id="job-name"
                  value={state.name}
                  autoFocus
                  placeholder="p. ej. Fotos a Backblaze"
                  onChange={(event) => patch({ name: event.target.value })}
                />
              </div>
              <div className="space-y-1">
                <Label>Origen</Label>
                <FolderBrowser value={state.source} onChange={(source) => patch({ source })} />
              </div>
            </div>
          )}

          {step === 1 && (
            <div className="space-y-3">
              <p className="text-[12px] text-muted-foreground">
                Un job puede escribir en varios destinos en la misma ejecución (1:N).
              </p>

              {state.destinations.map((destination, index) => (
                <div key={index} className="rounded-md border border-border p-2.5">
                  <div className="mb-2 flex items-center gap-2">
                    <span className="text-[12px] font-medium">Destino {index + 1}</span>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      className="ml-auto text-destructive"
                      onClick={() =>
                        patch({
                          destinations: state.destinations.filter((_, i) => i !== index),
                        })
                      }
                    >
                      <X />
                    </Button>
                  </div>
                  <FolderBrowser
                    value={destination}
                    onChange={(value) =>
                      patch({
                        destinations: state.destinations.map((entry, i) =>
                          i === index ? value : entry,
                        ),
                      })
                    }
                  />
                </div>
              ))}

              <Button
                variant="outline"
                size="sm"
                onClick={() =>
                  patch({ destinations: [...state.destinations, { remote: '', path: '' }] })
                }
              >
                <Plus />
                Añadir destino
              </Button>
            </div>
          )}

          {step === 2 && (
            <OptionsStep
              mode={state.mode}
              options={state.options}
              onModeChange={(mode) => patch({ mode })}
              onOptionsChange={patchOptions}
            />
          )}

          {step === 3 && (
            <ScheduleStep
              state={state}
              patch={patch}
              preview={cronPreview.data ?? null}
              previewing={cronPreview.isFetching}
              destructive={destructive}
            />
          )}
        </div>

        <DialogFooter className="justify-between">
          <Button
            variant="ghost"
            disabled={step === 0}
            onClick={() => setStep((previous) => previous - 1)}
          >
            <ChevronLeft />
            Atrás
          </Button>

          <div className="flex items-center gap-2">
            <Button variant="ghost" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            {step < STEPS.length - 1 ? (
              <Button disabled={!stepValid} onClick={() => setStep((previous) => previous + 1)}>
                Siguiente
                <ChevronRight />
              </Button>
            ) : (
              <Button
                variant={destructive ? 'destructive' : 'default'}
                disabled={!canSave || save.isPending}
                onClick={() => save.mutate()}
              >
                {save.isPending && <LoaderCircle className="animate-spin" />}
                {editing ? 'Guardar cambios' : 'Crear job'}
              </Button>
            )}
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function OptionsStep({
  mode,
  options,
  onModeChange,
  onOptionsChange,
}: {
  mode: Job['mode'];
  options: TransferOptions;
  onModeChange: (mode: Job['mode']) => void;
  onOptionsChange: (changes: Partial<TransferOptions>) => void;
}) {
  return (
    <div className="space-y-3">
      <div className="space-y-1">
        <Label>Modo</Label>
        <div className="flex gap-1">
          {(['copy', 'sync', 'move', 'bisync'] as const).map((option) => (
            <Button
              key={option}
              variant={mode === option ? 'default' : 'outline'}
              size="sm"
              className="flex-1 capitalize"
              onClick={() => onModeChange(option)}
            >
              {option}
            </Button>
          ))}
        </div>
        <p className="text-[11px] text-muted-foreground">
          {mode === 'copy' && 'Copia lo que falte o haya cambiado. No borra nada.'}
          {mode === 'sync' && 'Deja el destino igual que el origen. Con el borrado activado elimina lo que sobra.'}
          {mode === 'move' && 'Copia y luego borra en el origen.'}
          {mode === 'bisync' && 'Sincronización bidireccional; la primera ejecución necesita --resync en rclone.'}
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <FilterList
          label="Incluir (--include)"
          values={options.filters.include}
          onChange={(include) => onOptionsChange({ filters: { ...options.filters, include } })}
        />
        <FilterList
          label="Excluir (--exclude)"
          values={options.filters.exclude}
          onChange={(exclude) => onOptionsChange({ filters: { ...options.filters, exclude } })}
        />
      </div>

      <div className="grid grid-cols-2 gap-x-4 gap-y-2">
        <Toggle
          label="--dry-run"
          help="Simula la operación sin escribir nada."
          checked={options.dryRun}
          onChange={(dryRun) => onOptionsChange({ dryRun })}
        />
        <Toggle
          label="--check-first"
          help="Compara todo antes de empezar a transferir."
          checked={options.checkFirst}
          onChange={(checkFirst) => onOptionsChange({ checkFirst })}
        />
        <Toggle
          label="--track-renames"
          help="Detecta archivos renombrados en vez de retransferirlos."
          checked={options.trackRenames}
          onChange={(trackRenames) => onOptionsChange({ trackRenames })}
        />
        <Toggle
          label="Crear directorios vacíos"
          help="Replica también las carpetas sin contenido."
          checked={options.createEmptySrcDirs}
          onChange={(createEmptySrcDirs) => onOptionsChange({ createEmptySrcDirs })}
        />
      </div>

      <div className="grid grid-cols-3 gap-3">
        <NumberField
          label="--transfers"
          value={options.transfers}
          placeholder="global"
          onChange={(transfers) => onOptionsChange({ transfers })}
        />
        <NumberField
          label="--checkers"
          value={options.checkers}
          placeholder="global"
          onChange={(checkers) => onOptionsChange({ checkers })}
        />
        <div className="space-y-1">
          <Label htmlFor="bwlimit">--bwlimit</Label>
          <Input
            id="bwlimit"
            className="mono h-7 text-[12px]"
            placeholder="p. ej. 10M"
            value={options.bwlimit ?? ''}
            onChange={(event) => onOptionsChange({ bwlimit: event.target.value || null })}
          />
        </div>
      </div>
      <p className="text-[11px] text-muted-foreground">
        rclone aplica el límite de ancho de banda a todo el proceso. Mientras varias ejecuciones
        coincidan se usa el más restrictivo, y al terminar se restaura el valor global.
      </p>

      {mode === 'sync' && (
        <div className="space-y-2 rounded-md border border-destructive/40 bg-destructive/10 p-2.5">
          <label className="flex items-start gap-2 text-[12px] text-destructive">
            <Checkbox
              className="mt-0.5"
              checked={options.deleteOnDst}
              onCheckedChange={(checked) => onOptionsChange({ deleteOnDst: checked === true })}
            />
            <span>
              <span className="flex items-center gap-1.5 font-medium">
                <TriangleAlert className="size-3.5" />
                Borrar en el destino lo que no esté en el origen
              </span>
              <span className="mt-0.5 block leading-snug">
                Destruye datos de forma irreversible. Sin esta casilla, el modo sync se comporta
                como copy, que es exactamente lo que hace rclone: no existe un sync que no borre.
              </span>
            </span>
          </label>
        </div>
      )}
    </div>
  );
}

function ScheduleStep({
  state,
  patch,
  preview,
  previewing,
  destructive,
}: {
  state: WizardState;
  patch: (changes: Partial<WizardState>) => void;
  preview: { valid: boolean; description: string; next: string[]; error?: string } | null;
  previewing: boolean;
  destructive: boolean;
}) {
  const timezones = useQuery({
    queryKey: ['timezones'],
    queryFn: api.settings.timezones,
    staleTime: Number.POSITIVE_INFINITY,
  });

  return (
    <div className="space-y-3">
      <div className="space-y-1">
        <Label>Frecuencia</Label>
        <div className="flex flex-wrap gap-1">
          {(['manual', 'hourly', 'daily', 'weekly', 'monthly', 'custom'] as SchedulePreset[]).map(
            (preset) => (
              <Button
                key={preset}
                variant={state.preset === preset ? 'default' : 'outline'}
                size="sm"
                onClick={() =>
                  patch({
                    preset,
                    cron:
                      preset === 'custom'
                        ? state.cron || '0 3 * * *'
                        : (PRESETS[preset as Exclude<SchedulePreset, 'custom'>] ?? ''),
                  })
                }
              >
                {
                  {
                    manual: 'Manual',
                    hourly: 'Cada hora',
                    daily: 'Diario',
                    weekly: 'Semanal',
                    monthly: 'Mensual',
                    custom: 'Cron personalizado',
                  }[preset]
                }
              </Button>
            ),
          )}
        </div>
      </div>

      {state.preset !== 'manual' && (
        <>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label htmlFor="cron">Expresión cron (5 campos)</Label>
              <Input
                id="cron"
                className="mono h-7 text-[12px]"
                value={state.cron}
                disabled={state.preset !== 'custom'}
                onChange={(event) => patch({ cron: event.target.value })}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="timezone">Zona horaria</Label>
              <Select value={state.timezone} onValueChange={(timezone) => patch({ timezone })}>
                <SelectTrigger id="timezone" className="h-7">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(timezones.data ?? [state.timezone]).map((zone) => (
                    <SelectItem key={zone} value={zone}>
                      {zone}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="rounded-md border border-border bg-muted/40 p-2.5 text-[12px]">
            {previewing && <span className="text-muted-foreground">Calculando…</span>}
            {!previewing && preview?.valid && (
              <>
                <p className="font-medium">{preview.description}</p>
                <p className="mt-1 text-muted-foreground">Próximas 5 ejecuciones:</p>
                <ul className="mono mt-0.5 space-y-0.5 text-[11px] text-muted-foreground">
                  {preview.next.map((iso) => (
                    <li key={iso}>{formatDateTime(iso)}</li>
                  ))}
                </ul>
              </>
            )}
            {!previewing && preview && !preview.valid && (
              <p className="text-destructive">{preview.error ?? 'Expresión cron no válida'}</p>
            )}
            {!previewing && !preview && (
              <span className="text-muted-foreground">Escribe una expresión cron.</span>
            )}
          </div>
        </>
      )}

      <div className="space-y-2 border-t border-border pt-3">
        <Toggle
          label="Job activo"
          help="Un job desactivado no se ejecuta por programación, pero puedes lanzarlo a mano."
          checked={state.enabled}
          onChange={(enabled) => patch({ enabled })}
        />
        <div className="space-y-1">
          <Label htmlFor="webhook">Webhook al terminar (opcional)</Label>
          <Input
            id="webhook"
            className="mono h-7 text-[12px]"
            placeholder="https://…"
            value={state.webhookUrl}
            onChange={(event) => patch({ webhookUrl: event.target.value })}
          />
        </div>
        <div className="flex gap-4">
          <Toggle
            label="Notificar al terminar bien"
            checked={state.notifyOnSuccess}
            onChange={(notifyOnSuccess) => patch({ notifyOnSuccess })}
          />
          <Toggle
            label="Notificar al fallar"
            checked={state.notifyOnFailure}
            onChange={(notifyOnFailure) => patch({ notifyOnFailure })}
          />
        </div>
      </div>

      {destructive && (
        <div className="space-y-1 rounded-md border border-destructive/40 bg-destructive/10 p-2.5">
          <Label htmlFor="job-confirm" className="text-destructive">
            Este job borra en el destino. Escribe{' '}
            <span className="mono text-foreground">{state.name}</span> para confirmar
          </Label>
          <Input
            id="job-confirm"
            value={state.confirm}
            autoComplete="off"
            onChange={(event) => patch({ confirm: event.target.value })}
          />
        </div>
      )}
    </div>
  );
}

function Toggle({
  label,
  help,
  checked,
  onChange,
}: {
  label: string;
  help?: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <div className="flex items-start justify-between gap-3">
      <div className="space-y-0.5">
        <p className="mono text-[12px]">{label}</p>
        {help && <p className="text-[11px] leading-snug text-muted-foreground">{help}</p>}
      </div>
      <Switch checked={checked} onCheckedChange={onChange} />
    </div>
  );
}

function NumberField({
  label,
  value,
  placeholder,
  onChange,
}: {
  label: string;
  value: number | null;
  placeholder?: string;
  onChange: (value: number | null) => void;
}) {
  return (
    <div className="space-y-1">
      <Label htmlFor={`num-${label}`}>{label}</Label>
      <Input
        id={`num-${label}`}
        type="number"
        min={1}
        className="mono h-7 text-[12px]"
        placeholder={placeholder}
        value={value ?? ''}
        onChange={(event) =>
          onChange(event.target.value === '' ? null : Number.parseInt(event.target.value, 10))
        }
      />
    </div>
  );
}

function FilterList({
  label,
  values,
  onChange,
}: {
  label: string;
  values: string[];
  onChange: (values: string[]) => void;
}) {
  return (
    <div className="space-y-1">
      <Label>{label}</Label>
      <Textarea
        rows={3}
        className="mono text-[12px]"
        placeholder={'*.jpg\n/fotos/**'}
        value={values.join('\n')}
        onChange={(event) =>
          onChange(
            event.target.value
              .split('\n')
              .map((line) => line.trim())
              .filter(Boolean),
          )
        }
      />
      <p className="text-[11px] text-muted-foreground">Un patrón por línea.</p>
    </div>
  );
}
