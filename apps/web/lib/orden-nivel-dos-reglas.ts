import { faseDe, type FaseBorrador } from "./orden-fases-reglas";

// El «nivel 2» de Nueva orden (ADR-0509): lo que la orden ya trae resuelto —las fases y quién las hace, la tela, la entrega y la nota— va plegado bajo un resumen de pocos datos, y se abre
// solo cuando algo ahí necesita a la persona. Las reglas puras: sin React.
//
// POR QUÉ DOS NIVELES. Una muestra de 6 prendas de un modelo que ya se conoce son tres datos (modelo, tipo, cuántas): las siete fases en el Taller, sin tela y sin fecha son lo de siempre, y
// ponerlas a la vista empuja la lista hacia abajo (la hoja medía ~2.000 px y el compositor sigue siendo largo). Un asistente por pasos no sirve: los colores de la matriz deciden la tela,
// los pasos se influyen (NN/g).
//
// CONTRATO
//   PROMETE: que el resumen dice lo que de verdad va a viajar (las fases, cuáles salen a un servicio, la tela, la fecha), cada dato en su pieza y con los mismos datos del formulario, y que el nivel 2 se
//            abre cuando lo que hay dentro está mal (una fase de afuera sin servicio, una tela mal escrita, una entrega pasada): lo que está mal nunca queda escondido.
//   ASUME: quien llama pasa lo que ya validó (`problemasFases`, `problemasTela`, `problemaDeEntrega`); aquí no se vuelve a decidir qué es un problema.
//   NO HACE: no valida nada ni cambia lo que se manda a la base (eso es de `abrir_orden_produccion`).

export type EntradaDeResumen = {
  /** Fases y tela solo existen con un modelo elegido (o uno nuevo en construcción). Sin él, el resumen habla solo de la entrega. */
  hayModelo: boolean;
  fases: readonly Pick<FaseBorrador, "clave" | "encendida" | "quien">[];
  /** Las fases están tal como nacen con este modelo: nadie las tocó. */
  fasesDeSiempre: boolean;
  /** Los nombres de las telas del estante que están elegidas (las de «sin elegir» no cuentan). */
  telas: readonly string[];
  /** Cuántos avíos y otros materiales van elegidos. */
  avios: number;
  /** «23 oct», o `null` si no hay fecha. */
  entrega: string | null;
  nota: string;
};

/** Un dato del resumen: su nombre y su valor. Cada uno se dibuja como una pieza (`<ParDato>`), nunca en una frase con puntos. */
export type ParDelResumen = { clave: "fases" | "afuera" | "tela" | "avios" | "entrega" | "nota"; rotulo: string; valor: string };

/** Hasta dónde se muestra una nota en el resumen: lo demás se lee al abrir. */
export const MAX_NOTA_EN_RESUMEN = 32;

const enLista = (nombres: readonly string[]) => (nombres.length <= 1 ? nombres.join("") : `${nombres.slice(0, -1).join(", ")} y ${nombres[nombres.length - 1]}`);

/**
 * Lo que habla por lo plegado, dato por dato: «Fases: Las de siempre», «Afuera: Corte y Costura», «Tela: Lino crudo», «Entrega: Sin fecha» y «Nota» si hay.
 * Las fases que salen a un servicio se nombran siempre, también cuando nacen así: es lo que cambia quién hace la orden.
 */
export function paresNivelDos(o: EntradaDeResumen): ParDelResumen[] {
  const pares: ParDelResumen[] = [];
  if (o.hayModelo) {
    const encendidas = o.fases.filter((f) => f.encendida);
    const afuera = encendidas.filter((f) => f.quien === "servicio");
    pares.push({ clave: "fases", rotulo: "Fases", valor: o.fasesDeSiempre ? "Las de siempre" : `${encendidas.length} en total` });
    if (afuera.length > 0) pares.push({ clave: "afuera", rotulo: afuera.length === 1 ? "Sale afuera" : "Salen afuera", valor: enLista(afuera.map((f) => faseDe(f.clave).nombre)) });
    const telas = [...new Set(o.telas.map((t) => t.trim()).filter(Boolean))];
    pares.push({ clave: "tela", rotulo: "Tela", valor: telas.length === 0 ? "Sin elegir" : telas.length === 1 ? telas[0] : `${telas.length} telas` });
    if (o.avios > 0) pares.push({ clave: "avios", rotulo: "Avíos", valor: `${o.avios} ${o.avios === 1 ? "elegido" : "elegidos"}` });
  }
  pares.push({ clave: "entrega", rotulo: "Entrega", valor: o.entrega ?? "Sin fecha" });
  const nota = o.nota.trim();
  if (nota) pares.push({ clave: "nota", rotulo: "Nota", valor: nota.length > MAX_NOTA_EN_RESUMEN ? `${nota.slice(0, MAX_NOTA_EN_RESUMEN - 1).trimEnd()}…` : nota });
  return pares;
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
