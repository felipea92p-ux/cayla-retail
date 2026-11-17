// El equipo de hoy: quién está en la tienda y qué hizo (Inicio, y el buscador de la cabecera).
//
// Vive aparte de `inicio-avisos.ts` a propósito (ADR-0674): el buscador de la cabecera (`BuscadorGlobal`) lo usa y se carga en TODA
// pantalla; importarlo desde `inicio-avisos.ts` metía en el JavaScript del marco las reglas de recepción, conteo, compras y comprobantes
// que ese archivo necesita para sus avisos (medido el 2026-11-17 en el armado de producción). `inicio-avisos.ts` lo reexporta.

import { montosSinCorte } from "./montos-sin-corte";

export type MiembroEquipo = {
  personaId: string;
  nombre: string;
  /** 'presente' | 'en_pausa' | 'salio' | 'programada' (fn_asesoras_de_turno), o null si firmó sin marcar asistencia. */
  estado: string | null;
  /** Solo para quien ve la actividad (ADR-0207). null = no se lee para quien mira. */
  ventas: number | null;
  monto: number | null;
  ultima: { hora: string; texto: string } | null;
};

export type FilaTurno = { persona_id: string; nombre_corto: string; estado_ahora: string; es_de_esta_sede: boolean };
export type FilaActividad = {
  ocurrio_at: string;
  accion: string;
  descripcion: string;
  persona_id: string | null;
  persona_nombre: string | null;
  detalle: unknown;
  /** De qué tabla es el registro citado (`'ventas'` en las acciones de una venta) y su id: con eso se empareja una venta con su anulación. */
  tabla?: string | null;
  registro_id?: string | null;
};

/**
 * Junta la asistencia (quién está) con la actividad de hoy (qué hizo). La actividad llega de la más nueva a la más vieja.
 * Quien firmó algo hoy sin marcar asistencia también sale (estado null): se ve que operó, no se esconde.
 * `actividad` null = quien mira no ve la actividad (o no se pudo leer): la fila queda solo con el nombre.
 *
 * La bitácora de Actividad es inmutable: una venta anulada deja dos líneas («vendió…» y «anuló…»). Aquí no se cuenta como
 * venta ni como última acción de quien la registró; y si era de prueba (`detalle.es_prueba`, que solo trae la línea de la
 * anulación), ninguna de sus líneas aparece — es un dato archivado, igual que en Historial y Caja.
 */
export function armarEquipo(turno: FilaTurno[], actividad: FilaActividad[] | null): MiembroEquipo[] {
  const porId = new Map<string, MiembroEquipo>();
  for (const t of turno) {
    if (!t.es_de_esta_sede || t.estado_ahora === "programada") continue;
    porId.set(t.persona_id, { personaId: t.persona_id, nombre: t.nombre_corto, estado: t.estado_ahora, ventas: actividad ? 0 : null, monto: actividad ? 0 : null, ultima: null });
  }
  const anuladas = new Set<string>();
  const deLaPrueba = new Set<string>();
  for (const a of actividad ?? []) {
    if (a.tabla !== "ventas" || !a.registro_id) continue;
    if (a.accion === "venta_anulada") anuladas.add(a.registro_id);
    if ((a.detalle as { es_prueba?: unknown } | null)?.es_prueba === true) deLaPrueba.add(a.registro_id);
  }
  for (const a of actividad ?? []) {
    if (!a.persona_id) continue;
    if (a.tabla === "ventas" && a.registro_id) {
      if (deLaPrueba.has(a.registro_id)) continue;
      if (a.accion === "venta_registrada" && anuladas.has(a.registro_id)) continue;
    }
    let m = porId.get(a.persona_id);
    if (!m) {
      m = { personaId: a.persona_id, nombre: primerNombre(a.persona_nombre), estado: null, ventas: 0, monto: 0, ultima: null };
      porId.set(a.persona_id, m);
    }
    m.ultima ??= { hora: a.ocurrio_at, texto: montosSinCorte(a.descripcion) }; // la descripción la escribe Postgres
    if (a.accion === "venta_registrada") {
      const total = Number((a.detalle as { total?: unknown } | null)?.total ?? 0);
      m.ventas = (m.ventas ?? 0) + 1;
      m.monto = (m.monto ?? 0) + (Number.isFinite(total) ? total : 0);
    }
  }
  const pesoEstado = (e: string | null) => (e === "presente" ? 0 : e === "en_pausa" ? 1 : e === null ? 2 : 3);
  return [...porId.values()].sort((x, y) => pesoEstado(x.estado) - pesoEstado(y.estado) || (y.monto ?? 0) - (x.monto ?? 0) || x.nombre.localeCompare(y.nombre));
}

function primerNombre(nombre: string | null): string {
  const partes = (nombre ?? "").trim().split(/\s+/);
  return partes.length > 1 ? `${partes[0]} ${partes[1]![0]}.` : partes[0] || "Sin nombre";
}

export function textoEstado(estado: string | null): string {
  if (estado === "presente") return "En tienda";
  if (estado === "en_pausa") return "En pausa";
  if (estado === "salio") return "Ya salió";
  return "Sin marcar asistencia";
}
