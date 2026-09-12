import { requirePersonaActualV2 } from "@/lib/persona-actual";
import { AppShell } from "@/components/AppShell";

// Fase UI 1 (2026-09-11): usa la persona V2 (`ubicacion_id`), no la V1
// (`sede_id`). El selector de ubicación del Líder queda pendiente para
// Fase 2 — AppShell ya no lo pide como prop.
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const persona = await requirePersonaActualV2();

  return (
    <AppShell
      persona={{
        nombre: persona.nombre,
        rol: persona.rol,
        ubicacionEtiqueta: persona.ubicacionEtiqueta,
      }}
    >
      {children}
    </AppShell>
  );
}
