import { createClient } from "@/lib/supabase/server";
import { exigir } from "@/lib/resultado";
import { ID_CARGO_ESPECIAL } from "@/lib/cargo-especial";
import { calcularEstado, type EstadoStock } from "@/lib/inventario-reglas";

// Las páginas (server) importan todo desde acá; los componentes cliente
// importan SOLO `inventario-reglas.ts`.
export * from "@/lib/inventario-reglas";

// Stock por ubicación para la pantalla de Inventario. `retail.stock` es un
// snapshot derivado de `movimientos` (nunca se edita a mano) — acá solo se
// LEE. Desde 20260914210000_inventario_piso_almacen.sql, `stock` tiene una
// fila por (variante, sububicación) cuando la ubicación separa piso de
// venta y almacén de tienda (las 2 tiendas) — Taller sigue con una sola
// fila por variante (`sububicacion_id` null), y `piso`/`almacen`/`estado`
// quedan en `null` para esa ubicación: "no aplica" nunca se disfraza de 0.
export type FilaStock = {
  varianteId: string;
  sku: string;
  talla: string | null;
  color: string | null;
  /** `#rrggbb` de `colores.hex`; null en los colores que no son un color
   *  (Estampado, Multicolor, Animal print) — la pantalla los dibuja distinto. */
  colorHex: string | null;
  referencia: string;
  categoria: string | null;
  codigosBarras: string[];
  total: number;
  piso: number | null;
  almacen: number | null;
  estado: EstadoStock | null;
};

export type ResumenInventario = {
  total: number;
  piso: number | null;
  almacen: number | null;
  requierenReposicion: number;
  separaPisoAlmacen: boolean;
};

export async function getStockPorUbicacion(ubicacionId: string): Promise<FilaStock[]> {
  const supabase = await createClient();
  const filas = exigir(
    await supabase
      .from("stock")
      .select(
        `variante_id, cantidad,
         sububicacion:sububicaciones ( tipo ),
         variante:variantes (
           sku, talla,
           color:colores ( nombre, hex ),
           producto:productos ( referencia, categoria:categorias ( nombre ) ),
           codigos_barras ( codigo )
         )`
      )
      .eq("ubicacion_id", ubicacionId)
      // La variante centinela del «Monto manual» tiene 999.999 unidades por
      // ubicación: sin esto, «Total tienda» mostraba 1.000.422 (visto en
      // producción el 2026-09-15). Ver `lib/cargo-especial.ts`.
      .neq("variante_id", ID_CARGO_ESPECIAL)
      .order("variante_id"),
    "el inventario de esta ubicación"
  );

  // Una sola ubicación es piso/almacén o no lo es — nunca "depende de la
  // variante". Se decide una vez sobre todas las filas, no por fila: una
  // prenda que todavía no tiene stock en ningún lado de la tienda igual
  // cuenta como "separa" (para mostrar SIN STOCK, no para desaparecer).
  const separaPisoAlmacen = filas.some((f) => f.sububicacion?.tipo === "piso_venta" || f.sububicacion?.tipo === "almacen_tienda");

  type Acumulado = Omit<FilaStock, "piso" | "almacen" | "estado"> & { _piso: number; _almacen: number };
  const porVariante = new Map<string, Acumulado>();

  for (const f of filas) {
    let fila = porVariante.get(f.variante_id);
    if (!fila) {
      fila = {
        varianteId: f.variante_id,
        sku: f.variante?.sku ?? "",
        talla: f.variante?.talla ?? null,
        color: f.variante?.color?.nombre ?? null,
        colorHex: f.variante?.color?.hex ?? null,
        referencia: f.variante?.producto?.referencia ?? "",
        categoria: f.variante?.producto?.categoria?.nombre ?? null,
        codigosBarras: (f.variante?.codigos_barras ?? []).map((c) => c.codigo),
        total: 0,
        _piso: 0,
        _almacen: 0,
      };
      porVariante.set(f.variante_id, fila);
    }
    fila.total += f.cantidad;
    if (f.sububicacion?.tipo === "piso_venta") fila._piso += f.cantidad;
    else if (f.sububicacion?.tipo === "almacen_tienda") fila._almacen += f.cantidad;
  }

  return Array.from(porVariante.values())
    // Taller conserva su comportamiento de siempre (solo lo que tiene
    // stock); una tienda muestra también lo que llegó a 0 — es justo el
    // estado SIN STOCK que el pedido quiere ver, no un vacío silencioso.
    .filter((f) => separaPisoAlmacen || f.total > 0)
    .map(({ _piso, _almacen, ...resto }) => ({
      ...resto,
      piso: separaPisoAlmacen ? _piso : null,
      almacen: separaPisoAlmacen ? _almacen : null,
      estado: separaPisoAlmacen ? calcularEstado(_piso, _almacen) : null,
    }))
    .sort((a, b) => a.referencia.localeCompare(b.referencia, "es") || (a.sku ?? "").localeCompare(b.sku ?? "", "es"));
}

export function resumirInventario(filas: FilaStock[]): ResumenInventario {
  const separaPisoAlmacen = filas.some((f) => f.piso !== null);
  return {
    total: filas.reduce((acc, f) => acc + f.total, 0),
    piso: separaPisoAlmacen ? filas.reduce((acc, f) => acc + (f.piso ?? 0), 0) : null,
    almacen: separaPisoAlmacen ? filas.reduce((acc, f) => acc + (f.almacen ?? 0), 0) : null,
    requierenReposicion: filas.filter((f) => f.estado === "reponer_piso").length,
    separaPisoAlmacen,
  };
}
