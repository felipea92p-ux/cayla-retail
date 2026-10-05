import { cookies } from "next/headers";
import { COOKIE_LATERAL, COOKIE_LATERAL_PLEGADO } from "@/lib/lateral-cookie";
import { puede, requirePersonaActualV2 } from "@/lib/persona-actual";
import { getUbicaciones } from "@/lib/ubicaciones";
import { getNumeroDelMenuTraslados } from "@/lib/traslados";
import { AppShell } from "@/components/AppShell";
import { SedeActivaProveedor } from "@/components/SedeActiva";
import { ColasSinConexion } from "@/components/ColasSinConexion";
import { SinConexion } from "@/components/SinConexion";
import { RecordatorioCierreCaja } from "@/components/RecordatorioCierreCaja";
import { getRecordatorioCierre, recibeRecordatorioCierre } from "@/lib/recordatorio-cierre";

// Fase UI 1 (2026-09-11): usa la persona V2 (`ubicacion_id`), no la V1
// (`sede_id`). Fase 2 (2026-09-13): el selector de ubicación del líder ya
// no está pendiente — trae la lista completa solo cuando hace falta
// (`puedeCambiarUbicacion`), para no pedirle nada extra a un integrante.
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const persona = await requirePersonaActualV2();
  // El contador de «Traslados» del menú (2026-09-18): en paralelo con la lista de ubicaciones, y
  // total (nunca lanza) — este layout no tiene `error.tsx` propio, así que una excepción acá
  // dejaría sin pantalla a toda la app por un número.
  // ADR-0275: quien ve CAYLA Global sin ser líder también tiene selector, con su propia sede y la vista global.
  // El recordatorio de cierre de caja (ADR-0305): total como el contador, solo para quien puede cerrar la caja de una tienda.
  const recibeRecordatorio = recibeRecordatorioCierre(persona);
  const [todasLasUbicaciones, trasladosPorAtender, recordatorioCierre] = await Promise.all([
    persona.puedeCambiarUbicacion || persona.puedeVerGlobal ? getUbicaciones() : Promise.resolve([]),
    getNumeroDelMenuTraslados(persona.ubicacionId, puede(persona, "ajustarInventario")),
    recibeRecordatorio ? getRecordatorioCierre(persona) : Promise.resolve(null),
  ]);

  const ubicaciones = persona.puedeCambiarUbicacion ? todasLasUbicaciones : todasLasUbicaciones.filter((u) => u.id === persona.ubicacionId);

  // El lateral plegado (2026-09-19) se lee acá y no en el cliente: así la primera pintura ya sale
  // con el ancho que la persona dejó, sin el salto de 17rem a 4.75rem que daría localStorage.
  const lateralPlegado = (await cookies()).get(COOKIE_LATERAL)?.value === COOKIE_LATERAL_PLEGADO;

  return (
    <AppShell
      persona={{
        nombre: persona.nombre,
        personaId: persona.personaId,
        rol: persona.rol,
        ubicacionId: persona.ubicacionId,
        ubicacionEtiqueta: persona.ubicacionEtiqueta,
        ubicacionTipo: persona.ubicacionTipo,
        puedeCambiarUbicacion: persona.puedeCambiarUbicacion,
        puedeVerGlobal: persona.puedeVerGlobal,
        vista: persona.vista,
        terminal: persona.terminal,
        permisos: persona.permisos,
        modulos: persona.modulos.map((m) => m.clave),
      }}
      ubicaciones={ubicaciones}
      trasladosPorAtender={trasladosPorAtender}
      lateralPlegado={lateralPlegado}
    >
      {/* La sede activa y quién inició sesión, para el combo «Responsable» (ADR-0161, A11), sin pasarlas por props a cada pantalla. */}
      <SedeActivaProveedor
        ubicacionId={persona.ubicacionId}
        etiqueta={persona.ubicacionEtiqueta}
        personaSesionId={persona.personaId}
        esAdmin={persona.esAdmin}
        nombreSesion={persona.nombre}
      >
        {/* Service worker, copias por persona y aviso «sin conexión / copia guardada» (ADR-0210). `generadoEn` sella
            esta carga: en una copia servida sin red, es la hora de la copia. */}
        <SinConexion cuenta={persona.personaId ?? `terminal:${persona.nombre}`} generadoEn={new Date().toISOString()} />
        {children}
        {/* Sube lo guardado sin conexión (ADR-0210) desde cualquier pantalla. */}
        <ColasSinConexion />
        {/* «Es hora de cerrar caja» (ADR-0305): desde la hora de cierre de la tienda hasta que la caja se cierra, en toda pantalla. */}
        {recibeRecordatorio && <RecordatorioCierreCaja inicial={recordatorioCierre} />}
      </SedeActivaProveedor>
    </AppShell>
  );
}
