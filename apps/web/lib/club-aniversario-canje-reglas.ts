// El vale de aniversario del club en Cobrar (ADR-0288, G-13 y «Contrato de la tanda 1g»): cada año de club que cuenta, la
// socia recibe un vale en soles (S/ 20 · 30 · 40 · 50 · 60, editables sin deploy) para usar en UNA compra, dentro de sus días
// (60 por defecto). Se canjea igual que el cumpleaños de la tanda 1c (`club-cumple-canje-reglas.ts`): UNA línea en el pie, y
// el reparto por prenda viaja en `descuento_club_unitario`. Lógica pura, sin React ni red: la usan la caja de la clienta y el
// armado de `p_items` para `registrar_venta`.
//
// CONTRATO
//   PROMETE: repartir el vale entre las prendas en proporción a lo que cada una cobra (su neto: precio − su descuento sin el
//            club), por unidad y en céntimos exactos (`repartirVale`, la regla de abajo), sin dar a ninguna prenda más que su
//            neto ni al ticket más que su total. La suma es exacta al céntimo salvo un caso: si el resto no se puede repartir
//            por unidades (una sola prenda de 3 unidades y un vale de S/ 20 = 666,67 céntimos por unidad), se queda corto en
//            menos céntimos que las unidades de cualquier línea que todavía podía recibir; nunca se pasa. Es la regla de
//            abajo, no un óptimo: hay tickets raros (líneas de 2 y 3 unidades con 1 céntimo de resto) donde otra combinación
//            habría cuadrado; se eligió una regla que la base pueda repetir igual en SQL.
//   ASUME:   montos con 2 decimales (los del catálogo, los descuentos y `club_aniversario_escala.monto numeric(10,2)`). Quien
//            decide si la socia PUEDE usar el vale es la base (`resumen_clienta_caja.aniversario_disponible` al leer y
//            `registrar_venta` al cobrar); esto solo evita ofrecer lo que la base rechazaría, y lo apaga si venció con la
//            pantalla abierta.
//   NO HACE: no permite las dos ventajas en una compra (G-13: una sola por compra; la base lo exige con
//            `club_un_cupon_por_compra`): lo decide `useClubDeLaClienta`, que apaga una cuando la otra está puesta. Tampoco lo
//            ofrece sin conexión: una venta en cola podría llegar cuando otra tienda ya lo usó.
//
// LA REGLA DEL REPARTO (la misma que tiene que hacer `registrar_venta` con `p_canjear_aniversario`; todo en céntimos enteros):
//   1. n_i = precio_i − descuento_sin_club_i (por unidad; nunca menos de 0), q_i = cantidad_i, T = Σ n_i·q_i.
//   2. E = min(vale, T): el vale nunca descuenta más que el ticket entero.
//   3. Base por unidad: u_i = ⌊E·n_i / T⌋. Resto R = E − Σ u_i·q_i (siempre 0 ≤ R < Σ q_i).
//   4. Mientras quede R: se recorren las líneas de mayor a menor fracción (E·n_i mod T), y a igual fracción en el orden del
//      ticket; cada una suma 1 céntimo por unidad si le cabe (q_i ≤ R) y no pasa su neto (u_i < n_i). Se para cuando R = 0 o
//      cuando una vuelta entera no pudo sumar nada.
//   5. descuento_club_unitario_i = u_i / 100.

import { hoyLima } from "./fechas-lima";
import { diaYMesCorto } from "./club-cumple-canje-reglas";

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

/* ------------------------------------------------------------------ ¿Se ofrece? */

/** Lo que `resumen_clienta_caja` dice del vale (los campos de la tanda 1g, ya en camelCase). */
export type ResumenVale = {
  esSocia: boolean;
  aniversarioDisponible: boolean;
  aniversarioMonto: number | null;
  /** Hasta cuándo vale (`aaaa-mm-dd`, día de Lima). */
  aniversarioVence: string | null;
};

export type ValeEnCaja =
  /** No es socia, no tiene un vale disponible o ya venció: la caja no dice nada del vale. */
  | { tipo: "nada" }
  /** Tiene su vale: «Usar vale». */
  | { tipo: "disponible"; monto: number; vence: string | null }
  /** Tiene su vale, pero no hay conexión: no se ofrece (otra tienda podría usarlo a la vez). */
  | { tipo: "sin_conexion"; monto: number; vence: string | null };

/**
 * Qué muestra la caja sobre el vale. Manda lo que leyó la base (`aniversarioDisponible`); la fecha de Lima de AHORA solo puede
 * apagarlo: si la pantalla quedó abierta y el vale venció, no se ofrece uno que la base rechazaría (`aniversario_no_disponible`).
 */
export function valeEnCaja(r: ResumenVale | null | undefined, enLinea: boolean, ahora: Date = new Date()): ValeEnCaja {
  if (!r || !r.esSocia || !r.aniversarioDisponible) return { tipo: "nada" };
  const monto = r.aniversarioMonto;
  if (monto === null || !Number.isFinite(monto) || monto <= 0) return { tipo: "nada" };
  const vence = /^\d{4}-\d{2}-\d{2}/.test(r.aniversarioVence ?? "") ? r.aniversarioVence!.slice(0, 10) : null;
  if (vence && vence < hoyLima(ahora)) return { tipo: "nada" };
  return enLinea ? { tipo: "disponible", monto, vence } : { tipo: "sin_conexion", monto, vence };
}

/** El monto que entra al ticket: el del vale si la asesora tocó «Usar vale» y sigue disponible; null si no. */
export function montoDelVale(aplicado: boolean, estado: ValeEnCaja): number | null {
  return aplicado && estado.tipo === "disponible" ? estado.monto : null;
}

/* ------------------------------------------------------------------ Los textos */

/** «S/ 30» si es entero, «S/ 30.50» si no: así se dice el vale en la tarjeta (la escala es en soles redondos). */
export const solesDelVale = (n: number) => `S/ ${Number.isInteger(n) ? String(n) : n.toFixed(2)}`;
/** Soles como los dice la caja (`money` de `PuntoDeVenta`): «S/30.00». */
const soles = (n: number) => `S/${n.toFixed(2)}`;

export type AccionVale = "usar" | "quitar";

export type FilaVale = {
  /** En negrita. */
  destacado: string;
  /** Después del punto medio: «S/ 30 · hasta el 30 nov». */
  resto: string;
  /** La segunda línea, más chica. */
  bajada: string;
  /** El botón de la fila. `accion` null = apagado (sin conexión, o el cumpleaños ya está puesto). */
  boton: { texto: string; primario: boolean; accion: AccionVale | null };
  /** Con lo del club plegado, la misma acción como píldora. */
  pildora: { texto: string; accion: AccionVale | null };
  /** Lo que dice al pasar el mouse (el `title`). */
  ayuda: string;
};

/** Una sola ventaja del club por compra (G-13): el cumpleaños o el vale, no los dos. */
export const UNA_VENTAJA_POR_COMPRA = "una sola ventaja del club por compra";

/**
 * La fila del vale dentro de la caja de la clienta (como la del cumpleaños): «Vale de aniversario · S/ 30 · hasta el 30 nov»
 * con «Usar vale», «Quitar» o «Sin conexión». null = no tiene vale. `aplicado`: la asesora lo tocó en esta venta.
 * `cumpleAplicado`: el cumpleaños ya está en esta compra, y solo va una ventaja del club por compra: el botón se apaga y dice
 * por qué.
 */
export function filaDelVale(estado: ValeEnCaja, aplicado: boolean, cumpleAplicado: boolean): FilaVale | null {
  if (estado.tipo === "nada") return null;
  const monto = solesDelVale(estado.monto);
  const dia = diaYMesCorto(estado.vence);
  const base = {
    destacado: "Vale de aniversario",
    resto: dia ? `${monto} · hasta el ${dia}` : monto,
    ayuda: `Vale de ${monto} para una compra: si la compra es menor, no queda saldo. Va ${UNA_VENTAJA_POR_COMPRA}. Sin conexión se apaga: otra tienda podría usarlo a la vez.`,
  };
  if (estado.tipo === "sin_conexion") {
    return {
      ...base,
      bajada: "Sin conexión el botón se apaga",
      boton: { texto: "Sin conexión", primario: false, accion: null },
      pildora: { texto: "Sin conexión", accion: null },
    };
  }
  if (cumpleAplicado && !aplicado) {
    return {
      ...base,
      bajada: `Ya usa su cumpleaños: ${UNA_VENTAJA_POR_COMPRA}`,
      boton: { texto: "Usar vale", primario: false, accion: null },
      pildora: { texto: `Usar vale ${monto}`, accion: null },
    };
  }
  return {
    ...base,
    bajada: "En toda la compra, una sola vez",
    boton: aplicado ? { texto: "Quitar", primario: false, accion: "quitar" } : { texto: "Usar vale", primario: true, accion: "usar" },
    pildora: aplicado ? { texto: "Quitar vale", accion: "quitar" } : { texto: `Usar vale ${monto}`, accion: "usar" },
  };
}

/** La línea del pie del ticket (como el cumpleaños): «Vale de aniversario del club −S/30.00». */
export const TEXTO_PIE_VALE = "Vale de aniversario del club";

/** Su `title`: de cuánto es el vale y sobre cuánto se usó; si la compra es menor, que no queda saldo. */
export function ayudaPieVale(montoVale: number, usado: number, totalSinVale: number): string {
  if (usado < montoVale) return `El vale es de ${solesDelVale(montoVale)} y la compra, de ${soles(totalSinVale)}: se usa ${soles(usado)} y no queda saldo.`;
  return `Vale de ${solesDelVale(montoVale)} sobre toda la compra (${soles(totalSinVale)}), repartido entre las prendas.`;
}

/** Después de cobrar («Venta registrada»), con lo que descontó el vale. */
export const textoValeCobrado = (monto: number) => `Vale de aniversario usado (−${soles(monto)}). Es de una sola vez: devolver la compra no lo devuelve.`;

/** En el ticket impreso, que muestra el descuento de cada prenda («Dscto. -22.39 c/u»): cuánto de eso es del vale. */
export const textoValeEnElRecibo = (monto: number) => `Incluye vale de aniversario del club: -${monto.toFixed(2)}`;

/* ------------------------------------------------------------------ Cuando algo lo apaga */

/** Por qué se apagó solo (sin que la asesora tocara «Quitar»): se perdió la conexión, o una relectura dice que ya no está. */
export type MotivoValeApagado = "sin_conexion" | "no_disponible";

/** El aviso cuando se apaga solo. No vuelve solo: la asesora lo vuelve a tocar. */
export function avisoValeApagado(motivo: MotivoValeApagado, monto: number): { titulo: string; detalle: string } {
  const titulo = `Se quitó el vale de aniversario (${solesDelVale(monto)})`;
  return motivo === "sin_conexion"
    ? { titulo, detalle: "Sin conexión no se usa: otra tienda podría usarlo a la vez. Cuando vuelva la conexión, tócalo otra vez." }
    : { titulo, detalle: "Ya no está disponible para este cliente (pudo usarlo en otra tienda, o venció). El total volvió a su precio." };
}

/** Los `hint` de `registrar_venta` que rechazan el vale (ADR-0288, «Contrato de la tanda 1g»). */
const RECHAZOS_DEL_VALE: ReadonlyMap<string, { releer: boolean; queHacer: string }> = new Map([
  // La base ya sabe algo que la caja no: se vuelve a leer su resumen para que la fila diga lo que es.
  ["aniversario_ya_canjeado", { releer: true, queHacer: "Pudo usarlo en otra caja o tienda. Quité el vale: revisa el total con el cliente y vuelve a confirmar el cobro." }],
  ["aniversario_no_disponible", { releer: true, queHacer: "Quité el vale (pudo vencer): revisa el total con el cliente y vuelve a confirmar el cobro." }],
  ["club_un_cupon_por_compra", { releer: true, queHacer: "Va una sola ventaja del club por compra. Quité el vale: elige una y vuelve a confirmar el cobro." }],
  // No depende de ella: la pantalla lo evita, y si igual llega, se apaga y se dice.
  ["aniversario_sin_monto", { releer: false, queHacer: "En esta venta no queda nada que descontar: el vale queda para otra compra." }],
  // Una venta en S/ 0 no se registra (todo pago es mayor que cero): el vale queda para una compra más grande.
  ["aniversario_cubre_todo", { releer: false, queHacer: "El vale cubre toda la compra. Quité el vale: agrega otra prenda o cobra esta compra sin él." }],
  // El reparto de la caja y el de la base son la misma regla; si no coinciden, algo cambió en el ticket: se relee.
  ["aniversario_descuento_distinto", { releer: true, queHacer: "Quité el vale porque el cálculo no coincidió: vuelve a ponerlo y confirma el cobro." }],
]);

/**
 * Qué hace la caja cuando `registrar_venta` rechaza el vale: SIEMPRE lo apaga (la venta no se guardó y NO se vuelve a mandar
 * sola sin el vale: la clienta tiene que saber que paga más), y a veces vuelve a leer su resumen. El título del aviso es
 * `traducirError` (lib/error-escritura.ts); esto es el detalle. null si el rechazo no es del vale.
 */
export function rechazoDelVale(hint: string | null | undefined): { releer: boolean; detalle: string } | null {
  const r = hint ? RECHAZOS_DEL_VALE.get(hint) : undefined;
  return r ? { releer: r.releer, detalle: `La venta no se guardó. ${r.queHacer}` } : null;
}

/** Se cortó la conexión cobrando con el vale: no va a la cola. El mismo `p_token` hace seguro volver a confirmar. */
export function valeSinConexion(): { titulo: string; detalle: string } {
  return {
    titulo: "Se cortó la conexión: el vale de aniversario no se usa sin internet",
    detalle:
      "Otra tienda podría usarlo a la vez. Cuando vuelva la conexión, confirma otra vez: si ya se había guardado, el sistema la reconoce y no la duplica. Si el cliente no puede esperar, quita el vale y cobra el total completo.",
  };
}
