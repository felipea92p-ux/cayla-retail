import "server-only";
import { createClient } from "@/lib/supabase/server";
import { getParametrosFinanzas } from "@/lib/configuracion";
import { getParametrosTributarios } from "@/lib/impuestos";
import { getEstadoResultados } from "@/lib/resultados";
import { armarRentaDelAno, desdeDelSistema, leerFilaSustento, type RentaPantalla } from "@/lib/renta-anual-reglas";

// Finanzas ▸ Impuestos, la renta de marzo (ADR-0598). Lee en paralelo lo que el año necesita: el costo por papel (`fn_sustento_costos`, solo el líder),
// la utilidad y el costo de lo vendido del Estado de resultados, lo vendido sin IGV (para el 1 % a cuenta), los parámetros y el inicio de Finanzas.
// Si una lectura falla, la tarjeta lo dice y el resto de Impuestos se ve igual (principio 9): nunca una renta calculada sobre ceros.

type Lectura<T> = { datos: T; falla: string | null };

export async function getRentaDelAno(hoy: string): Promise<Lectura<RentaPantalla | null>> {
  const supabase = await createClient();
  const anio = Number(hoy.slice(0, 4));
  const [finanzas, parametros] = await Promise.all([getParametrosFinanzas(), getParametrosTributarios()]);
  if (parametros.falla) return { datos: null, falla: parametros.falla };
  const desde = desdeDelSistema(anio, finanzas?.inicioFinanzas ?? null);
  const [sustento, er, meses] = await Promise.all([
    supabase.rpc("fn_sustento_costos" as never, { p_desde: desde, p_hasta: hoy } as never),
    getEstadoResultados(desde, hoy),
    supabase.rpc("fn_impuestos_igv_meses" as never, { p_desde: desde, p_hasta: hoy } as never),
  ]);
  if (sustento.error) return { datos: null, falla: `No se pudo leer el costo por papel: ${sustento.error.message}` };
  if (er.falla) return { datos: null, falla: er.falla };
  if (meses.error) return { datos: null, falla: `No se pudo leer lo vendido: ${meses.error.message}` };
  const consolidado = er.datos.find((f) => f.unidad === "consolidado");
  if (!consolidado) return { datos: null, falla: "El Estado de resultados no trajo el consolidado de CAYLA." };
  const ventasSinIgv = ((meses.data ?? []) as Record<string, unknown>[]).reduce((s, m) => s + Number(m.base_ventas ?? 0), 0);
  const datos = armarRentaDelAno({
    hoy,
    inicioFinanzas: finanzas?.inicioFinanzas ?? null,
    parametros: parametros.datos,
    filas: ((sustento.data ?? []) as Record<string, unknown>[]).map(leerFilaSustento),
    utilidad: consolidado.resultado,
    costoVentas: consolidado.costo,
    ventasSinIgv,
  });
  return { datos, falla: datos ? null : "Falta la escala de la renta o la UIT del año en Configuración ▸ Impuestos." };
}
