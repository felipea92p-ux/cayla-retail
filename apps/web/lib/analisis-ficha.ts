// Análisis v4 (ADR-0357): la ficha de una prenda, en tarjetitas y gráficos (Felipe: nada de párrafos). Lógica pura, probada en
// `analisis-ficha.test.ts`: qué tarjetitas lleva según su grupo, las 8 semanas con su fecha, dónde hay en la red, el modelo
// entero en mi tienda (talla × color), el dinero y los botones del pie. La ficha (`components/analisis/FichaPrenda.tsx`) solo
// dibuja lo que esto decide, con las clases de la maqueta aprobada (`hechos()`, `fichaHTML()` y `grillaHTML()`).
//
// No agrega reglas de negocio: el grupo sale de `grupoDe` (el mismo de las pestañas) y cada botón de `analisis-acciones.ts`.

import type { AccesoAnalisis, LlegadaPrenda, OrigenLlegada, PrendaAnalisis, SedeAnalisis } from "./analisis-tipos";
import {
  DIAS_MINIMOS_RITMO,
  DIAS_TRES_MESES,
  diasQueQuedan,
  type GrupoAnalisis,
  llegadaAtrasada,
  llegadasDe,
  otraSedeQueLaTiene,
  plural,
  porLlegar,
  sedeQueMasVende,
  totalEnTienda,
  ventanaDe,
} from "./analisis-reglas";
import { llegaTarde, lecturaDeRitmo, textoAtraso, textoDejasDeGanar, textoLlegaTarde, textoTeDura, UNA_SEMANA, type LlegaTarde } from "./analisis-acaba";
import { ritmoReciente } from "./analisis-ritmo";
import { notaDePedidoDeTipo, PEDIDO_SIN_MODELO, type PedidoDeTipo } from "./analisis-pedido-en-camino-reglas";
import { FUENTE_CORTA, type ProveedorDelModelo } from "./analisis-a-quien-pedir";
import { razonSinRitmo } from "./analisis-quietas";
import { hrefComprar, hrefEnviar, hrefLiquidar, hrefRegistrarVentas, hrefReponerPiso, type DondeComprar } from "./analisis-acciones";
import { estiloMosaicoColor } from "./color-prenda-reglas";
import { queTiene } from "./analisis-modelo";
import { diaAntes, fechaCorta } from "./motor-demanda-reglas";
import { compararTallas } from "./tallas";

/** El color de una tarjetita o de un chip, con el nombre de su token (la ficha lo traduce a `var(--color-…)`). */
export type TonoFicha = "rojo" | "ambar" | "verde" | "pizarra" | "taupe";

/** Los íconos que usan las tarjetitas (todos existen en `components/analisis/iconos.tsx`). */
export type IconoHecho = "agotado" | "reloj" | "check" | "tijera" | "caja" | "llega" | "flechas" | "urg" | "camion" | "etiqueta";

/**
 * Una tarjetita: el dato grande y, debajo, de qué es («Quedan 9 días · tienes 2»). `mas`: más líneas chicas bajo la primera (lo que llega, parte
 * por parte). `ancho: "completo"`: una franja de todo el ancho, no una tarjeta de la cuadrícula de cifras: el proveedor y lo que viene en camino
 * llevan frases, y un nombre largo en una tarjeta de 112 px se partía a media palabra («Confeccione|s»).
 */
export type Hecho = { icono: IconoHecho; tono: TonoFicha; valor: string; etiqueta: string | null; mas?: string[]; ancho?: "completo" };

/** El estado del chip de arriba: los de Análisis (urgente, atención, va bien, todavía no). */
export type EstadoFicha = "urg" | "ate" | "bien" | "nd";

const CHIP_GRUPO: Record<GrupoAnalisis, { est: EstadoFicha; texto: string }> = {
  comprar: { est: "urg", texto: "Cómpralas" },
  enviar: { est: "ate", texto: "Mándalas a donde sí se venden" },
  liquidar: { est: "ate", texto: "Liquidar" },
  vigila: { est: "nd", texto: "Vigílalas" },
  duda: { est: "nd", texto: "Aún no se sabe" },
  sin_ritmo: { est: "nd", texto: "Todavía sin ritmo" },
};

/**
 * El chip de la prenda: el título de su grupo, con el estado del grupo; sin grupo, «Va bien», salvo lo guardado que nunca salió al
 * piso (`sinSalir`, 20261007120000): eso no «va bien», nadie lo vio.
 *
 * `yaViene` (algo llega a tiempo, `porLlegar`): un modelo que se acaba pero YA viene en camino no es un «Cómpralas» en rojo (el carril lo pone
 * en «Ya vienen», sin rojo, y la ficha no puede contradecirlo): dice «Ya viene». Si lo que viene llega DESPUÉS de que se acabe al ritmo de la
 * cifra principal (`tarde`, de `llegaTarde`, con `unos` días sin stock), no puede decir «Ya viene» en verde junto a «Llega tarde · te quedas
 * unos 4 días sin stock»: dice «Ya viene, pero tarde», en ámbar. Con `unos` en 0 (a ese ritmo llega a tiempo y solo el peor caso la pasa) la
 * franja dice «Puede llegar tarde», una duda y no un hecho: el chip sigue en «Ya viene» (la duda queda en la franja y en el tooltip).
 *
 * `unaVenta` (el ritmo sale de UNA sola venta, D6 de Felipe 2026-10-16): sigue en «Cómpralas», pero en ámbar y no en rojo; el chip «Una sola
 * venta» lo acompaña. Un dato así de flaco no grita.
 *
 * `dias` (los que quedan, `diasQueQuedan`): el rojo es de lo que se agotó o queda una semana o menos, como la barra del carril (`colorDias`); con
 * más días, «Cómpralas» va en ámbar (segundo pase visual, 2026-10-17: el Bolso con 13 días salía en rojo con ⚠ junto a una barra ámbar). Sin
 * el dato (null), como siempre: rojo.
 */
export function chipDeGrupo(
  grupo: GrupoAnalisis | null,
  sinSalir = false,
  yaViene = false,
  unaVenta = false,
  dias: number | null = null,
  tarde: Pick<LlegaTarde, "unos"> | null = null,
): { est: EstadoFicha; texto: string } {
  if (grupo === "comprar" && yaViene) return tarde && tarde.unos > 0 ? { est: "ate", texto: "Ya viene, pero tarde" } : { est: "bien", texto: "Ya viene" };
  if (grupo === "comprar" && (unaVenta || (dias !== null && dias > UNA_SEMANA))) return { est: "ate", texto: CHIP_GRUPO.comprar.texto };
  if (grupo) return CHIP_GRUPO[grupo];
  return sinSalir ? { est: "ate", texto: "Nunca salió al piso" } : { est: "bien", texto: "Va bien" };
}

/** Soles como se leen en una ficha: «S/ 60» si es entero, «S/ 59.90» si no; «—» si no se sabe. */
export function solesFicha(n: number | null): string {
  if (n === null || !Number.isFinite(n)) return "—";
  const centimos = Math.round(Math.abs(n) * 100);
  const decimales = centimos % 100 === 0 ? 0 : 2;
  const texto = (centimos / 100).toLocaleString("es-PE", { minimumFractionDigits: decimales, maximumFractionDigits: decimales });
  return `${n < 0 && centimos > 0 ? "−" : ""}S/\u00a0${texto}`;
}

/** La línea bajo el nombre: «Celeste · talla S · S/ 60» (sin precio, sin esa parte). */
export function subtituloFicha(p: Pick<PrendaAnalisis, "color" | "talla" | "precio"> & { variantes?: readonly Pick<PrendaAnalisis, "precio">[]; colores?: string[]; tallas?: string[] }): string {
  // De un modelo (ADR-0357, decisión 12): sus colores y tallas, y su precio; si sus tallas tienen precios distintos, «desde» el menor.
  if (p.variantes && p.colores && p.tallas) {
    const precios = p.variantes.map((v) => v.precio).filter((x): x is number => x !== null);
    const menor = precios.length > 0 ? Math.min(...precios) : null;
    const precio = menor === null ? null : precios.every((x) => x === menor) ? solesFicha(menor) : `desde ${solesFicha(menor)}`;
    return [queTiene({ colores: p.colores, tallas: p.tallas }), precio].filter(Boolean).join(" · ");
  }
  return [p.color, p.talla ? `talla ${p.talla}` : null, p.precio === null ? null : solesFicha(p.precio)].filter(Boolean).join(" · ");
}

/** «Costó cada una» y «Ganas por cada una» (precio − costo, con el IGV del precio adentro: pendiente de Felipe, ADR-0357 act. 2026-10-16); «—» si falta uno de los dos. */
export function dineroDe(p: Pick<PrendaAnalisis, "precio" | "costo">): { costo: string; ganas: string } {
  return { costo: solesFicha(p.costo), ganas: p.precio === null || p.costo === null ? "—" : solesFicha(p.precio - p.costo) };
}

/** De dónde viene cada parte de lo que llega, como se dice en tienda: «pediste 10» (una compra), «del almacén 2», «del taller 1», «de otra tienda 3». */
const PARTE_DE_LLEGADA: Record<OrigenLlegada, (n: number) => string> = {
  compra: (n) => `pediste ${n}`,
  almacen: (n) => `del almacén ${n}`,
  taller: (n) => `del taller ${n}`,
  tienda: (n) => `de otra tienda ${n}`,
};

/**
 * Una parte de lo que viene, en una línea con su fecha: «pediste 10 · llega el 20 oct.», «pediste 6 · sin fecha» (nadie anotó cuándo; no se
 * inventa una) y, si ya pasó, «pediste 8 · debía llegar el 20 sep.». Antes decía «compra 16», que se leía como una orden («compra 16 unidades»).
 */
function lineaDeLlegada(x: LlegadaPrenda, hoy: string): string {
  const cuando =
    x.fecha === null ? "sin fecha" : x.fecha === hoy ? "llega hoy" : x.fecha < hoy ? `debía llegar el ${fechaCorta(x.fecha)}` : `llega el ${fechaCorta(x.fecha)}`;
  return `${PARTE_DE_LLEGADA[x.de](x.cantidad)} · ${cuando}`;
}

/** Las líneas de varias partes, de la que llega antes a la que llega después (lo que no tiene fecha, al final). */
function lineasDeLlegadas(partes: readonly LlegadaPrenda[], hoy: string): string[] {
  const orden = (f: string | null) => f ?? "9999-12-31";
  return [...partes]
    .filter((x) => x.cantidad > 0)
    .sort((a, b) => orden(a.fecha).localeCompare(orden(b.fecha)))
    .map((x) => lineaDeLlegada(x, hoy));
}

/**
 * Lo que llega antes y después de la meta, para que quien compra sepa si lo que viene alcanza: «10 antes de Navidad, 6 después» o, si nada
 * llega antes, «6 llegan después de Navidad». null si nada llega después (no hay qué decir).
 */
function textoAntesYDespues(antes: number, despues: number, meta: string): string | null {
  if (despues <= 0) return null;
  return antes > 0 ? `${antes} antes de ${meta}, ${despues} después` : `${despues} ${plural(despues, "llega", "llegan")} después de ${meta}`;
}

/** La meta contra la que se mide lo que viene en camino (hoy, Navidad: `proximaNavidad`; con la meta por campaña, el fin de la campaña). */
type MetaDeLlegada = { hasta: string; nombre: string };

/**
 * «en 30 días» o, si la tienda tiene menos días de ventas en el ERP, «en 8 días»: de qué días habla «Vendiste». Si la prenda lleva menos días
 * colgada que la tienda vendiendo, su ritmo se mide desde que se colgó (`ventanaDeRitmo`) y se dice: «en 23 días, desde que se colgó». Sin eso, la
 * misma ficha decía «6 en 23 días» arriba y «6 en 30 días» abajo y no explicaba la diferencia (segundo pase visual, 2026-10-17). En el mínimo de una
 * semana no se dice «desde que se colgó»: una colgada hace 3 días también se mide en 7.
 */
const enDias = (p: Pick<PrendaAnalisis, "diasDeVentas" | "diasDeVentasTienda">): string => {
  const n = p.diasDeVentas ?? 30;
  const desdeQueSeColgo = n < (p.diasDeVentasTienda ?? n) && n > DIAS_MINIMOS_RITMO;
  return `en ${n} ${plural(n, "día", "días")}${desdeQueSeColgo ? ", desde que se colgó" : ""}`;
};

/** La primera letra en mayúscula: «puede acabarse en 5 días» → «Puede acabarse en 5 días». */
const mayuscula = (texto: string): string => texto.charAt(0).toUpperCase() + texto.slice(1);

/** El código de una tienda para las tarjetitas («AQP tiene 3»); si no está en la red, «Otra tienda». */
const codigoDe = (sedes: readonly SedeAnalisis[], id: string): string => sedes.find((s) => s.id === id)?.codigo ?? "Otra tienda";

/**
 * Las tarjetitas de la ficha, como `hechos()` de la maqueta. Lo que se acaba dice cuánto le queda, cuánto vendió, de dónde se
 * repone, lo que ya viene y qué otra tienda la tiene; lo quieto dice cuánto lleva en el piso sin venderse, cuánto hay y qué toca
 * (mandarla o liquidarla); lo que nunca salió al piso (`sinSalir`: sus días en el almacén, o null si no se sabe cuándo llegó), cuánto
 * lleva guardado y cuánto hay; lo que va bien, cuánto vendió y cuánto hay.
 */
export function hechosDe(
  p: PrendaAnalisis,
  grupo: GrupoAnalisis | null,
  sedes: readonly SedeAnalisis[],
  /** El día de hoy en Lima (YYYY-MM-DD): con él, lo que ya se atrasó no se cuenta como «Por llegar» (A3). */
  hoy: string,
  sinSalir: { dias: number | null } | null = null,
  /** A quién se le pide (A8, `proveedorDelModelo`): con él la franja dice el proveedor por su nombre y de dónde se sabe. Sin él (no se
   *  pudo leer), «Proveedor taller» o «Proveedor terceros», como antes. */
  proveedor: ProveedorDelModelo | null = null,
  /** La meta contra la que se mide lo que viene (Navidad): con ella, lo que llega después se dice («10 antes de Navidad, 6 después»). */
  meta: MetaDeLlegada | null = null,
  /** Lo ya pedido de su TIPO (`pedidoPorTipo`): una orden es del tipo y no dice a qué modelo irá, así que la ficha de sus modelos lo dice igual que la
   *  franja sobre el carril. Solo en lo que sigue en «Comprar» (lo que ya viene no lo pide otra vez). */
  pedidoDelTipo: PedidoDeTipo | null = null,
): Hecho[] {
  const hechos: Hecho[] = [];
  const agregar = (icono: IconoHecho, tono: TonoFicha, valor: string, etiqueta: string | null = null, extra: Pick<Hecho, "mas" | "ancho"> = {}) =>
    hechos.push({ icono, tono, valor, etiqueta, ...extra });
  const tienes = totalEnTienda(p);

  if (grupo === "comprar") {
    const d = diasQueQuedan(p) ?? 0;
    // La base del número (A5, 2026-10-16): cuántas ventas sostienen los días, el rango y, si ya no hay, lo que cuesta esperar (A15).
    const ritmo = lecturaDeRitmo(p, hoy);
    if (d === 0) {
      // Lo que cuesta esperar va de bajada de «Ya no hay», no como una tarjeta más: con ella la cuadrícula de 4 quedaba en 5 y «TRU tiene 5» caía
      // sola a otra fila, y «~S/ 17 por día» se partía en dos líneas (segundo pase visual, 2026-10-17).
      agregar("agotado", ritmo?.unaVenta ? "ambar" : "rojo", "Ya no hay", ritmo && ritmo.margenDia !== null ? textoDejasDeGanar(solesFicha(ritmo.margenDia)) : "en tu tienda");
    } else {
      // UNA tarjeta con la cifra y su rango (antes, «Quedan 12 días» y, debajo, «Puede acabarse en 8 días · entre 8 y 17»: dos números para lo mismo).
      const dura = textoTeDura(d, ritmo, tienes);
      agregar("reloj", d <= UNA_SEMANA ? "ambar" : "pizarra", dura.valor, dura.etiqueta);
    }
    agregar("check", "verde", `Vendiste ${p.vendidas30}`, enDias(p));
    if (ritmo?.agotada && ritmo.hace) agregar("reloj", "pizarra", mayuscula(ritmo.hace), "fue tu última venta");
    // Si la última semana vendió claramente más que el ritmo de la ventana, se dice junto a la cifra: el gráfico de abajo lo mostraba (1 → 2 → 4) y la
    // cifra no. No la cambia. Una franja: es una frase.
    const reciente = ritmo?.agotada ? null : ritmoReciente({ semanas: p.semanas, enStock: tienes, ventas: p.vendidas30, ventana: ventanaDe(p) });
    if (reciente) {
      agregar("reloj", "ambar", `La última semana vendiste ${reciente.vendidas}`, `a ese paso te quedan ~${reciente.dias} ${plural(reciente.dias, "día", "días")}`, { ancho: "completo" });
    }
    // A quién se le pide va en una FRANJA de ancho completo, no en la cuadrícula de cifras: un nombre largo en una tarjeta de 112 px se partía a media
    // palabra. Un proveedor archivado no se recomienda: se dice que falta elegir otro (Felipe 2026-10-16).
    const completo = { ancho: "completo" } as const;
    // La franja dice el nombre y de dónde se sabe, nunca «pídelo aquí» (no es un enlace y, con algo en camino, empujaba a pedirlo dos veces).
    const yaViene = porLlegar(p, hoy) > 0;
    if (proveedor && (proveedor.fuente === "taller" || proveedor.fuente === "catalogo" || proveedor.fuente === "compra")) {
      const taller = proveedor.fuente === "taller";
      const fuente = FUENTE_CORTA[proveedor.fuente];
      // «pídelo aquí» invitaba a tocar y no era un enlace (segundo pase visual, 2026-10-17): queda de dónde se sabe, que es lo que la fila ya dice.
      const etiqueta = taller ? null : fuente;
      agregar(taller ? "tijera" : "caja", "taupe", taller ? "Taller de CAYLA" : proveedor.nombre, etiqueta, completo);
    } else if (proveedor?.fuente === "archivado") {
      agregar("caja", "taupe", "Sin proveedor", `${proveedor.nombre} está archivado: elige otro`, completo);
    } else if (p.origen) {
      agregar(p.origen === "taller" ? "tijera" : "caja", "taupe", p.origen === "taller" ? "Proveedor taller" : "Proveedor terceros", null, completo);
    } else if (proveedor) {
      // Se leyó y el modelo no tiene a quién: se dice (no se calla), sin inventar uno.
      agregar("caja", "taupe", "Sin proveedor", FUENTE_CORTA.ninguno, completo);
    }
    // Lo ya pedido de su TIPO (una orden no dice a qué modelo irá): la ficha lo dice igual que la franja sobre el carril. Con algo YA en camino a tiempo no se
    // dice (esa prenda no se pide otra vez).
    const pedido = !yaViene && p.categoria && pedidoDelTipo ? notaDePedidoDeTipo(p.categoria, pedidoDelTipo) : null;
    if (pedido) agregar("llega", "pizarra", pedido.titulo, [pedido.detalle, PEDIDO_SIN_MODELO].filter(Boolean).join(" · "), completo);
    // Lo que viene en camino: UNA franja con cada parte y su fecha («pediste 10 · llega el 20 oct.»), si llega tarde, lo que llega después de la meta y lo
    // atrasado (A3, plan verificado 2026-10-16). Antes eran dos tarjetas («Por llegar» y «Atrasada») y la segunda quedaba sola en otra fila.
    const llegadas = llegadasDe(p.llega, hoy, meta?.hasta);
    const aTiempo = p.llega.filter((x) => !llegadaAtrasada(x, hoy));
    const tardias = p.llega.filter((x) => llegadaAtrasada(x, hoy));
    const total = llegadas.vienen + llegadas.despues;
    // Si lo que viene llega DESPUÉS de que se acabe, la franja pasa a ámbar y lo dice (segundo pase visual, 2026-10-17).
    const tarde = llegaTarde(p, hoy);
    if (total > 0) {
      const lineas = lineasDeLlegadas(aTiempo, hoy);
      if (tarde) lineas.push(textoLlegaTarde(tarde));
      const corte = meta ? textoAntesYDespues(llegadas.vienen, llegadas.despues, meta.nombre) : null;
      if (corte) lineas.push(corte);
      if (llegadas.atrasadas > 0) lineas.push(`${llegadas.atrasadas} ${plural(llegadas.atrasadas, "atrasada", "atrasadas")} hace ${llegadas.diasAtraso} ${plural(llegadas.diasAtraso, "día", "días")}`);
      agregar("llega", llegadas.atrasadas > 0 || tarde ? "ambar" : "verde", `Por llegar ${total}`, lineas[0] ?? null, { ancho: "completo", mas: lineas.slice(1) });
    } else if (llegadas.atrasadas > 0) {
      // Nada viene a tiempo: lo que debía llegar y no llegó vuelve a «Comprar» y se dice con sus fechas.
      agregar("llega", "ambar", textoAtraso(llegadas.diasAtraso), `${llegadas.atrasadas} sin llegar`, { ancho: "completo", mas: lineasDeLlegadas(tardias, hoy) });
    }
    const alla = otraSedeQueLaTiene(p.otras);
    if (alla) agregar("flechas", "pizarra", `${codigoDe(sedes, alla.sedeId)} tiene ${alla.stock}`, "se podría pedir");
    return hechos;
  }

  if (grupo === "enviar" || grupo === "liquidar" || grupo === "vigila") {
    const dias = p.diasSinVender ?? 0;
    const grave = dias >= DIAS_TRES_MESES;
    agregar(grave ? "urg" : "reloj", grave ? "rojo" : "ambar", `${dias} ${plural(dias, "día", "días")}`, "en el piso sin venderse");
    // Contra qué se juzgó (ADR-0357, act. 2026-10-14): lo que tardan los de su tipo que sí se vendieron en el piso de la tienda.
    if (p.umbrales) agregar("reloj", "pizarra", `${p.umbrales.liquidar} ${plural(p.umbrales.liquidar, "día", "días")}`, "tardan 9 de cada 10 de su tipo");
    agregar("caja", "taupe", `Tienes ${tienes}`, `${p.piso} en el piso`);
    const vende = grupo === "enviar" ? sedeQueMasVende(p.otras) : null;
    if (vende) agregar("camion", "ambar", `${codigoDe(sedes, vende.sedeId)} vendió ${vende.vendidas30}`, "este mes");
    if (grupo === "liquidar") agregar("etiqueta", grave ? "rojo" : "ambar", "Liquidar", "tú eliges cuánto");
    return hechos;
  }

  // Quieta, pero su tipo todavía no vendió lo suficiente para saber cuánto tarda en venderse (ADR-0357, act. 2026-10-17, B1): ni se rebaja ni se manda, y
  // la ficha dice por qué con las mismas palabras que la fila del carril. Sin un número de días de respaldo.
  if (grupo === "sin_ritmo") {
    const dias = p.diasSinVender ?? 0;
    agregar("reloj", "pizarra", `${dias} ${plural(dias, "día", "días")}`, "en el piso sin venderse");
    agregar("caja", "taupe", `Tienes ${tienes}`, `${p.piso} en el piso`);
    const razon = razonSinRitmo(p);
    if (razon) agregar("flechas", "pizarra", "Todavía sin ritmo", razon, { ancho: "completo" });
    return hechos;
  }

  // Quieta, pero alguna unidad colgada puede ser una venta sin registrar (ADR-0357, act. 2026-10-14): los días sin venderse no son ciertos.
  if (grupo === "duda") {
    const dias = p.diasSinVender ?? 0;
    const n = p.enDuda ?? 0;
    agregar("reloj", "pizarra", `${dias} ${plural(dias, "día", "días")}`, "sin una venta registrada");
    agregar("flechas", "pizarra", `${n} en duda`, plural(n, "puede ser una venta sin registrar", "pueden ser ventas sin registrar"));
    agregar("caja", "taupe", `Tienes ${tienes}`, `${p.piso} en el piso`);
    return hechos;
  }

  if (sinSalir) {
    const d = sinSalir.dias;
    agregar("reloj", "ambar", d === null ? "Nunca salió al piso" : `${d} ${plural(d, "día", "días")}`, d === null ? null : "en el almacén, sin salir al piso");
    agregar("caja", "taupe", `Tienes ${tienes}`, "0 en el piso");
    return hechos;
  }

  agregar("check", "verde", `Vendiste ${p.vendidas30}`, enDias(p));
  agregar("caja", "taupe", `Tienes ${tienes}`, `${p.piso} en el piso`);
  return hechos;
}

// ───────── Ventas por semana ─────────

/** Cuántas semanas dibuja la ficha (las que trae `PrendaAnalisis.semanas`). */
export const SEMANAS_FICHA = 8;
/** El alto, en px, de la barra de la semana que más vendió (la maqueta). */
const ALTO_BARRA = 62;

/**
 * El primer día de cada semana que dibuja la ficha (YYYY-MM-DD), de la más vieja a la de hoy. Es la misma semana que cuenta la
 * lectura (`fn_analisis_sede`, 20261006214000): la semana k (0 a 7) son los 7 días que terminan hoy − 7·(7−k), así que la última
 * va de hace 6 días a hoy (y hoy puede estar a medias). Si la lectura cambia de semana, esto cambia con ella.
 */
export function iniciosDeSemana(hoy: string, n: number = SEMANAS_FICHA): string[] {
  return Array.from({ length: n }, (_, k) => diaAntes(hoy, 7 * (n - 1 - k) + 6));
}

/** Una barra de «Ventas por semana»: su fecha de inicio («29 set.»), lo vendido, su alto y su tooltip. */
export type BarraSemana = { inicio: string; etiqueta: string; vendidas: number; alto: number; ultima: boolean; tip: string };

/**
 * Las 8 barras, cada una con el primer día de su semana: la última (la que termina hoy) va en tinta. Si la lectura trae más
 * semanas se toman las últimas 8; si trae menos, las que faltan al principio valen 0 (no se inventa venta).
 */
export function barrasSemanas(semanas: readonly number[], hoy: string): BarraSemana[] {
  const ultimas = semanas.slice(-SEMANAS_FICHA).map((n) => (Number.isFinite(n) && n > 0 ? n : 0));
  const valores = [...Array<number>(SEMANAS_FICHA - ultimas.length).fill(0), ...ultimas];
  const max = Math.max(1, ...valores);
  return iniciosDeSemana(hoy).map((inicio, j) => {
    const vendidas = valores[j];
    const etiqueta = fechaCorta(inicio);
    return {
      inicio,
      etiqueta,
      vendidas,
      alto: Math.round((vendidas / max) * ALTO_BARRA),
      ultima: j === SEMANAS_FICHA - 1,
      tip: `Semana del ${etiqueta}: ${vendidas} ${plural(vendidas, "vendida", "vendidas")}`,
    };
  });
}

// ───────── El modelo en tu tienda: una frase, una tabla y las otras tiendas (Felipe 2026-10-10, opción B) ─────────
//
// Antes eran tres secciones con los mismos números («Dónde hay», «Lo que más sale» y la grilla talla × color, con «0» rayados en rojo
// que había que adivinar) y dos ventanas de días distintas para la misma cifra. Felipe eligió mirando la lámina (artifact privado
// 4mRrK4dotpJUnDg5tis9u2) la B: una frase que responde, UNA tabla donde cada celda dice con palabras qué pasó, con totales, y los
// colores que más se venden arriba.

const unidades = (n: number, una: string, varias: string): string => `${n} ${plural(n, una, varias)}`;

/**
 * La frase de arriba: «Vendiste 10 en tus últimos 11 días y te queda 1.» (o «no te queda ninguna», o «no vendiste ninguna»). Dice «tus últimos N días»: son los
 * días de ventas de la TIENDA (hasta 30), y la tarjeta de arriba cuenta desde que se colgó la prenda; sin decirlo, la misma ficha tenía «6 en 23 días» y «6 en
 * 30 días» y no explicaba la diferencia (segundo pase visual, 2026-10-17).
 */
export function fraseDelModelo(m: { variantes: readonly PrendaAnalisis[] }, diasDeVentas: number): string {
  const vendio = m.variantes.reduce((s, v) => s + v.vendidas30, 0);
  const tiene = m.variantes.reduce((s, v) => s + totalEnTienda(v), 0);
  const enDias = diasDeVentas === 1 ? "tu último día" : `tus últimos ${diasDeVentas} días`;
  const queda = tiene === 0 ? "no te queda ninguna" : tiene === 1 ? "te queda 1" : `te quedan ${tiene}`;
  if (vendio === 0) return `No vendiste ninguna en ${enDias}; ${queda}.`;
  return `Vendiste ${vendio} en ${enDias} y ${queda}.`;
}

/** Qué pasó con una talla de un color: se vendió y no hay stock (`pedir`), te queda (`queda`) o no hay (`nada`). */
export type EstadoCelda = "pedir" | "queda" | "nada";

export type CeldaTabla = {
  talla: string;
  estado: EstadoCelda;
  /** Arriba, siempre lo vendido («2 vendidas», «sin ventas»); abajo, lo que queda («quedan 2», «sin stock»); `nada` solo dice «no hay». */
  fuerte: string;
  suave: string | null;
  /** Para el lector y el tooltip: «Blanco · M: 2 vendidas, sin stock». */
  tip: string;
};

export type FilaTabla = {
  color: string;
  punto: string | null;
  vendio: number;
  /** Se vendió y el color ya no tiene stock en ninguna talla (Felipe 2026-10-12: «que exista algún indicador que alerte que ya no hay
   *  stock»). Lo que nunca se vendió ni hay no se alerta: su celda ya dice «no hay». */
  sinStock: boolean;
  celdas: CeldaTabla[];
};

export type TablaModelo = {
  /** Las tallas en el orden de tienda (`compararTallas`). */
  tallas: string[];
  /** Un color por fila, del que más vendiste al que menos; a igual venta, el que más tienes; después, por nombre. */
  filas: FilaTabla[];
  /** Lo vendido por talla (la fila de abajo) y en total. */
  vendioPorTalla: number[];
  vendio: number;
};

function celda(color: string, talla: string, vs: readonly PrendaAnalisis[]): CeldaTabla {
  const nombre = [color, talla].filter(Boolean).join(" · ");
  if (vs.length === 0) return { talla, estado: "nada", fuerte: "no hay", suave: null, tip: `${nombre}: no hay` };
  const vendio = vs.reduce((s, v) => s + v.vendidas30, 0);
  const tiene = vs.reduce((s, v) => s + totalEnTienda(v), 0);
  // Siempre igual (Felipe 2026-10-12): arriba, en negrita, lo vendido; abajo, lo que queda. Antes, con stock la negrita era «quedan 2»
  // y sin stock era «2 vendidas»: la misma línea decía dos cosas distintas según la celda.
  const fuerte = vendio > 0 ? unidades(vendio, "vendida", "vendidas") : "sin ventas";
  if (tiene > 0) {
    const suave = tiene === 1 ? "queda 1" : `quedan ${tiene}`;
    return { talla, estado: "queda", fuerte, suave, tip: `${nombre}: ${fuerte}, ${suave}` };
  }
  if (vendio > 0) {
    return { talla, estado: "pedir", fuerte, suave: "sin stock", tip: `${nombre}: ${fuerte}, sin stock` };
  }
  return { talla, estado: "nada", fuerte: "no hay", suave: null, tip: `${nombre}: no hay` };
}

/** La tabla del modelo; null si tiene una sola talla de un solo color (la frase ya lo dice todo). */
export function tablaDelModelo(m: { variantes: readonly PrendaAnalisis[] }): TablaModelo | null {
  const tallas = [...new Set(m.variantes.map((v) => v.talla))].sort(compararTallas);
  const colores = [...new Set(m.variantes.map((v) => v.color))];
  if (tallas.length < 2 && colores.length < 2) return null;
  // Solo por lo que más se vendió, quede o no (Felipe 2026-10-12); a igual venta, por nombre. Lo que no tiene stock lo alerta su fila.
  // Entre lo que no se vendió, lo que todavía tienes va antes; lo que ni se vendió ni tienes («no hay»), al final (Felipe 2026-10-12).
  const filas = colores
    .map((color, orden) => {
      const delColor = m.variantes.filter((v) => v.color === color);
      const vendio = delColor.reduce((s, v) => s + v.vendidas30, 0);
      const tiene = delColor.reduce((s, v) => s + totalEnTienda(v), 0);
      return {
        orden,
        tiene,
        fila: {
          color,
          punto: delColor.map((v) => estiloMosaicoColor(v.colorHex)?.fondo).find((f): f is string => Boolean(f)) ?? null,
          vendio,
          sinStock: vendio > 0 && tiene === 0,
          celdas: tallas.map((t) => celda(color, t, delColor.filter((v) => v.talla === t))),
        },
      };
    })
    .sort(
      (a, b) =>
        b.fila.vendio - a.fila.vendio ||
        (a.fila.vendio === 0 ? Number(b.tiene > 0) - Number(a.tiene > 0) : 0) ||
        a.fila.color.localeCompare(b.fila.color, "es") ||
        a.orden - b.orden,
    )
    .map((x) => x.fila);
  const vendioPorTalla = tallas.map((t) => m.variantes.filter((v) => v.talla === t).reduce((s, v) => s + v.vendidas30, 0));
  return { tallas, filas, vendioPorTalla, vendio: vendioPorTalla.reduce((s, n) => s + n, 0) };
}

/**
 * Las otras tiendas, en una línea bajo la tabla: «Arequipa y Lima no tienen este modelo.» o «Arequipa tiene 3 (vendió 2 en sus últimos 30
 * días). Lima no tiene.» Las otras tiendas cuentan sus propios 30 días: se dice, para no mezclarlo con los días de la tuya.
 *
 * Una tienda que lo VENDIÓ y quedó en cero no «no tiene este modelo» (eso se lee como «nunca lo tuvo»): «Arequipa se quedó sin stock (vendió 5 en
 * sus últimos 30 días)». El «también» es solo para cuando la tuya TAMBIÉN está en cero: en la ficha de un modelo que mandas o liquidas (mi tienda
 * sí lo tiene) diría que a las dos les falta, y es justo lo contrario de lo que mueve el envío. «Sin stock» y no «sin ella»: «ella» no tenía a
 * qué referirse y no concordaba con un Polo o un Chaleco. «No tiene este modelo» queda para la que nunca lo tuvo ni lo vendió.
 */
export function lineaOtrasTiendas(p: Pick<PrendaAnalisis, "otras" | "piso" | "almacen">, sedes: readonly SedeAnalisis[], miSedeId: string): string | null {
  const otras = sedes.filter((s) => s.id !== miSedeId).map((s) => ({ ciudad: s.ciudad, o: p.otras.find((x) => x.sedeId === s.id) }));
  if (otras.length === 0) return null;
  const tiene = (x: (typeof otras)[number]) => (x.o?.stock ?? 0) > 0;
  const vendio = (x: (typeof otras)[number]) => x.o?.vendidas30 ?? 0;
  const con = otras.filter(tiene);
  const sinStock = otras.filter((x) => !tiene(x) && vendio(x) > 0);
  const sin = otras.filter((x) => !tiene(x) && vendio(x) <= 0).map((x) => x.ciudad);
  const lista = (xs: string[]) => (xs.length <= 1 ? (xs[0] ?? "") : `${xs.slice(0, -1).join(", ")} y ${xs[xs.length - 1]}`);
  if (con.length === 0 && sinStock.length === 0) return `${lista(sin)} no ${sin.length === 1 ? "tiene" : "tienen"} este modelo.`;
  const tienen = con.map((x) => `${x.ciudad} tiene ${x.o?.stock ?? 0}${vendio(x) > 0 ? ` (vendió ${vendio(x)} en sus últimos 30 días)` : ""}`);
  const tambien = totalEnTienda(p) === 0 ? " también" : "";
  const sinSu = sinStock.map((x) => `${x.ciudad}${tambien} se quedó sin stock (vendió ${vendio(x)} en sus últimos 30 días)`);
  return [[...tienen, ...sinSu].join(". ") + ".", sin.length > 0 ? `${lista(sin)} no ${sin.length === 1 ? "tiene" : "tienen"}.` : null].filter(Boolean).join(" ");
}

// ───────── Los botones del pie ─────────

/** Un botón que lleva a otra pantalla. `secundaria`: no es el paso que toca (lo que ya viene en camino no se compra otra vez): botón secundario, no el negro. */
export type AccionFicha = { texto: string; href: string; secundaria?: boolean };

/**
 * El botón principal según el grupo, como la fila de su carril: «Comprar», «Enviar a Arequipa» (la tienda que más la vende),
 * «Liquidar», «Registrar ventas» (lo que puede haberse vendido sin registrar) o, lo que nunca salió al piso, «Bajar al piso». null si va bien o solo se vigila, o si la cuenta no ve el destino (un
 * botón que lleva a «Sin acceso» no se dibuja).
 */
export function accionPrincipal(
  p: PrendaAnalisis,
  grupo: GrupoAnalisis | null,
  sedes: readonly SedeAnalisis[],
  acceso: AccesoAnalisis,
  /** A dónde llega la orden y a quién se le pide («Comprar» abre una orden de compra con eso, A9). */
  donde: DondeComprar,
  sinSalir = false,
  /** Algo llega a tiempo (`porLlegar`): «Comprar» sigue ahí, pero ya no es el botón principal (lo hace el carril, que lo dibuja secundario). */
  yaViene = false,
): AccionFicha | null {
  if (sinSalir && !grupo) {
    const href = hrefReponerPiso([p], acceso);
    return href ? { texto: "Bajar al piso", href } : null;
  }
  if (grupo === "comprar") {
    const href = hrefComprar(p, acceso, donde);
    return href ? { texto: "Comprar", href, ...(yaViene ? { secundaria: true } : {}) } : null;
  }
  if (grupo === "enviar") {
    const vende = sedeQueMasVende(p.otras);
    const destino = vende ? sedes.find((s) => s.id === vende.sedeId) : undefined;
    const href = destino ? hrefEnviar([p], destino, acceso) : null;
    return destino && href ? { texto: `Enviar a ${destino.ciudad}`, href } : null;
  }
  if (grupo === "liquidar") {
    const href = hrefLiquidar([p], acceso);
    return href ? { texto: "Liquidar", href } : null;
  }
  if (grupo === "duda") {
    const href = hrefRegistrarVentas(acceso);
    return href ? { texto: "Registrar ventas", href } : null;
  }
  return null;
}

/**
 * «Pedir a Arequipa»: solo si se acaba, otra tienda la tiene y la cuenta puede pedir. Es la tienda que más tiene; la persona
 * decide si pedirla o comprarla (decisión 7). null si no corresponde.
 */
export function sedeParaPedir(p: PrendaAnalisis, grupo: GrupoAnalisis | null, sedes: readonly SedeAnalisis[], acceso: Pick<AccesoAnalisis, "pedir">): SedeAnalisis | null {
  if (grupo !== "comprar" || !acceso.pedir) return null;
  const alla = otraSedeQueLaTiene(p.otras);
  return alla ? (sedes.find((s) => s.id === alla.sedeId) ?? null) : null;
}
