// Reglas puras del Inicio (sin Supabase ni React): qué se le muestra a quién y cómo se lee cada cifra.
// Viven acá y no en `page.tsx` para poder probarlas (auditoría docs/pantallas/inicio.md, tarea #11) y porque
// un Server Component no puede llamar funciones de un archivo "use client" (CLAUDE.md).
//
// Aquí viven las cifras del día («Hoy» / «Tu día»). Los avisos de «Te toca», los accesos y «Equipo de hoy» viven en
// `inicio-avisos.ts` (spike docs/maquetas/inicio-movil-roles-2026-09/, 2026-09-26).

import { comparativoSemanaAnterior, type Comparativo } from "./caja-panel-reglas";
import type { ClaveModulo } from "./modulos";

export type PerfilInicio = {
  rol: "lider" | "integrante";
  ubicacionTipo: "tienda" | "almacen" | "taller";
  /** ¿Quien mira es una cuenta TERMINAL (un aparato, ADR-0162)? Una que ve el Punto de venta nunca llega acá: aterriza en
   *  `/vender` (`aterrizajeDe` en `lib/menu.ts`). Las que llegan no venden: su casa es lo que su rol ve. */
  terminal?: boolean;
  /** Los módulos de su rol. */
  modulos?: readonly ClaveModulo[];
};

// ── «Hoy» ────────────────────────────────────────────────────────────────────────────────────────

/** Solo las tiendas venden: en un almacén o en el Taller no hay «ventas de hoy» que mostrar. Tampoco una terminal que
 *  llega a Inicio: si su rol viera el Punto de venta habría aterrizado en `/vender`, así que no vende y un «Tu día» de
 *  ventas no le dice nada. */
export function mostrarHoy(perfil: Pick<PerfilInicio, "ubicacionTipo" | "terminal">): boolean {
  return perfil.ubicacionTipo === "tienda" && !perfil.terminal;
}

const DIAS = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"] as const;

/** Nombre del día de HOY en hora de Lima (fija UTC−5, Perú no cambia la hora: mismo criterio que `panel-serie.ts`).
 *  Sirve para el «vs. viernes pasado»: el comparativo dice de qué día habla, no un genérico «semana pasada». */
export function nombreDiaLima(ahoraMs: number): string {
  return DIAS[new Date(ahoraMs - 5 * 3600 * 1000).getUTCDay()]!;
}

export type Meta = { pct: number; barra: number; falta: number; meta: number };

export type ResumenHoy = {
  importe: number;
  ventas: number;
  /** null = sin ventas: un promedio sin ventas no es cero, es «no hay». */
  valorMedio: number | null;
  /** null = no hay con qué comparar (semana pasada en cero, o no se pudo leer). */
  comparativo: Comparativo | null;
  /** null = la sede no tiene meta configurada (`ubicaciones.meta_venta_diaria`). */
  meta: Meta | null;
};

/**
 * @param totales    el `total` de cada venta del día (lo que devuelve `fn_ventas_del_dia`; una colaboradora
 *                   recibe solo las suyas, así que «Tus ventas» sale sin filtrar nada acá).
 * @param semanaAnterior lo vendido el mismo día de la semana pasada hasta esta misma hora; null si no aplica.
 */
export function resumirHoy(
  totales: number[],
  semanaAnterior: number | null,
  metaVentaDiaria: number | null,
  nombreDiaPasado: string
): ResumenHoy {
  const importe = totales.reduce((a, t) => a + t, 0);
  const ventas = totales.length;
  const meta =
    metaVentaDiaria && metaVentaDiaria > 0
      ? {
          pct: Math.round((importe / metaVentaDiaria) * 100),
          barra: Math.min(100, Math.round((importe / metaVentaDiaria) * 100)),
          falta: Math.max(0, metaVentaDiaria - importe),
          meta: metaVentaDiaria,
        }
      : null;
  return {
    importe,
    ventas,
    valorMedio: ventas > 0 ? importe / ventas : null,
    comparativo: semanaAnterior === null ? null : comparativoSemanaAnterior(importe, semanaAnterior, nombreDiaPasado),
    meta,
  };
}
