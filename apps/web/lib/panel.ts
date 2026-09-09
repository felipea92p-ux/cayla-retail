import { createClient } from "@/lib/supabase/server";
import { getSedes } from "@/lib/sedes";
import type { PersonaActual } from "@/lib/persona";
import type { VarianteConStock } from "@/lib/catalogo";
import {
  DIAS_TENDENCIA,
  INDICE_HOY,
  INDICE_SEMANA_PASADA,
  hastaEstaHora,
  indiceEnSerie,
  inicioDeLaVentana,
} from "@/lib/panel-serie";

// Panel del día del Líder (Inicio): el pulso del negocio en una pantalla.
// Toda la aritmética de "qué día es esto" en hora de Lima vive en
// `panel-serie.ts`, que es puro y está probado — acá solo se consulta y se suma.

export type PanelLider = {
  ventasHoyTotal: number;
  ventasHoyPorSede: { codigo: string; monto: number }[];
  /** Ventas en soles por día, del más viejo (índice 0) a hoy. Largo = DIAS_TENDENCIA. */
  ventasSerie: number[];
  /**
   * Ventas del mismo día de la semana pasada, contadas SOLO hasta esta misma
   * hora. Comparar las 3 ventas de un martes a las 10am contra el martes
   * completo de la semana pasada da siempre un número en rojo que no significa
   * nada — a las 10am ninguna tienda vendió su día entero todavía.
   */
  ventasSemanaPasadaAEstaHora: number;
  cajasTiendas: { codigo: string; abierta: boolean }[];
  /** Piso de venta + almacén interno, valorado a costo. */
  valorInventarioTotal: number;
  /** La parte de ese total que sigue en almacén, sin bajar a piso. */
  valorAlmacenTotal: number;
  valorPorSede: { codigo: string; valor: number }[];
};

/**
 * `variantes` llega ya cargada por la pantalla (el Inicio la pide para contar
 * "reponer ya" y "estancadas"): de ahí sale el inventario a costo, en vez de
 * releer `stock` entero con su join a `variantes` por segunda vez en la misma
 * pantalla — que es lo que hacía esta función antes. El Inicio es la pantalla
 * más visitada del sistema y era la que más leía.
 */
export async function getPanelLider(
  persona: PersonaActual,
  variantes: VarianteConStock[]
): Promise<PanelLider | null> {
  if (persona.rol !== "lider") return null;
  const supabase = await createClient();
  const ahora = Date.now();
  const desde = inicioDeLaVentana(ahora).toISOString();

  // `getSedes` está cacheada por request y el catálogo ya la pidió, así que acá
  // no cuesta un viaje nuevo: las consultas reales son las dos de abajo.
  const [sedes, { data: ventas }, { data: cajasAbiertas }] = await Promise.all([
    getSedes(),
    supabase.from("ventas").select("sede_id, monto_total, created_at").gte("created_at", desde),
    supabase.from("cajas").select("sede_id").eq("estado", "abierta"),
  ]);

  const codigoPorId = new Map(sedes.map((s) => [s.id, s.codigo]));
  const sedesAbiertas = new Set((cajasAbiertas ?? []).map((c) => c.sede_id));

  // Una sola pasada por las ventas de la ventana: la serie de tendencia, el
  // desglose de hoy por sede y el comparativo salen del mismo recorrido.
  const ventasSerie: number[] = new Array(DIAS_TENDENCIA).fill(0);
  const ventasPorSede = new Map<string, number>();
  let ventasSemanaPasadaAEstaHora = 0;
  (ventas ?? []).forEach((v) => {
    const t = Date.parse(v.created_at);
    const indice = indiceEnSerie(t, ahora);
    if (indice === null) return;
    const monto = Number(v.monto_total);
    ventasSerie[indice] += monto;
    if (indice === INDICE_HOY) {
      const codigo = codigoPorId.get(v.sede_id) ?? "?";
      ventasPorSede.set(codigo, (ventasPorSede.get(codigo) ?? 0) + monto);
    } else if (indice === INDICE_SEMANA_PASADA && hastaEstaHora(t, ahora)) {
      ventasSemanaPasadaAEstaHora += monto;
    }
  });

  // Inventario a costo = piso de venta + almacén interno (decisión de Felipe,
  // 2026-09-09): la mercadería recibida y todavía sin bajar es la plata MÁS
  // dormida que hay; dejarla fuera del total la volvía invisible. Se devuelve
  // aparte cuánto de ese total está en almacén, para poder decirlo en pantalla.
  // `costo` viene poblado porque esta función es solo del Líder.
  let valorPiso = 0;
  let valorAlmacenTotal = 0;
  const valorPorSedeMap = new Map<string, number>();
  const sumarSede = (codigo: string, valor: number) =>
    valorPorSedeMap.set(codigo, (valorPorSedeMap.get(codigo) ?? 0) + valor);
  variantes.forEach((v) => {
    const costo = v.costo ?? 0;
    if (costo === 0) return;
    Object.entries(v.stockPorSede).forEach(([codigo, cantidad]) => {
      valorPiso += costo * cantidad;
      sumarSede(codigo, costo * cantidad);
    });
    Object.entries(v.stockAlmacenPorSede).forEach(([codigo, cantidad]) => {
      valorAlmacenTotal += costo * cantidad;
      sumarSede(codigo, costo * cantidad);
    });
  });

  return {
    ventasHoyTotal: ventasSerie[INDICE_HOY],
    ventasHoyPorSede: [...ventasPorSede.entries()]
      .map(([codigo, monto]) => ({ codigo, monto }))
      .sort((a, b) => b.monto - a.monto),
    ventasSerie,
    ventasSemanaPasadaAEstaHora,
    cajasTiendas: sedes
      .filter((s) => s.tipo === "tienda")
      .map((s) => ({ codigo: s.codigo, abierta: sedesAbiertas.has(s.id) })),
    valorInventarioTotal: valorPiso + valorAlmacenTotal,
    valorAlmacenTotal,
    valorPorSede: [...valorPorSedeMap.entries()]
      .map(([codigo, valor]) => ({ codigo, valor }))
      .sort((a, b) => b.valor - a.valor),
  };
}
