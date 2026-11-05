import { faseDe, type FaseBorrador } from "./orden-fases-reglas";

// El «nivel 2» de Nueva orden (ADR-0509): lo que la orden ya trae resuelto —las fases y quién las hace, la tela, la entrega y la nota— va plegado bajo UNA línea que lo resume, y se abre
// solo cuando algo ahí necesita a la persona. Las reglas puras: sin React.
//
// POR QUÉ DOS NIVELES. Una muestra de 6 prendas de un modelo que ya se conoce son tres datos (modelo, tipo, cuántas): las siete fases en el Taller, sin tela y sin fecha son lo de siempre, y
// ponerlas a la vista empuja la lista hacia abajo (la hoja medía ~2.000 px y el compositor sigue siendo largo). Un asistente por pasos no sirve: los colores de la matriz deciden la tela,
// los pasos se influyen (NN/g).
//
// CONTRATO
//   PROMETE: que la línea dice lo que de verdad va a viajar (cuántas fases, cuáles salen a un servicio, cuántas telas, la fecha) con los mismos datos del formulario, y que el nivel 2 se
//            abre cuando lo que hay dentro está mal (una fase de afuera sin servicio, una tela mal escrita, una entrega pasada): lo que está mal nunca queda escondido.
//   ASUME: quien llama pasa lo que ya validó (`problemasFases`, `problemasTela`, `problemaDeEntrega`); aquí no se vuelve a decidir qué es un problema.
//   NO HACE: no valida nada ni cambia lo que se manda a la base (eso es de `abrir_orden_produccion`).

export type EntradaDeResumen = {
  /** Fases y tela solo existen con un modelo elegido (o uno nuevo en construcción). Sin él, la línea habla solo de la entrega. */
  hayModelo: boolean;
  fases: readonly Pick<FaseBorrador, "clave" | "encendida" | "quien">[];
  /** Cuántas telas del estante están elegidas (las de «sin elegir» no cuentan). */
  telasElegidas: number;
  /** «23 oct», o `null` si no hay fecha. */
  entrega: string | null;
  hayNota: boolean;
};

/** «7 fases · todo en el Taller · sin tela elegida · sin fecha de entrega» / «8 fases · 2 afuera (Corte, Costura) · 1 tela · entrega 23 oct · con nota». */
export function resumenNivelDos(o: EntradaDeResumen): string {
  const partes: string[] = [];
  if (o.hayModelo) {
    const encendidas = o.fases.filter((f) => f.encendida);
    const afuera = encendidas.filter((f) => f.quien === "servicio");
    partes.push(`${encendidas.length} ${encendidas.length === 1 ? "fase" : "fases"}`);
    partes.push(afuera.length === 0 ? "todo en el Taller" : `${afuera.length} afuera (${afuera.map((f) => faseDe(f.clave).nombre).join(", ")})`);
    partes.push(o.telasElegidas === 0 ? "sin tela elegida" : `${o.telasElegidas} ${o.telasElegidas === 1 ? "tela" : "telas"}`);
  }
  partes.push(o.entrega ? `entrega ${o.entrega}` : "sin fecha de entrega");
  if (o.hayNota) partes.push("con nota");
  return partes.join(" · ");
}

/** Hay algo adentro que la persona tiene que ver: una fase de afuera sin servicio, una tela mal escrita o una entrega que no se puede. */
export function nivelDosPideAbrirse(o: { problemasFases: number; problemasTela: number; entregaMala: string | null }): boolean {
  return o.problemasFases > 0 || o.problemasTela > 0 || o.entregaMala !== null;
}

/** Los campos de la guía de foco que viven dentro del nivel 2: para llevar a uno hay que abrirlo antes (plegado, ni se ve ni se alcanza con el teclado). */
const CAMPOS_DEL_NIVEL_DOS: ReadonlySet<string> = new Set(["fases", "tela"]);

export function esDeNivelDos(idDeCampo: string): boolean {
  return CAMPOS_DEL_NIVEL_DOS.has(idDeCampo);
}
