import { createClient } from "@/lib/supabase/server";
import type { PersonaActual } from "@/lib/persona";
import { getCatalogoConStock, type VarianteConStock } from "@/lib/catalogo";
import { UMBRAL_ESTANCADO_DIAS, LEAD_TIME_DIAS } from "@cayla-retail/shared";

const DIA_MS = 86400000;

export type SugerenciaTraslado = {
  sedeDestinoCodigo: string;
  sedeOrigenCodigo: string;
  stockOrigen: number;
};

export type VarianteInteligente = VarianteConStock & {
  vendidasVentana: number;
  velocidadDiaria: number; // unidades/día en la ventana, motivo='venta'
  diasInventario: number | null;
  diasSinVenta: number | null;
  estancado: boolean;
  reorderPoint: number;
  reponerYa: boolean;
  /** Sedes cuyo stock está por debajo de SU mínimo propio (stock.stock_minimo, Fase B). */
  sedesBajoMinimo: string[];
  /** Hay una producción borrador abierta (registrar_produccion sin cerrar) que ya cubre esta alerta. */
  produccionAbiertaId: string | null;
  /** El líder pospuso la alerta hasta esta fecha — pasado ese plazo, vuelve a alertar sola. */
  silenciadaHasta: string | null;
  // Campos con sesgo monetario: null para Integrante (mismo criterio que costo/precio en getCatalogoConStock).
  montoVentana: number | null;
  sellThrough: number | null;
  claseABC: "A" | "B" | "C" | null;
  sugerenciaTraslado: SugerenciaTraslado | null;
};

export type ResumenInteligencia = {
  ventanaDias: number;
  variantes: VarianteInteligente[];
  alertasReposicion: VarianteInteligente[];
  alertasTraslado: VarianteInteligente[];
};

/**
 * Motor de inteligencia de inventario: rotación, alertas de reposición y sugerencias
 * de traslado entre sedes, calculadas sobre lo que ya se registra en `movimientos`
 * (sin checkout/comprobantes — usa motivo='venta' como proxy, ver MOTIVOS_SALIDA).
 */
export async function getCatalogoInteligente(
  persona: PersonaActual,
  ventanaDias = 30
): Promise<ResumenInteligencia> {
  const supabase = await createClient();
  const verMonto = persona.rol === "lider";
  const desde = new Date(Date.now() - ventanaDias * DIA_MS);

  // Las 4 consultas son independientes entre sí — en paralelo en vez de encadenadas.
  // La última venta y la fecha de alta por variante ya vienen calculadas en
  // getCatalogoConStock (misma fila de `stock`/`variantes` que ya trae cantidad y
  // created_at), así que no se vuelven a pedir esas tablas acá.
  const [variantes, { data: movimientos }, { data: silenciadas }, { data: produccionesAbiertas }] = await Promise.all([
    getCatalogoConStock(persona),
    supabase
      .from("movimientos")
      .select("variante_id, tipo, cantidad, motivo, monto, created_at")
      .gte("created_at", desde.toISOString()),
    supabase
      .from("reposicion_silenciada")
      .select("variante_id, silenciada_hasta")
      .gt("silenciada_hasta", new Date().toISOString()),
    // Borrador de Taller sin cerrar (inventariado_at null) por variante — mientras exista,
    // "reponer ya" ya tiene una orden en camino y no debe seguir gritando en rojo.
    supabase
      .from("producciones")
      .select("id, produccion_lineas(variante_id)")
      .is("inventariado_at", null),
  ]);

  const silenciadaHastaPorVariante = new Map<string, string>(
    (silenciadas ?? []).map((s) => [s.variante_id, s.silenciada_hasta])
  );
  const produccionAbiertaPorVariante = new Map<string, string>();
  (produccionesAbiertas ?? []).forEach((p) => {
    (p.produccion_lineas ?? []).forEach((l: { variante_id: string }) => {
      if (!produccionAbiertaPorVariante.has(l.variante_id)) produccionAbiertaPorVariante.set(l.variante_id, p.id);
    });
  });

  const ventasPorVariante = new Map<string, { unidades: number; monto: number }>();
  (movimientos ?? []).forEach((m) => {
    if (m.tipo !== "salida" || m.motivo !== "venta") return;
    const acc = ventasPorVariante.get(m.variante_id) ?? { unidades: 0, monto: 0 };
    acc.unidades += Math.abs(m.cantidad);
    acc.monto += Number(m.monto) || 0;
    ventasPorVariante.set(m.variante_id, acc);
  });

  const ahora = Date.now();

  // Clasificación ABC (Pareto 80/15/5) por monto vendido en la ventana, solo entre
  // variantes con ventas — el resto queda "sin rotación" (null), no forzado a C.
  const claseABCPorVariante = new Map<string, "A" | "B" | "C">();
  if (verMonto) {
    const ranking = [...ventasPorVariante.entries()]
      .filter(([, v]) => v.monto > 0)
      .sort((a, b) => b[1].monto - a[1].monto);
    const totalMonto = ranking.reduce((acc, [, v]) => acc + v.monto, 0);
    // Se clasifica según el acumulado ANTES de sumar este ítem, no después: así un
    // solo producto que ya representa, digamos, el 90% de las ventas cae en A (es el
    // motor del negocio), en vez de quedar empujado a B/C solo porque su propio
    // acumulado supera el corte de 80/95%.
    let acumuladoPrevio = 0;
    ranking.forEach(([varianteId, v]) => {
      const pctPrevio = totalMonto > 0 ? acumuladoPrevio / totalMonto : 0;
      claseABCPorVariante.set(varianteId, pctPrevio < 0.8 ? "A" : pctPrevio < 0.95 ? "B" : "C");
      acumuladoPrevio += v.monto;
    });
  }

  const resultado: VarianteInteligente[] = variantes.map((v) => {
    const ventas = ventasPorVariante.get(v.varianteId) ?? { unidades: 0, monto: 0 };
    const velocidadDiaria = ventas.unidades / ventanaDias;
    const diasInventario = velocidadDiaria > 0 ? Math.round((v.stockTotal / velocidadDiaria) * 10) / 10 : null;

    // Estancamiento = días sin VENDER (no sin cualquier salida): una bajada de almacén a
    // tienda es una salida del almacén pero no una venta, y no debe "rejuvenecer" el
    // producto. Por eso se mira ultimaVenta (sellada solo con motivo='venta' en
    // fn_aplicar_movimiento, migración 0011), no ultima_salida.
    const refFecha = v.ultimaVenta ?? v.creadaEn ?? null;
    const diasSinVenta = refFecha ? Math.floor((ahora - new Date(refFecha).getTime()) / DIA_MS) : null;
    const estancado = v.stockTotal > 0 && diasSinVenta !== null && diasSinVenta > UMBRAL_ESTANCADO_DIAS;

    const reorderPoint = Math.round((velocidadDiaria * LEAD_TIME_DIAS + v.stockMinimo) * 10) / 10;
    // Bajo mínimo POR SEDE: aunque el total de red esté sano, una tienda concreta
    // puede estar por debajo de su propio mínimo — eso también es "reponer" (o trasladar).
    const sedesBajoMinimo = Object.entries(v.minimoPorSede)
      .filter(([codigo, minimo]) => (v.stockPorSede[codigo] ?? 0) < minimo)
      .map(([codigo]) => codigo);
    const reponerYa = v.stockTotal <= reorderPoint || sedesBajoMinimo.length > 0;

    const totalConsiderado = ventas.unidades + v.stockTotal;
    const sellThrough = verMonto && totalConsiderado > 0 ? Math.round((ventas.unidades / totalConsiderado) * 1000) / 1000 : null;

    // Líder ve la red completa: la sede con 0 no tiene por qué ser la suya propia,
    // así que se evalúa cada sede como posible destino, no solo persona.sedeCodigo.
    let sugerenciaTraslado: SugerenciaTraslado | null = null;
    if (verMonto) {
      let mejor: SugerenciaTraslado | null = null;
      Object.entries(v.stockPorSede)
        .filter(([, cantidad]) => cantidad === 0)
        .forEach(([sedeDestino]) => {
          Object.entries(v.stockPorSede).forEach(([sedeOrigen, cantidad]) => {
            if (sedeOrigen === sedeDestino) return;
            if (cantidad >= Math.max(2 * v.stockMinimo, 2) && (!mejor || cantidad > mejor.stockOrigen)) {
              mejor = { sedeDestinoCodigo: sedeDestino, sedeOrigenCodigo: sedeOrigen, stockOrigen: cantidad };
            }
          });
        });
      sugerenciaTraslado = mejor;
    }

    return {
      ...v,
      vendidasVentana: ventas.unidades,
      velocidadDiaria: Math.round(velocidadDiaria * 100) / 100,
      diasInventario,
      diasSinVenta,
      estancado,
      reorderPoint,
      reponerYa,
      sedesBajoMinimo,
      produccionAbiertaId: produccionAbiertaPorVariante.get(v.varianteId) ?? null,
      silenciadaHasta: silenciadaHastaPorVariante.get(v.varianteId) ?? null,
      montoVentana: verMonto ? Math.round(ventas.monto * 100) / 100 : null,
      sellThrough,
      claseABC: verMonto ? claseABCPorVariante.get(v.varianteId) ?? null : null,
      sugerenciaTraslado,
    };
  });

  // Ya con orden en camino o pospuesta a propósito: sigue "por debajo del punto de
  // reorden" (reponerYa no cambia, es la verdad de stock), pero ya no es una alerta
  // ACTIVA que el líder tenga que resolver de nuevo — no debe seguir contando ni
  // apareciendo en el listado de pendientes.
  const alertasReposicion = resultado
    .filter((v) => v.reponerYa && !v.produccionAbiertaId && !v.silenciadaHasta)
    .sort((a, b) => (b.reorderPoint - b.stockTotal) - (a.reorderPoint - a.stockTotal))
    .slice(0, 8);

  const alertasTraslado = resultado
    .filter((v) => v.sugerenciaTraslado)
    .sort((a, b) => (b.sugerenciaTraslado?.stockOrigen ?? 0) - (a.sugerenciaTraslado?.stockOrigen ?? 0))
    .slice(0, 8);

  return { ventanaDias, variantes: resultado, alertasReposicion, alertasTraslado };
}
