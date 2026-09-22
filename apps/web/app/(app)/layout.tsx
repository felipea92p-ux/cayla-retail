import { cookies } from "next/headers";
import { COOKIE_LATERAL, COOKIE_LATERAL_PLEGADO } from "@/lib/lateral-cookie";
import { requirePersonaActualV2 } from "@/lib/persona-actual";
import { getUbicaciones } from "@/lib/ubicaciones";
import { getTrasladosPorAtender } from "@/lib/traslados";
import { AppShell } from "@/components/AppShell";

// Fase UI 1 (2026-09-11): usa la persona V2 (`ubicacion_id`), no la V1
// (`sede_id`). Fase 2 (2026-09-13): el selector de ubicación del líder ya
// no está pendiente — trae la lista completa solo cuando hace falta
// (`puedeCambiarUbicacion`), para no pedirle nada extra a un integrante.
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const persona = await requirePersonaActualV2();
  // El contador de «Traslados» del menú (2026-09-18): en paralelo con la lista de ubicaciones, y
  // total (nunca lanza) — este layout no tiene `error.tsx` propio, así que una excepción acá
  // dejaría sin pantalla a toda la app por un número.
  const [ubicaciones, trasladosPorAtender] = await Promise.all([
    persona.puedeCambiarUbicacion ? getUbicaciones() : Promise.resolve([]),
    getTrasladosPorAtender(persona.ubicacionId, persona.rol === "lider"),
  ]);

  // El lateral plegado (2026-09-19) se lee acá y no en el cliente: así la primera pintura ya sale
  // con el ancho que la persona dejó, sin el salto de 17rem a 4.75rem que daría localStorage.
  const lateralPlegado = (await cookies()).get(COOKIE_LATERAL)?.value === COOKIE_LATERAL_PLEGADO;

  return (
    <AppShell
      persona={{
        nombre: persona.nombre,
        rol: persona.rol,
        ubicacionId: persona.ubicacionId,
        ubicacionEtiqueta: persona.ubicacionEtiqueta,
        ubicacionTipo: persona.ubicacionTipo,
        puedeCambiarUbicacion: persona.puedeCambiarUbicacion,
        esCompradorDeTienda: persona.tiendasCompra.length > 0,
      }}
      ubicaciones={ubicaciones}
      trasladosPorAtender={trasladosPorAtender}
      lateralPlegado={lateralPlegado}
    >
      {children}
    </AppShell>
  );
}
