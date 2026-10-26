// Plan de campaña — el centro de avisos (tarea #4 de la auditoría, Felipe 2026-10-26, spike ②). Lógica pura, sin React ni red.
//
// EL PROBLEMA. El Plan avisaba en cinco lugares a la vez (la franja del plazo, la línea del stock sobre la tabla, el detalle del stock en el cajón,
// «empezó sin plan», «no encontramos esa campaña») y el número del ícono contaba SOLO las tiendas sin stock al día: el plazo para pedir, que es lo
// que cuesta plata si se ignora, no sumaba. Y el descuento de la campaña podía cambiar después de armar el plan sin que nada lo dijera.
//
// LO QUE DECIDIÓ FELIPE MIRANDO. Un centro compacto, flotante, sin palabra junto al ícono, con su barra de desplazamiento; lo urgente sigue
// asomando aunque esté cerrado. Esto es lo que lo alimenta.
//
// CONTRATO
//   PROMETE: una lista de avisos con su nivel —urgente, pendiente, para saber o en orden—; «cuántos por atender» cuenta solo lo que hay que
//            hacer (urgentes y pendientes) y lo que la persona no marcó como visto; lo urgente nunca se puede marcar como visto; y «ya lo vi»
//            deja de contar un aviso SOLO hasta que el dato cambie (su huella), nunca para siempre.
//   NO HACE: no decide qué es una campaña en plazo (eso es `plazoDePedido`), ni cuánto creerle a los números (`exactitudDeLosDatos`), ni calcula la
//            confianza del stock (`confianzaDelStock`): las recibe hechas. No dibuja nada ni guarda nada.

import type { ConfianzaDelStock, EstadoCampana, FilaPlan } from "./plan-compra-reglas";
import { solesES } from "./plan-compra-reglas";
import type { PlazoDePedido } from "./plan-compra-plazo";
import { sugeridoParcial } from "./plan-compra-descuento";
import { exactitudDeLosDatos } from "./plan-compra-periodo";

export type NivelDelAviso = "urgente" | "pendiente" | "info" | "ok";
export type IdDelAviso = "plazo" | "stock" | "sin-plan" | "deriva" | "tope" | "datos";

/** Lo que el botón de un aviso hace; la pantalla lo traduce a abrir una hoja, el cajón o ir a otra pantalla. */
export type AccionDelAviso =
  | { tipo: "cambiar-dias"; texto: string }
  | { tipo: "ver-resumen"; texto: string }
  | { tipo: "ir-conteo"; texto: string }
  | { tipo: "abrir-categoria"; texto: string; categoriaId: string };

export type AvisoDelPlan = {
  id: IdDelAviso;
  nivel: NivelDelAviso;
  /** Una línea para cuando asoma junto al ícono (solo lo urgente la trae). */
  corto: string | null;
  titulo: string;
  texto: string;
  /** Cambia cuando cambia el dato del que sale el aviso: «ya lo vi» solo vale mientras la huella sea la misma. */
  huella: string;
  acciones: AccionDelAviso[];
};

/** Lo que la persona marcó como visto: aviso → la huella que tenía cuando lo marcó. */
export type Vistos = Readonly<Record<string, string>>;

export type EntradaDeAvisos = {
  estado: EstadoCampana;
  plazo: PlazoDePedido;
  /** Categorías con algo por comprar. */
  porPedir: number;
  /** Categorías con plan. */
  conPlan: number;
  /** «Cuenta con 14 días para llegar…» (`fraseDeLosDias`), ya dicha. */
  fraseDeLosDias: string;
  /** El plazo se puede cambiar desde aquí (la base lo guarda y la persona tiene el módulo). */
  puedeCambiarDias: boolean;
  confianza: ConfianzaDelStock;
  puedeContar: boolean;
  /** «Cuéntalo antes del 27/11…» (`fraseDelConteoAntesDelPlazo`); null = la de siempre. */
  fraseDelConteo: string | null;
  filas: readonly FilaPlan[];
  /** El tope de inversión de la campaña; null = sin tope. */
  tope: number | null;
  /** Lo que cuesta el plan al costo. */
  inversion: number;
};

const RANGO: Record<NivelDelAviso, number> = { urgente: 0, pendiente: 1, info: 2, ok: 3 };
const ORDEN: IdDelAviso[] = ["plazo", "stock", "sin-plan", "deriva", "tope", "datos"];

const enLista = (nombres: readonly string[]) => (nombres.length <= 1 ? (nombres[0] ?? "") : `${nombres.slice(0, -1).join(", ")} y ${nombres[nombres.length - 1]}`);
const pct = (n: number) => n.toLocaleString("es-PE", { maximumFractionDigits: 2 });
const dias = (n: number) => `${n} ${n === 1 ? "día" : "días"}`;

/** Una categoría con plan cuyo descuento no es el que hoy dice la campaña. */
export type DerivaDeDescuento = { categoriaId: string; nombre: string; plan: number; campana: number };

/**
 * Las categorías con plan guardado cuyo descuento supuesto es otro que el de la campaña (ADR-0499, «paso 4»). Solo cuenta si la base guarda el
 * descuento y la campaña lo da para esa categoría; un sugerido que rige solo algunos días o en algunas tiendas no se compara (la persona pudo
 * haberlo corregido a propósito y marcarlo sería un falso aviso).
 */
export function derivaDelDescuento(filas: readonly FilaPlan[]): DerivaDeDescuento[] {
  return filas
    .flatMap((f): DerivaDeDescuento[] => {
      const s = f.descuentoSugerido;
      if (!f.linea || f.conDescuento !== true || !s || sugeridoParcial(s)) return [];
      const plan = f.linea.descuentoPct ?? 0;
      return Math.abs(plan - s.pct) >= 0.01 ? [{ categoriaId: f.c.id, nombre: f.c.nombre, plan, campana: s.pct }] : [];
    })
    .sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));
}

function avisoDelPlazo(e: EntradaDeAvisos): AvisoDelPlan | null {
  const { plazo } = e;
  if (plazo.estado === "termino") return null;
  const pendiente = e.porPedir > 0;
  const nivel: NivelDelAviso =
    plazo.estado === "tarde" ? (pendiente ? "urgente" : "info")
    : plazo.estado === "justo" ? (pendiente ? "urgente" : e.conPlan > 0 ? "ok" : "info")
    : plazo.estado === "empezo" ? "info"
    : pendiente || e.conPlan === 0 ? "info" : "ok";
  const antes = pendiente
    ? `${e.porPedir} ${e.porPedir === 1 ? "categoría tiene" : "categorías tienen"} compra pendiente. `
    : e.conPlan > 0
      ? "Ninguna categoría tiene compra pendiente. "
      : "";
  const corto =
    nivel !== "urgente" ? null
    : plazo.estado === "tarde" ? "Ya no llega a tiempo"
    : `${plazo.texto}${plazo.diasParaElLimite !== null ? ` · ${dias(Math.max(0, plazo.diasParaElLimite))}` : ""}`;
  return {
    id: "plazo",
    nivel,
    corto,
    titulo: plazo.texto,
    texto: `${antes}${plazo.detalle} ${e.fraseDeLosDias}`.trim(),
    huella: `${plazo.estado}|${plazo.limite ?? "-"}|${e.porPedir}`,
    acciones: e.puedeCambiarDias ? [{ tipo: "cambiar-dias", texto: "Cambiar los días" }] : [],
  };
}

function avisoDelStock(e: EntradaDeAvisos): AvisoDelPlan | null {
  const c = e.confianza;
  if (c.estado === "confiable") return null;
  const sinAlDia = c.sedes.filter((s) => !s.alDia).map((s) => s.nombre);
  const ignoto = c.estado === "sin-dato" || sinAlDia.length === 0;
  return {
    id: "stock",
    nivel: "pendiente",
    corto: null,
    titulo: ignoto ? "No se pudo comprobar el stock de las tiendas" : `${enLista(sinAlDia)} ${sinAlDia.length === 1 ? "no tiene" : "no tienen"} el stock al día`,
    texto: `«Hay hoy» puede no ser exacto: el plan te pediría comprar de más. ${e.fraseDelConteo ?? "Cuéntalo antes de decidir."}`,
    huella: ignoto ? "sin-dato" : sinAlDia.join("|"),
    acciones: [{ tipo: "ver-resumen", texto: "Ver qué falta" }, ...(e.puedeContar ? [{ tipo: "ir-conteo", texto: "Ir a Conteo" } as const] : [])],
  };
}

function avisoSinPlan(e: EntradaDeAvisos): AvisoDelPlan | null {
  if (e.estado !== "antes") return null;
  const top = e.filas.filter((f) => f.puesto !== null);
  const sin = top.filter((f) => !f.linea);
  if (sin.length === 0) return null;
  return {
    id: "sin-plan",
    nivel: "pendiente",
    corto: null,
    titulo: `${sin.length} de las ${top.length} que más venden no tienen plan`,
    texto: `Empieza por ${enLista(sin.slice(0, 3).map((f) => f.c.nombre))}${sin.length > 3 ? ` (y ${sin.length - 3} más)` : ""}.`,
    huella: sin.map((f) => f.c.id).join("|"),
    acciones: [{ tipo: "abrir-categoria", texto: `Seguir con ${sin[0].c.nombre}`, categoriaId: sin[0].c.id }],
  };
}

function avisoDeLaDeriva(e: EntradaDeAvisos): AvisoDelPlan | null {
  const d = derivaDelDescuento(e.filas);
  if (d.length === 0) return null;
  const dice = (x: DerivaDeDescuento) => (x.plan === 0 ? "no lleva descuento" : `supone −${pct(x.plan)} %`);
  const uno = d.length === 1;
  return {
    id: "deriva",
    nivel: "pendiente",
    corto: null,
    titulo: uno ? `La campaña dice −${pct(d[0].campana)} % y tu plan de ${d[0].nombre} ${dice(d[0])}` : `${d.length} categorías tienen otro descuento que el de la campaña`,
    texto: uno
      ? "El plan cuenta con otro descuento que el de hoy: ábrela para ponerlo al día, o déjalo así si fue a propósito."
      : `${d.slice(0, 3).map((x) => `${x.nombre} (plan −${pct(x.plan)} %, campaña −${pct(x.campana)} %)`).join("; ")}${d.length > 3 ? `; y ${d.length - 3} más` : ""}. Ábrelas para ponerlas al día, o déjalas si fue a propósito.`,
    huella: d.map((x) => `${x.categoriaId}:${x.plan}:${x.campana}`).join("|"),
    acciones: [{ tipo: "abrir-categoria", texto: `Revisar ${d[0].nombre}`, categoriaId: d[0].categoriaId }],
  };
}

function avisoDelTope(e: EntradaDeAvisos): AvisoDelPlan | null {
  if (e.tope === null || e.inversion <= e.tope) return null;
  const excede = e.inversion - e.tope;
  return {
    id: "tope",
    nivel: "pendiente",
    corto: null,
    titulo: `Te pasas ${solesES(excede)} de tu tope`,
    texto: `El plan cuesta ${solesES(e.inversion)} al costo y tu tope es ${solesES(e.tope)}.`,
    huella: String(Math.round(excede)),
    acciones: [{ tipo: "ver-resumen", texto: "Ver el resumen" }],
  };
}

/** «Los datos todavía no son exactos…»: el mismo dato y las mismas palabras que la línea de la hoja de cada categoría. Solo se lee, no se cuenta. */
function avisoDeLosDatos(dias: number | undefined, conCampanaAnterior: boolean): AvisoDelPlan | null {
  const x = exactitudDeLosDatos(dias, conCampanaAnterior);
  return x ? { id: "datos", nivel: "info", corto: null, titulo: x.titulo, texto: x.detalle, huella: `${x.nivel}`, acciones: [] } : null;
}

/** Todos los avisos del Plan, de lo más urgente a lo que solo informa; a igual nivel, en un orden fijo. */
export function avisosDelPlan(e: EntradaDeAvisos, datos: { diasDeVentas: number | undefined; conCampanaAnterior: boolean }): AvisoDelPlan[] {
  return [avisoDelPlazo(e), avisoDelStock(e), avisoSinPlan(e), avisoDeLaDeriva(e), avisoDelTope(e), avisoDeLosDatos(datos.diasDeVentas, datos.conCampanaAnterior)]
    .filter((a): a is AvisoDelPlan => a !== null)
    .sort((a, b) => RANGO[a.nivel] - RANGO[b.nivel] || ORDEN.indexOf(a.id) - ORDEN.indexOf(b.id));
}

/** ¿La persona ya lo vio? Lo urgente nunca se da por visto, y lo marcado solo vale mientras el dato sea el mismo. */
export const estaVisto = (a: AvisoDelPlan, vistos: Vistos): boolean => a.nivel !== "urgente" && vistos[a.id] === a.huella;

/** Los avisos que se muestran: todos menos los ya vistos. */
export const avisosVisibles = (avisos: readonly AvisoDelPlan[], vistos: Vistos): AvisoDelPlan[] => avisos.filter((a) => !estaVisto(a, vistos));

/** El número del ícono: lo que hay que hacer (urgente o pendiente) y no se marcó como visto. Lo que solo informa no suma. */
export const porAtender = (avisos: readonly AvisoDelPlan[], vistos: Vistos): number =>
  avisos.filter((a) => (a.nivel === "urgente" || a.nivel === "pendiente") && !estaVisto(a, vistos)).length;

/** El que asoma junto al ícono aunque el centro esté cerrado: el primer aviso urgente. */
export const elQueAsoma = (avisos: readonly AvisoDelPlan[]): AvisoDelPlan | null => avisos.find((a) => a.nivel === "urgente") ?? null;

/** Marca un aviso como visto con su huella de hoy; lo urgente no se marca. */
export function marcarVisto(vistos: Vistos, a: AvisoDelPlan): Vistos {
  return a.nivel === "urgente" ? vistos : { ...vistos, [a.id]: a.huella };
}

/** Lo que se guarda en el navegador: solo lo que sigue siendo cierto (avisos que ya no existen o cuyo dato cambió se sueltan). */
export function vistosVigentes(vistos: Vistos, avisos: readonly AvisoDelPlan[]): Vistos {
  return Object.fromEntries(avisos.filter((a) => estaVisto(a, vistos)).map((a) => [a.id, a.huella]));
}

/** Lee lo guardado en el navegador sin confiar en su forma: solo pares texto → texto; cualquier otra cosa vale «nada visto». */
export function leerVistos(guardado: string | null | undefined): Vistos {
  if (!guardado) return {};
  try {
    const v: unknown = JSON.parse(guardado);
    if (typeof v !== "object" || v === null || Array.isArray(v)) return {};
    return Object.fromEntries(Object.entries(v).filter((par): par is [string, string] => typeof par[1] === "string"));
  } catch {
    return {};
  }
}

/** La llave del navegador: una por campaña, para que lo visto en Navidad no esconda un aviso de Día de la Madre. */
export const llaveDeVistos = (planId: string) => `cayla-plan-avisos-vistos:${planId}`;
