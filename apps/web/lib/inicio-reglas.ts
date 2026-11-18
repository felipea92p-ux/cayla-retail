// Reglas puras del Inicio (sin Supabase ni React): qué se le muestra a quién y cómo se lee cada cifra.
// Viven acá y no en `page.tsx` para poder probarlas (auditoría docs/pantallas/inicio.md, tarea #11) y porque
// un Server Component no puede llamar funciones de un archivo "use client" (CLAUDE.md).
//
// Aquí viven las cifras del día («Hoy» / «Tu día»). Los avisos de «Te toca», los accesos y «Equipo de hoy» viven en
// `inicio-avisos.ts` (spike docs/maquetas/inicio-movil-roles-2026-09/, 2026-09-26).

import { comparativoSemanaAnterior, type Comparativo } from "./caja-panel-reglas";
import { soles } from "./compras-reglas";
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

/**
 * Qué función de la base lee «las ventas de hoy» de cada perfil. La líder ve el día de TODA la sede; una integrante,
 * SOLO lo que ella atendió (`ventas.asesora_id`). Es una regla aparte, y con prueba, porque `fn_ventas_del_dia` le devolvía
 * a una integrante todas las ventas de su tienda y el Inicio las mostraba como «Tus ventas» y «Tu ticket» (verificado en
 * producción el 2026-09-29). Caja, Vender y Comprobantes siguen usando `fn_ventas_del_dia`: necesitan el día de la tienda.
 */
export function fuenteVentasDeHoy(esLider: boolean): "fn_ventas_del_dia" | "fn_mis_ventas_del_dia" {
  return esLider ? "fn_ventas_del_dia" : "fn_mis_ventas_del_dia";
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
 * @param totales    el `total` de cada venta del día: el de TODA la sede para la líder (`fn_ventas_del_dia`) y solo el de las
 *                   ventas atendidas por la persona para una integrante (`fn_mis_ventas_del_dia`), así que «Tus ventas» sale
 *                   sin filtrar nada acá.
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

// ── Lo de CLAURE no suma en «Hoy» (ADR-0560, actividad 6a) ───────────────────────────────────────────
// En Tienda LIM se vende lo de CAYLA y lo de CLAURE (de Claudia) en la misma caja. Caja sigue diciendo todo lo cobrado (`fn_ventas_del_dia`); el «Hoy» del Inicio
// dice lo de CAYLA y, aparte, cuánto se dejó fuera. La base calcula qué parte de cada venta de hoy es de CLAURE (`fn_claure_de_hoy`); aquí solo se resta.

/** Lo de CLAURE en las ventas de hoy de una sede y en la misma hora de la semana pasada (`fn_claure_de_hoy`). */
export type ClaureDeHoy = {
  /** Solo las ventas de hoy que tienen algo de CLAURE: cuánto de ellas lo es y cuántas líneas de CAYLA les quedan. */
  hoy: { ventaId: string; deClaure: number; lineasDeCasa: number }[];
  /** Lo que CLAURE vendió el mismo día de la semana pasada hasta esta hora. */
  semanaPasada: number;
};

const numero = (v: unknown): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

/** La base responde un jsonb; sin CLAURE en la sede (o sin respuesta) no hay nada que restar (`null`). */
export function leerClaureDeHoy(datos: unknown): ClaureDeHoy | null {
  const r = datos as { hay_claure?: unknown; hoy?: unknown; semana_pasada?: unknown } | null | undefined;
  if (!r || typeof r !== "object" || r.hay_claure !== true) return null;
  const filas = Array.isArray(r.hoy) ? (r.hoy as Record<string, unknown>[]) : [];
  return {
    hoy: filas.map((f) => ({ ventaId: String(f.venta_id ?? ""), deClaure: numero(f.de_claure), lineasDeCasa: numero(f.lineas_de_casa) })),
    semanaPasada: numero(r.semana_pasada),
  };
}

/**
 * De las ventas de hoy (el `total` de cada una, tal como las lee Caja), deja solo lo de CAYLA: una venta solo de CLAURE no cuenta como venta, una mixta
 * cuenta por sus líneas de CAYLA. `excluido` es cuánto se dejó fuera, para decirlo.
 */
export function sinClaure(ventas: { id: string; total: number }[], claure: ClaureDeHoy | null): { totales: number[]; excluido: number } {
  if (!claure || claure.hoy.length === 0) return { totales: ventas.map((v) => v.total), excluido: 0 };
  const de = new Map(claure.hoy.map((c) => [c.ventaId, c]));
  let excluido = 0;
  const totales: number[] = [];
  for (const v of ventas) {
    const c = de.get(v.id);
    if (!c) {
      totales.push(v.total);
      continue;
    }
    excluido += c.deClaure;
    if (c.lineasDeCasa > 0) totales.push(Math.max(0, v.total - c.deClaure));
  }
  return { totales, excluido: Math.round(excluido * 100) / 100 };
}

/** Lo vendido la semana pasada a esta hora, sin lo de CLAURE (nunca bajo cero); sin base para comparar sigue sin ella. */
export function semanaSinClaure(semanaAnterior: number | null, claure: ClaureDeHoy | null): number | null {
  if (semanaAnterior === null || !claure) return semanaAnterior;
  return Math.max(0, Math.round((semanaAnterior - claure.semanaPasada) * 100) / 100);
}

/** La línea bajo «Hoy» que dice cuánto no se contó; sin nada que decir, nada. */
export function notaClaureDeHoy(excluido: number): string | null {
  return excluido > 0 ? `No incluye ${soles(excluido)} de lo que se vendió de CLAURE: Caja sí lo cuenta.` : null;
}
