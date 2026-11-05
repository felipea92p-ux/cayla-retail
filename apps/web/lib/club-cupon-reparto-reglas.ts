// El reparto del cupón del Club entre las prendas (programa de puntos): un cupón descuenta un monto FIJO en soles de toda la compra, y la
// parte de cada prenda viaja en `descuento_club_unitario` de `registrar_venta`. Lógica pura, sin React ni red: la usan el ticket, el armado
// de `p_items` y el papel. Nació para el vale de aniversario (tanda 1g, ADR-0288 G-13), que se retiró el 2026-10-19: la regla se quedó
// porque el cupón es el mismo tipo de descuento, y por eso sus nombres dicen «vale» (lo mismo que `retail.fn_club_repartir_vale`).
//
// CONTRATO
//   PROMETE: repartir el monto entre las prendas en proporción a lo que cada una cobra (su neto: precio − su descuento sin el club), por
//            unidad y en céntimos exactos (`repartirVale`, la regla de abajo), sin dar a ninguna prenda más que su neto ni al ticket más que
//            su total. La suma es exacta al céntimo salvo un caso: si el resto no se puede repartir por unidades (una sola prenda de 3
//            unidades y un cupón de S/ 20 = 666,67 céntimos por unidad), se queda corto en menos céntimos que las unidades de cualquier
//            línea que todavía podía recibir; nunca se pasa.
//   ASUME:   montos con 2 decimales. Quien decide si el cupón sirve es la base (`validar_cupon` al aplicarlo y `registrar_venta` al cobrar).
//   NO HACE: no valida el cupón ni decide su valor: solo lo reparte.
//
// LA REGLA DEL REPARTO (la misma que repite `retail.fn_club_repartir_vale` en la base; todo en céntimos enteros):
//   1. n_i = precio_i − descuento_sin_club_i (por unidad; nunca menos de 0), q_i = cantidad_i, T = Σ n_i·q_i.
//   2. E = min(monto, T): el cupón nunca descuenta más que el ticket entero.
//   3. Base por unidad: u_i = ⌊E·n_i / T⌋. Resto R = E − Σ u_i·q_i (siempre 0 ≤ R < Σ q_i).
//   4. Mientras quede R: se recorren las líneas de mayor a menor fracción (E·n_i mod T), y a igual fracción en el orden del
//      ticket; cada una suma 1 céntimo por unidad si le cabe (q_i ≤ R) y no pasa su neto (u_i < n_i). Se para cuando R = 0 o
//      cuando una vuelta entera no pudo sumar nada.
//   5. descuento_club_unitario_i = u_i / 100.

/* ------------------------------------------------------------------ Aritmética exacta en céntimos */

const aCentimos = (soles: number) => Math.round(soles * 100);
const aSoles = (centimos: number) => centimos / 100;
/** ⌊a / b⌋ con enteros no negativos, sin pasar por la coma flotante de la división. */
const dividirAbajo = (a: number, b: number) => (a - (a % b)) / b;

/* ------------------------------------------------------------------ El reparto */

/** Lo mínimo de una línea del ticket: su precio, el descuento que ya tiene SIN el club y cuántas son. */
export type LineaParaVale = { precioUnitario: number; descuentoUnitario: number; cantidad: number };

/**
 * La parte del vale de cada línea, POR UNIDAD y en soles (la regla de arriba). Un vale de 0 o un ticket sin nada que cobrar
 * reparten 0. Ej.: dos prendas que cobran 79.90 y 40.10 con un vale de S/ 30 → 19.98 y 10.02 (suma 30.00).
 */
export function repartirVale(lineas: readonly LineaParaVale[], monto: number): number[] {
  const netos = lineas.map((l) => Math.max(0, aCentimos(l.precioUnitario) - aCentimos(l.descuentoUnitario)));
  const cantidades = lineas.map((l) => Math.max(0, Math.trunc(l.cantidad)));
  const total = netos.reduce((acc, n, i) => acc + n * cantidades[i]!, 0);
  if (total <= 0) return lineas.map(() => 0);
  const vale = Math.min(Math.max(0, aCentimos(monto)), total);

  const partes = netos.map((n) => dividirAbajo(vale * n, total));
  let resto = vale - partes.reduce((acc, u, i) => acc + u * cantidades[i]!, 0);
  // De mayor a menor fracción y, a igual fracción, en el orden del ticket: siempre el mismo resultado para el mismo ticket.
  const orden = netos.map((n, i) => ({ i, fraccion: (vale * n) % total })).sort((a, b) => b.fraccion - a.fraccion || a.i - b.i);
  let sumo = true;
  while (resto > 0 && sumo) {
    sumo = false;
    for (const { i } of orden) {
      const q = cantidades[i]!;
      if (q === 0 || q > resto || partes[i]! >= netos[i]!) continue;
      partes[i]! += 1;
      resto -= q;
      sumo = true;
      if (resto === 0) break;
    }
  }
  return partes.map(aSoles);
}

export type LineaConVale<L extends LineaParaVale> = L & {
  /** La parte del vale por unidad (0 sin vale). */
  descuentoClubUnitario: number;
  /** Lo que se cobra por unidad: precio − descuento sin club − vale. */
  precioFinalUnitario: number;
};

export type TicketConVale<L extends LineaParaVale> = {
  lineas: LineaConVale<L>[];
  /** El total SIN el vale (lo que se cobraría sin usarlo). */
  totalSinVale: number;
  /** Cuánto descuenta el vale en esta compra: Σ parte × cantidad (el `monto` de `club_canjes`). Menor que el vale si la
   *  compra es menor. */
  totalVale: number;
  /** El total a cobrar: `registrar_venta` exige que los pagos sumen esto. */
  total: number;
};

/** Cómo quedan las líneas y el total con el vale. `monto` null = sin vale: todo igual, con la parte del club en 0. */
export function ticketConVale<L extends LineaParaVale>(lineas: readonly L[], monto: number | null): TicketConVale<L> {
  const partes = monto === null ? lineas.map(() => 0) : repartirVale(lineas, monto);
  let sinVale = 0;
  let vale = 0;
  const conVale = lineas.map((l, i) => {
    const cobradoSinClub = Math.max(0, aCentimos(l.precioUnitario) - aCentimos(l.descuentoUnitario));
    const club = aCentimos(partes[i]!);
    const cantidad = Math.max(0, Math.trunc(l.cantidad));
    sinVale += cobradoSinClub * cantidad;
    vale += club * cantidad;
    return { ...l, descuentoClubUnitario: aSoles(club), precioFinalUnitario: aSoles(cobradoSinClub - club) };
  });
  return { lineas: conVale, totalSinVale: aSoles(sinVale), totalVale: aSoles(vale), total: aSoles(sinVale - vale) };
}

/**
 * Lo que viaja en cada ítem de `p_items` cuando hay un cupón: `descuento_unitario` sigue siendo el descuento TOTAL por unidad
 * (sin club + club, sumado al céntimo exacto: nunca `a + b` en coma flotante, que puede dar 22.389999…) y
 * `descuento_club_unitario`, la parte del cupón. Sin cupón, `descuentoClub` es 0 y el ítem queda como siempre.
 */
export function descuentosParaRegistrar(
  descuentoSinClub: number,
  descuentoClub: number
): { descuento_unitario: number; descuento_club_unitario: number } {
  return {
    descuento_unitario: aSoles(aCentimos(descuentoSinClub) + aCentimos(descuentoClub)),
    descuento_club_unitario: aSoles(aCentimos(descuentoClub)),
  };
}
