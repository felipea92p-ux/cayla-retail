// Los puntos y los cupones del Club en la caja (programa de puntos, actividad 5). Lógica pura, sin React ni red: la usan la
// tarjeta del cliente, las hojas «Usar puntos» y «Código de cupón» y el armado de `registrar_venta`.
//
// CONTRATO
//   PROMETE: decir cuánto se puede canjear de verdad en ESTA compra (varios de 100, desde el mínimo, sin pasar el saldo ni el
//            mínimo de compra del cupón), cuántos puntos gana la compra y qué hacer cuando la base rechaza un cupón.
//   ASUME:   las mismas cuentas que la base (`canjear_puntos`: valor = puntos / 100 × soles por 100; compra mínima del cupón =
//            ceil(valor × compra_minima_x)). Quien decide es la base: esto solo evita ofrecer lo que la base rechazaría, y el
//            número que muestra nunca reemplaza al que ella devuelve.
//   NO HACE: no toca el ticket ni reparte el descuento (eso es `ticketConVale`, la regla que ya repite la base por prenda).

import type { ResumenDePuntosEnCaja, ValidacionDeCupon } from "@cayla-retail/database";

/* ------------------------------------------------------------------ Lo que la caja lee de la base */

/** La configuración vigente (la base la entrega siempre, aunque la ficha no sea miembro). */
export type ConfigPuntos = {
  puntosPorSol: number;
  solesPor100: number;
  canjeMinimo: number;
  compraMinimaX: number;
  vigenciaDias: number;
  regaloCumple: number;
};

/** Un cupón vivo de la miembro, para ofrecérselo a la cajera (el cupón es al portador). */
export type CuponVivo = { codigo: string; valor: number; compraMinima: number; venceEl: string };

/** `resumen_puntos_caja` en camelCase. Sin `miembro`, solo la configuración. */
export type ResumenPuntos = {
  config: ConfigPuntos;
  miembro: boolean;
  saldo: number;
  valorSaldo: number;
  regaloDisponible: boolean;
  cupones: CuponVivo[];
};

export function resumenDePuntos(r: ResumenDePuntosEnCaja): ResumenPuntos {
  return {
    config: {
      puntosPorSol: Number(r.puntos_por_sol),
      solesPor100: Number(r.soles_por_100),
      canjeMinimo: Number(r.canje_minimo),
      compraMinimaX: Number(r.compra_minima_x),
      vigenciaDias: Number(r.vigencia_dias),
      regaloCumple: Number(r.regalo_cumple),
    },
    miembro: r.miembro === true,
    saldo: Number(r.saldo ?? 0),
    valorSaldo: Number(r.valor_saldo ?? 0),
    regaloDisponible: r.regalo_disponible === true,
    cupones: (r.cupones ?? []).map((c) => ({ codigo: c.codigo, valor: Number(c.valor), compraMinima: Number(c.compra_minima), venceEl: c.vence_el })),
  };
}

/* ------------------------------------------------------------------ Cuentas */

/** Soles con céntimos exactos (sin 0,1 + 0,2). */
const aCentimos = (soles: number) => Math.round(soles * 100);

/** Cuánto valen estos puntos: 100 puntos = `solesPor100` soles. */
export function valorDePuntos(puntos: number, cfg: Pick<ConfigPuntos, "solesPor100">): number {
  return Math.round((puntos / 100) * cfg.solesPor100 * 100) / 100;
}

/** La compra mínima del cupón de estos puntos (la misma cuenta de `canjear_puntos`: ceil(valor × x)). */
export function compraMinimaDelCanje(puntos: number, cfg: Pick<ConfigPuntos, "solesPor100" | "compraMinimaX">): number {
  return Math.ceil(valorDePuntos(puntos, cfg) * cfg.compraMinimaX - 1e-9);
}

/** Los puntos que gana una compra: lo que paga (ya con el cupón) × puntos por sol, hacia abajo. Sin miembro, 0. */
export function puntosQueGana(totalAPagar: number, cfg: Pick<ConfigPuntos, "puntosPorSol">): number {
  if (!(totalAPagar > 0) || !(cfg.puntosPorSol > 0)) return 0;
  return Math.floor((aCentimos(totalAPagar) * cfg.puntosPorSol) / 100 + 1e-9);
}

export type OpcionesDeCanje =
  /** Se puede canjear de `min` a `max` de a `paso` (siempre `min` ≤ `max`). */
  | { tipo: "posible"; min: number; max: number; paso: number }
  /** No se puede, y por qué: el saldo no llega, o la compra no alcanza para el cupón más chico. */
  | { tipo: "saldo_corto"; faltan: number }
  | { tipo: "compra_corta"; comprarAlMenos: number };

/**
 * Cuántos puntos puede canjear la miembro en ESTA compra. Un cupón es de a 100 puntos (la base lo exige), desde
 * `canjeMinimo`, sin pasar su saldo y sin que su compra mínima (`compraMinimaX` veces su valor) pase del ticket: así el
 * cupón nunca cubre toda la compra (el cupón más grande vale 1/`compraMinimaX` del ticket).
 */
export function opcionesDeCanje(saldo: number, totalDelTicket: number, cfg: ConfigPuntos): OpcionesDeCanje {
  const paso = 100;
  const min = Math.max(paso, Math.ceil(cfg.canjeMinimo / paso) * paso);
  if (saldo < min) return { tipo: "saldo_corto", faltan: min - saldo };
  if (compraMinimaDelCanje(min, cfg) > totalDelTicket + 1e-9) return { tipo: "compra_corta", comprarAlMenos: compraMinimaDelCanje(min, cfg) };
  let max = min;
  const tope = Math.floor(saldo / paso) * paso;
  while (max + paso <= tope && compraMinimaDelCanje(max + paso, cfg) <= totalDelTicket + 1e-9) max += paso;
  return { tipo: "posible", min, max, paso };
}

/* ------------------------------------------------------------------ La fila de puntos de la tarjeta del cliente */

export type FilaPuntos = {
  /** En negrita: «1,240 puntos». */
  destacado: string;
  /** Después del punto medio: «valen S/ 62». */
  resto: string;
  /** La segunda línea, más chica. */
  bajada: string;
  boton: { texto: string; primario: boolean; accion: "usar" | "quitar" | null };
  pildora: { texto: string; accion: "usar" | "quitar" | null };
  ayuda: string;
};

const numero = (n: number) => n.toLocaleString("es-PE");
/** «S/ 62» si es entero, «S/ 62.50» si no (con espacio que no se parte, ADR-0413). */
export const solesDelCupon = (n: number) => `S/ ${Number.isInteger(n) ? String(n) : n.toFixed(2)}`;

/**
 * La fila «1,240 puntos · valen S/ 62» con su botón «Usar puntos». `hayCupon`: ya hay un cupón puesto en esta compra (el que
 * sea, de estos puntos o de un código): solo va uno, y el botón pasa a «Quitar» si lo puso esta fila. `sinConexion`: canjear
 * crea un cupón en la base y no se hace sin red.
 */
export function filaDePuntos(v: {
  resumen: ResumenPuntos;
  totalDelTicket: number;
  hayArticulos: boolean;
  cuponPuesto: boolean;
  sinConexion: boolean;
}): FilaPuntos {
  const { resumen, totalDelTicket, hayArticulos, cuponPuesto, sinConexion } = v;
  const destacado = `${numero(resumen.saldo)} puntos`;
  const resto = `valen ${solesDelCupon(resumen.valorSaldo)}`;
  const ayuda = `100 puntos valen ${solesDelCupon(resumen.config.solesPor100)}. Canjearlos crea un cupón con código y se aplica a este ticket. No vencen mientras compre.`;
  const opciones = opcionesDeCanje(resumen.saldo, totalDelTicket, resumen.config);
  const apagado = (bajada: string, texto = "Usar puntos") => ({
    destacado,
    resto,
    bajada,
    boton: { texto, primario: false, accion: null },
    pildora: { texto: "Usar puntos", accion: null },
    ayuda,
  });
  if (cuponPuesto) {
    return {
      destacado,
      resto,
      bajada: "Ya hay un cupón en esta compra",
      boton: { texto: "Usar puntos", primario: false, accion: null },
      pildora: { texto: "Usar puntos", accion: null },
      ayuda,
    };
  }
  if (sinConexion) return apagado("Sin conexión no se pueden canjear", "Sin conexión");
  if (opciones.tipo === "saldo_corto") return apagado(`Con ${numero(resumen.config.canjeMinimo)} puntos ya puede canjear`);
  if (!hayArticulos) return apagado("Agrega prendas al ticket para canjear");
  if (opciones.tipo === "compra_corta") return apagado(`Para canjear, la compra debe ser de ${solesDelCupon(opciones.comprarAlMenos)} o más`);
  return {
    destacado,
    resto,
    bajada: "Crea un cupón al instante · no vencen",
    boton: { texto: "Usar puntos", primario: true, accion: "usar" },
    pildora: { texto: "Usar puntos", accion: "usar" },
    ayuda,
  };
}

/* ------------------------------------------------------------------ El cupón puesto en la compra */

/** El cupón que entra al ticket: lo que la caja necesita para repartirlo por prenda y mandarlo a la base. */
export type CuponPuesto = {
  codigo: string;
  valor: number;
  compraMinima: number;
  venceEl: string;
  /** «puntos» si salió de «Usar puntos» en esta venta; «codigo» si lo trajo el cliente (o lo ofreció la lista). */
  origen: "puntos" | "codigo";
  /** Nombre de pila de la dueña, si la base lo reveló (solo en «codigo»). */
  de: string | null;
};

export type TextoDelCupon = { titulo: string; detalle: string };

/** La línea del pie del ticket: «Cupón del Club CAY-…». */
export const TEXTO_PIE_CUPON = "Cupón del Club";

/** Lo que dice el cupón puesto debajo del código: de quién es y hasta cuándo. */
export function detalleDelCupon(c: CuponPuesto): string {
  if (c.origen === "puntos") return "Puntos canjeados en caja";
  return c.de ? `Cupón de ${c.de} · lo usa otra persona` : "Cupón canjeado en la tienda";
}

/** Para el `title` del pie: de cuánto es y la compra mínima. */
export function ayudaPieCupon(c: CuponPuesto, usado: number): string {
  if (usado < c.valor) return `El cupón es de ${solesDelCupon(c.valor)}: se usan ${solesDelCupon(usado)} y no queda saldo.`;
  return `Cupón de ${solesDelCupon(c.valor)} sobre toda la compra, repartido entre las prendas. Se usa una sola vez.`;
}

/** Después de cobrar («Venta registrada»). */
export const textoCuponCobrado = (monto: number) => `Cupón del Club usado (−S/${monto.toFixed(2)}). Es de una sola vez: devolver la compra no lo devuelve.`;

/** En el ticket impreso, que muestra el descuento de cada prenda: cuánto de eso es del cupón. */
export const textoCuponEnElRecibo = (monto: number) => `Incluye cupón del Club: -${monto.toFixed(2)}`;

/* ------------------------------------------------------------------ El código que escribe la cajera */

/** Lo que se escribió o escaneó, a la forma `CAY-XXXX-XXXX` (mayúsculas; sin espacios; los guiones se ponen solos). */
export function normalizarCodigo(texto: string): string {
  const limpio = texto.toUpperCase().replace(/[^A-Z0-9]/g, "");
  const cuerpo = limpio.startsWith("CAY") ? limpio.slice(3) : limpio;
  const partes = [cuerpo.slice(0, 4), cuerpo.slice(4, 8)].filter((p) => p !== "");
  return ["CAY", ...partes].join("-");
}

/** ¿Está completo (`CAY-XXXX-XXXX`)? Solo entonces se pregunta a la base. */
export const codigoCompleto = (codigo: string) => /^CAY-[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(codigo);

/** Sin cuerpo (solo «CAY-» o vacío): el campo se ve vacío y se muestra el ejemplo. */
export const codigoVacio = (codigo: string) => codigo === "" || codigo === "CAY";

/** «12 nov» (día y mes corto, sin año) para decir cuándo vence. */
function diaCorto(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!m) return iso;
  const meses = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
  return `${Number(m[3])} ${meses[Number(m[2]) - 1] ?? ""}`;
}

export type ResultadoDelCodigo =
  | { tipo: "ok"; cupon: CuponPuesto }
  | { tipo: "no"; tono: "error" | "atencion"; titulo: string; detalle: string };

/** Lo que `validar_cupon` dijo, en palabras de tienda. `bloqueado`: demasiados códigos que no existen. */
export function resultadoDelCodigo(v: ValidacionDeCupon): ResultadoDelCodigo {
  if (v.ok) {
    return {
      tipo: "ok",
      cupon: { codigo: v.codigo, valor: Number(v.valor), compraMinima: Number(v.compra_minima), venceEl: v.vence_el, origen: "codigo", de: v.de },
    };
  }
  switch (v.motivo) {
    case "no_existe":
      return { tipo: "no", tono: "error", titulo: "No encontramos ese código", detalle: "Revisa que esté completo (CAY-XXXX-XXXX)." };
    case "bloqueado":
      return {
        tipo: "no",
        tono: "error",
        titulo: "Demasiados intentos con códigos que no existen",
        detalle: "Por seguridad, los códigos se bloquean unos minutos. Puedes seguir vendiendo; vuelve a intentarlo en 5 minutos.",
      };
    case "usado":
      return { tipo: "no", tono: "atencion", titulo: "Este cupón ya se usó", detalle: "Cada cupón vale una sola vez." };
    case "vencido":
      return {
        tipo: "no",
        tono: "atencion",
        titulo: `Este cupón venció el ${diaCorto(v.vence_el)}`,
        detalle: "Los puntos ya volvieron al saldo de su dueño: puede crear otro cupón.",
      };
    case "minimo":
      return {
        tipo: "no",
        tono: "atencion",
        titulo: "La compra no llega al mínimo del cupón",
        detalle: `Pide una compra de ${solesDelCupon(Number(v.compra_minima))} o más; faltan ${solesDelCupon(Number(v.faltan))}.`,
      };
  }
}

/* ------------------------------------------------------------------ Cuando la base rechaza el cupón al cobrar */

const RECHAZOS_DEL_CUPON: ReadonlyMap<string, string> = new Map([
  ["cupon_ya_usado", "Otra caja lo usó antes. Quité el cupón: revisa el total con el cliente y vuelve a confirmar el cobro."],
  ["cupon_vencido", "El cupón venció. Quité el cupón: revisa el total con el cliente y vuelve a confirmar el cobro."],
  ["cupon_no_existe", "La base no reconoce ese código. Quité el cupón: revisa el total con el cliente y vuelve a confirmar el cobro."],
  ["cupon_compra_minima", "La compra bajó del mínimo del cupón. Quité el cupón: agrega prendas o cobra sin él."],
  ["cupon_cubre_todo", "El cupón cubre toda la compra. Quité el cupón: agrega otra prenda o cobra esta compra sin él."],
  ["cupon_sin_monto", "En esta venta no queda nada que descontar. Quité el cupón: queda para otra compra."],
  ["cupon_descuento_distinto", "Quité el cupón porque el cálculo no coincidió: vuelve a ponerlo y confirma el cobro."],
  ["club_un_cupon_por_compra", "Va un solo cupón por compra. Quité el cupón: elige uno y vuelve a confirmar el cobro."],
]);

/**
 * Qué hace la caja cuando `registrar_venta` rechaza el cupón: SIEMPRE lo quita (la venta no se guardó y NO se vuelve a mandar
 * sola sin el cupón: el cliente tiene que saber que paga más). null si el rechazo no es del cupón.
 */
export function rechazoDelCupon(hint: string | null | undefined): { detalle: string } | null {
  const r = hint ? RECHAZOS_DEL_CUPON.get(hint) : undefined;
  return r ? { detalle: `La venta no se guardó. ${r}` } : null;
}

/** Se cortó la conexión cobrando con un cupón: no va a la cola (otra caja podría usarlo a la vez). */
export function cuponSinConexion(): TextoDelCupon {
  return {
    titulo: "Se cortó la conexión: el cupón del Club no se usa sin internet",
    detalle:
      "Otra caja podría usarlo a la vez. Cuando vuelva la conexión, confirma otra vez: si ya se había guardado, el sistema la reconoce y no la duplica. Si el cliente no puede esperar, quita el cupón y cobra el total completo.",
  };
}

/** Por qué se quitó solo (sin que nadie tocara «Quitar»). */
export function avisoCuponApagado(valor: number): TextoDelCupon {
  return {
    titulo: `Se quitó el cupón del Club (${solesDelCupon(valor)})`,
    detalle: "Sin conexión no se usa: otra caja podría usarlo a la vez. Cuando vuelva la conexión, aplícalo otra vez.",
  };
}
