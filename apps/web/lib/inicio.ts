import { createClient } from "@/lib/supabase/server";
import { getCajaAbierta, getVentasMismaHoraSemanaAnterior } from "@/lib/caja";
import { getUbicaciones } from "@/lib/ubicaciones";
import { nombreDiaLima } from "@/lib/inicio-reglas";

// Lecturas del bloque «Hoy» del Inicio. Reutiliza las MISMAS fuentes que Caja (`fn_ventas_del_dia`,
// `getVentasMismaHoraSemanaAnterior`, `ubicaciones.meta_venta_diaria`) para que las dos pantallas nunca
// discrepen en qué es «hoy» (docs/datos/11-KPIS.md, «Qué lo rompe» a: dos fuentes que nada obliga a cuadrar).
//
// Cada pieza falla POR SEPARADO y devuelve null: «Hoy» es un dato secundario del que nadie decide plata
// mirando un solo número, pero un cero mudo sí engañaría — por eso la pantalla distingue «0 ventas» de
// «no se pudo leer». Sin `exigir`: si una pieza cae, las demás se muestran igual.

export type HoyDeLaSede = {
  /** null = no se pudo leer (no es lo mismo que «cerrada»). */
  cajaAbierta: boolean | null;
  /** El `total` de cada venta del día. Para una colaboradora la RPC devuelve solo las suyas. null = falló. */
  totales: number[] | null;
  /** Solo la líder ve el comparativo y la meta: son cifras de toda la sede. null = no aplica o falló. */
  semanaAnterior: number | null;
  metaVentaDiaria: number | null;
  /** «viernes»: el día de hoy en Lima, para decir «vs. viernes pasado». Se calcula acá (no en el componente) porque
   *  `Date.now()` es impuro y un componente no debe llamarlo. */
  nombreDia: string;
};

async function tolerarLectura<T>(que: string, leer: () => Promise<T>): Promise<T | null> {
  try {
    return await leer();
  } catch (e) {
    console.error(`Inicio · no se pudo leer ${que}:`, e);
    return null;
  }
}

export async function getHoyDeLaSede(ubicacionId: string, esLider: boolean): Promise<HoyDeLaSede> {
  const supabase = await createClient();
  const [caja, totales, semanaAnterior, ubicaciones] = await Promise.all([
    // `getCajaAbierta` devuelve null cuando NO hay caja abierta: no es un fallo. Un fallo real (lanza) se vuelve null
    // acá, y por eso se separan: abierta = true, cerrada = false, no se pudo leer = null.
    getCajaAbierta(ubicacionId).then(
      (caja): boolean | null => caja !== null,
      (e): boolean | null => {
        console.error("Inicio · no se pudo leer la caja:", e);
        return null;
      }
    ),
    tolerarLectura("las ventas de hoy", async () => {
      const res = await supabase.rpc("fn_ventas_del_dia", { p_ubicacion_id: ubicacionId });
      if (res.error) throw new Error(res.error.message);
      return (res.data ?? []).map((v) => Number(v.total));
    }),
    esLider ? tolerarLectura("las ventas de la semana pasada", () => getVentasMismaHoraSemanaAnterior(ubicacionId)) : Promise.resolve(null),
    esLider ? tolerarLectura("la meta de la sede", () => getUbicaciones()) : Promise.resolve(null),
  ]);

  return {
    cajaAbierta: caja,
    totales,
    semanaAnterior,
    metaVentaDiaria: ubicaciones?.find((u) => u.id === ubicacionId)?.metaVentaDiaria ?? null,
    nombreDia: nombreDiaLima(Date.now()),
  };
}
