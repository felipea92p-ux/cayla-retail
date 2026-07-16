import { requirePersonaActual } from "@/lib/persona";
import { LogoutButton } from "@/components/LogoutButton";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const persona = await requirePersonaActual();

  return (
    <div className="min-h-screen bg-neutral-50">
      <header className="flex items-center justify-between border-b border-neutral-200 bg-white px-5 py-3">
        <div>
          <span className="text-base font-semibold text-neutral-900">CAYLA Retail</span>
          <span className="ml-3 rounded-full bg-neutral-100 px-2.5 py-0.5 text-xs font-medium text-neutral-600">
            {persona.sedeCodigo}
          </span>
        </div>
        <div className="flex items-center gap-3 text-sm">
          <span className="text-neutral-600">
            {persona.nombre} · <span className="text-neutral-400">{persona.rol === "lider" ? "Líder" : "Integrante"}</span>
          </span>
          <LogoutButton />
        </div>
      </header>
      <main className="mx-auto max-w-3xl px-4 py-6">{children}</main>
    </div>
  );
}
