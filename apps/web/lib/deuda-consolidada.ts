import { createClient } from "@/lib/supabase/server";
import { exigir, leerTodas } from "@/lib/resultado";
import type { DeudaFila, IgvMes } from "@/lib/por-pagar-produccion-reglas";

// D-I (ADR-0133, F4c): dos lecturas de SOLO LECTURA para el líder que suman los libros de Compras y de Producción sin modificar ninguno.
// `fn_deuda_consolidada` = cuánto se debe a cada proveedor de los dos módulos; `fn_igv_credito_fiscal` = el IGV del mes de los dos libros
// menos el de las notas de crédito de Compras. Para quien no es líder ambas responden cero filas.

export async function getDeudaConsolidada(): Promise<DeudaFila[]> {
  const supabase = await createClient();
  // Una fila por proveedor y libro: hoy decenas, pero PostgREST cortaría en 1.000 sin avisar y la deuda total saldría
  // menor. Por páginas, en serie (ADR-0192), mayor saldo primero como la función; (origen, proveedor) es único.
  const filas = exigir(
    await leerTodas(
      (desde, hasta) =>
        supabase.rpc("fn_deuda_consolidada").order("saldo", { ascending: false }).order("origen").order("proveedor_id").range(desde, hasta),
      { enParalelo: 1 },
    ),
    "la deuda consolidada",
  );
  return filas.map((f) => ({
    origen: f.origen as DeudaFila["origen"],
    proveedorId: f.proveedor_id,
    proveedor: f.proveedor,
    comprobantes: Number(f.comprobantes),
    saldo: Number(f.saldo),
    vencido: Number(f.vencido),
    proximoVencimiento: f.proximo_vencimiento,
  }));
}

export async function getIgvDelMes(): Promise<IgvMes | null> {
  const supabase = await createClient();
  const [f] = exigir(await supabase.rpc("fn_igv_credito_fiscal"), "el IGV del mes");
  if (!f) return null;
  return { mes: f.mes, igvCompras: Number(f.igv_compras), igvProduccion: Number(f.igv_produccion), igvNotasCredito: Number(f.igv_notas_credito), igvNeto: Number(f.igv_neto) };
}
