// Tienda web ▸ Vitrina ▸ Looks: ideas de NOMBRE y de FRASE para un look según las prendas que se eligieron (Felipe 2026-10-26: «un sistema que
// pueda brindarte un nombre adecuado y una frase basándote en tus elecciones, y que no haya nombres o frases similares»). Lógica pura, sin red ni
// azar: la misma elección da siempre las mismas ideas (ADR-0290, «sugerencias coherentes»: el ejemplo sigue lo que la persona eligió).
//
// CONTRATO
//   PROMETE: de las prendas del look (su grupo de la tienda y su color), devolver nombres y frases de una tabla curada, en español neutro y sin
//            decir nada de la prenda que no se sepa (ni telas, ni tallas, ni precios); dejar fuera todo lo que se parezca a un nombre o una frase que
//            YA existe (otro look o lo que la persona ya escribió); y respetar los topes de la base (60 letras el nombre, 200 la frase).
//   ASUME:   que el grupo de cada prenda lo dice la misma tabla de la tienda (`grupoDeLaTienda`, por prefijo: nunca por el nombre visible).
//   NO HACE: guardar nada, llamar a ningún servicio de afuera ni inventar texto nuevo: si la tabla se queda sin ideas libres, devuelve una lista vacía
//            y la pantalla no muestra nada (nunca un texto repetido).

import { grupoDeLaTienda } from "@cayla-retail/shared/categorias-de-la-tienda";
import { normalizarBusqueda } from "./combo-reglas";
import { MAX_FRASE_LOOK, MAX_NOMBRE_LOOK } from "./vitrina-looks-reglas";

/** De cada prenda del look, lo único que las ideas necesitan: la clave de su categoría (el prefijo), su familia y el nombre de su color. */
export type PrendaParaIdeas = { clave: string | null; familia: string | null; color: string | null };
export type Ideas = { nombres: string[]; frases: string[] };
/** Lo que ya existe y no se debe repetir ni parecer: los nombres y las frases de los otros looks, y lo que la persona ya escribió. */
export type Ocupados = { nombres: readonly string[]; frases: readonly (string | null)[] };

type Silueta = "vestido" | "capas" | "dos_piezas" | "con_abrigo" | "con_detalles" | "solo_detalles" | "general";

const GRUPOS_DE_ROPA = ["arriba", "vestidos", "abajo", "encima", "otras"];

/** Qué tipo de look es, por los grupos de sus prendas: un vestido, tres capas (arriba, abajo y abrigo), dos piezas, ropa con abrigo, ropa con
 *  detalles (bolso, joyas, calzado…), solo detalles, o algo que no encaja en ninguno. */
export function siluetaDe(prendas: readonly PrendaParaIdeas[]): Silueta {
  const grupos = new Set(prendas.map((p) => grupoDeLaTienda(p.clave ?? "", p.familia).clave));
  const hay = (g: string) => grupos.has(g);
  const ropa = GRUPOS_DE_ROPA.some(hay);
  const detalles = [...grupos].some((g) => !GRUPOS_DE_ROPA.includes(g));
  if (!ropa) return detalles ? "solo_detalles" : "general";
  if (hay("vestidos")) return "vestido";
  if (hay("arriba") && hay("abajo") && hay("encima")) return "capas";
  if (detalles) return "con_detalles";
  if (hay("arriba") && hay("abajo")) return "dos_piezas";
  if (hay("encima")) return "con_abrigo";
  return "general";
}

const NOMBRES: Record<Silueta, readonly string[]> = {
  vestido: ["Vestido con carácter", "Un solo gesto", "Del día a la noche", "Elegante sin esfuerzo", "Para lucirse", "Todo en una prenda", "Plan especial", "Brillo propio"],
  capas: ["Capas con estilo", "Look de temporada", "Por capas", "Armado en tres", "Entretiempo", "Para el frío con estilo", "Abrigo y compañía", "Tres prendas, un look"],
  dos_piezas: ["Combinación de diario", "Arriba y abajo", "Mi uniforme favorito", "Fácil de repetir", "Básicos que combinan", "Del trabajo al plan", "Todo terreno", "Sin pensarlo mucho"],
  con_abrigo: ["Con abrigo incluido", "Listo para el frío", "Para el entretiempo", "Una capa de más", "Abrigado con estilo", "Look de abrigo"],
  con_detalles: ["Con el detalle justo", "El toque final", "Completo hasta el final", "Detalles que suman", "Todo en su lugar", "Armado de pies a cabeza"],
  solo_detalles: ["Accesorios que combinan", "Pequeños detalles", "Para completar", "Brillos y detalles", "El regalo perfecto", "Detalles a juego"],
  general: ["Look del día", "Para salir", "Mi selección", "Una idea para hoy", "Casual y cómodo", "Estilo sin esfuerzo", "Prendas que se llevan bien", "Mezcla favorita"],
};

const FRASES: Record<Silueta, readonly string[]> = {
  vestido: [
    "Una sola prenda y todo resuelto.",
    "Se lleva solo, y con un detalle más se vuelve otro look.",
    "Para el día y para la noche, sin cambiar de plan.",
    "La prenda que no falla cuando hay poco tiempo.",
    "Se ve armado sin haber pensado mucho.",
  ],
  capas: [
    "Capas que se suman o se quitan según el día.",
    "Para el entretiempo: una capa de más y todo resuelto.",
    "Tres prendas que se llevan bien juntas, de la mañana a la noche.",
    "Se arma en un minuto y abriga justo lo necesario.",
    "Cada capa se puede llevar sola, y juntas se ven aún mejor.",
  ],
  dos_piezas: [
    "Dos prendas que se llevan con todo, para el día a día.",
    "Una combinación fácil de repetir toda la semana.",
    "Cómoda para el trabajo y lista para el plan.",
    "Básicos que se combinan sin pensar.",
    "Arriba y abajo que se entienden desde la primera vez.",
  ],
  con_abrigo: [
    "Con algo de abrigo para los días más frescos.",
    "Una capa que se quita cuando sube la temperatura.",
    "Para salir sin miedo al cambio de clima.",
    "Abrigo y básicos que se llevan bien juntos.",
  ],
  con_detalles: [
    "El detalle que completa el look.",
    "La ropa justa y el toque que la hace tuya.",
    "Lo básico se vuelve especial con un buen detalle.",
    "Armado de pies a cabeza, sin dudar en el último paso.",
  ],
  solo_detalles: [
    "Pequeños detalles que cambian cualquier look.",
    "Piezas que se llevan juntas o por separado.",
    "Para regalar o para regalarse.",
    "Los detalles que hacen la diferencia.",
  ],
  general: [
    "Una idea para armar tu día, prenda por prenda.",
    "Prendas que se llevan bien juntas.",
    "Una mezcla fácil de llevar, a cualquier hora.",
    "Para cuando no sabes qué ponerte.",
  ],
};

/** El color que comparten TODAS las prendas (por su nombre, sin tildes ni mayúsculas), o `null` si no hay uno solo. Con menos de dos prendas no cuenta. */
export function colorUnico(prendas: readonly PrendaParaIdeas[]): string | null {
  if (prendas.length < 2) return null;
  const colores = prendas.map((p) => (p.color ? normalizarBusqueda(p.color) : ""));
  if (colores.some((c) => c === "") || new Set(colores).size !== 1) return null;
  return prendas[0]!.color!.trim().toLowerCase();
}

/** Palabras que no distinguen un texto de otro («un», «de», «para»…): sin ellas, «Look del día» y «Una idea para el día» no se parecen por «del/de». */
const VACIAS = new Set(["a", "al", "con", "de", "del", "el", "en", "la", "las", "lo", "los", "para", "por", "se", "su", "sus", "un", "una", "y", "mi", "tu"]);

const palabras = (t: string): string[] => normalizarBusqueda(t).split(" ").filter((w) => w.length > 1 && !VACIAS.has(w));

/** ¿Un texto se parece a otro? Es el mismo, uno cabe en el otro, o comparten más de la mitad de sus palabras que cuentan. */
export function seParecen(a: string, b: string): boolean {
  const na = normalizarBusqueda(a);
  const nb = normalizarBusqueda(b);
  if (na === "" || nb === "") return false;
  if (na === nb || na.includes(nb) || nb.includes(na)) return true;
  const pa = new Set(palabras(a));
  const pb = new Set(palabras(b));
  if (pa.size === 0 || pb.size === 0) return false;
  let comunes = 0;
  for (const w of pa) if (pb.has(w)) comunes++;
  return comunes / Math.min(pa.size, pb.size) > 0.5;
}

/** Deja los textos que no se parecen a los ocupados NI entre sí (el primero se queda), dentro del tope de la base. */
function libres(candidatos: readonly string[], ocupados: readonly (string | null)[], tope: number): string[] {
  const salida: string[] = [];
  for (const c of candidatos) {
    if (c.length > tope) continue;
    if (ocupados.some((o) => o && seParecen(c, o))) continue;
    if (salida.some((s) => seParecen(c, s))) continue;
    salida.push(c);
  }
  return salida;
}

const conMayuscula = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);

/**
 * Las ideas para un look con estas prendas: con menos de dos prendas todavía no hay look y no se sugiere nada. Si todas comparten un color, la
 * primera idea lo dice («Total negro»). Lo demás sale de la tabla de su silueta y luego de la general, en un orden que no cambia.
 */
export function ideasParaLook(prendas: readonly PrendaParaIdeas[], ocupados: Ocupados): Ideas {
  if (prendas.length < 2) return { nombres: [], frases: [] };
  const silueta = siluetaDe(prendas);
  const color = colorUnico(prendas);
  const nombres = [...(color ? [`Total ${color}`, `Todo en ${color}`] : []), ...NOMBRES[silueta], ...(silueta === "general" ? [] : NOMBRES.general)].map(conMayuscula);
  const frases = [...(color ? [`Todo en ${color}: cero dudas al combinar.`] : []), ...FRASES[silueta], ...(silueta === "general" ? [] : FRASES.general)];
  return { nombres: libres(nombres, ocupados.nombres, MAX_NOMBRE_LOOK), frases: libres(frases, ocupados.frases, MAX_FRASE_LOOK) };
}

/** Tres ideas, empezando por la `vuelta` (cada «Otras ideas» corre la ventana; al llegar al final vuelve al principio). */
export function ventanaDeIdeas<T>(ideas: readonly T[], vuelta: number, cuantas = 3): T[] {
  if (ideas.length <= cuantas) return [...ideas];
  const inicio = (vuelta * cuantas) % ideas.length;
  return Array.from({ length: cuantas }, (_, i) => ideas[(inicio + i) % ideas.length]!);
}
