import { createClient } from "@/lib/supabase/server";
import { exigir } from "@/lib/resultado";
import { getCatalogo } from "@/lib/catalogo-v2";
import { nombreCortoSede } from "@/lib/stock-por-sede";
import { detectarCurvasIncompletas, type ProductoColorSede, type CurvaIncompleta } from "@/lib/curva-variantes";
import { type EstadoResumen } from "@/lib/inventario-reglas";

// Resumen de Inventario (2026-09-17, ADR-0097): la pantalla de "qué decidir
// hoy" — distinta de Existencias, que sigue siendo "qué hay en ESTA fila,
// ahora" (ver ADR-0097 para el porqué de separarlas). Compone tres fuentes
// que YA existen, ninguna se duplica:
//   - `retail.fn_resumen_inventario()` (RPC nueva, 20260917220000): cobertura
//     y sell-through por producto, a nivel red.
//   - `getCatalogo()` (ya existía): metadatos de cada variante.
//   - `retail.fn_stock_por_sede()` (ya existía, la misma que usa Vender):
//     cuánto hay de cada variante en cada sede.

export type FilaResumenProducto = {
  productoId: string;
  referencia: string;
  categoria: string | null;
  stockTotal: number;
  stockMinimo: number | null;
  ventaNeta30d: number;
  merma30d: number;
  demandaDiaria: number;
  /** null = no hay demanda medible en la ventana; no confundir con 0 días. */
  coberturaDias: number | null;
  enCamino: number;
  coberturaProyectadaDias: number | null;
  /** null = no hay base para calcularlo (sin stock, sin venta, sin merma). */
  sellThroughPct: number | null;
  puntoReorden: number;
  reponerDeProveedor: boolean;
  estado: EstadoResumen;
};

export type SugerenciaTraslado = {
  productoId: string;
  referencia: string;
  color: string | null;
  colorHex: string | null;
  tallaFaltante: string;
  sedeDestinoId: string;
  sedeDestinoNombre: string;
  sedeOrigenId: string;
  sedeOrigenNombre: string;
  cantidadDisponibleOrigen: number;
};

export type ResumenInventarioCompleto = {
  productos: FilaResumenProducto[];
  curvasIncompletas: CurvaIncompleta[];
  sugerenciasTraslado: SugerenciaTraslado[];
};

async function getFilasProducto(): Promise<FilaResumenProducto[]> {
  const supabase = await createClient();
  const filas = exigir(await supabase.rpc("fn_resumen_inventario"), "el resumen de inventario");
  return filas.map((f) => ({
    productoId: f.producto_id,
    referencia: f.referencia,
    categoria: f.categoria_nombre,
    stockTotal: f.stock_total,
    stockMinimo: f.stock_minimo,
    ventaNeta30d: f.venta_neta_30d,
    merma30d: f.merma_30d,
    demandaDiaria: Number(f.demanda_diaria),
    coberturaDias: f.cobertura_dias == null ? null : Number(f.cobertura_dias),
    enCamino: f.en_camino,
    coberturaProyectadaDias: f.cobertura_proyectada_dias == null ? null : Number(f.cobertura_proyectada_dias),
    sellThroughPct: f.sell_through_pct == null ? null : Number(f.sell_through_pct),
    puntoReorden: f.punto_reorden,
    reponerDeProveedor: f.reponer_de_proveedor,
    estado: f.estado as EstadoResumen,
  }));
}

/** Curvas incompletas + sugerencias de traslado — comparten el mismo
 *  cómputo base (catálogo × stock por sede), por eso van juntas. */
async function getCurvasYSugerencias(
  ubicaciones: { id: string; nombre: string }[]
): Promise<{ curvas: CurvaIncompleta[]; sugerencias: SugerenciaTraslado[] }> {
  const supabase = await createClient();
  const [catalogo, stockRes] = await Promise.all([
    getCatalogo(),
    supabase.rpc("fn_stock_por_sede"),
  ]);
  const stockPorSede = exigir(stockRes, "el stock por sede") as { variante_id: string; ubicacion_id: string; cantidad: number }[];

  // variante_id -> Map<ubicacion_id, cantidad>
  const stockPorVariante = new Map<string, Map<string, number>>();
  for (const s of stockPorSede) {
    let m = stockPorVariante.get(s.variante_id);
    if (!m) stockPorVariante.set(s.variante_id, (m = new Map()));
    m.set(s.ubicacion_id, (m.get(s.ubicacion_id) ?? 0) + s.cantidad);
  }

  // Agrupa por producto+color+sede — una curva es por color, nunca el
  // producto entero (dos colores del mismo modelo no comparten curva).
  const grupos = new Map<string, ProductoColorSede>();
  for (const v of catalogo) {
    if (!v.activo || v.talla === null) continue;
    const cantidadPorSede = stockPorVariante.get(v.varianteId);
    for (const u of ubicaciones) {
      const clave = `${v.productoId}::${v.color ?? ""}::${u.id}`;
      let g = grupos.get(clave);
      if (!g) {
        g = {
          productoId: v.productoId,
          referencia: v.referencia,
          color: v.color,
          colorHex: v.colorHex,
          sedeId: u.id,
          sedeNombre: nombreCortoSede(u.nombre),
          variantes: [],
        };
        grupos.set(clave, g);
      }
      g.variantes.push({ varianteId: v.varianteId, talla: v.talla, stock: cantidadPorSede?.get(u.id) ?? 0 });
    }
  }

  const curvas = detectarCurvasIncompletas([...grupos.values()]);

  // Sugerencia de traslado: para cada hueco, ¿alguna OTRA sede tiene esa
  // variante puntual (mismo producto+color+talla) en stock? Se sugiere la
  // que más tiene. No se ofrece nada si ninguna sede la tiene — eso ya lo
  // cubre "riesgo de quiebre" a nivel red, no hay de dónde redistribuir.
  const sugerencias: SugerenciaTraslado[] = [];
  for (const hueco of curvas) {
    const variante = catalogo.find(
      (v) => v.productoId === hueco.productoId && v.color === hueco.color && v.talla === hueco.tallaFaltante
    );
    if (!variante) continue;
    const porSede = stockPorVariante.get(variante.varianteId);
    if (!porSede) continue;
    let mejor: { sedeId: string; cantidad: number } | null = null;
    for (const u of ubicaciones) {
      if (u.id === hueco.sedeId) continue;
      const cantidad = porSede.get(u.id) ?? 0;
      if (cantidad > 0 && (!mejor || cantidad > mejor.cantidad)) mejor = { sedeId: u.id, cantidad };
    }
    if (mejor) {
      const sedeOrigen = ubicaciones.find((u) => u.id === mejor!.sedeId);
      sugerencias.push({
        productoId: hueco.productoId,
        referencia: hueco.referencia,
        color: hueco.color,
        colorHex: hueco.colorHex,
        tallaFaltante: hueco.tallaFaltante,
        sedeDestinoId: hueco.sedeId,
        sedeDestinoNombre: hueco.sedeNombre,
        sedeOrigenId: mejor.sedeId,
        sedeOrigenNombre: sedeOrigen ? nombreCortoSede(sedeOrigen.nombre) : "",
        cantidadDisponibleOrigen: mejor.cantidad,
      });
    }
  }

  return { curvas, sugerencias };
}

export async function getResumenInventario(ubicaciones: { id: string; nombre: string }[]): Promise<ResumenInventarioCompleto> {
  const [productos, { curvas, sugerencias }] = await Promise.all([
    getFilasProducto(),
    getCurvasYSugerencias(ubicaciones),
  ]);
  return { productos, curvasIncompletas: curvas, sugerenciasTraslado: sugerencias };
}
