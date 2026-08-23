import { useState } from 'react';
import { Cloud, LoaderCircle } from 'lucide-react';
import { ApiError } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useAuth } from '@/hooks/useAuth';

export default function LoginPage() {
  const { login } = useAuth();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setPending(true);
    setError(null);
    try {
      await login(username, password);
    } catch (cause) {
      setError(
        cause instanceof ApiError
          ? cause.status === 429
            ? 'Demasiados intentos fallidos. Espera unos minutos.'
            : cause.message
          : 'No se pudo iniciar sesión',
      );
    } finally {
      setPending(false);
    }
  };

  return (
    <div className="grid h-dvh place-items-center bg-background p-4">
      <form
        onSubmit={submit}
        className="w-full max-w-72 space-y-4 rounded-lg border border-border bg-card p-6"
      >
        <div className="flex items-center gap-2">
          <div className="grid size-7 place-items-center rounded bg-primary/15 text-primary">
            <Cloud className="size-4" />
          </div>
          <div>
            <h1 className="text-[13px] font-semibold tracking-tight">CloudBridge</h1>
            <p className="text-[11px] text-muted-foreground">Gestor multi-nube</p>
          </div>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="username">Usuario</Label>
          <Input
            id="username"
            autoComplete="username"
            autoFocus
            required
            value={username}
            onChange={(event) => setUsername(event.target.value)}
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="password">Contraseña</Label>
          <Input
            id="password"
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
        </div>

        {error && (
          <p role="alert" className="rounded-md bg-destructive/10 px-2.5 py-2 text-xs text-destructive">
            {error}
          </p>
        )}

        <Button type="submit" className="w-full" disabled={pending}>
          {pending && <LoaderCircle className="animate-spin" />}
          Entrar
        </Button>
      </form>
    </div>
  );
}
