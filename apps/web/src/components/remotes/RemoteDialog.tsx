import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ChevronDown,
  ChevronRight,
  Cloud,
  KeyRound,
  ListChecks,
  LoaderCircle,
  Settings2,
  Terminal,
} from 'lucide-react';
import { toast } from 'sonner';
import type {
  ProviderInfo,
  ProviderOption,
  RemoteSetupResult,
} from '@cloudbridge/shared';
import { ApiError, api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { FieldHelp } from '@/components/ui/field-help';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Command,
  CommandEmpty,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import { ProviderIcon } from '@/components/provider-icon';
import { ProviderField } from './ProviderField';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { localizeSetupOption } from '@/i18n/provider-options';

type SetupQuestion = Extract<RemoteSetupResult, { status: 'question' }>;

/** Options every provider gets, ordered so the important ones come first. */
function visibleOptions(
  provider: ProviderInfo,
  values: Record<string, string>,
): ProviderOption[] {
  const variant = values.provider;
  return provider.options
    .filter((option) => option.name !== 'token')
    .filter((option) => {
      if (!option.provider) return true;
      if (!variant) return true;
      // rclone uses "!Other,Foo" to mean "every provider except these".
      if (option.provider.startsWith('!')) {
        return !option.provider.slice(1).split(',').includes(variant);
      }
      return option.provider.split(',').includes(variant);
    })
    .sort(
      (a, b) =>
        Number(a.advanced) - Number(b.advanced) ||
        Number(b.required) - Number(a.required),
    );
}

export function RemoteDialog({
  open,
  onOpenChange,
  editing,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Name of the remote being edited; undefined creates a new one. */
  editing?: string;
}) {
  const queryClient = useQueryClient();
  const [type, setType] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [values, setValues] = useState<Record<string, string>>({});
  const [token, setToken] = useState('');
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [setupQuestion, setSetupQuestion] = useState<SetupQuestion | null>(null);
  const [setupAnswer, setSetupAnswer] = useState('');

  const providersQuery = useQuery({
    queryKey: ['providers'],
    queryFn: api.remotes.providers,
    enabled: open,
    staleTime: 600_000,
  });

  const detailQuery = useQuery({
    queryKey: ['remote', editing],
    queryFn: () => api.remotes.get(editing!),
    enabled: open && Boolean(editing),
  });

  useEffect(() => {
    if (!open) return;
    setToken('');
    setShowAdvanced(false);
    setSetupQuestion(null);
    setSetupAnswer('');
    if (editing && detailQuery.data) {
      setType(detailQuery.data.type);
      setName(detailQuery.data.name);
      const { type: _ignored, ...rest } = detailQuery.data.parameters;
      setValues(rest);
    } else if (!editing) {
      setType(null);
      setName('');
      setValues({});
    }
  }, [open, editing, detailQuery.data]);

  const provider = useMemo(
    () => providersQuery.data?.find((entry) => entry.name === type) ?? null,
    [providersQuery.data, type],
  );

  const options = provider ? visibleOptions(provider, values) : [];
  const basic = options.filter((option) => !option.advanced);
  const advanced = options.filter((option) => option.advanced);

  const save = useMutation({
    mutationFn: async () => {
      if (setupQuestion) {
        return api.remotes.continueSetup(setupQuestion.remoteName, {
          setupId: setupQuestion.setupId,
          state: setupQuestion.state,
          answer: setupAnswer,
        });
      }
      const parameters = Object.fromEntries(
        Object.entries(values).filter(([, value]) => value !== ''),
      );
      if (editing) {
        return api.remotes.update(editing, { parameters, ...(token ? { token } : {}) });
      }
      return api.remotes.create({
        name,
        type: type!,
        parameters,
        ...(token ? { token } : {}),
      });
    },
    onSuccess: (result) => {
      if (result.status === 'question') {
        setSetupQuestion(result);
        setSetupAnswer(
          result.option.default === undefined || result.option.default === null
            ? ''
            : String(result.option.default),
        );
        return;
      }
      const remote = result.remote;
      void queryClient.invalidateQueries({ queryKey: ['remotes'] });
      void queryClient.invalidateQueries({ queryKey: ['remote', remote.name] });
      toast.success(
        editing
          ? `Remoto "${remote.name}" actualizado`
          : `Remoto "${remote.name}" creado`,
        {
          description: remote.online
            ? 'Conexión verificada correctamente.'
            : (remote.error ?? 'Guardado, pero la conexión de prueba falló.'),
        },
      );
      onOpenChange(false);
    },
    onError: (error) =>
      toast.error('No se pudo guardar el remoto', {
        description: error instanceof ApiError ? error.message : String(error),
      }),
  });

  const canSave = setupQuestion
    ? !setupQuestion.option.required || setupAnswer.length > 0
    : Boolean(type) && (editing ? true : name.trim().length > 0);

  const closeDialog = () => {
    const incompleteSetup = setupQuestion;
    setSetupQuestion(null);
    setSetupAnswer('');
    onOpenChange(false);
    if (!incompleteSetup) return;
    void api.remotes
      .cancelSetup(incompleteSetup.remoteName, incompleteSetup.setupId)
      .then(() => queryClient.invalidateQueries({ queryKey: ['remotes'] }))
      .catch((error) =>
        toast.error('No se pudo cancelar la configuración', {
          description: error instanceof ApiError ? error.message : String(error),
        }),
      );
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (nextOpen) onOpenChange(true);
        else closeDialog();
      }}
    >
      <DialogContent
        data-remote-dialog="true"
        className="w-[calc(100%_-_2rem)] max-w-[720px] overflow-hidden p-0"
      >
        <div className="flex max-h-[90vh] flex-col">
          <DialogHeader className="mb-0 border-b border-border/70 bg-muted/20 px-5 pb-4 pt-5">
            <DialogTitle>{editing ? `Editar "${editing}"` : 'Añadir remoto'}</DialogTitle>
            <DialogDescription>
              {editing
                ? 'Los secretos guardados se muestran enmascarados; escribe uno nuevo solo si quieres reemplazarlo.'
                : 'Elige el proveedor, identifica el remoto y completa únicamente los datos necesarios.'}
            </DialogDescription>
          </DialogHeader>

          <div className="min-h-0 flex-1 overflow-y-auto p-5">
            {setupQuestion ? (
              <SetupQuestionCard
                provider={type ?? 'unknown'}
                question={setupQuestion}
                answer={setupAnswer}
                onAnswerChange={setSetupAnswer}
              />
            ) : !type ? (
              <div className="overflow-hidden rounded-lg border border-border">
                {providersQuery.isPending ? (
                  <div className="space-y-1 p-2">
                    {Array.from({ length: 6 }).map((_, index) => (
                      <Skeleton key={index} className="h-9 w-full" />
                    ))}
                  </div>
                ) : (
                  <Command>
                    <CommandInput placeholder="Buscar proveedor…" />
                    <CommandList className="max-h-[52vh]">
                      <CommandEmpty>Ningún proveedor coincide.</CommandEmpty>
                      {providersQuery.data?.map((entry) => (
                        <CommandItem
                          key={entry.name}
                          value={`${entry.name} ${entry.description}`}
                          onSelect={() => setType(entry.name)}
                          className="min-h-9"
                        >
                          <ProviderIcon type={entry.name} />
                          <span className="mono text-[12px]">{entry.name}</span>
                          <span className="truncate text-[11px] text-muted-foreground">
                            {entry.description}
                          </span>
                        </CommandItem>
                      ))}
                    </CommandList>
                  </Command>
                )}
              </div>
            ) : null}

            {type && !setupQuestion && (
              <div className="space-y-4">
                <div className="flex min-h-11 items-center gap-2 rounded-lg border border-border bg-muted/30 px-3 py-2">
                  <div className="flex size-7 shrink-0 items-center justify-center rounded-md border border-primary/20 bg-primary/10">
                    <ProviderIcon type={type} />
                  </div>
                  <div className="min-w-0">
                    <p className="mono truncate text-[12px] font-medium">{type}</p>
                    <p className="truncate text-[11px] text-muted-foreground">
                      {provider?.description}
                    </p>
                  </div>
                  {!editing && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="ml-auto"
                      onClick={() => setType(null)}
                    >
                      Cambiar
                    </Button>
                  )}
                </div>

                {!editing && (
                  <section className="overflow-hidden rounded-lg border border-border/80 bg-card/40">
                    <SectionHeading
                      icon={Cloud}
                      title="Identidad del remoto"
                      description="Este nombre aparecerá en el Explorer y en los jobs."
                    />
                    <div className="p-4">
                      <div className="grid min-w-0 content-start gap-1.5">
                        <div className="flex min-h-5 items-center gap-1.5">
                          <Label htmlFor="remote-name">Nombre del remoto</Label>
                          <FieldHelp label="Nombre del remoto">
                            Identificador único y fácil de reconocer. Usa letras, números,
                            guiones o guiones bajos; por ejemplo, onedrive-personal.
                          </FieldHelp>
                        </div>
                        <Input
                          id="remote-name"
                          value={name}
                          autoFocus
                          placeholder="p. ej. onedrive-personal"
                          onChange={(event) => setName(event.target.value)}
                        />
                      </div>
                    </div>
                  </section>
                )}

                {provider?.oauth && (
                  <OAuthHelp type={type} token={token} onTokenChange={setToken} />
                )}

                <section className="overflow-hidden rounded-lg border border-border/80 bg-card/40">
                  <SectionHeading
                    icon={Settings2}
                    title="Configuración del proveedor"
                    description="Los valores vacíos conservan los ajustes predeterminados de rclone."
                  />
                  <div className="grid gap-4 p-4 sm:grid-cols-2">
                    {basic.map((option) => (
                      <ProviderField
                        key={option.name}
                        option={option}
                        provider={type}
                        value={values[option.name] ?? ''}
                        onChange={(value) =>
                          setValues((previous) => ({ ...previous, [option.name]: value }))
                        }
                      />
                    ))}

                    {advanced.length > 0 && (
                      <div className="border-t border-border/70 pt-3 sm:col-span-2">
                        <button
                          type="button"
                          className="flex items-center gap-1 text-[11px] font-medium text-muted-foreground hover:text-foreground"
                          onClick={() => setShowAdvanced((previous) => !previous)}
                        >
                          {showAdvanced ? (
                            <ChevronDown className="size-3" />
                          ) : (
                            <ChevronRight className="size-3" />
                          )}
                          Opciones avanzadas ({advanced.length})
                        </button>
                        {showAdvanced && (
                          <div className="mt-3 grid gap-4 border-l border-border pl-3 sm:grid-cols-2">
                            {advanced.map((option) => (
                              <ProviderField
                                key={option.name}
                                option={option}
                                provider={type}
                                value={values[option.name] ?? ''}
                                onChange={(value) =>
                                  setValues((previous) => ({
                                    ...previous,
                                    [option.name]: value,
                                  }))
                                }
                              />
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </section>
              </div>
            )}
          </div>

          <DialogFooter className="mt-0 border-t border-border/70 bg-muted/10 px-5 py-4">
            <Button variant="ghost" onClick={closeDialog}>
              Cancelar
            </Button>
            <Button onClick={() => save.mutate()} disabled={!canSave || save.isPending}>
              {save.isPending && <LoaderCircle className="animate-spin" />}
              {setupQuestion ? 'Continuar' : editing ? 'Guardar cambios' : 'Crear remoto'}
            </Button>
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function SetupQuestionCard({
  provider,
  question,
  answer,
  onAnswerChange,
}: {
  provider: string;
  question: SetupQuestion;
  answer: string;
  onAnswerChange: (value: string) => void;
}) {
  const translation = localizeSetupOption(provider, question.option);
  const id = `setup-${question.option.name}`;
  const examples = question.option.examples ?? [];

  return (
    <section className="overflow-hidden rounded-lg border border-primary/30 bg-primary/5">
      <SectionHeading
        icon={ListChecks}
        title="Completa la configuración"
        description="rclone necesita un dato adicional antes de activar este remoto."
      />
      <div className="space-y-3 p-4">
        <div className="space-y-1.5">
          <Label htmlFor={id}>
            {translation.label}
            {question.option.required && <span className="ml-1 text-destructive">*</span>}
          </Label>
          <p className="text-[11px] leading-4 text-muted-foreground">{translation.help}</p>
          {examples.length > 0 && question.option.exclusive ? (
            <Select value={answer} onValueChange={onAnswerChange}>
              <SelectTrigger id={id}>
                <SelectValue placeholder="Selecciona una opción" />
              </SelectTrigger>
              <SelectContent>
                {examples.map((example) => (
                  <SelectItem key={example.value} value={example.value}>
                    <span>{translation.exampleHelp(example.value, example.help)}</span>
                    <span className="ml-2 mono text-[10px] text-muted-foreground">
                      {example.value}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : (
            <Input
              id={id}
              type={question.option.isPassword ? 'password' : 'text'}
              value={answer}
              placeholder={
                question.option.default === undefined
                  ? undefined
                  : String(question.option.default)
              }
              onChange={(event) => onAnswerChange(event.target.value)}
            />
          )}
        </div>
        {question.error && (
          <p className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-[11px] text-destructive">
            {question.error}
          </p>
        )}
      </div>
    </section>
  );
}

function SectionHeading({
  icon: Icon,
  title,
  description,
}: {
  icon: typeof Cloud;
  title: string;
  description: string;
}) {
  return (
    <div className="flex items-start gap-3 border-b border-border/70 bg-muted/20 px-4 py-3">
      <div className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-md border border-primary/20 bg-primary/10 text-primary">
        <Icon className="size-4" />
      </div>
      <div className="min-w-0">
        <h3 className="text-[12px] font-semibold leading-5">{title}</h3>
        <p className="text-[11px] leading-4 text-muted-foreground">{description}</p>
      </div>
    </div>
  );
}

/**
 * Head-less OAuth: CloudBridge has no browser, so the token is obtained with
 * `rclone authorize` on a machine that does and pasted here.
 */
function OAuthHelp({
  type,
  token,
  onTokenChange,
}: {
  type: string;
  token: string;
  onTokenChange: (value: string) => void;
}) {
  const command = `rclone authorize "${type}"`;
  return (
    <section className="overflow-hidden rounded-lg border border-primary/30 bg-primary/5">
      <div className="flex items-start gap-3 border-b border-primary/20 px-4 py-3">
        <div className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-md border border-primary/25 bg-primary/10 text-primary">
          <KeyRound className="size-4" />
        </div>
        <div>
          <h3 className="text-[12px] font-semibold leading-5">Autorización OAuth</h3>
          <p className="text-[11px] leading-4 text-muted-foreground">
            Autoriza el acceso desde un equipo que tenga navegador.
          </p>
        </div>
      </div>
      <div className="space-y-4 p-4">
        <div className="space-y-2">
          <p className="text-[11px] leading-relaxed text-muted-foreground">
            Ejecuta el comando, completa el acceso y pega el JSON resultante. Si utilizas
            tus propios client_id y client_secret, añádelos también al comando.
          </p>
          <div className="flex min-w-0 items-center gap-2 rounded-md border border-border bg-background/80 p-1.5">
            <Terminal className="ml-1 size-3.5 shrink-0 text-primary" />
            <code className="mono min-w-0 flex-1 truncate text-[11px]">{command}</code>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                void navigator.clipboard.writeText(command);
                toast.success('Comando copiado');
              }}
            >
              Copiar
            </Button>
          </div>
        </div>
        <div className="grid min-w-0 content-start gap-1.5">
          <div className="flex min-h-5 items-center gap-1.5">
            <Label htmlFor="oauth-token">Token OAuth</Label>
            <FieldHelp label="Token OAuth">
              Pega el JSON completo que devuelve rclone authorize. Incluye los tokens de
              acceso y renovación necesarios para conectar el remoto. Si lo completas,
              CloudBridge conservará este token y no volverá a pedir autenticación.
            </FieldHelp>
          </div>
          <textarea
            id="oauth-token"
            rows={3}
            value={token}
            onChange={(event) => onTokenChange(event.target.value)}
            placeholder='{"access_token":"…","refresh_token":"…","expiry":"…"}'
            className="mono w-full rounded-md border border-input bg-background px-2.5 py-2 text-[12px] placeholder:text-muted-foreground focus-visible:border-ring"
          />
        </div>
      </div>
    </section>
  );
}
