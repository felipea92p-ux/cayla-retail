// El cartel «Invitación» del Club CAYLA para el mostrador (ADR-0288 act. g; diseño C aprobado por Felipe el 2026-10-01):
// lo que dice, armado con lo que el club ofrece HOY. Lógica pura: la usan la lectura del servidor (`lib/clientas.ts`,
// `getTextosDelCartel`) y el cartel mismo (`components/clientas/CartelClub.tsx`).
//
// CONTRATO
//   PROMETE: ninguna cifra escrita a mano. Lo que se gana por cada sol, lo que valen 100 puntos, el canje mínimo, los días del cupón y el
//            regalo de cumpleaños salen de la configuración vigente de los puntos (`fn_club_puntos_vigentes`, programa de puntos): lo
//            mismo que cobra la caja y configura Clientes ▸ Beneficios del club. Si falta una cifra o no tiene sentido (un 0, un
//            negativo), null: el cartel no se imprime con un beneficio inventado.
//   NO HACE: no decide quién puede ser miembro ni las condiciones del canje: las dicen los términos, al escanear.

import { formatoSoles } from "./club-registro-reglas";

/** Lo que el cartel dice igual en toda tienda y con cualquier beneficio vigente (diseño C). */
export const CARTEL_INVITACION = {
  sello: "CLUB",
  titulo: "Te invitamos",
  bajada: "a ser parte del club. Es gratis.",
  escanea: "Escanea y únete en un minuto",
} as const;

/** Una línea de beneficio: «Tu cumpleaños ···· 10 %». Los puntos guía los dibuja el cartel. */
export type LineaCartel = { beneficio: string; valor: string };

/** Las tres líneas y la condición del año (la letra chica sin la tienda), iguales para todas las tiendas. */
export type TextosCartel = { lineas: LineaCartel[]; condiciones: string };

const numero = (x: unknown): number | null => {
  const n = typeof x === "number" ? x : typeof x === "string" && x.trim() !== "" ? Number(x) : NaN;
  return Number.isFinite(n) ? n : null;
};
const miles = (n: number) => n.toLocaleString("es-PE");

/**
 * Lo que el cartel dice de los puntos, desde el jsonb de `fn_club_puntos_vigentes`. null si no vienen completos o alguna cifra no tiene
 * sentido: entonces el cartel no se dibuja.
 */
export function textosDelCartel(json: unknown): TextosCartel | null {
  if (!json || typeof json !== "object") return null;
  const o = json as Record<string, unknown>;
  const porSol = numero(o.puntos_por_sol);
  const s100 = numero(o.soles_por_100);
  const minimo = numero(o.canje_minimo);
  const dias = numero(o.vigencia_dias);
  const regalo = numero(o.regalo_cumple);
  const positivo = (n: number | null): n is number => n !== null && n > 0;
  if (!positivo(porSol) || !positivo(s100) || !positivo(minimo) || !Number.isInteger(minimo) || !positivo(dias) || !Number.isInteger(dias)) return null;
  if (regalo === null || regalo < 0 || !Number.isInteger(regalo)) return null;
  const lineas: LineaCartel[] = [
    { beneficio: "Cada compra", valor: `${porSol === 1 ? "1 punto" : `${miles(porSol)} puntos`} por S/\u00a01` },
    { beneficio: "100 puntos*", valor: `${formatoSoles(s100)} de descuento` },
  ];
  // Sin regalo de cumpleaños configurado, la línea no promete nada: el cartel dice lo nuevo.
  lineas.push(regalo > 0 ? { beneficio: "Tu cumpleaños", valor: `+${miles(regalo)} puntos` } : { beneficio: "Lo nuevo, primero", valor: "por WhatsApp" });
  return {
    lineas,
    condiciones: `*Canjeas desde ${miles(minimo)} puntos por un cupón de ${dias} ${dias === 1 ? "día" : "días"}. Novedades por WhatsApp solo si las pides. Solo mayores de 18. Condiciones al escanear.`,
  };
}

/** La letra chica al pie del cartel: «Tienda TRU · *Canjeas desde 200 puntos por un cupón de 7 días. …». */
export function letraChicaDelCartel(tienda: string, textos: TextosCartel): string {
  return `${tienda.trim()} · ${textos.condiciones}`;
}
