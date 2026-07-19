import { requirePersonaActual } from "@/lib/persona";
import { AppShell } from "@/components/AppShell";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const persona = await requirePersonaActual();

  return (
    <AppShell persona={{ nombre: persona.nombre, rol: persona.rol, sedeCodigo: persona.sedeCodigo }}>
      {children}
    </AppShell>
  );
}
