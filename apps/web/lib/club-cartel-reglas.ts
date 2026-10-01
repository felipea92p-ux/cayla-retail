// El cartel «Invitación» del Club CAYLA para el mostrador (ADR-0288 act. g; diseño C aprobado por Felipe el 2026-10-01):
// lo que dice, armado con lo que el club ofrece HOY. Lógica pura: la usan la lectura del servidor (`lib/clientas.ts`,
// `getTextosDelCartel`) y el cartel mismo (`components/clientas/CartelClub.tsx`).
//
// CONTRATO
//   PROMETE: ninguna cifra escrita a mano. El % del cumpleaños, el vale menor y el mayor de la escala del aniversario, y las
//            compras y el monto que hacen contar un año salen de `fn_club_textos_legales`: lo mismo que leen los términos y la
//            página que abre el QR, así el cartel nunca promete otra cosa que lo que ella acepta al escanear. Si falta una
//            cifra o no tiene sentido (un 0, un negativo), null: el cartel no se imprime con un beneficio inventado.
//   ASUME:   la forma del jsonb que ya lee el modal de beneficios (`leerBeneficios`, `club-beneficios-reglas.ts`): el % del
//            cumpleaños, el vale de cada año del 1 al 5 (G-13), las compras (un entero) y el monto en soles.
//   NO HACE: no decide quién puede ser socia ni las condiciones del vale: las dicen los términos, al escanear.

import { leerBeneficios } from "./club-beneficios-reglas";
import { formatoPct, formatoSoles } from "./club-registro-reglas";

/** Lo que el cartel dice igual en toda tienda y con cualquier beneficio vigente (diseño C). */
export const CARTEL_INVITACION = {
  sello: "CLUB CAYLA",
  titulo: "Estás invitada",
  bajada: "a ser socia del club. Es gratis.",
  escanea: "Escanea y únete en un minuto",
} as const;

/** Una línea de beneficio: «Tu cumpleaños ···· 10 %». Los puntos guía los dibuja el cartel. */
export type LineaCartel = { beneficio: string; valor: string };

/** Las tres líneas y la condición del año (la letra chica sin la tienda), iguales para todas las tiendas. */
export type TextosCartel = { lineas: LineaCartel[]; condiciones: string };

/** «S/ 20 a 60» con la escala que crece; «S/ 40» si todos los años valen lo mismo. Va de menor a mayor aunque no crezca. */
function rangoDelVale(escala: readonly number[]): string {
  const menor = Math.min(...escala);
  const mayor = Math.max(...escala);
  if (menor === mayor) return formatoSoles(menor);
  return `${formatoSoles(menor)} a ${formatoSoles(mayor).replace(/^S\/ /, "")}`;
}

/**
 * Lo que el cartel dice de los beneficios, desde el jsonb de `fn_club_textos_legales` (o de `fn_club_pagina`, que trae lo mismo).
 * null si no vienen completos o alguna cifra no tiene sentido: entonces el cartel no se dibuja.
 */
export function textosDelCartel(json: unknown): TextosCartel | null {
  const b = leerBeneficios(json);
  if (!b) return null;
  const positivo = (n: number) => Number.isFinite(n) && n > 0;
  if (!positivo(b.pct) || !positivo(b.compras) || !Number.isInteger(b.compras) || !positivo(b.monto)) return null;
  if (b.escala.length === 0 || !b.escala.every(positivo)) return null;
  const compras = `${b.compras} ${b.compras === 1 ? "compra" : "compras"}`;
  return {
    lineas: [
      { beneficio: "Tu cumpleaños", valor: `${formatoPct(b.pct)} %` },
      { beneficio: "Cada aniversario*", valor: `vale de ${rangoDelVale(b.escala)}` },
      { beneficio: "Lo nuevo, primero", valor: "por WhatsApp" },
    ],
    condiciones: `*Un año cuenta si hiciste ${compras} o sumaste ${formatoSoles(b.monto)}. Novedades por WhatsApp solo si las pides. Solo mayores de 18. Condiciones al escanear.`,
  };
}

/** La letra chica al pie del cartel: «Tienda TRU · *Un año cuenta si hiciste 6 compras o sumaste S/ 600. …». */
export function letraChicaDelCartel(tienda: string, textos: TextosCartel): string {
  return `${tienda.trim()} · ${textos.condiciones}`;
}
