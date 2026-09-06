import { useMemo, useState } from "react";
import {
  Bell,
  Check,
  MessageCircle,
  Plus,
  Radio,
  Send,
  Trash2,
  Webhook,
} from "lucide-react";
import type {
  NotificationChannel,
  NotificationChannelInput,
  NotificationProvider,
} from "@cloudbridge/shared";
import { Button } from "@/components/ui/button";
import { Input, Textarea } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { FieldHelp } from "@/components/ui/field-help";

type Draft = NotificationChannelInput;

const PROVIDERS: { value: NotificationProvider; label: string; icon: typeof Bell }[] = [
  { value: "telegram", label: "Telegram", icon: Send },
  { value: "discord", label: "Discord", icon: MessageCircle },
  { value: "ntfy", label: "ntfy", icon: Radio },
  { value: "webhook", label: "Webhook genérico", icon: Webhook },
];

function draftFor(provider: NotificationProvider): Draft {
  const base = {
    id: crypto.randomUUID(),
    name: "",
    provider,
    enabled: true,
    notifyOnSuccess: true,
    notifyOnFailure: true,
  } as const;
  switch (provider) {
    case "telegram":
      return {
        ...base,
        provider,
        config: { token: "", chatId: "", messageThreadId: null },
      };
    case "discord":
      return { ...base, provider, config: { webhookUrl: "", username: null } };
    case "ntfy":
      return {
        ...base,
        provider,
        config: { serverUrl: "https://ntfy.sh", topic: "", token: "", priority: 3 },
      };
    case "webhook":
      return { ...base, provider, config: { url: "", template: null, headers: {} } };
  }
}

function toDraft(channel: NotificationChannel): Draft {
  switch (channel.provider) {
    case "telegram":
      return {
        ...channel,
        config: {
          chatId: channel.config.chatId,
          messageThreadId: channel.config.messageThreadId,
        },
      };
    case "discord":
      return { ...channel, config: { username: channel.config.username } };
    case "ntfy":
      return {
        ...channel,
        config: {
          serverUrl: channel.config.serverUrl,
          topic: channel.config.topic,
          priority: channel.config.priority,
        },
      };
    case "webhook":
      return { ...channel, config: { template: channel.config.template } };
  }
}

export function notificationChannelDraft(channel: NotificationChannel): Draft {
  return toDraft(channel);
}

export function NotificationChannels({
  channels,
  onChange,
  onTest,
  testing,
}: {
  channels: NotificationChannelInput[];
  onChange: (channels: NotificationChannelInput[]) => void;
  onTest: (channel: NotificationChannelInput) => void;
  testing: boolean;
}) {
  const [draft, setDraft] = useState<Draft | null>(null);
  const entries = useMemo(() => channels, [channels]);
  const save = () => {
    if (!draft) return;
    const others = channels.filter((item) => item.id !== draft.id);
    onChange([...others, draft]);
    setDraft(null);
  };
  const remove = (id: string) => onChange(channels.filter((item) => item.id !== id));
  const toggle = (channel: NotificationChannelInput) =>
    onChange(
      channels.map((item) =>
        item.id === channel.id ? { ...item, enabled: !item.enabled } : item,
      ),
    );

  return (
    <>
      <div className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <p className="text-[12px] text-muted-foreground">
            Todos los canales habilitados reciben cada transferencia según sus reglas.
          </p>
          <Button
            size="sm"
            variant="outline"
            onClick={() => setDraft(draftFor("telegram"))}
          >
            <Plus /> Añadir canal
          </Button>
        </div>
        {entries.length === 0 && (
          <p className="rounded-md border border-dashed border-border p-4 text-center text-[12px] text-muted-foreground">
            No hay canales configurados.
          </p>
        )}
        {entries.map((channel) => {
          const provider = PROVIDERS.find((item) => item.value === channel.provider)!;
          const Icon = provider.icon;
          return (
            <div
              key={channel.id}
              className="flex items-center gap-3 rounded-md border border-border p-3"
            >
              <div className="rounded-md border border-primary/30 bg-primary/10 p-2 text-primary">
                <Icon className="size-4" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="font-medium">{channel.name}</span>
                  <Badge variant={channel.enabled ? "success" : "outline"}>
                    {channel.enabled ? "activo" : "desactivado"}
                  </Badge>
                </div>
                <p className="text-[11px] text-muted-foreground">
                  {provider.label} · {channel.notifyOnSuccess && "éxitos"}
                  {channel.notifyOnSuccess && channel.notifyOnFailure && " y "}
                  {channel.notifyOnFailure && "errores"}
                </p>
              </div>
              <Switch
                checked={channel.enabled}
                onCheckedChange={() => toggle(channel)}
                aria-label={`Activar ${channel.name}`}
              />
              <Button
                size="sm"
                variant="ghost"
                onClick={() => onTest(channel)}
                disabled={testing}
              >
                <Send /> Probar
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setDraft(channel)}>
                Editar
              </Button>
              <Button
                size="icon-sm"
                variant="ghost"
                className="text-destructive"
                aria-label={`Eliminar ${channel.name}`}
                onClick={() => remove(channel.id)}
              >
                <Trash2 />
              </Button>
            </div>
          );
        })}
      </div>
      <ChannelDialog
        draft={draft}
        onClose={() => setDraft(null)}
        onChange={setDraft}
        onSave={save}
      />
    </>
  );
}

function ChannelDialog({
  draft,
  onClose,
  onChange,
  onSave,
}: {
  draft: Draft | null;
  onClose: () => void;
  onChange: (value: Draft) => void;
  onSave: () => void;
}) {
  if (!draft) return null;
  const provider = PROVIDERS.find((item) => item.value === draft.provider)!;
  const update = (patch: Partial<Draft>) => onChange({ ...draft, ...patch } as Draft);
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>
            {draft.name ? `Editar ${draft.name}` : "Añadir canal"}
          </DialogTitle>
          <DialogDescription>
            Los secretos guardados se mantienen si dejas vacío su campo.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <Label>Proveedor</Label>
              <Select
                value={draft.provider}
                onValueChange={(value) =>
                  onChange(draftFor(value as NotificationProvider))
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PROVIDERS.map((item) => (
                    <SelectItem key={item.value} value={item.value}>
                      {item.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Nombre</Label>
              <Input
                value={draft.name}
                onChange={(event) => update({ name: event.target.value })}
                placeholder={`${provider.label} principal`}
              />
            </div>
          </div>
          <ProviderFields draft={draft} onChange={onChange} />
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="flex items-center justify-between rounded-md border border-border p-2 text-[12px]">
              Notificar éxitos{" "}
              <Switch
                checked={draft.notifyOnSuccess}
                onCheckedChange={(value) => update({ notifyOnSuccess: value })}
              />
            </label>
            <label className="flex items-center justify-between rounded-md border border-border p-2 text-[12px]">
              Notificar errores{" "}
              <Switch
                checked={draft.notifyOnFailure}
                onCheckedChange={(value) => update({ notifyOnFailure: value })}
              />
            </label>
          </div>
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={onSave}>
            <Check /> Guardar canal
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function ProviderFields({
  draft,
  onChange,
}: {
  draft: Draft;
  onChange: (value: Draft) => void;
}) {
  const patch = (config: Draft["config"]) => onChange({ ...draft, config } as Draft);
  if (draft.provider === "telegram")
    return (
      <div className="grid gap-3 sm:grid-cols-2">
        <Field
          label="Token del bot"
          help="Créalo con @BotFather."
          value={draft.config.token ?? ""}
          secret
          onChange={(token) => patch({ ...draft.config, token })}
        />
        <Field
          label="ID del chat"
          value={draft.config.chatId}
          onChange={(chatId) => patch({ ...draft.config, chatId })}
        />
        <Field
          label="ID de tema (opcional)"
          value={draft.config.messageThreadId ?? ""}
          onChange={(messageThreadId) =>
            patch({ ...draft.config, messageThreadId: messageThreadId || null })
          }
        />
      </div>
    );
  if (draft.provider === "discord")
    return (
      <div className="grid gap-3 sm:grid-cols-2">
        <Field
          label="URL del webhook"
          value={draft.config.webhookUrl ?? ""}
          secret
          onChange={(webhookUrl) => patch({ ...draft.config, webhookUrl })}
        />
        <Field
          label="Nombre mostrado (opcional)"
          value={draft.config.username ?? ""}
          onChange={(username) => patch({ ...draft.config, username: username || null })}
        />
      </div>
    );
  if (draft.provider === "ntfy")
    return (
      <div className="grid gap-3 sm:grid-cols-2">
        <Field
          label="Servidor ntfy"
          value={draft.config.serverUrl}
          onChange={(serverUrl) => patch({ ...draft.config, serverUrl })}
        />
        <Field
          label="Tópico"
          value={draft.config.topic}
          onChange={(topic) => patch({ ...draft.config, topic })}
        />
        <Field
          label="Token (opcional)"
          value={draft.config.token ?? ""}
          secret
          onChange={(token) => patch({ ...draft.config, token })}
        />
        <div className="space-y-1">
          <Label>Prioridad</Label>
          <Select
            value={String(draft.config.priority)}
            onValueChange={(value) => patch({ ...draft.config, priority: Number(value) })}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {[1, 2, 3, 4, 5].map((value) => (
                <SelectItem key={value} value={String(value)}>
                  {value}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
    );
  return (
    <div className="space-y-3">
      <Field
        label="URL"
        value={draft.config.url ?? ""}
        secret
        onChange={(url) => patch({ ...draft.config, url })}
      />
      <div className="space-y-1">
        <Label>
          Plantilla JSON (opcional){" "}
          <FieldHelp label="Plantilla JSON">
            {
              "Placeholders: {{job}}, {{status}}, {{files}}, {{bytesHuman}}, {{duration}}, {{error}}."
            }
          </FieldHelp>
        </Label>
        <Textarea
          rows={3}
          value={draft.config.template ?? ""}
          onChange={(event) =>
            patch({ ...draft.config, template: event.target.value || null })
          }
        />
      </div>
    </div>
  );
}

function Field({
  label,
  help,
  value,
  onChange,
  secret = false,
}: {
  label: string;
  help?: string;
  value: string;
  onChange: (value: string) => void;
  secret?: boolean;
}) {
  return (
    <div className="space-y-1">
      <Label>
        {label} {help && <FieldHelp label={label}>{help}</FieldHelp>}
      </Label>
      <Input
        type={secret ? "password" : "text"}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    </div>
  );
}
