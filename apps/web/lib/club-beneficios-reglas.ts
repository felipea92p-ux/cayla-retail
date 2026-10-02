// «Beneficios del club» (ADR-0288, «Actualización 2026-10-01 (g)», G-13; contrato de la tanda 1g, funciones 1 y 9): lo que el líder
// ajusta sin deploy — el % del cumpleaños, cuándo cuenta un año de club para el aniversario, en cuántos días se usa el vale y el vale
// de cada año. Lógica pura: la usan la página (servidor), el modal (navegador) y su guía de foco (`club-beneficios-guia.ts`).
//
// CONTRATO
//   PROMETE: leer los beneficios vigentes de lo que devuelve `fn_club_pagina` (o decir que no se pudo), pasar el borrador del modal a
//            los valores que guarda `guardar_beneficios_club` y decir qué tiene mal cada campo con UNA sola regla, la misma que apaga
//            el botón de guardar y la que sigue la guía.
//   ASUME:   los límites que ya cuida la base: el % entre 1 y 50 (`configuracion_empresa_club_cumple_pct_valido`), montos en soles con
//            2 decimales (`numeric(10,2)`), compras y días enteros, y un vale por año del 1 al 5 mayor que 0
//            (`club_aniversario_escala`). Si la base exige algo más, lo dice al guardar.
//   NO HACE: no decide si un cambio publica términos nuevos: lo hace `guardar_beneficios_club`.

/** Años de la escala del vale de aniversario: del 1 al 5; el del quinto se repite los años siguientes (G-13). */
export const ANIOS_ESCALA = 5;

export type BeneficiosClub = {
  /** % de descuento del cupón de cumpleaños (`configuracion_empresa.club_cumple_pct`). */
  pct: number;
  /** Compras netas en el año de club para que el año cuente (`club_aniversario_compras`). */
  compras: number;
  /** O este monto en soles de compras netas en el año (`club_aniversario_monto`). */
  monto: number;
  /** Días que tiene para usar el vale (`club_aniversario_dias`). */
  dias: number;
  /** El vale en soles de cada año, del 1 al 5 (`club_aniversario_escala`). */
  escala: number[];
};

const numero = (x: unknown): number | null => {
  const n = typeof x === "number" ? x : typeof x === "string" && x.trim() !== "" ? Number(x) : NaN;
  return Number.isFinite(n) ? n : null;
};

/** Los beneficios vigentes desde el jsonb de `fn_club_pagina`, o null si no vienen completos (una base sin la tanda 1g, o sin la escala
 *  de los cinco años): el modal no inventa valores que después guardaría encima de los reales. */
export function leerBeneficios(pagina: unknown): BeneficiosClub | null {
  if (!pagina || typeof pagina !== "object") return null;
  const p = pagina as Record<string, unknown>;
  const pct = numero(p.pct);
  const compras = numero(p.compras);
  const monto = numero(p.monto_minimo);
  const dias = numero(p.dias);
  if (pct === null || compras === null || monto === null || dias === null || !Array.isArray(p.escala)) return null;
  const porAnio = new Map<number, number>();
  for (const e of p.escala as unknown[]) {
    if (!e || typeof e !== "object") continue;
    const anio = numero((e as Record<string, unknown>).anio);
    const valor = numero((e as Record<string, unknown>).monto);
    if (anio !== null && valor !== null) porAnio.set(anio, valor);
  }
  const escala = Array.from({ length: ANIOS_ESCALA }, (_, i) => porAnio.get(i + 1));
  if (escala.some((v) => v === undefined)) return null;
  return { pct, compras, monto, dias, escala: escala as number[] };
}

/** Lo que se escribe en el modal: texto, para poder borrar y reescribir sin que se pegue un «0». */
export type BorradorBeneficios = { pct: string; compras: string; monto: string; dias: string; escala: string[] };

export function borradorDe(b: BeneficiosClub): BorradorBeneficios {
  return { pct: String(b.pct), compras: String(b.compras), monto: String(b.monto), dias: String(b.dias), escala: b.escala.map(String) };
}

export type CampoBeneficio = "pct" | "compras" | "monto" | "dias" | "escala";

/** «12,5» o «12.5» → 12.5; con más de 2 decimales, letras o vacío → null. */
function decimal(texto: string): number | null {
  const t = texto.trim().replace(",", ".");
  return /^\d+(\.\d{1,2})?$/.test(t) ? Number(t) : null;
}
function entero(texto: string): number | null {
  const t = texto.trim();
  return /^\d+$/.test(t) ? Number(t) : null;
}

/**
 * Qué tiene mal cada campo, o null. ES la regla del modal: apaga «Guardar» y la guía la lee tal cual (lo exige su prueba). Un campo
 * vacío dice qué escribir; uno mal escrito, cómo tiene que ser.
 */
export function problemasBeneficios(b: BorradorBeneficios): Record<CampoBeneficio, string | null> {
  const pct = decimal(b.pct);
  const compras = entero(b.compras);
  const monto = decimal(b.monto);
  const dias = entero(b.dias);
  const escala = b.escala.map(decimal);
  return {
    pct: b.pct.trim() === "" ? "Escribe el % del cumpleaños." : pct === null || pct < 1 || pct > 50 ? "El % del cumpleaños va de 1 a 50, con hasta 2 decimales." : null,
    compras: b.compras.trim() === "" ? "Escribe cuántas compras hacen falta en el año." : compras === null || compras < 1 ? "Las compras son un número entero, 1 o más." : null,
    monto: b.monto.trim() === "" ? "Escribe cuánto tiene que comprar en el año." : monto === null || monto <= 0 ? "El monto va en soles, mayor que 0, con hasta 2 decimales." : null,
    dias: b.dias.trim() === "" ? "Escribe en cuántos días puede usar el vale." : dias === null || dias < 1 ? "Los días son un número entero, 1 o más." : null,
    escala:
      b.escala.length !== ANIOS_ESCALA || b.escala.some((v) => v.trim() === "")
        ? "Escribe el vale de cada año, del 1 al 5."
        : escala.some((v) => v === null || v <= 0)
          ? "Cada vale va en soles, mayor que 0, con hasta 2 decimales."
          : null,
  };
}

/** Los valores para `guardar_beneficios_club`, o null si algún campo tiene un problema. */
export function beneficiosDelBorrador(b: BorradorBeneficios): BeneficiosClub | null {
  if (Object.values(problemasBeneficios(b)).some((p) => p !== null)) return null;
  return { pct: decimal(b.pct)!, compras: entero(b.compras)!, monto: decimal(b.monto)!, dias: entero(b.dias)!, escala: b.escala.map((v) => decimal(v)!) };
}

/** `p_escala` de `guardar_beneficios_club`: la misma forma en que la devuelve `fn_club_pagina`. */
export function escalaParaGuardar(escala: readonly number[]): { anio: number; monto: number }[] {
  return escala.map((monto, i) => ({ anio: i + 1, monto }));
}

const soles = (n: number) => `S/ ${n.toFixed(2)}`;
const anioDe = (i: number) => (i === ANIOS_ESCALA - 1 ? `Vale del año ${i + 1} en adelante` : `Vale del año ${i + 1}`);

/** Lo que cambia respecto de lo vigente, en palabras: «Cumpleaños: 10 % → 12 %». Vacío si no cambió nada (no hay qué guardar). */
export function cambiosDeBeneficios(antes: BeneficiosClub, despues: BeneficiosClub): string[] {
  const out: string[] = [];
  if (antes.pct !== despues.pct) out.push(`Cumpleaños: ${antes.pct} % → ${despues.pct} %`);
  if (antes.compras !== despues.compras) out.push(`Compras en el año: ${antes.compras} → ${despues.compras}`);
  if (antes.monto !== despues.monto) out.push(`Monto en el año: ${soles(antes.monto)} → ${soles(despues.monto)}`);
  if (antes.dias !== despues.dias) out.push(`Días para usar el vale: ${antes.dias} → ${despues.dias}`);
  despues.escala.forEach((v, i) => {
    if (antes.escala[i] !== v) out.push(`${anioDe(i)}: ${soles(antes.escala[i] ?? 0)} → ${soles(v)}`);
  });
  return out;
}
