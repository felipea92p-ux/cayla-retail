import { clave } from "./buscar-prenda-v2";
import { sugerirCodigoColor } from "./color-codigo";
import type { ColorAlta } from "./alta-producto";
import { colorConEseNombre } from "./color-alta-reglas";

// Sugerencias de Nuevo producto que siguen lo que la persona ya eligió (skill `/sugerir`, CLAUDE.md «Sugerencias coherentes»).
//
// El problema: «Blusa Aurora» y «Manga globo, botones forrados…» estaban escritos en el JSX, así que a quien elegía «Casacas» le
// decían que su nombre parecía el de una blusa. Un ejemplo es una afirmación sobre lo que la persona está haciendo: si ya eligió
// Casacas, «Blusa Aurora» es falso. Peor que un ejemplo genérico es un ejemplo equivocado.
//
// De dónde sale cada texto, en este orden:
//   1. la CATEGORÍA (clave estable: `categorias.prefijo`, no el nombre visible, que se renombra: «Casacas/Chaquetas» → «Casacas»);
//   2. la FAMILIA (`familias.codigo`): un texto neutro que usa el vocabulario de la familia y no nombra ninguna prenda;
//   3. nada: «Nombre del producto». Una familia o categoría que un Líder crea sin deploy cae acá, nunca a un ejemplo ajeno.
//
// Nombre y descripción salen de una tabla curada y NO de un producto real de la categoría, a propósito: un dato real invita a
// copiarlo (el nombre chocaría con el aviso de parecidos) y una descripción interna no es un ejemplo. El ejemplo enseña la forma
// («<Tipo> <Flor>», ADR-0556: cada categoría de moda con una flor distinta de `FLORES`, lib/nombre-de-prenda.ts), no ofrece un valor. En cambio los colores y los valores nuevos (talla, tejido, patrón) sí se
// comparan con lo que YA existe: sugerir un color que ya está llevaría a la persona a un «ya existe».
//
// Todo es una función pura y determinista: mismo contexto, mismo texto (sin azar, sin red: una sede sin señal ve lo mismo).

export type OrigenSugerencia = "categoria" | "familia" | "neutro";
export type Sugerencia = { texto: string; origen: OrigenSugerencia };
export type ContextoCategoria = { familia?: string | null; prefijo?: string | null };

/** Lo más largo que cabe en la caja de Descripción de un celular (a 375 px la caja útil mide 279 px y 36 caracteres ocupan ~270 px como máximo), con margen. */
export const MAX_DESCRIPCION = 36;

type Ficha = { prenda: string; nombre: string; descripcion: string };

/**
 * Por `categorias.prefijo`. Los textos son de CAYLA, no un estándar: Felipe los veta y los cambia aquí, en un solo lugar.
 * La descripción no pasa de `MAX_DESCRIPCION` caracteres: a 375 px la caja útil mide ~280 px y un placeholder que no cabe se corta a media palabra.
 */
export const FICHAS_POR_CATEGORIA: Readonly<Record<string, Ficha>> = {
  // ---- indumentaria ----
  ABR: { prenda: "Abrigo", nombre: "Abrigo Magnolia", descripcion: "Paño grueso, cuello solapa, cinturón" },
  BLZ: { prenda: "Blazer", nombre: "Blazer Camelia", descripcion: "Corte recto, un botón, forro" },
  BOD: { prenda: "Body", nombre: "Body Peonía", descripcion: "Tirantes finos, escote cuadrado" },
  CMS: { prenda: "Blusa", nombre: "Blusa Dalia", descripcion: "Manga globo, botones forrados" },
  CAS: { prenda: "Casaca", nombre: "Casaca Gardenia", descripcion: "Cierre frontal, bolsillos, forro" },
  CHA: { prenda: "Chaleco", nombre: "Chaleco Azucena", descripcion: "Sin mangas, botones, acolchado" },
  CMP: { prenda: "Chompa", nombre: "Chompa Amapola", descripcion: "Cuello redondo, punto trenzado" },
  CON: { prenda: "Conjunto", nombre: "Conjunto Begonia", descripcion: "Dos piezas, cintura elástica" },
  ENT: { prenda: "Enterizo", nombre: "Enterizo Iris", descripcion: "Tirantes ajustables, pierna ancha" },
  FAL: { prenda: "Falda", nombre: "Falda Lirio", descripcion: "Corte en A, largo midi" },
  JEA: { prenda: "Jean", nombre: "Jean Tulipán", descripcion: "Tiro alto, pierna recta, claro" },
  PAN: { prenda: "Pantalón", nombre: "Pantalón Hortensia", descripcion: "Pierna ancha, pretina con pinzas" },
  SUD: { prenda: "Polera", nombre: "Polera Margarita", descripcion: "Capucha, bolsillo canguro, afelpada" },
  POL: { prenda: "Polo", nombre: "Polo Clavel", descripcion: "Cuello redondo, algodón pima" },
  LEN: { prenda: "Bralette", nombre: "Bralette Jacinto", descripcion: "Encaje, sin costuras, copa suave" },
  SHO: { prenda: "Short", nombre: "Short Glicina", descripcion: "Cintura elástica, largo medio muslo" },
  TOP: { prenda: "Top", nombre: "Top Acacia", descripcion: "Tirantes, escote corazón, ajustado" },
  VES: { prenda: "Vestido", nombre: "Vestido Mimosa", descripcion: "Largo midi, cuello en V, cinturón" },
  // ---- calzado ----
  BAI: { prenda: "Bailarina", nombre: "Bailarina Azalea", descripcion: "Punta redonda, cierre elástico" },
  BOT: { prenda: "Bota", nombre: "Bota Freesia", descripcion: "Caña alta, cierre lateral, taco bajo" },
  BOI: { prenda: "Botín", nombre: "Botín Cantuta", descripcion: "Taco cuadrado, cierre lateral, cuero" },
  MSN: { prenda: "Mocasín", nombre: "Mocasín Amancae", descripcion: "Suela flexible, plantilla, cuero" },
  SAN: { prenda: "Sandalia", nombre: "Sandalia Retama", descripcion: "Tiras cruzadas, hebilla, taco bajo" },
  ZAP: { prenda: "Zapatilla", nombre: "Zapatilla Jazmín", descripcion: "Suela de goma, cordones planos" },
  ZFO: { prenda: "Zapato", nombre: "Zapato Orquídea", descripcion: "Punta fina, taco medio, cuero" },
  // ---- accesorios y complementos ----
  CAR: { prenda: "Cartera", nombre: "Cartera Gladiolo", descripcion: "Asa regulable, cierre de imán" },
  CIN: { prenda: "Cinturón", nombre: "Cinturón Anémona", descripcion: "Hebilla dorada, ancho 3 cm, cuero" },
  GOR: { prenda: "Sombrero", nombre: "Sombrero Alhelí", descripcion: "Ala ancha, cinta a tono, talla única" },
  LSO: { prenda: "Lentes", nombre: "Lentes Verbena", descripcion: "Filtro UV400, montura ligera" },
  MOC: { prenda: "Mochila", nombre: "Mochila Petunia", descripcion: "Dos bolsillos, correas acolchadas" },
  BUF: { prenda: "Pañoleta", nombre: "Pañoleta Zinnia", descripcion: "Estampado floral, seda, 90 x 90 cm" },
  REL: { prenda: "Reloj", nombre: "Reloj Nardo", descripcion: "Correa de cuero, caja de acero" },
  RIN: { prenda: "Riñonera", nombre: "Riñonera Narciso", descripcion: "Correa ajustable, dos bolsillos" },
  // ---- belleza ----
  MAQ: { prenda: "Labial", nombre: "Labial Rubí", descripcion: "Larga duración, acabado mate" },
  // ---- bisutería ----
  ANL: { prenda: "Anillo", nombre: "Anillo Lantana", descripcion: "Baño de oro, talla ajustable" },
  ARE: { prenda: "Aretes", nombre: "Aretes Brezo", descripcion: "Aro pequeño, baño de plata" },
  COL: { prenda: "Collar", nombre: "Collar Loto", descripcion: "Cadena fina, dije pequeño, 45 cm" },
  PUL: { prenda: "Pulsera", nombre: "Pulsera Cala", descripcion: "Cadena regulable, tres dijes" },
  // ---- papelería ----
  UTC: { prenda: "Colores", nombre: "Colores Arcoíris", descripcion: "Caja de 12, punta suave" },
  LAP: { prenda: "Lapicero", nombre: "Lapicero Gel", descripcion: "Tinta gel, punta 0.5, metálico" },
  LIB: { prenda: "Libreta", nombre: "Libreta Bosque", descripcion: "Tapa dura, 100 hojas, hojas rayadas" },
  UOF: { prenda: "Set", nombre: "Set Escritorio", descripcion: "Pack de tres, uso diario" },
};

/** Por `familias.codigo`: vocabulario de la familia, sin nombrar ninguna prenda. Es lo que ve una categoría que aún no tiene ficha. */
const NEUTRO_POR_FAMILIA: Readonly<Record<string, { nombre: string; descripcion: string }>> = {
  indumentaria: { nombre: "Nombre de la prenda", descripcion: "Corte, largo, detalles…" },
  calzado: { nombre: "Nombre del modelo", descripcion: "Taco, suela, cierre…" },
  accesorios: { nombre: "Nombre del accesorio", descripcion: "Material, medidas, cierre…" },
  belleza: { nombre: "Nombre del producto", descripcion: "Acabado, tono, duración…" },
  bisuteria: { nombre: "Nombre de la joya", descripcion: "Baño, medidas, cierre…" },
  papeleria: { nombre: "Nombre del artículo", descripcion: "Tamaño, cantidad, material…" },
};

const NEUTRO = { nombre: "Nombre del producto", descripcion: "Lo que no dice el nombre…" };

function resolver(ctx: ContextoCategoria | null | undefined, campo: "nombre" | "descripcion"): Sugerencia {
  const ficha = ctx?.prefijo ? FICHAS_POR_CATEGORIA[ctx.prefijo] : undefined;
  if (ficha) return { texto: campo === "descripcion" ? `${ficha.descripcion}…` : ficha.nombre, origen: "categoria" };
  const familia = ctx?.familia ? NEUTRO_POR_FAMILIA[ctx.familia] : undefined;
  if (familia) return { texto: familia[campo], origen: "familia" };
  return { texto: NEUTRO[campo], origen: "neutro" };
}

/** El placeholder de «Nombre»: la forma `<Prenda> <nombre propio>` de la categoría elegida. */
export const sugerirNombre = (ctx: ContextoCategoria | null | undefined): Sugerencia => resolver(ctx, "nombre");

/** El placeholder de «Descripción»: lo que suele decir el corte, el material o los detalles de esa categoría. */
export const sugerirDescripcion = (ctx: ContextoCategoria | null | undefined): Sugerencia => resolver(ctx, "descripcion");

// ---------------------------------------------------------------------------------------------------------------------
// «+ Nueva talla / tejido / patrón» (ProponerValor): sigue a la FAMILIA de la categoría y evita lo que ya existe.
// ---------------------------------------------------------------------------------------------------------------------

export type TipoValorNuevo = "tallas" | "tejidos" | "patrones";

const CANDIDATOS_VALOR: Readonly<Record<TipoValorNuevo, Readonly<Record<string, readonly string[]>>>> = {
  tallas: {
    indumentaria: ["XXL", "XXS", "3XL"],
    calzado: ["44", "36", "45"],
    accesorios: ["Única", "S/M"],
    bisuteria: ["16", "18"],
    papeleria: ["A5", "A4"],
    belleza: ["30 ml", "15 ml"],
  },
  tejidos: {
    indumentaria: ["Lana merino", "Lino", "Seda"],
    calzado: ["Cuero", "Gamuza", "Charol"],
    accesorios: ["Cuero", "Lona", "Acero inoxidable"],
    bisuteria: ["Acero quirúrgico", "Plata 925", "Latón"],
    papeleria: ["Papel bond", "Cartulina"],
  },
  patrones: {
    indumentaria: ["Pata de gallo", "Lunares", "Cuadros vichy"],
    calzado: ["Trenzado", "Animal print"],
    accesorios: ["Rayas", "Cuadros"],
    papeleria: ["Rayado", "Cuadriculado"],
  },
};

const NEUTRO_VALOR: Readonly<Record<TipoValorNuevo, string>> = {
  tallas: "Nombre de la talla",
  tejidos: "Nombre del tejido",
  patrones: "Nombre del patrón",
};

/**
 * El placeholder de la caja «nueva talla / tejido / patrón». `existentes` es el vocabulario que la pantalla ya tiene: el ejemplo
 * es el primer candidato de la familia que NO está ahí (uno que ya existe llevaría a la persona a un «ya existe»). Si la familia no
 * tiene candidatos, o ya están todos, dice qué escribir sin dar un ejemplo.
 */
export function sugerirValorNuevo(tipo: TipoValorNuevo, familia: string | null | undefined, existentes: readonly { texto: string }[] = []): Sugerencia {
  const usados = new Set(existentes.map((v) => clave(v.texto)));
  const libre = (familia ? CANDIDATOS_VALOR[tipo][familia] : undefined)?.find((c) => !usados.has(clave(c)));
  return libre ? { texto: `Ej. ${libre}`, origen: "familia" } : { texto: NEUTRO_VALOR[tipo], origen: "neutro" };
}

// ---------------------------------------------------------------------------------------------------------------------
// «+ Nuevo color» (NuevoColorAlta): sigue a la FAMILIA DE COLOR (elegida, o la que sale del tono) y evita lo que ya existe.
// ---------------------------------------------------------------------------------------------------------------------

/** Por `FAMILIAS_COLOR.valor`. Ninguno existe hoy en el catálogo; si mañana existe, se salta al siguiente. */
const NOMBRES_DE_COLOR: Readonly<Record<string, readonly string[]>> = {
  neutro: ["Marfil", "Gris humo", "Ostra"],
  azul: ["Azul acero", "Azul noche", "Azul rey"],
  rosado: ["Rosa pastel", "Rosa chicle", "Chicle"],
  rojo: ["Rojo ladrillo", "Granate", "Carmín"],
  naranja: ["Naranja quemado", "Zanahoria", "Ámbar"],
  amarillo: ["Girasol", "Maíz", "Amarillo pollito"],
  verde: ["Verde bosque", "Menta", "Jade"],
  morado: ["Uva", "Glicina", "Morado royal"],
  tierra: ["Ocre", "Barro", "Café"],
  metalico: ["Latón", "Acero", "Grafito"],
  estampado: ["Rayas", "Floral", "Cuadros"],
};

/**
 * Los placeholders de «Nombre del color» y «Código». El código NO es un texto aparte: es el que el sistema propondría para ese
 * mismo nombre (`sugerirCodigoColor`), así que los dos ejemplos siempre cuentan la misma historia y el código nunca choca con uno usado.
 */
export function sugerirColor(
  familia: string | null | undefined,
  colores: readonly ColorAlta[],
  codigosUsados: ReadonlySet<string> = new Set()
): { nombre: Sugerencia; codigo: Sugerencia } {
  const usados = new Set([...codigosUsados, ...colores.map((c) => c.codigo)]);
  const nombre = (familia ? NOMBRES_DE_COLOR[familia] : undefined)?.find((n) => !colorConEseNombre(n, colores));
  if (!nombre) return { nombre: { texto: "Nombre del color", origen: "neutro" }, codigo: { texto: "3 letras", origen: "neutro" } };
  const codigo = sugerirCodigoColor(nombre, usados);
  return { nombre: { texto: nombre, origen: "familia" }, codigo: codigo ? { texto: codigo, origen: "familia" } : { texto: "3 letras", origen: "neutro" } };
}
