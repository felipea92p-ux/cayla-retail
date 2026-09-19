import { createClient } from "@/lib/supabase/server";
import { exigir } from "@/lib/resultado";
import { hoyLima } from "@/lib/etiqueta-vigencia";
import { getUbicaciones } from "@/lib/ubicaciones";
import { DIAS_PLAZO_CAMBIO } from "@/lib/cambios-reglas";
import {
  agrupar,
  danadasPorTienda,
  ultimosMeses,
  type CalidadAgrupada,
  type DanadasDeTienda,
  type FilaCalidad,
  type FilaDanadas,
  type NivelCalidad,
} from "@/lib/calidad-reglas";

// Panel de calidad (ADR-0113). Dos fuentes, ninguna inventada acá:
//   - `retail.fn_calidad`          : unidades vendidas, devueltas, dañadas y cambiadas por producto, talla, origen
//                                    (proveedor o Taller) y categoría, sobre una cohorte de ventas que ya cumplió su plazo.
//   - `retail.fn_calidad_danadas`  : prendas que volvieron dañadas, por tienda y por mes.
//   - `calidad-reglas.ts`          : qué significan esos números (única casa de las reglas).
// Este archivo NO suma ni promedia: solo trae, nombra y ordena.
//
// El plazo de cambio se lee de `DIAS_PLAZO_CAMBIO` (cambios-reglas.ts) y se le PASA al SQL: hay una sola cifra de
// "cuántos días tiene una clienta para cambiar", y el panel de calidad no puede discrepar de la pantalla de Cambios.
//
// Es dinero y decisiones de compra: se usa `exigir()`. Si una consulta falla, la pantalla NO se dibuja.
//
// SE ROMPE SI: la migración `20260918192000_panel_calidad.sql` no está aplicada en la base a la que apunta la app
// (`rpc()` responde "function does not exist"). Orden de despliegue: primero el SQL, después el código.

/** Cuántos días de ventas mira el panel (además de esperar el plazo de cambio). */
export const VENTANA_DIAS = 90;
/** Cuántos meses hacia atrás muestra la tabla de prendas dañadas. */
export const MESES_DANADAS = 6;

export type DanadasTienda = DanadasDeTienda & { nombre: string };

export type PanelCalidad = {
  fecha: string;
  plazoDias: number;
  ventanaDias: number;
  /** Primer y último día (inclusive) de las ventas analizadas, `YYYY-MM-DD`, en hora de Lima. */
  cohorteDesde: string;
  cohorteHasta: string;
  calidad: CalidadAgrupada;
  meses: string[];
  danadas: DanadasTienda[];
};

export async function getPanelCalidad(): Promise<PanelCalidad> {
  const supabase = await createClient();
  const fecha = hoyLima();

  const [rCalidad, rDanadas, ubicaciones] = await Promise.all([
    supabase.rpc("fn_calidad", { p_dia: fecha, p_dias: VENTANA_DIAS, p_plazo_dias: DIAS_PLAZO_CAMBIO }),
    supabase.rpc("fn_calidad_danadas", { p_dia: fecha, p_meses: MESES_DANADAS }),
    getUbicaciones(),
  ]);
  const crudas = exigir(rCalidad, "la calidad de las ventas");
  const crudasDanadas = exigir(rDanadas, "las prendas dañadas");

  const filas: FilaCalidad[] = crudas.map((f) => ({
    nivel: f.nivel as NivelCalidad,
    clave: f.clave,
    etiqueta: f.etiqueta,
    vendidas: f.unidades_vendidas,
    devueltas: f.unidades_devueltas,
    vendibles: f.devueltas_vendibles,
    danadas: f.devueltas_danadas,
    aProveedor: f.devueltas_a_proveedor,
    cambiadas: f.unidades_cambiadas,
  }));

  const filasDanadas: FilaDanadas[] = crudasDanadas.map((f) => ({
    ubicacionId: f.ubicacion_id,
    mes: f.mes,
    condicion: f.condicion,
    origen: f.origen as FilaDanadas["origen"],
    unidades: f.unidades,
  }));

  const tiendas = ubicaciones.filter((u) => u.tipo === "tienda");
  const meses = ultimosMeses(fecha, MESES_DANADAS);
  const nombrePorId = new Map(tiendas.map((t) => [t.id, t.nombre]));

  return {
    fecha,
    plazoDias: DIAS_PLAZO_CAMBIO,
    ventanaDias: VENTANA_DIAS,
    cohorteDesde: crudas[0]?.cohorte_desde ?? fecha,
    cohorteHasta: crudas[0]?.cohorte_hasta ?? fecha,
    calidad: agrupar(filas),
    meses,
    danadas: danadasPorTienda(filasDanadas, tiendas.map((t) => t.id), meses).map((d) => ({
      ...d,
      nombre: nombrePorId.get(d.ubicacionId) ?? "Tienda",
    })),
  };
}
