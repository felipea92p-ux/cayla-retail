import { TIPOS_POR_CATEGORIA } from "./nombre-de-prenda";
import { ayudaDeTejido } from "./tejido-ayuda";
import { familiaDeTejido, type FamiliaTejido } from "./tejido-visual";

// La ficha de la prenda para la IA de «Catálogo con IA» (2026-11-14, Felipe: «que tomes sugerencia los tejidos ya seleccionados, porque eso
// se selecciona antes»). Nació de un pantalón de lino beige, sostenido a mano en el almacén, que la IA devolvió como un buzo: el pedido
// (`openai-imagen-reglas.ts`) era el mismo para toda prenda y escrito para blusas («interior del cuello», «hombros», «puños, elástico»), y
// NADA de lo que la persona ya había elegido —categoría, tejido, patrón— le llegaba. Con una foto que cuelga suelta y una pretina elástica,
// la IA adivinaba «jogger».
//
// CONTRATO
//   PROMETE: de lo ya elegido (categoría, tejido, patrón) arma el texto que se suma al pedido y la ZONA de la prenda (de dónde cuelga), que
//            decide si el pedido habla de cuello y hombros o de pretina y basta. Pura y determinista: sin red, sin base, sin azar.
//   ASUME:   lo que llega puede venir de un navegador: se limpia (largo, caracteres) antes de entrar a un pedido que se paga. Lo elegido por la
//            persona se toma como cierto: la ficha «manda sobre lo que se adivine de la foto».
//   NO HACE: no inventa. Una categoría que un Líder crea sin deploy no está en la tabla: no toma el tipo ni la zona de otra (ADR-0290), y sin
//            ningún dato la respuesta es `null` y el pedido sale idéntico al medido (ADR-0659). No dice «es plano» de un tejido que no lo es:
//            lo plano es una lista corta y a propósito (`TEJIDOS_PLANOS`); algodón, jersey o franela no entran (un buzo real tiene que seguir
//            saliendo como buzo).

/** De dónde cuelga la prenda: de los hombros (blusa, casaca, vestido) o de la cintura (pantalón, jean, short, falda). Define qué partes se nombran. */
export type ZonaDeLaPrenda = "hombros" | "cintura";

/** Lo ya elegido de la prenda, tal como lo tiene la pantalla. Todo es opcional: sin datos, la IA recibe el pedido de siempre. */
export type DatosDePrenda = {
  /** `categorias.prefijo`: la clave estable (el nombre visible se renombra). */
  prefijo?: string | null;
  /** El tipo elegido cuando la categoría junta dos («Blusa» o «Camisa»). Se ignora si no es uno de los de esa categoría. */
  tipo?: string | null;
  /** El nombre del tejido elegido (Lino, Franela…). */
  tejido?: string | null;
  /** El nombre del patrón elegido (Liso, Rayas…). */
  patron?: string | null;
};

export type FichaParaIA = {
  /** Sin zona conocida el pedido es el de siempre. */
  zona: ZonaDeLaPrenda | null;
  /** Lo que se suma al final del pedido. */
  texto: string;
};

/**
 * @internal Exportada para su prueba de totalidad contra `TIPOS_POR_CATEGORIA`; la pantalla la usa a través de `fichaParaIA`.
 * Por `categorias.prefijo`. Una categoría que no está aquí no tiene zona (el pedido de siempre), nunca la de otra: lo cruza `ficha-foto-ia.test.ts`
 * con `TIPOS_POR_CATEGORIA` para que una categoría nueva de ropa no quede sin decidir. `null` es «a propósito sin zona»: un conjunto son dos piezas
 * y la lencería junta cosas de arriba y de abajo.
 */
export const ZONA_POR_PREFIJO: Readonly<Record<string, ZonaDeLaPrenda | null>> = {
  // ---- cuelgan de los hombros (el largo va de los hombros al ruedo) ----
  ABR: "hombros",
  BLZ: "hombros",
  BOD: "hombros",
  CMS: "hombros",
  CAS: "hombros",
  CHA: "hombros",
  CMP: "hombros",
  ENT: "hombros",
  SUD: "hombros",
  POL: "hombros",
  TOP: "hombros",
  VES: "hombros",
  // ---- cuelgan de la cintura (el largo va de la pretina a la basta) ----
  FAL: "cintura",
  JEA: "cintura",
  PAN: "cintura",
  SHO: "cintura",
  // ---- sin zona, a propósito ----
  CON: null,
  LEN: null,
};

/**
 * @internal Exportada para que su prueba vigile que ningún tejido de punto entre; la pantalla la usa a través de `fichaParaIA`.
 * Tejidos que son PLANOS (trama y urdimbre, no de punto). Corta a propósito: solo lo que lo es sin discusión. «Algodón» puede ser plano o de
 * punto, «franela» es felpa cepillada, «jersey», «rib», «licra», «polar», «piqué» y «suplex» son punto: ninguno entra, o un buzo de verdad saldría
 * dibujado como un pantalón de tela. Va por `FamiliaTejido`, la misma regla que dibuja la muestra del tejido (no por el texto que se escribió).
 */
export const TEJIDOS_PLANOS: ReadonlySet<FamiliaTejido> = new Set<FamiliaTejido>([
  "lino",
  "oxford",
  "gabardina",
  "popelina",
  "drill",
  "denim",
  "sastre",
  "seda",
  "gasa",
  "organza",
  "seersucker",
]);

/** Lo más largo que se acepta de un nombre elegido (un tejido o un patrón): lo demás es ruido o un intento de colar instrucciones. */
const MAX_NOMBRE = 40;

/** Un nombre limpio, o `null` si no queda nada: solo letras, números, espacios y la puntuación de un nombre de tela, en una línea y corto. */
function limpiar(valor: unknown): string | null {
  if (typeof valor !== "string") return null;
  const t = valor
    .normalize("NFC")
    .replace(/[^\p{L}\p{N} .,&+/()'-]/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, MAX_NOMBRE)
    .trim();
  return t.length > 0 ? t : null;
}

function limpiarPrefijo(valor: unknown): string | null {
  if (typeof valor !== "string") return null;
  const p = valor.trim().toUpperCase();
  return /^[A-Z0-9]{2,5}$/.test(p) ? p : null;
}

/** El tipo de prenda: el elegido si es de la categoría; si la categoría tiene uno solo, ese; si junta dos y no se eligió, ninguno (no se adivina). */
function tipoDe(prefijo: string | null, elegido: string | null): string | null {
  const tipos = prefijo ? (TIPOS_POR_CATEGORIA[prefijo] ?? []) : [];
  if (tipos.length === 0) return null;
  if (elegido) {
    const igual = tipos.find((t) => t.toLowerCase() === elegido.toLowerCase());
    if (igual) return igual;
  }
  return tipos.length === 1 ? tipos[0] : null;
}

/**
 * Lo que se suma al pedido, o `null` si no hay nada elegido que decir (entonces el pedido es el de siempre). Con el tejido, la IA deja de adivinar
 * «lino» o «buzo» de cómo cuelga la prenda; con la zona, el pedido habla de pretina y basta y no de cuello y hombros.
 */
export function fichaParaIA(datos: DatosDePrenda | null | undefined): FichaParaIA | null {
  if (!datos) return null;
  const prefijo = limpiarPrefijo(datos.prefijo);
  const tipo = tipoDe(prefijo, limpiar(datos.tipo));
  const tejido = limpiar(datos.tejido);
  const patron = limpiar(datos.patron);
  if (!tipo && !tejido && !patron) return null;

  const partes: string[] = ["DATOS DE LA PRENDA, elegidos por el equipo de la tienda (son ciertos y mandan sobre lo que adivines de la foto):"];
  if (tipo) partes.push(`Tipo de prenda: ${tipo}.`);

  if (tejido) {
    const familia = familiaDeTejido(tejido);
    // «Tela» a secas es el comodín del vocabulario: su frase genérica no describe nada.
    const queEs = familia && familia !== "tela" ? ayudaDeTejido(tejido)?.queEs : null;
    partes.push(queEs ? `Tela: ${tejido}. ${queEs}` : `Tela: ${tejido}.`);
    if (familia && TEJIDOS_PLANOS.has(familia)) {
      partes.push("Es un tejido PLANO, no de punto: se ve su trama, sin pelusa ni textura de felpa, de algodón de buzo o de ropa deportiva.");
    }
  }

  if (patron) {
    partes.push(/^liso$/i.test(patron) ? "Diseño: liso, sin estampado ni rayas: no dibujes ninguno." : `Diseño: ${patron}.`);
  }

  // La foto real casi nunca es limpia: una mano que la sostiene, otra prenda al lado, los estantes del almacén.
  partes.push("Si la sostiene una persona, o hay otra ropa, manos o estantes en la foto, ignóralos: la prenda es SOLO esta.");

  return { zona: prefijo ? (ZONA_POR_PREFIJO[prefijo] ?? null) : null, texto: partes.join(" ") };
}
