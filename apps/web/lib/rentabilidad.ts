import { createClient } from "@/lib/supabase/server";
import { exigir } from "@/lib/resultado";
import { hoyLima } from "@/lib/etiqueta-vigencia";
import { IGV_TASA } from "@/lib/registro-contable";
import { agrupar, type FilaRentabilidad, type NivelRentabilidad, type RentabilidadAgrupada } from "@/lib/rentabilidad-reglas";

// Panel de rentabilidad (ADR-0118). Dos fuentes, ninguna inventada acá:
//   - `retail.fn_rentabilidad`  : unidades, venta neta (SIN IGV), costo, descuento, devoluciones y stock por producto,
//                                 categoría, temporada y origen (proveedor o Taller).
//   - `rentabilidad-reglas.ts`  : qué significan esos números (única casa de las reglas).
// Este archivo NO suma ni promedia: solo trae, nombra y ordena.
//
// El IGV se PASA al SQL (`p_igv`) en vez de vivir escrito adentro: el margen depende de él (venta neta = pagado ÷ (1 + IGV))
// y una tasa escondida en una función es la que nadie se acuerda de cambiar. Hoy la tasa sale de `IGV_TASA`
// (registro-contable.ts), que es la que ya importan otros dos archivos; ADR-0109 prevé una tabla de parámetros tributarios.
//
// Es dinero y decisiones de precio y compra: se usa `exigir()`. Si la consulta falla, la pantalla NO se dibuja.
//
// SE ROMPE SI: la migración `20260918194000_panel_rentabilidad.sql` no está aplicada en la base a la que apunta la app
// (`rpc()` responde "function does not exist"). Orden de despliegue: primero el SQL, después el código.

/** Cuántos días de ventas mira el panel (hoy incluido). */
export const VENTANA_DIAS_RENTABILIDAD = 90;

export type PanelRentabilidad = {
  fecha: string;
  /** Primer y último día de las ventas analizadas, `YYYY-MM-DD`, en hora de Lima. */
  desde: string;
  hasta: string;
  diasVentana: number;
  /** Tasa de IGV con la que se calculó la venta neta. */
  igv: number;
  rentabilidad: RentabilidadAgrupada;
};

export async function getPanelRentabilidad(): Promise<PanelRentabilidad> {
  const supabase = await createClient();
  const fecha = hoyLima();

  const crudas = exigir(
    await supabase.rpc("fn_rentabilidad", { p_dia: fecha, p_dias: VENTANA_DIAS_RENTABILIDAD, p_igv: IGV_TASA }),
    "la rentabilidad de las ventas"
  );

  const filas: FilaRentabilidad[] = crudas.map((f) => ({
    nivel: f.nivel as NivelRentabilidad,
    clave: f.clave,
    etiqueta: f.etiqueta,
    unidades: f.unidades,
    ventaNeta: Number(f.venta_neta),
    ventaNetaConCosto: Number(f.venta_neta_con_costo),
    costo: Number(f.costo),
    unidadesSinCosto: f.unidades_sin_costo,
    descuento: Number(f.descuento),
    devueltas: f.unidades_devueltas,
    stock: f.stock === null ? null : f.stock,
    diasVentana: f.dias_ventana,
  }));

  return {
    fecha,
    desde: crudas[0]?.desde ?? fecha,
    hasta: crudas[0]?.hasta ?? fecha,
    diasVentana: VENTANA_DIAS_RENTABILIDAD,
    igv: IGV_TASA,
    rentabilidad: agrupar(filas),
  };
}
