import { createClient } from "@/lib/supabase/server";
import { getSedes } from "@/lib/sedes";
import { exigir } from "@/lib/resultado";
import type { PersonaActual } from "@/lib/persona";
import type { VarianteConStock } from "@/lib/catalogo";
import type { MotivoSalida, MotivoDevolucion } from "@cayla-retail/shared";
import { diaLima } from "@/lib/panel-serie";

// Actividad reciente del Inicio: qué se movió hoy, en qué sede y quién lo hizo.
//
// `movimientos` es append-only y es la fuente de verdad del inventario desde el
// primer día, pero ninguna pantalla la mostraba nunca en orden cronológico. El
// Líder está en Lima y no ve el piso de Trujillo: sin esto, "¿qué pasó hoy en
// TRU?" solo se responde por teléfono.
//
// No es una bandeja de pendientes ni un indicador: no pide nada y no resume
// nada. Es la respuesta a "¿qué está pasando?", que es una pregunta distinta de
// "¿qué tengo que hacer?" y de "¿cómo vamos?".

/**
 * Etiquetas para LEER un movimiento, no para elegirlo en un formulario.
 * `MovimientoModal` tiene las suyas y son deliberadamente instructivas ("Otro
 * (especificar en nota)"): sirven para guiar a quien registra, y leídas de
 * corrido en una lista sobran. Son dos redacciones del mismo dominio para dos
 * usos distintos, no una duplicación — pero van tipadas contra el mismo enum de
 * `@cayla-retail/shared`, así que si mañana aparece un motivo nuevo, TypeScript
 * no deja compilar hasta que también se traduzca acá.
 */
const ETIQUETA_SALIDA: Record<MotivoSalida, string> = {
  venta: "Venta",
  merma: "Merma",
  regalo: "Regalo",
  muestra: "Muestra",
  otro: "Salida",
};

const ETIQUETA_DEVOLUCION: Record<MotivoDevolucion, string> = {
  no_vendida: "Devuelta al almacén",
  danada_reparacion: "Devuelta — a reparar",
  danada_donar: "Devuelta — a donar",
  devolver_proveedor: "Devuelta al proveedor",
};

const ETIQUETA_TIPO: Record<string, string> = {
  entrada: "Ingreso",
  salida: "Salida",
  ajuste: "Ajuste",
  traslado: "Traslado",
};

export type Actividad = {
  id: string;
  /** Ya redactado: "Venta", "Ingreso", "Traslado"… */
  que: string;
  prenda: string;
  cantidad: number;
  /** "TRU", o "TRU → AQP" cuando es traslado. */
  donde: string;
  quien: string | null;
  monto: number | null;
  /** "10:45" si fue hoy; "06 set · 18:30" si fue antes. */
  cuando: string;
};

/**
 * `variantes` llega ya cargada por la pantalla — mismo criterio que
 * `getPanelInicio`: el Inicio ya tiene el catálogo en memoria, así que resolver
 * el nombre de la prenda no cuesta una consulta más.
 *
 * Sirve a los dos roles sin filtro propio: RLS ya acota `movimientos` a la sede
 * de quien mira, así que la Encargada ve el movimiento de SU tienda y el Líder el
 * de las tres. Filtrar otra vez acá sería repetir en TypeScript una regla que ya
 * vive en la base — y las dos copias se desincronizan.
 */
export async function getActividad(
  persona: PersonaActual,
  variantes: VarianteConStock[],
  limite = 8
): Promise<Actividad[]> {
  const supabase = await createClient();

  const [resMovimientos, sedes, resPersonas] = await Promise.all([
    supabase
      .from("movimientos")
      .select("id, variante_id, sede_id, sede_destino_id, tipo, cantidad, motivo, monto, usuario_id, created_at")
      .order("created_at", { ascending: false })
      .limit(limite),
    getSedes(),
    // `personas` es una vista puente sobre Dynamic en producción, y una vista no
    // sostiene el "embed" por relación de PostgREST (mismo motivo por el que
    // `sedes` se resuelve con getSedes() y no con un join). Son ~9 filas.
    supabase.from("personas").select("id, nombre"),
  ]);

  // Este bloque ES el registro de movimientos, y su propia regla dice que un movimiento
  // invisible es peor que uno feo. Una lista recortada en silencio se lee como «no pasó
  // nada más hoy», que es justo lo contrario de lo que un registro promete.
  const movimientos = exigir(resMovimientos, "los movimientos recientes");
  const personas = exigir(resPersonas, "los nombres del equipo");

  const codigoPorSede = new Map(sedes.map((s) => [s.id, s.codigo]));
  const nombrePorPersona = new Map(personas.map((p) => [p.id, p.nombre]));
  const prendaPorVariante = new Map(
    variantes.map((v) => [v.varianteId, `${v.referencia} ${[v.talla, v.color].filter(Boolean).join("/")}`.trim()])
  );
  const hoy = diaLima(Date.now());

  return movimientos.map((m) => {
    const destino = m.sede_destino_id ? codigoPorSede.get(m.sede_destino_id) : null;
    const origen = codigoPorSede.get(m.sede_id) ?? "?";

    let que: string;
    if (m.tipo === "traslado") {
      que = m.motivo && m.motivo in ETIQUETA_DEVOLUCION
        ? ETIQUETA_DEVOLUCION[m.motivo as MotivoDevolucion]
        : ETIQUETA_TIPO.traslado;
    } else if (m.tipo === "salida" && m.motivo && m.motivo in ETIQUETA_SALIDA) {
      que = ETIQUETA_SALIDA[m.motivo as MotivoSalida];
    } else if (m.tipo === "entrada") {
      que = m.motivo === "compra" ? "Ingreso de mercadería" : ETIQUETA_TIPO.entrada;
    } else {
      // Motivo que nadie tradujo todavía: se muestra crudo en vez de esconderse.
      // Un movimiento invisible en el registro de movimientos es peor que uno feo.
      que = m.motivo ? `${ETIQUETA_TIPO[m.tipo] ?? m.tipo} (${m.motivo})` : ETIQUETA_TIPO[m.tipo] ?? m.tipo;
    }

    return {
      id: m.id,
      que,
      // El catálogo excluye productos descontinuados, así que un movimiento viejo
      // puede no encontrar su prenda. Se dice, no se calla.
      prenda: prendaPorVariante.get(m.variante_id) ?? "(prenda dada de baja)",
      cantidad: Math.abs(m.cantidad),
      donde: destino ? `${origen} → ${destino}` : origen,
      quien: m.usuario_id ? nombrePorPersona.get(m.usuario_id) ?? null : null,
      monto: m.monto != null ? Number(m.monto) : null,
      cuando: formatearCuando(m.created_at, hoy),
    };
  });
}

/** Hoy solo la hora; antes, el día — leer "18:30" y no saber de qué día es peor que un texto largo. */
function formatearCuando(iso: string, hoy: number): string {
  const t = Date.parse(iso);
  const hora = new Intl.DateTimeFormat("es-PE", {
    timeZone: "America/Lima",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(t));
  if (diaLima(t) === hoy) return hora;
  const dia = new Intl.DateTimeFormat("es-PE", {
    timeZone: "America/Lima",
    day: "2-digit",
    month: "short",
  }).format(new Date(t));
  return `${dia} · ${hora}`;
}
