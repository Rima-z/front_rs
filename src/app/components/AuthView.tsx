// src/views/AuthView.tsx

import { useState } from 'react';
import { Building2, Eye, EyeOff, Lock, Mail, ShieldCheck, Loader2 } from 'lucide-react';
import { decodeJwtPayload } from '../../utils/auth';

interface AuthViewProps {
  onAuthenticate: () => void;
}

export function AuthView({ onAuthenticate }: AuthViewProps) {
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setLoading(true);

    const form = event.currentTarget;
    const email = (form.elements.namedItem('email') as HTMLInputElement).value.trim();
    const password = (form.elements.namedItem('password') as HTMLInputElement).value;

    try {
      const res = await fetch('http://localhost:8080/auth/LoginClientService', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, devicename: 'web' }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.message ?? 'Identifiants invalides');
      }

      const data = await res.json();

      // ── Persist session ────────────────────────────────────────────────────
      localStorage.setItem('access_token', data.token);
      localStorage.setItem('username', data.username ?? data.clientname ?? '');
      localStorage.setItem('email', data.email ?? email);

      // ── Extract roles from JWT payload ─────────────────────────────────────
      const payload = decodeJwtPayload(data.token);
      // Spring Boot JwtUtil typically stores roles under "roles" or "authorities"
      const roles: string[] =
        (payload.roles as string[]) ??
        (payload.authorities as string[]) ??
        [];
      localStorage.setItem('roles', JSON.stringify(roles));

      onAuthenticate();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="size-full p-5 md:p-7 bg-[radial-gradient(circle_at_0%_0%,#f5f7f8_0,#e9ecef_55%,#e0e7eb_100%)]">
      <div className="size-full rounded-[34px] bg-white/45 backdrop-blur-xl border border-white/80 shadow-[0_30px_70px_rgba(0,0,0,0.12)] overflow-hidden grid grid-cols-1 lg:grid-cols-2">

        {/* ── Left: form ─────────────────────────────────────────────────── */}
        <section className="p-8 md:p-12 flex flex-col justify-between">
          <div>
            {/* Logo */}
            <div className="inline-flex items-center gap-3 px-4 py-2 rounded-2xl bg-white/70 border border-white/80 shadow-sm">
              <div className="size-10 rounded-xl bg-gradient-to-br from-amber-400 to-yellow-500 text-white grid place-items-center">
                <Building2 className="w-5 h-5" />
              </div>
              <div>
                <p className="text-sm text-zinc-500">Welcome back to</p>
                <h1 className="text-lg font-semibold text-zinc-700">Smart Building</h1>
              </div>
            </div>

            <h2 className="mt-8 text-4xl text-zinc-700">Sign In</h2>
            <p className="mt-2 text-zinc-500">
              Access your dashboard and monitor every zone in real time.
            </p>

            <form onSubmit={handleSubmit} className="mt-8 space-y-4 max-w-md">

              {/* Email */}
              <label className="block">
                <span className="text-sm text-zinc-600 mb-2 block">Email</span>
                <div className="flex items-center gap-2 px-4 py-3 rounded-2xl bg-white/75 border border-zinc-200/80 focus-within:border-amber-400 transition-colors">
                  <Mail className="w-4 h-4 text-zinc-500 shrink-0" />
                  <input
                    name="email"
                    type="email"
                    required
                    placeholder="you@example.com"
                    className="w-full bg-transparent outline-none text-zinc-700 placeholder:text-zinc-400"
                  />
                </div>
              </label>

              {/* Password */}
              <label className="block">
                <span className="text-sm text-zinc-600 mb-2 block">Password</span>
                <div className="flex items-center gap-2 px-4 py-3 rounded-2xl bg-white/75 border border-zinc-200/80 focus-within:border-amber-400 transition-colors">
                  <Lock className="w-4 h-4 text-zinc-500 shrink-0" />
                  <input
                    name="password"
                    type={showPassword ? 'text' : 'password'}
                    required
                    placeholder="••••••••"
                    className="w-full bg-transparent outline-none text-zinc-700 placeholder:text-zinc-400"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(v => !v)}
                    className="text-zinc-500 hover:text-zinc-700 transition-colors"
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </label>

              {/* Remember / Forgot */}
              <div className="flex items-center justify-between text-sm">
                <label className="flex items-center gap-2 text-zinc-500 cursor-pointer">
                  <input type="checkbox" className="rounded border-zinc-300 accent-amber-500" />
                  Remember me
                </label>
                <button type="button" className="text-amber-600 hover:text-amber-700 transition-colors">
                  Forgot password?
                </button>
              </div>

              {/* Error banner */}
              {error && (
                <div className="flex items-center gap-2 px-4 py-3 rounded-2xl bg-red-50 border border-red-200 text-red-600 text-sm">
                  <span>⚠️</span>
                  <span>{error}</span>
                </div>
              )}

              {/* Submit */}
              <button
                type="submit"
                disabled={loading}
                className="w-full py-3 rounded-2xl bg-[#f4b400] hover:bg-[#e2a800] disabled:opacity-60 disabled:cursor-not-allowed text-white shadow-[0_12px_24px_rgba(244,180,0,0.35)] transition-all flex items-center justify-center gap-2"
              >
                {loading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Connexion…</span>
                  </>
                ) : (
                  'Sign In'
                )}
              </button>
            </form>
          </div>
        </section>

        {/* ── Right: decorative panel ─────────────────────────────────────── */}
        <section className="hidden lg:flex p-8 md:p-12">
          <div className="size-full rounded-3xl bg-gradient-to-br from-[#efe1bc]/80 via-white/70 to-[#f5e7c5]/70 border border-white/80 shadow-[0_20px_50px_rgba(0,0,0,0.08)] p-8 flex flex-col justify-between">
            <div>
              <p className="text-sm text-zinc-500">Secure Access</p>
              <h3 className="text-3xl text-zinc-700 mt-2">
                Control your building from one place
              </h3>
            </div>

            <div className="space-y-4">
              {[
                'Real-time monitoring and alerts',
                'Energy and occupancy analytics',
                'Centralized HVAC and lighting control',
              ].map(item => (
                <div
                  key={item}
                  className="flex items-center gap-3 p-4 rounded-2xl bg-white/65 border border-white/90"
                >
                  <ShieldCheck className="w-5 h-5 text-amber-500 shrink-0" />
                  <p className="text-zinc-600">{item}</p>
                </div>
              ))}
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
