import { requirePersonaActualV2 } from "@/lib/persona-actual";
import { getUbicaciones } from "@/lib/ubicaciones";
import { AppShell } from "@/components/AppShell";

// Fase UI 1 (2026-09-11): usa la persona V2 (`ubicacion_id`), no la V1
// (`sede_id`). Fase 2 (2026-09-13): el selector de ubicación del líder ya
// no está pendiente — trae la lista completa solo cuando hace falta
// (`puedeCambiarUbicacion`), para no pedirle nada extra a un integrante.
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const persona = await requirePersonaActualV2();
  const ubicaciones = persona.puedeCambiarUbicacion ? await getUbicaciones() : [];

  return (
    <AppShell
      persona={{
        nombre: persona.nombre,
        rol: persona.rol,
        ubicacionId: persona.ubicacionId,
        ubicacionEtiqueta: persona.ubicacionEtiqueta,
        puedeCambiarUbicacion: persona.puedeCambiarUbicacion,
      }}
      ubicaciones={ubicaciones}
    >
      {children}
    </AppShell>
  );
}
