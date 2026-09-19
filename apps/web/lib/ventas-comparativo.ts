import { createClient } from "@/lib/supabase/server";
import { tolerar } from "@/lib/resultado";
import { horaDeLima, ventanaHastaEstaHora } from "@/lib/facturacion-resumen-reglas";
import type { VentaEnHora } from "@/lib/facturacion-resumen-graficos";

// La referencia de «Vendido hoy» y de «Ventas» en el Resumen (spec §9): lo que se vendió el
// MISMO día de la semana pasada, hasta esta misma hora de Lima. No se compara contra «ayer»: un
// día parcial contra un día entero pinta un rojo sin sentido, y un lunes contra un domingo no es
// comparable en una tienda.
//
// Mide lo mismo que «Vendido hoy»: la suma de `venta_items.subtotal` (lo cobrado en el
// mostrador, con IGV — la definición de ADR-0110) de las ventas `completada` de la ventana. Es
// un dato secundario: si la lectura falla, `null` y la tarjeta se queda sin comparativo (nunca
// uno inventado).
export type VentasDeReferencia = { ventas: VentaEnHora[]; total: number };

export async function getVentasDeReferencia(diasAtras = 7): Promise<VentasDeReferencia | null> {
  const { desde, hasta } = ventanaHastaEstaHora(new Date(), diasAtras);
  const supabase = await createClient();
  const res = await supabase
    .from("ventas")
    .select("created_at, venta_items(subtotal)")
    .eq("estado", "completada")
    .gte("created_at", desde)
    .lt("created_at", hasta);
  const { datos, fallo } = tolerar(res, "las ventas de la semana pasada");
  // `fallo` es el aviso para la persona; la causa real (Postgres) es para quien lea el log.
  if (fallo) console.error("Facturación: no se pudo leer la referencia de la semana pasada (comparativo del Resumen):", res.error?.message);
  if (!datos) return null;

  const ventas = datos.map((v) => ({
    hora: horaDeLima(v.created_at),
    monto: (v.venta_items ?? []).reduce((suma, item) => suma + Number(item.subtotal ?? 0), 0),
  }));
  return { ventas, total: Math.round(ventas.reduce((suma, v) => suma + v.monto, 0) * 100) / 100 };
}
