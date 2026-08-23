import type { ProviderOption } from '@cloudbridge/shared';
import { Input, Textarea } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

/** Render one rclone config option according to the type reported by config/providers. */
export function ProviderField({
  option,
  value,
  onChange,
}: {
  option: ProviderOption;
  value: string;
  onChange: (value: string) => void;
}) {
  const id = `opt-${option.name}`;
  const label = (
    <Label htmlFor={id} className="flex items-baseline gap-1.5">
      <span className="mono text-[12px] text-foreground">{option.name}</span>
      {option.required && <span className="text-destructive">*</span>}
      {option.advanced && <span className="text-[10px] uppercase">avanzada</span>}
    </Label>
  );

  const help = option.help ? (
    <p className="text-[11px] leading-snug text-muted-foreground">{option.help.split('\n')[0]}</p>
  ) : null;

  if (option.type === 'bool') {
    return (
      <div className="flex items-start justify-between gap-3 py-1">
        <div className="space-y-0.5">
          {label}
          {help}
        </div>
        <Switch
          id={id}
          checked={value === 'true'}
          onCheckedChange={(checked) => onChange(checked ? 'true' : 'false')}
        />
      </div>
    );
  }

  if (option.examples && option.examples.length > 0 && option.examples.length <= 40) {
    return (
      <div className="space-y-1">
        {label}
        <Select value={value} onValueChange={onChange}>
          <SelectTrigger id={id}>
            <SelectValue placeholder="Selecciona un valor" />
          </SelectTrigger>
          <SelectContent>
            {option.examples.map((example) => (
              <SelectItem key={example.value} value={example.value || '""'}>
                <span className="mono">{example.value || '(vacío)'}</span>
                {example.help && (
                  <span className="ml-2 text-[11px] text-muted-foreground">
                    {example.help.split('\n')[0]}
                  </span>
                )}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {help}
      </div>
    );
  }

  const isLong = option.name === 'token' || option.name === 'service_account_credentials';

  return (
    <div className="space-y-1">
      {label}
      {isLong ? (
        <Textarea
          id={id}
          rows={3}
          className="mono text-[12px]"
          value={value}
          onChange={(event) => onChange(event.target.value)}
        />
      ) : (
        <Input
          id={id}
          type={option.isPassword ? 'password' : option.type === 'int' ? 'number' : 'text'}
          className="mono text-[12px]"
          placeholder={
            option.default !== undefined && option.default !== '' ? String(option.default) : undefined
          }
          value={value}
          onChange={(event) => onChange(event.target.value)}
        />
      )}
      {help}
    </div>
  );
}
