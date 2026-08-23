import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ChevronDown, ChevronRight, LoaderCircle, Terminal } from 'lucide-react';
import { toast } from 'sonner';
import type { ProviderInfo, ProviderOption } from '@cloudbridge/shared';
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

/** Options every provider gets, ordered so the important ones come first. */
function visibleOptions(provider: ProviderInfo, values: Record<string, string>): ProviderOption[] {
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
    .sort((a, b) => Number(a.advanced) - Number(b.advanced) || Number(b.required) - Number(a.required));
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
    if (editing && detailQuery.data) {
      setType(detailQuery.data.type);
      setName(detailQuery.data.name);
      const { type: _ignored, ...rest } = detailQuery.data.parameters;
      setValues(rest);
    } else if (!editing) {
      setType(null);
      setName('');
      setValues({});
      setToken('');
      setShowAdvanced(false);
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
    onSuccess: (remote) => {
      void queryClient.invalidateQueries({ queryKey: ['remotes'] });
      void queryClient.invalidateQueries({ queryKey: ['remote', remote.name] });
      toast.success(editing ? `Remoto "${remote.name}" actualizado` : `Remoto "${remote.name}" creado`, {
        description: remote.online
          ? 'Conexión verificada correctamente.'
          : (remote.error ?? 'Guardado, pero la conexión de prueba falló.'),
      });
      onOpenChange(false);
    },
    onError: (error) =>
      toast.error('No se pudo guardar el remoto', {
        description: error instanceof ApiError ? error.message : String(error),
      }),
  });

  const canSave = Boolean(type) && (editing ? true : name.trim().length > 0);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>{editing ? `Editar "${editing}"` : 'Añadir remoto'}</DialogTitle>
          <DialogDescription>
            {editing
              ? 'Los secretos guardados se muestran enmascarados; escribe uno nuevo solo si quieres reemplazarlo.'
              : 'Elige el tipo de proveedor y rellena su configuración.'}
          </DialogDescription>
        </DialogHeader>

        {!type && (
          <div className="rounded-md border border-border">
            {providersQuery.isPending ? (
              <div className="space-y-1 p-2">
                {Array.from({ length: 6 }).map((_, index) => (
                  <Skeleton key={index} className="h-7 w-full" />
                ))}
              </div>
            ) : (
              <Command>
                <CommandInput placeholder="Buscar proveedor…" />
                <CommandList className="max-h-72">
                  <CommandEmpty>Ningún proveedor coincide.</CommandEmpty>
                  {providersQuery.data?.map((entry) => (
                    <CommandItem
                      key={entry.name}
                      value={`${entry.name} ${entry.description}`}
                      onSelect={() => setType(entry.name)}
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
        )}

        {type && (
          <div className="space-y-3">
            <div className="flex items-center gap-2 rounded-md border border-border bg-muted/40 px-2.5 py-1.5">
              <ProviderIcon type={type} />
              <span className="mono text-[12px]">{type}</span>
              <span className="truncate text-[11px] text-muted-foreground">
                {provider?.description}
              </span>
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
              <div className="space-y-1">
                <Label htmlFor="remote-name">Nombre del remoto</Label>
                <Input
                  id="remote-name"
                  value={name}
                  autoFocus
                  placeholder="p. ej. gdrive-personal"
                  onChange={(event) => setName(event.target.value)}
                />
              </div>
            )}

            {provider?.oauth && <OAuthHelp type={type} token={token} onTokenChange={setToken} />}

            <div className="max-h-[38vh] space-y-3 overflow-y-auto pr-1">
              {basic.map((option) => (
                <ProviderField
                  key={option.name}
                  option={option}
                  value={values[option.name] ?? ''}
                  onChange={(value) => setValues((previous) => ({ ...previous, [option.name]: value }))}
                />
              ))}

              {advanced.length > 0 && (
                <div className="pt-1">
                  <button
                    type="button"
                    className="flex items-center gap-1 text-[11px] font-medium text-muted-foreground hover:text-foreground"
                    onClick={() => setShowAdvanced((previous) => !previous)}
                  >
                    {showAdvanced ? <ChevronDown className="size-3" /> : <ChevronRight className="size-3" />}
                    Opciones avanzadas ({advanced.length})
                  </button>
                  {showAdvanced && (
                    <div className="mt-2 space-y-3 border-l border-border pl-3">
                      {advanced.map((option) => (
                        <ProviderField
                          key={option.name}
                          option={option}
                          value={values[option.name] ?? ''}
                          onChange={(value) =>
                            setValues((previous) => ({ ...previous, [option.name]: value }))
                          }
                        />
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={() => save.mutate()} disabled={!canSave || save.isPending}>
            {save.isPending && <LoaderCircle className="animate-spin" />}
            {editing ? 'Guardar cambios' : 'Crear remoto'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
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
    <div className="space-y-2 rounded-md border border-primary/30 bg-primary/5 p-3">
      <p className="flex items-center gap-1.5 text-[12px] font-medium">
        <Terminal className="size-3.5 text-primary" />
        Este proveedor necesita autorización OAuth
      </p>
      <p className="text-[11px] leading-snug text-muted-foreground">
        Ejecuta este comando en un equipo con navegador y pega aquí el JSON que devuelve. Si usas tu
        propio client_id/client_secret, rellénalos abajo primero y añádelos también al comando.
      </p>
      <div className="flex items-center gap-2">
        <code className="mono flex-1 truncate rounded bg-background px-2 py-1 text-[12px]">
          {command}
        </code>
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
      <div className="space-y-1">
        <Label htmlFor="oauth-token">Token</Label>
        <textarea
          id="oauth-token"
          rows={3}
          value={token}
          onChange={(event) => onTokenChange(event.target.value)}
          placeholder='{"access_token":"…","refresh_token":"…","expiry":"…"}'
          className="mono w-full rounded-md border border-input bg-background px-2.5 py-2 text-[12px] placeholder:text-muted-foreground"
        />
      </div>
    </div>
  );
}
