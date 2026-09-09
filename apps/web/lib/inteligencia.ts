import { createClient } from "@/lib/supabase/server";
import type { PersonaActual } from "@/lib/persona";
import { getCatalogoConStock, type VarianteConStock } from "@/lib/catalogo";
import { exigir } from "@/lib/resultado";
import { UMBRAL_ESTANCADO_DIAS, LEAD_TIME_DIAS } from "@cayla-retail/shared";

const DIA_MS = 86400000;

export type SugerenciaTraslado = {
  sedeDestinoCodigo: string;
  sedeOrigenCodigo: string;
  stockOrigen: number;
  /** Lo que hay hoy en la sede que necesita. */
  stockDestino: number;
  /** El límite de esa sede: el suyo propio si alguien lo fijó, si no el general. */
  limiteDestino: number;
  /** Cuántas puede ceder el origen sin bajar de su propio límite. */
  sobranteOrigen: number;
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

  // Las 2 consultas son independientes entre sí — en paralelo en vez de encadenadas.
  // La última venta y la fecha de alta por variante ya vienen calculadas en
  // getCatalogoConStock (misma fila de `stock`/`variantes` que ya trae cantidad y
  // created_at), así que no se vuelven a pedir esas tablas acá.
  const [variantes, resMovimientos] = await Promise.all([
    getCatalogoConStock(persona),
    supabase
      .from("movimientos")
      .select("variante_id, tipo, cantidad, motivo, monto, created_at")
      .gte("created_at", desde.toISOString()),
  ]);

  // De acá salen rotación, clase ABC y qué reponer: son decisiones de compra con
  // plata detrás. Sin movimientos, TODO el catálogo parece estancado y la sugerencia
  // sería dejar de reponer lo que más se vende.
  const movimientos = exigir(resMovimientos, "los movimientos de la ventana");

  const ventasPorVariante = new Map<string, { unidades: number; monto: number }>();
  movimientos.forEach((m) => {
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
      // El límite lo pone la encargada por sede en /producto/[varianteId] (RPC
      // `fijar_stock_minimo`). Dejarlo vacío significa "usa el mínimo general"
      // — es lo que promete `MinimosPorSede` y lo que se respeta acá.
      const limiteDe = (codigo: string) => v.minimoPorSede[codigo] ?? v.stockMinimo;

      let mejor: SugerenciaTraslado | null = null;
      Object.entries(v.stockPorSede)
        // Destino: la sede cayó por debajo de SU propio límite (decisión de
        // Felipe, 2026-09-09). Antes solo avisaba con la sede en cero exacto,
        // y una tienda con 1 unidad de algo que vuela está casi igual de mal.
        // El `max(limite, 1)` conserva la regla vieja cuando no hay límite
        // fijado: nada de lo que hoy avisa deja de avisar.
        .filter(([codigo, cantidad]) => cantidad < Math.max(limiteDe(codigo), 1))
        .forEach(([sedeDestino, stockDestino]) => {
          Object.entries(v.stockPorSede).forEach(([sedeOrigen, cantidad]) => {
            if (sedeOrigen === sedeDestino) return;
            // El origen tampoco puede quedar por debajo del suyo: tapar un hueco
            // abriendo otro no es una sugerencia, es mover el problema de tienda.
            const sobranteOrigen = cantidad - limiteDe(sedeOrigen);
            if (sobranteOrigen < 1 || cantidad < 2) return;
            if (!mejor || sobranteOrigen > mejor.sobranteOrigen) {
              mejor = {
                sedeDestinoCodigo: sedeDestino,
                sedeOrigenCodigo: sedeOrigen,
                stockOrigen: cantidad,
                stockDestino,
                limiteDestino: limiteDe(sedeDestino),
                sobranteOrigen,
              };
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
      montoVentana: verMonto ? Math.round(ventas.monto * 100) / 100 : null,
      sellThrough,
      claseABC: verMonto ? claseABCPorVariante.get(v.varianteId) ?? null : null,
      sugerenciaTraslado,
    };
  });

  const alertasReposicion = resultado
    .filter((v) => v.reponerYa)
    .sort((a, b) => (b.reorderPoint - b.stockTotal) - (a.reorderPoint - a.stockTotal))
    .slice(0, 8);

  // Primero la sede que más lejos quedó de su límite, no la que más tiene para
  // ceder: lo urgente es el hueco, no el excedente.
  const faltanEnDestino = (v: VarianteInteligente) => {
    const t = v.sugerenciaTraslado;
    return t ? Math.max(t.limiteDestino, 1) - t.stockDestino : 0;
  };
  const alertasTraslado = resultado
    .filter((v) => v.sugerenciaTraslado)
    .sort(
      (a, b) =>
        faltanEnDestino(b) - faltanEnDestino(a) ||
        (b.sugerenciaTraslado?.sobranteOrigen ?? 0) - (a.sugerenciaTraslado?.sobranteOrigen ?? 0)
    )
    .slice(0, 8);

  return { ventanaDias, variantes: resultado, alertasReposicion, alertasTraslado };
}
