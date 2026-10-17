// Análisis v4 (ADR-0357, «Actualización 2026-10-16 — Análisis para decidir compras», A4): qué suma lo YA PEDIDO y cómo se dice. Lógica pura
// (sin base ni React): la usan «Qué pedir» (`alcancePorTipo`), «¿Qué pedir?» de Hoy y la nota de las filas de «Comprar».
//
// LA REGLA (la fija este archivo; Felipe puede cambiarla aquí, en `pedidoPorTipo`, sin tocar la base):
//   · SUMA a «tienes / vienen» del tipo (cuenta para saber si te alcanza):
//       – lo que ya va en un ENVÍO hacia mi tienda (ya salió del proveedor; llega aunque la fecha de la orden haya pasado o falte);
//       – lo pedido en una ORDEN abierta que llega a mi tienda, con entrega de hoy en adelante (y hasta la meta, si hay: un pedido
//         del 5 de enero no cubre el 25 de diciembre).
//   · SE MUESTRA y NO SUMA (nada de esto es una promesa que se pueda contar): lo pedido SIN fecha, lo pedido con la entrega VENCIDA, lo que
//     llega DESPUÉS de la meta, y lo que el proveedor debe reponer («No vino»; no tiene fecha).
//   · Es de la RED, no de mi tienda, y por eso nunca suma: lo pedido «por repartir» (llega a Lima y se reparte después) y lo que el Taller
//     tiene en proceso (mientras se cose no dice a qué tienda irá: decisión 6 de ADR-0357).
// Es la misma idea de A3 para las llegadas por prenda (`llegadasDe`): lo atrasado y lo que llega tarde no esconden una compra que sigue
// haciendo falta. Un tipo con una orden abierta con fecha no dice solo «pídelo»; uno con una orden sin fecha sigue diciéndolo y avisa que la hay.
// La decisión 7 («Análisis no sugiere cantidades») sigue intacta: esto dice qué hay pedido, nunca cuánto pedir.

import type { LlegadaPrenda, PartePedido } from "./analisis-tipos";
import { diasEntreFechas } from "./fechas-lima";
import { fechaCorta } from "./motor-demanda-reglas";
import { plural, porLlegar } from "./analisis-reglas";
import { numeroOrdenCompra } from "./ordenes-compra-reglas";

/** Lo ya pedido de UN tipo, partido en lo que suma y lo que solo se muestra. Todo en unidades. */
export type PedidoDeTipo = {
  /** Lo que suma a «tienes / vienen»: `enEnvio` + `deOrden`. */
  suma: number;
  /** De `suma`: lo que ya va en un envío hacia mi tienda. */
  enEnvio: number;
  /** De `suma`: lo pedido en una orden con entrega de hoy en adelante (y hasta la meta). */
  deOrden: number;
  /** La primera y la última entrega de `deOrden` (YYYY-MM-DD); null si no hay orden con fecha. */
  primeraFecha: string | null;
  ultimaFecha: string | null;
  /** NO suman — pedido a mi tienda: sin fecha, con la entrega vencida, después de la meta, y lo que el proveedor debe reponer. */
  sinFecha: number;
  atrasadas: number;
  /** Los días de la orden más atrasada (0 si ninguna lo está). */
  diasAtraso: number;
  despues: number;
  debe: number;
  /** NO suman — de la red, no de mi tienda. */
  porRepartir: number;
  enTaller: number;
  /** Los números de las órdenes de compra que suman algo de esto (menor a mayor) y sus marcas (por nombre). */
  ordenes: number[];
  marcas: string[];
};

const SIN_PEDIDO: PedidoDeTipo = Object.freeze({
  suma: 0,
  enEnvio: 0,
  deOrden: 0,
  primeraFecha: null,
  ultimaFecha: null,
  sinFecha: 0,
  atrasadas: 0,
  diasAtraso: 0,
  despues: 0,
  debe: 0,
  porRepartir: 0,
  enTaller: 0,
  ordenes: [],
  marcas: [],
});

/** Un tipo sin nada pedido (cero en todo). Una copia, para que quien la reciba pueda sumarle sin tocar la de todos. */
export const sinPedido = (): PedidoDeTipo => ({ ...SIN_PEDIDO, ordenes: [], marcas: [] });

/** El nombre del tipo como lo junta «Qué pedir»: recortado (`categoriaDe`). */
const tipoDe = (p: Pick<PartePedido, "categoria">): string => p.categoria.trim();

/** Lo pedido a mi tienda (sin la red): lo que hay de ella para decir «hay una orden abierta». */
export const pedidoDeMiTienda = (p: Pick<PedidoDeTipo, "suma" | "sinFecha" | "atrasadas" | "despues" | "debe">): number =>
  p.suma + p.sinFecha + p.atrasadas + p.despues + p.debe;

/**
 * Lo ya pedido, por tipo (el nombre del tipo, recortado). `hoy` (YYYY-MM-DD) separa lo vencido; `hasta` es el último día que importa (Navidad
 * hoy, el fin de la campaña con A6): lo que llega después se aparta. Sin `hasta` no se corta por arriba («Se está acabando» no mide contra
 * una meta). Una parte sin unidades no cuenta en ninguna.
 */
export function pedidoPorTipo(partes: readonly PartePedido[], hoy: string, hasta?: string): Map<string, PedidoDeTipo> {
  const porTipo = new Map<string, PedidoDeTipo>();
  const marcas = new Map<string, Set<string>>();
  const ordenes = new Map<string, Set<number>>();
  for (const x of partes) {
    if (!(x.cantidad > 0)) continue;
    const tipo = tipoDe(x);
    if (!tipo) continue;
    const t = porTipo.get(tipo) ?? sinPedido();
    porTipo.set(tipo, t);
    switch (x.de) {
      case "envio":
        t.suma += x.cantidad;
        t.enEnvio += x.cantidad;
        break;
      case "orden":
        if (x.fecha === null) t.sinFecha += x.cantidad;
        else if (x.fecha < hoy) {
          t.atrasadas += x.cantidad;
          t.diasAtraso = Math.max(t.diasAtraso, diasEntreFechas(x.fecha, hoy));
        } else if (hasta !== undefined && x.fecha > hasta) t.despues += x.cantidad;
        else {
          t.suma += x.cantidad;
          t.deOrden += x.cantidad;
          t.primeraFecha = t.primeraFecha === null || x.fecha < t.primeraFecha ? x.fecha : t.primeraFecha;
          t.ultimaFecha = t.ultimaFecha === null || x.fecha > t.ultimaFecha ? x.fecha : t.ultimaFecha;
        }
        break;
      case "reposicion":
        t.debe += x.cantidad;
        break;
      case "por_repartir":
        t.porRepartir += x.cantidad;
        break;
      case "taller":
        t.enTaller += x.cantidad;
        break;
    }
    // Las órdenes de compra y sus marcas (lo del Taller trae números de PRODUCCIÓN, no de orden).
    if (x.de !== "taller") {
      const n = ordenes.get(tipo) ?? new Set<number>();
      for (const numero of x.numeros) n.add(numero);
      ordenes.set(tipo, n);
      if (x.marca) marcas.set(tipo, (marcas.get(tipo) ?? new Set<string>()).add(x.marca));
    }
  }
  for (const [tipo, t] of porTipo) {
    t.ordenes = [...(ordenes.get(tipo) ?? [])].sort((a, b) => a - b);
    t.marcas = [...(marcas.get(tipo) ?? [])].sort((a, b) => a.localeCompare(b, "es"));
  }
  return porTipo;
}

/** Cierra una frase con un punto, salvo que ya lo traiga (la fecha corta termina en «nov.»: sin esto saldría «nov..»). */
const cierre = (frase: string): string => (frase.endsWith(".") ? frase : `${frase}.`);

/** «el 12 nov.», o «del 12 nov. al 30 nov.» si hay varias entregas. */
export function cuandoLlegan(p: Pick<PedidoDeTipo, "primeraFecha" | "ultimaFecha">): string | null {
  if (!p.primeraFecha) return null;
  return p.ultimaFecha && p.ultimaFecha !== p.primeraFecha ? `del ${fechaCorta(p.primeraFecha)} al ${fechaCorta(p.ultimaFecha)}` : `el ${fechaCorta(p.primeraFecha)}`;
}

/**
 * Cuándo llega lo que suma, en pocas palabras: «llegan el 12 nov.» (lo de las órdenes con fecha), «van en camino» (si todo va en un envío) o,
 * si hay las dos cosas, «30 en camino y 10 el 12 nov.» (la fecha es solo de lo que sigue en la orden: no se la pone a lo que ya salió).
 * Vacío si nada suma.
 */
function llegadaCorta(p: Pick<PedidoDeTipo, "enEnvio" | "deOrden" | "primeraFecha" | "ultimaFecha">): string {
  const cuando = cuandoLlegan(p);
  if (p.deOrden > 0 && cuando) return p.enEnvio > 0 ? `${p.enEnvio} en camino y ${p.deOrden} ${cuando}` : `${plural(p.deOrden, "llega", "llegan")} ${cuando}`;
  return p.enEnvio > 0 ? plural(p.enEnvio, "va en camino", "van en camino") : "";
}

/**
 * Lo que suma, corto, para la fila de «Qué pedir»: «Ya pedido 40 · llegan el 12 nov.» o, si todo va en un envío, «Ya pedido 30 · van en camino»
 * (y con las dos cosas, «Ya pedido 40 · 30 en camino y 10 el 12 nov.»). Vacío si nada suma.
 */
export function yaPedidoCorto(p: Pick<PedidoDeTipo, "suma" | "enEnvio" | "deOrden" | "primeraFecha" | "ultimaFecha">): string {
  if (p.suma <= 0) return "";
  const llegada = llegadaCorta(p);
  return `Ya pedido ${p.suma}${llegada ? ` · ${llegada}` : ""}`;
}

/**
 * Lo que suma, completo, para el panel del tipo y los tooltips: «Ya pedido 40: 30 van en un envío y 10 llegan el 12 nov.». Vacío si nada suma.
 */
export function yaPedidoDetalle(p: Pick<PedidoDeTipo, "suma" | "enEnvio" | "deOrden" | "primeraFecha" | "ultimaFecha">): string {
  if (p.suma <= 0) return "";
  const partes: string[] = [];
  if (p.enEnvio > 0) partes.push(`${p.enEnvio} ${plural(p.enEnvio, "va", "van")} en un envío`);
  if (p.deOrden > 0) {
    const cuando = cuandoLlegan(p);
    partes.push(`${p.deOrden} ${plural(p.deOrden, "llega", "llegan")}${cuando ? ` ${cuando}` : ""}`);
  }
  return cierre(`Ya pedido ${p.suma}${partes.length ? `: ${partes.join(" y ")}` : ""}`);
}

/**
 * Lo pedido que NO suma y lo de la red, en frases cortas para una segunda línea: «15 pedidas sin fecha: no las cuento», «6 pedidas con la entrega
 * vencida: no las cuento», «8 pedidas con entrega después de Navidad», «el proveedor debe 10», «30 por repartir desde Lima», «el Taller tiene 40 en proceso».
 * Vacío si no hay nada de eso. «Navidad» es la meta de hoy: con A6 sale de la campaña, junto con `llegadasAparte` de `analisis-pedir.ts`.
 */
export function pedidoAparte(p: Pick<PedidoDeTipo, "sinFecha" | "atrasadas" | "despues" | "debe" | "porRepartir" | "enTaller">, despues: string = "después de Navidad"): string[] {
  const f: string[] = [];
  if (p.sinFecha > 0) f.push(`${p.sinFecha} ${plural(p.sinFecha, "pedida", "pedidas")} sin fecha: no ${plural(p.sinFecha, "la cuento", "las cuento")}`);
  if (p.atrasadas > 0) f.push(`${p.atrasadas} ${plural(p.atrasadas, "pedida", "pedidas")} con la entrega vencida: no ${plural(p.atrasadas, "la cuento", "las cuento")}`);
  // «pedidas con entrega…», no «llegan…»: las prendas de `llegadasAparte` (compras y traslados) ya dicen «llegan después de Navidad» en la misma línea.
  if (p.despues > 0) f.push(`${p.despues} ${plural(p.despues, "pedida", "pedidas")} con entrega ${despues}`);
  if (p.debe > 0) f.push(`el proveedor debe ${p.debe}`);
  if (p.porRepartir > 0) f.push(`${p.porRepartir} por repartir desde Lima`);
  if (p.enTaller > 0) f.push(`el Taller tiene ${p.enTaller} en proceso`);
  return f;
}

/**
 * El tipo dentro de una frase, no como un título: «Camisas y Blusas» → «camisas y blusas» («Ya pedido: 40 camisas»). Una sigla (TOP) no se toca: solo baja la
 * mayúscula que va seguida de una minúscula.
 */
const enFrase = (tipo: string): string => tipo.trim().replace(/\p{Lu}(?=\p{Ll})/gu, (c) => c.toLowerCase());

/** «40 camisas», y «1 de camisas» cuando es una sola (el tipo va en plural: «1 camisas» no se lee). */
const unidadesDe = (n: number, tipo: string): string => (n === 1 ? `1 de ${tipo}` : `${n} ${tipo}`);

/** Lo que dice lo ya pedido de un tipo: el título («Ya pedido: 40 camisas»), cuándo llegan (o por qué no cuenta) y la ayuda del tooltip. */
type NotaDePedido = { titulo: string; detalle: string | null; ayuda: string };

/** Lo que no dice una orden: a qué modelo irá (se pide por tipo y marca). Va en la ficha de sus modelos y, entera, al pie de la franja de «Se está acabando». */
export const PEDIDO_SIN_MODELO = "la orden no dice a qué modelo irá";
export const NOTA_DE_LO_PEDIDO = `Se pide por tipo y marca: ${PEDIDO_SIN_MODELO}. Míralo antes de pedir más.`;

/**
 * Lo ya pedido de un TIPO (la prenda se acaba y no viene nada): «Ya pedido: 40 camisas» + cuándo llegan, o lo que haya (sin fecha, vencido, lo que el
 * proveedor debe). Dice «camisas», no el modelo: una orden se pide por tipo y marca, y Análisis no sabe a qué modelo irá. Por eso se dice UNA vez por
 * tipo, en una franja sobre las filas y en la ficha de sus modelos, y no en cada fila (segundo pase visual, 2026-10-17: «Ya pedido: 40 Camisas»
 * repetido en dos modelos se leía como «vienen 40 de ESTE modelo»).
 * null si a mi tienda no le han pedido nada de ese tipo (lo de la red no es una orden «a tu tienda»: no se pone).
 */
export function notaDePedidoDeTipo(tipo: string, p: PedidoDeTipo): NotaDePedido | null {
  if (pedidoDeMiTienda(p) <= 0) return null;
  const nombre = enFrase(tipo);
  let titulo: string;
  let detalle: string | null = null;
  if (p.suma > 0) {
    titulo = `Ya pedido: ${unidadesDe(p.suma, nombre)}`;
    detalle = llegadaCorta(p) || null;
  } else if (p.sinFecha > 0) {
    titulo = `Ya pedido: ${unidadesDe(p.sinFecha, nombre)}`;
    detalle = "sin fecha de entrega";
  } else if (p.atrasadas > 0) {
    titulo = `Pedido atrasado: ${unidadesDe(p.atrasadas, nombre)}`;
    detalle = `${p.diasAtraso} ${plural(p.diasAtraso, "día", "días")} sin llegar`;
  } else if (p.despues > 0) {
    titulo = `Ya pedido: ${unidadesDe(p.despues, nombre)}`;
    detalle = "llega después de Navidad";
  } else {
    titulo = `El proveedor debe ${unidadesDe(p.debe, nombre)}`;
    detalle = "falta reponer";
  }
  const quienes = [
    p.marcas.length > 0 ? `de ${p.marcas.join(", ")}` : null,
    p.ordenes.length > 0 ? p.ordenes.map(numeroOrdenCompra).join(", ") : null,
  ].filter((x): x is string => x !== null);
  const aparte = pedidoAparte(p).filter((x) => !x.startsWith("el Taller") && !x.includes("por repartir"));
  const ayuda = [
    `Hay una orden abierta de ${nombre}${quienes.length ? ` (${quienes.join(" · ")})` : ""}. Se pide por tipo y marca, así que no dice a qué modelo irá: míralo antes de pedir otra vez.`,
    yaPedidoDetalle(p),
    ...aparte.map((x) => cierre(`${x.charAt(0).toUpperCase()}${x.slice(1)}`)),
  ]
    .filter((x) => x !== "")
    .join(" ");
  return { titulo, detalle, ayuda };
}

/** Cuántos tipos se nombran en la franja antes de «y N más»: con 6 tipos pedidos, la franja no debe empujar las filas fuera de la pantalla. */
export const TIPOS_EN_LA_FRANJA = 3;

/** La franja de «Se está acabando»: una línea por tipo, y cuántos tipos más quedan sin nombrar. */
export type FranjaDePedido = { lineas: { tipo: string; texto: string; ayuda: string }[]; mas: number };

/**
 * Lo ya pedido de los tipos de las filas que SIGUEN en «Comprar» (las que ya vienen en camino a tiempo no se piden otra vez y no lo dicen), UNA vez
 * por tipo y en el orden de la lista (el tipo del modelo más urgente primero): «Ya pedido: 40 camisas · llegan el 29 oct.». Sale encima del carril, no
 * pegada a una fila: la orden es del TIPO y no dice a qué modelo irá. null si ninguna fila de «Comprar» tiene un tipo con algo pedido a mi tienda.
 * NO cambia en qué grupo cae ninguna prenda (una orden no dice a qué modelo irá).
 */
export function franjaDePedido(
  modelos: readonly { categoria: string | null; llega: LlegadaPrenda[] }[],
  porTipo: ReadonlyMap<string, PedidoDeTipo>,
  hoy: string,
): FranjaDePedido | null {
  const lineas: FranjaDePedido["lineas"] = [];
  const vistos = new Set<string>();
  for (const m of modelos) {
    if (porLlegar(m, hoy) > 0) continue;
    const tipo = m.categoria?.trim();
    if (!tipo || vistos.has(tipo)) continue;
    vistos.add(tipo);
    const delTipo = porTipo.get(tipo);
    const nota = delTipo ? notaDePedidoDeTipo(tipo, delTipo) : null;
    if (nota) lineas.push({ tipo, texto: nota.detalle ? `${nota.titulo} · ${nota.detalle}` : nota.titulo, ayuda: nota.ayuda });
  }
  if (lineas.length === 0) return null;
  return { lineas: lineas.slice(0, TIPOS_EN_LA_FRANJA), mas: Math.max(0, lineas.length - TIPOS_EN_LA_FRANJA) };
}

/**
 * Los tipos que tienen algo pedido PARA MI TIENDA y que «Qué pedir» no dibuja (la tienda no tiene ninguna prenda de ese tipo): sin esto,
 * quien busca el tipo y no lo ve volvería a pedirlo. De mayor a menor. Lo de la red no entra: el Taller produce de todo y no es una orden
 * a esta tienda.
 */
export function pedidoSinTipo(porTipo: ReadonlyMap<string, PedidoDeTipo>, tiposDibujados: ReadonlySet<string>): { categoria: string; unidades: number }[] {
  return [...porTipo]
    .filter(([tipo]) => !tiposDibujados.has(tipo))
    .map(([categoria, p]) => ({ categoria, unidades: pedidoDeMiTienda(p) }))
    .filter((t) => t.unidades > 0)
    .sort((a, b) => b.unidades - a.unidades || a.categoria.localeCompare(b.categoria, "es"));
}

/**
 * «También hay pedido para tu tienda de 40 Chalecos y 10 Sacos: hoy no tienen ventas ni stock aquí, así que no salen en la lista.» Dice lo que vale en
 * los dos casos en que un tipo no sale: la tienda no tiene ninguna prenda de ese tipo, o las tiene sin stock ni ventas.
 */
export function notaPedidoSinTipo(tipos: readonly { categoria: string; unidades: number }[]): string {
  const nombres = tipos.slice(0, 3).map((t) => `${t.unidades} ${t.categoria}`);
  const resto = tipos.length - nombres.length;
  const lista =
    resto > 0
      ? `${nombres.join(", ")} y ${resto} ${plural(resto, "tipo más", "tipos más")}`
      : nombres.length > 1
        ? `${nombres.slice(0, -1).join(", ")} y ${nombres[nombres.length - 1]}`
        : (nombres[0] ?? "");
  return `También hay pedido para tu tienda de ${lista}: hoy no ${tipos.length === 1 ? "tiene" : "tienen"} ventas ni stock aquí, así que no ${tipos.length === 1 ? "sale" : "salen"} en la lista.`;
}
