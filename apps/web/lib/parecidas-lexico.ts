// Léxico curado de prendas para comparar dos altas de producto — DATOS, no lógica. Lo lee `parecidas-alta-reglas.ts`.
//
// EL PROBLEMA. Dos sedes escriben la misma prenda con otras palabras («Blusa Lara» / «Camisa Lara», «Pant. Palazo» / «Wide Leg»,
// «SS25 311» pegado al nombre) y un comparador de texto no sabe que son lo mismo. Este archivo le da el vocabulario: qué palabras
// equivalen, cuáles no informan, cómo se escribe un código de la marca y qué atributos de forma (largo, manga, cuello) separan dos diseños.
//
// CONTRATO
//   PROMETE: datos tipados y en forma NORMALIZADA (minúsculas, sin tildes, ñ → n, signos → espacio), listos para consumir sin
//            transformarlos. Solo entran entradas de confianza «alta» o «media»; las «baja» (regionalismos, palabras con dos sentidos)
//            quedaron fuera: sumarían más falsas equivalencias que aciertos.
//   ASUME:   que es una foto curada a mano de la investigación (docs/investigacion/2026-09-29-duplicados-de-producto.md, sección 5.2;
//            léxico v1.0.0 del 2026-09-29) y NO está validada contra altas reales: hay 10 productos en producción. Se ajusta con lo que
//            las sedes escriban de verdad, no antes.
//   NO HACE: no decide identidad de producto (eso lo hace el puntaje con marca, categoría y conflictos); no se genera en ejecución;
//            no trae precios, costos ni nada de dinero.
//
// Si una entrada condiciona su alias a la categoría o al campo (`condicionados`), solo aplica en ese caso. El resto de las condiciones
// del léxico original («solo si el nombre no tiene otra palabra de prenda», «solo en talla», «hilo»/«jean» como tejido) no se pueden
// comprobar con lo que el alta conoce: esos alias quedan como `sin_contexto` (se reconocen como palabra, no se traducen) y el canónico
// se conserva. Un solo patrón no viene del léxico original: `codigo_letra_espacio_numero` («Polo G 44»), que lee el código que la
// gente escribe con espacio; no cambia las cifras del corpus y deja `Polo G 44` y `Polo G44` con el mismo código.

export type ConfianzaLexico = "alta" | "media";
export type DominioSinonimo = "prenda" | "accesorio" | "calzado" | "tejido" | "patron";
/** Cuándo un alias condicionado SÍ aplica: en la categoría Riñoneras, o si la categoría no es de accesorios. «sin_contexto» = el léxico
 *  lo condiciona a algo que el alta no puede comprobar: se reconoce como palabra pero NUNCA se traduce. */
export type CondicionAlias = "categoria_rinoneras" | "no_accesorio" | "sin_contexto";

export type SinonimoLexico = {
  canon: string;
  alias: readonly string[];
  dominio: DominioSinonimo;
  confianza: ConfianzaLexico;
  /** Categoría CAYLA (normalizada) a la que pertenece el canónico; un alias AMBIGUO solo vale dentro de ella. */
  categoria?: string;
  condicionados?: readonly { alias: string; condicion: CondicionAlias }[];
};
export type SiluetaLexico = { canon: string; alias: readonly string[]; confianza: ConfianzaLexico; /** Solo aplica a productos de estas prendas. */ prendas: readonly string[]; grupo: string };
export type GrupoAtributo = "manga" | "cuello" | "largo" | "tiro" | "detalles";
export type AtributoLexico = { canon: string; alias: readonly string[]; confianza: ConfianzaLexico };
/** Qué se hace con lo que encuentra un patrón: guardarlo como código, como temporada, como pack, o descartarlo (talla, medida, gramaje…). */
export type CampoDePatron = "codigo" | "temporada" | "pack" | "descartar";
export type PatronDeCodigo = { nombre: string; campo: CampoDePatron; /** Se compila con la bandera `g` sobre texto ya en minúsculas y sin tildes. */ regex: string };

export type LexicoParecidas = {
  version: string;
  /** Palabras que el léxico reconoce pero NO traduce (regionalismos, términos ambiguos): el corrector de tipeos no las «arregla». */
  conocidas: readonly string[];
  sinonimos: readonly SinonimoLexico[];
  siluetas: readonly SiluetaLexico[];
  atributos: Readonly<Record<GrupoAtributo, readonly AtributoLexico[]>>;
  /** [forma cruda en minúsculas sin tildes, forma larga]. La corta se busca ANTES de quitar signos («m/l»). */
  abreviaturas: readonly (readonly [string, string])[];
  /** Palabras que no identifican el modelo («adulto», «oferta», conectores, colores sin ambigüedad). */
  ruido: readonly string[];
  /** [junto, ...partes]: «minifalda» → «mini falda». */
  compuestos: readonly (readonly string[])[];
  plurales: { invariables: readonly string[]; irregulares: Readonly<Record<string, string>> };
  /** Palabras con dos sentidos («top», «rosa», «denim»): su alias solo vale dentro de la categoría del canónico. */
  ambiguos: readonly string[];
  /** Grupos de categorías que se confunden entre sí (Pantalones ~ Jeans): pesan ×0,9 en vez de ×0,7 al cruzarse. */
  categoriasVecinas: readonly (readonly string[])[];
  patrones: { precios: readonly PatronDeCodigo[]; orden: readonly PatronDeCodigo[] };
  /** Palabras que separan dos diseños aunque el resto coincida: «Polo Lara Plus» no es «Polo Lara». */
  diferenciadores: readonly string[];
};

export const LEXICO_PARECIDAS: LexicoParecidas = {
  version: "1.0.0",

  conocidas: [
    "ajustada", "ajustado", "amarre", "americana", "argyle", "arlequin", "asimetrico", "bodi",
    "bolsa", "bomber", "borrego", "bustier", "buzo", "camison", "cangurera", "capa",
    "capri", "cebra", "cenido", "cheetah", "choker", "chupin", "circular", "corpino",
    "cortaviento", "cow", "cubretodo", "enterito", "esclava", "esqueleto", "gallo", "gargantilla",
    "georgette", "guepardo", "houndstooth", "jirafa", "kimono", "l", "lazo", "leopard",
    "leopardo", "lyocell", "manilla", "microfibra", "modal", "mono", "morral", "musculosa",
    "muselina", "one", "os", "parka", "pescador", "pike", "pique", "piton",
    "pollera", "puntos", "remera", "rompeviento", "rompevientos", "sarga", "serpiente", "sherpa",
    "skater", "snake", "sweatpant", "sweatpants", "tencel", "tigre", "topos", "trench",
    "tu", "twill", "vaca", "voile", "windbreaker", "zebra",
  ],

  // ---------------------------------------------------------------- sinónimos (canónico ← alias)
  sinonimos: [
    { canon: "polo", alias: ["t shirt", "tshirt", "tee"], dominio: "prenda", confianza: "alta", categoria: "polos" },
    { canon: "polo", alias: ["camiseta", "playera"], dominio: "prenda", confianza: "media", categoria: "polos" },
    { canon: "polera", alias: ["sudadera", "sweatshirt", "sweat shirt"], dominio: "prenda", confianza: "alta", categoria: "poleras" },
    { canon: "polera", alias: ["poleron", "hoodie", "hoody", "crewneck", "crew neck"], dominio: "prenda", confianza: "media", categoria: "poleras" },
    { canon: "chompa", alias: ["sueter", "sweater", "pullover", "pull over", "pulover"], dominio: "prenda", confianza: "alta", categoria: "chompas" },
    { canon: "chompa", alias: ["chompita"], dominio: "prenda", confianza: "media", categoria: "chompas" },
    { canon: "cardigan", alias: ["cardi"], dominio: "prenda", confianza: "media", categoria: "chompas" },
    { canon: "cardigan", alias: ["saco tejido", "chompa abierta", "casaca tejida", "chaqueta tejida"], dominio: "prenda", confianza: "media", categoria: "chompas" },
    { canon: "casaca", alias: ["chaqueta", "jacket"], dominio: "prenda", confianza: "alta", categoria: "casacas" },
    { canon: "casaca", alias: ["cazadora", "campera"], dominio: "prenda", confianza: "media", categoria: "casacas" },
    { canon: "blazer", alias: ["saco", "saco sastre", "chaqueta sastre"], dominio: "prenda", confianza: "media", categoria: "blazers" },
    { canon: "abrigo", alias: ["coat"], dominio: "prenda", confianza: "alta", categoria: "abrigos" },
    { canon: "abrigo", alias: ["tapado", "sobretodo"], dominio: "prenda", confianza: "media", categoria: "abrigos" },
    { canon: "chaleco", alias: ["vest", "gilet", "chalequito"], dominio: "prenda", confianza: "media", categoria: "chalecos" },
    { canon: "camisa", alias: ["shirt"], dominio: "prenda", confianza: "alta", categoria: "camisas y blusas" },
    { canon: "blusa", alias: ["blouse"], dominio: "prenda", confianza: "alta", categoria: "camisas y blusas" },
    { canon: "top", alias: ["tank top", "tank", "tube top", "top tubo", "topcito"], dominio: "prenda", confianza: "media", categoria: "tops" },
    { canon: "body", alias: ["bodysuit", "body suit"], dominio: "prenda", confianza: "alta", categoria: "bodys" },
    { canon: "vestido", alias: ["dress"], dominio: "prenda", confianza: "alta", categoria: "vestidos" },
    { canon: "vestido", alias: ["vestidito"], dominio: "prenda", confianza: "media", categoria: "vestidos" },
    { canon: "falda", alias: ["skirt"], dominio: "prenda", confianza: "alta", categoria: "faldas" },
    { canon: "falda", alias: ["faldita"], dominio: "prenda", confianza: "media", categoria: "faldas" },
    { canon: "conjunto", alias: [], dominio: "prenda", confianza: "alta", categoria: "conjuntos", condicionados: [{ alias: "set", condicion: "no_accesorio" }, { alias: "coordinado", condicion: "sin_contexto" }, { alias: "co ord", condicion: "sin_contexto" }, { alias: "coord", condicion: "sin_contexto" }] },
    { canon: "conjunto", alias: ["dos piezas", "2 piezas", "two piece", "matching set", "twin set"], dominio: "prenda", confianza: "media", categoria: "conjuntos" },
    { canon: "enterizo", alias: ["jumpsuit", "jump suit"], dominio: "prenda", confianza: "alta", categoria: "enterizos" },
    { canon: "enterizo", alias: ["romper", "playsuit"], dominio: "prenda", confianza: "media", categoria: "enterizos" },
    { canon: "jumper", alias: ["pichi"], dominio: "prenda", confianza: "media" },
    { canon: "overol", alias: ["overall", "overoll", "peto", "jardinera", "salopette"], dominio: "prenda", confianza: "media" },
    { canon: "traje de bano", alias: ["swimsuit", "swimwear", "ropa de bano"], dominio: "prenda", confianza: "alta", categoria: "trajes de bano" },
    { canon: "traje de bano", alias: ["banador", "vestido de bano", "bikini", "trikini", "monokini"], dominio: "prenda", confianza: "media", categoria: "trajes de bano" },
    { canon: "corset", alias: ["corse", "corsele"], dominio: "prenda", confianza: "media" },
    { canon: "pantalon", alias: ["pants", "pant", "trouser"], dominio: "prenda", confianza: "alta", categoria: "pantalones" },
    { canon: "pantalon", alias: ["slacks"], dominio: "prenda", confianza: "media", categoria: "pantalones" },
    { canon: "jean", alias: ["pantalon jean", "pantalon de jean", "pantalon denim", "pantalon de denim", "denim pant", "jean pant", "blue jean"], dominio: "prenda", confianza: "alta", categoria: "jeans" },
    { canon: "jean", alias: ["vaquero", "mezclilla"], dominio: "prenda", confianza: "media", categoria: "jeans" },
    { canon: "short", alias: ["pantalon corto", "pantalon short", "short pant"], dominio: "prenda", confianza: "alta", categoria: "shorts" },
    { canon: "short", alias: ["shortcito", "pantaloneta", "bermuda"], dominio: "prenda", confianza: "media", categoria: "shorts" },
    { canon: "legging", alias: ["leggin", "leggins", "legins", "leging"], dominio: "prenda", confianza: "alta" },
    { canon: "legging", alias: ["calza", "malla"], dominio: "prenda", confianza: "media" },
    { canon: "lenceria", alias: ["ropa interior", "intimates"], dominio: "prenda", confianza: "alta", categoria: "ropa interior lenceria" },
    { canon: "brasier", alias: ["sosten", "bra", "brassiere", "brasiere"], dominio: "prenda", confianza: "alta", categoria: "ropa interior lenceria" },
    { canon: "brasier", alias: ["sujetador"], dominio: "prenda", confianza: "media", categoria: "ropa interior lenceria" },
    { canon: "panty", alias: ["calzon", "panties"], dominio: "prenda", confianza: "alta", categoria: "ropa interior lenceria" },
    { canon: "panty", alias: ["braga", "underwear"], dominio: "prenda", confianza: "media", categoria: "ropa interior lenceria" },
    { canon: "pijama", alias: ["piyama", "pyjama", "pijamas"], dominio: "prenda", confianza: "alta" },
    { canon: "pijama", alias: ["ropa de dormir", "sleepwear"], dominio: "prenda", confianza: "media" },
    { canon: "cartera", alias: ["bolso", "handbag"], dominio: "accesorio", confianza: "alta", categoria: "bolsos y carteras" },
    { canon: "cartera", alias: ["purse"], dominio: "accesorio", confianza: "media", categoria: "bolsos y carteras" },
    { canon: "mochila", alias: ["backpack"], dominio: "accesorio", confianza: "alta", categoria: "mochilas" },
    { canon: "rinonera", alias: [], dominio: "accesorio", confianza: "media", categoria: "rinoneras", condicionados: [{ alias: "canguro", condicion: "categoria_rinoneras" }, { alias: "fanny pack", condicion: "sin_contexto" }, { alias: "belt bag", condicion: "sin_contexto" }] },
    { canon: "cinturon", alias: ["belt"], dominio: "accesorio", confianza: "alta", categoria: "cinturones" },
    { canon: "cinturon", alias: ["correa", "cinto"], dominio: "accesorio", confianza: "media", categoria: "cinturones" },
    { canon: "arete", alias: ["earring"], dominio: "accesorio", confianza: "alta", categoria: "aretes" },
    { canon: "arete", alias: ["pendiente", "zarcillo", "aro"], dominio: "accesorio", confianza: "media", categoria: "aretes" },
    { canon: "collar", alias: ["necklace"], dominio: "accesorio", confianza: "alta", categoria: "collares" },
    { canon: "pulsera", alias: ["bracelet"], dominio: "accesorio", confianza: "alta", categoria: "pulseras" },
    { canon: "pulsera", alias: ["brazalete"], dominio: "accesorio", confianza: "media", categoria: "pulseras" },
    { canon: "anillo", alias: ["ring"], dominio: "accesorio", confianza: "alta", categoria: "anillos" },
    { canon: "anillo", alias: ["sortija"], dominio: "accesorio", confianza: "media", categoria: "anillos" },
    { canon: "reloj", alias: ["watch"], dominio: "accesorio", confianza: "alta", categoria: "relojes" },
    { canon: "lentes de sol", alias: ["gafas de sol", "sunglasses", "anteojos de sol"], dominio: "accesorio", confianza: "alta", categoria: "lentes de sol" },
    { canon: "sombrero", alias: ["hat"], dominio: "accesorio", confianza: "alta", categoria: "gorros y sombreros" },
    { canon: "gorra", alias: ["cap"], dominio: "accesorio", confianza: "alta", categoria: "gorros y sombreros" },
    { canon: "gorro", alias: ["beanie"], dominio: "accesorio", confianza: "media", categoria: "gorros y sombreros" },
    { canon: "bufanda", alias: ["scarf"], dominio: "accesorio", confianza: "alta", categoria: "panuelos y panoletas" },
    { canon: "bufanda", alias: ["chalina", "echarpe"], dominio: "accesorio", confianza: "media", categoria: "panuelos y panoletas" },
    { canon: "panuelo", alias: ["panoleta", "bandana"], dominio: "accesorio", confianza: "alta", categoria: "panuelos y panoletas" },
    { canon: "panuelo", alias: ["foulard"], dominio: "accesorio", confianza: "media", categoria: "panuelos y panoletas" },
    { canon: "chal", alias: ["shawl"], dominio: "accesorio", confianza: "alta", categoria: "panuelos y panoletas" },
    { canon: "chal", alias: ["pashmina", "manton"], dominio: "accesorio", confianza: "media", categoria: "panuelos y panoletas" },
    { canon: "zapatilla", alias: ["sneaker"], dominio: "calzado", confianza: "alta", categoria: "zapatillas" },
    { canon: "zapatilla", alias: ["tenis"], dominio: "calzado", confianza: "media", categoria: "zapatillas" },
    { canon: "sandalia", alias: ["sandal"], dominio: "calzado", confianza: "alta", categoria: "sandalias" },
    { canon: "bota", alias: ["boot"], dominio: "calzado", confianza: "alta", categoria: "botas" },
    { canon: "botin", alias: ["ankle boot", "bootie", "booty"], dominio: "calzado", confianza: "media", categoria: "botines" },
    { canon: "zapato formal", alias: ["zapato de vestir"], dominio: "calzado", confianza: "media", categoria: "zapatos formales" },
    { canon: "mocasin", alias: ["loafer"], dominio: "calzado", confianza: "alta", categoria: "mocasines" },
    { canon: "bailarina", alias: ["ballerina", "ballet flat"], dominio: "calzado", confianza: "alta", categoria: "bailarinas" },
    { canon: "bailarina", alias: ["flat", "chata"], dominio: "calzado", confianza: "media", categoria: "bailarinas" },
    { canon: "algodon", alias: ["cotton"], dominio: "tejido", confianza: "alta" },
    { canon: "algodon pima", alias: ["pima", "pima cotton", "algodon pima peruano", "algodon peruano pima"], dominio: "tejido", confianza: "alta" },
    { canon: "algodon alicrado", alias: ["algodon licrado", "algodon lycrado", "algodon con licra", "algodon con lycra", "algodon elastizado", "algodon stretch", "algodon strech"], dominio: "tejido", confianza: "alta" },
    { canon: "algodon alicrado", alias: ["alicrado", "licrado", "lycrado"], dominio: "tejido", confianza: "media" },
    { canon: "hilo de algodon", alias: ["hilo algodon", "cotton yarn", "algodon en hilo"], dominio: "tejido", confianza: "alta" },
    { canon: "hilo de algodon", alias: [], dominio: "tejido", confianza: "media", condicionados: [{ alias: "hilo", condicion: "sin_contexto" }] },
    { canon: "denim", alias: ["tela jean", "tela denim"], dominio: "tejido", confianza: "alta" },
    { canon: "denim", alias: [], dominio: "tejido", confianza: "media", condicionados: [{ alias: "jean", condicion: "sin_contexto" }, { alias: "mezclilla", condicion: "sin_contexto" }] },
    { canon: "poliester", alias: ["polyester", "poly", "pes"], dominio: "tejido", confianza: "alta" },
    { canon: "licra", alias: ["lycra", "spandex", "elastano", "elastane", "full licra", "full lycra"], dominio: "tejido", confianza: "alta" },
    { canon: "lino", alias: ["linen"], dominio: "tejido", confianza: "alta" },
    { canon: "seda", alias: ["silk"], dominio: "tejido", confianza: "alta" },
    { canon: "viscosa", alias: ["viscose", "rayon"], dominio: "tejido", confianza: "alta" },
    { canon: "gasa", alias: ["chiffon", "chifon", "shifon"], dominio: "tejido", confianza: "alta" },
    { canon: "popelina", alias: ["poplin", "popelin"], dominio: "tejido", confianza: "alta" },
    { canon: "gabardina", alias: ["gabardine"], dominio: "tejido", confianza: "alta" },
    { canon: "drill", alias: ["dril"], dominio: "tejido", confianza: "alta" },
    { canon: "pana", alias: ["corduroy", "corderoy"], dominio: "tejido", confianza: "alta" },
    { canon: "polar", alias: ["fleece", "polar fleece", "micropolar", "micro polar"], dominio: "tejido", confianza: "alta" },
    { canon: "jersey", alias: ["interlock", "single jersey", "punto jersey"], dominio: "tejido", confianza: "alta" },
    { canon: "rib", alias: ["rib licrado", "rib stretch", "ribb", "ribbed", "rib knit"], dominio: "tejido", confianza: "alta" },
    { canon: "rib", alias: ["canale", "acanalado"], dominio: "tejido", confianza: "media" },
    { canon: "suplex", alias: ["supplex"], dominio: "tejido", confianza: "alta" },
    { canon: "seersucker", alias: ["seer sucker", "sersucker", "sirsaca"], dominio: "tejido", confianza: "media" },
    { canon: "lana", alias: ["wool"], dominio: "tejido", confianza: "alta" },
    { canon: "alpaca", alias: ["baby alpaca", "alpaca baby", "alpaca peruana"], dominio: "tejido", confianza: "media" },
    { canon: "acrilico", alias: ["acrylic", "hilo acrilico"], dominio: "tejido", confianza: "alta" },
    { canon: "poliamida", alias: ["nylon", "nailon", "polyamide"], dominio: "tejido", confianza: "alta" },
    { canon: "cuero", alias: ["leather"], dominio: "tejido", confianza: "alta" },
    { canon: "cuero sintetico", alias: ["cuerina", "ecocuero", "eco cuero", "polipiel", "cuero vegano", "cuero ecologico", "leatherette", "pu leather"], dominio: "tejido", confianza: "alta" },
    { canon: "gamuza", alias: ["suede", "ante"], dominio: "tejido", confianza: "media" },
    { canon: "terciopelo", alias: ["velvet", "velour"], dominio: "tejido", confianza: "alta" },
    { canon: "encaje", alias: ["lace", "puntilla", "guipur"], dominio: "tejido", confianza: "media" },
    { canon: "tul", alias: ["tulle"], dominio: "tejido", confianza: "alta" },
    { canon: "liso", alias: ["plain", "solid", "unicolor", "color entero", "sin estampado"], dominio: "patron", confianza: "alta" },
    { canon: "liso", alias: ["solido"], dominio: "patron", confianza: "media" },
    { canon: "rayas", alias: ["rayado", "rayada", "a rayas", "stripe", "striped", "listado"], dominio: "patron", confianza: "alta" },
    { canon: "rayas", alias: ["milrayas", "mil rayas", "pinstripe", "pin stripe", "marinero"], dominio: "patron", confianza: "media" },
    { canon: "cuadros", alias: ["a cuadros", "cuadriculado", "plaid", "check", "checked", "cuadrille"], dominio: "patron", confianza: "alta" },
    { canon: "cuadros", alias: ["tartan", "escoces", "vichy", "gingham"], dominio: "patron", confianza: "media" },
    { canon: "lunares", alias: ["polka dot", "polka", "polka dots", "dots", "a lunares", "poa"], dominio: "patron", confianza: "alta" },
    { canon: "floral", alias: ["flores", "de flores", "con flores", "flower", "flowers", "florecitas", "flor"], dominio: "patron", confianza: "alta" },
    { canon: "estampado", alias: ["print", "printed", "estampada", "sublimado"], dominio: "patron", confianza: "media" },
    { canon: "animal print", alias: ["print animal", "animalprint", "animal"], dominio: "patron", confianza: "alta" },
    { canon: "rombos", alias: ["rombo", "diamond", "diamantes"], dominio: "patron", confianza: "media" },
    { canon: "cable knit", alias: ["punto trenzado", "trenzado", "trenzas", "torzal", "cableado", "punto cable"], dominio: "patron", confianza: "media" },
    { canon: "geometrico", alias: ["geometric", "figuras geometricas"], dominio: "patron", confianza: "media" },
    { canon: "tie dye", alias: ["tiedye", "tenido anudado", "batik"], dominio: "patron", confianza: "media" },
  ],

  // ---------------------------------------------------------------- siluetas (solo aplican a las prendas que dicen)
  siluetas: [
    { canon: "wide leg", alias: ["wideleg", "pierna ancha", "pata ancha"], confianza: "alta", prendas: ["pantalon", "jean"], grupo: "pierna_ancha" },
    { canon: "wide leg", alias: ["palazo", "palazzo", "pantalon palazo", "pantalon palazzo", "pantalon ancho"], confianza: "media", prendas: ["pantalon", "jean"], grupo: "pierna_ancha" },
    { canon: "wide leg corto", alias: ["culotte", "pantalon culotte", "pantacourt"], confianza: "media", prendas: ["pantalon", "jean"], grupo: "pierna_ancha" },
    { canon: "recto", alias: ["straight", "straight leg", "straight fit", "pierna recta", "pata recta", "corte recto"], confianza: "alta", prendas: ["pantalon", "jean"], grupo: "recto" },
    { canon: "recto", alias: ["regular", "regular fit"], confianza: "media", prendas: ["pantalon", "jean", "polo", "camisa"], grupo: "recto" },
    { canon: "mom", alias: ["mom jean", "mom fit", "mom style"], confianza: "alta", prendas: ["jean"], grupo: "holgado" },
    { canon: "boyfriend", alias: ["boyfriend fit", "bf fit"], confianza: "media", prendas: ["jean"], grupo: "holgado" },
    { canon: "baggy", alias: ["loose", "loose fit", "relaxed", "relaxed fit", "slouchy"], confianza: "media", prendas: ["pantalon", "jean"], grupo: "holgado" },
    { canon: "oversize", alias: ["oversized", "over size", "oversize fit"], confianza: "alta", prendas: ["polo", "polera", "camisa", "casaca", "chompa", "blazer"], grupo: "holgado" },
    { canon: "oversize", alias: ["holgado", "holgada", "amplio", "amplia"], confianza: "media", prendas: ["polo", "polera", "camisa", "casaca", "chompa", "pantalon"], grupo: "holgado" },
    { canon: "skinny", alias: ["skinny fit", "super skinny", "pitillo"], confianza: "media", prendas: ["pantalon", "jean"], grupo: "ajustado" },
    { canon: "slim", alias: ["slim fit", "entallado", "entallada"], confianza: "media", prendas: ["pantalon", "jean", "camisa", "blazer"], grupo: "ajustado" },
    { canon: "flare", alias: ["acampanado", "acampanada", "campana", "pata de elefante", "bell bottom", "flared", "flare leg"], confianza: "alta", prendas: ["pantalon", "jean"], grupo: "campana" },
    { canon: "flare", alias: ["bootcut", "boot cut", "semi acampanado"], confianza: "media", prendas: ["pantalon", "jean"], grupo: "campana" },
    { canon: "cargo", alias: ["pantalon cargo", "cargo pant"], confianza: "alta", prendas: ["pantalon", "jean"], grupo: "utilitario" },
    { canon: "jogger", alias: ["joggers", "pantalon jogger", "jogging"], confianza: "alta", prendas: ["pantalon"], grupo: "deportivo" },
    { canon: "paperbag", alias: ["paper bag", "cintura paperbag", "cintura fruncida"], confianza: "media", prendas: ["pantalon", "falda", "short"], grupo: "cintura" },
    { canon: "biker", alias: ["ciclista", "biker short", "short ciclista", "cycling short"], confianza: "media", prendas: ["short", "legging"], grupo: "deportivo" },
    { canon: "crop", alias: ["cropped"], confianza: "alta", prendas: ["polo", "top", "camisa", "chompa", "casaca", "polera"], grupo: "largo" },
    { canon: "crop", alias: ["cortito", "cortita"], confianza: "media", prendas: ["polo", "top", "camisa", "chompa", "casaca", "polera"], grupo: "largo" },
    { canon: "tubo", alias: ["falda tubo", "pencil", "pencil skirt", "falda lapiz", "lapiz"], confianza: "media", prendas: ["falda"], grupo: "ajustado" },
    { canon: "linea a", alias: ["a line", "evase", "falda evase", "en a"], confianza: "media", prendas: ["falda", "vestido"], grupo: "vuelo" },
    { canon: "plisado", alias: ["plisada", "tableado", "tableada", "pleated", "plisse"], confianza: "media", prendas: ["falda", "vestido", "pantalon"], grupo: "plisado" },
    { canon: "cruzado", alias: ["cruzada", "envolvente", "wrap"], confianza: "media", prendas: ["vestido", "blusa", "falda", "top"], grupo: "cruzado" },
    { canon: "camisero", alias: ["camisera", "shirt dress", "estilo camisero"], confianza: "media", prendas: ["vestido"], grupo: "camisero" },
    { canon: "lencero", alias: ["lencera", "slip dress", "vestido lencero"], confianza: "media", prendas: ["vestido"], grupo: "lencero" },
    { canon: "bodycon", alias: ["body con"], confianza: "alta", prendas: ["vestido", "falda"], grupo: "ajustado" },
    { canon: "babydoll", alias: ["baby doll"], confianza: "alta", prendas: ["vestido", "blusa"], grupo: "babydoll" },
    { canon: "imperio", alias: ["empire", "corte imperio"], confianza: "media", prendas: ["vestido"], grupo: "babydoll" },
    { canon: "sirena", alias: ["mermaid"], confianza: "alta", prendas: ["vestido", "falda"], grupo: "sirena" },
    { canon: "sastre", alias: ["sastrero", "tailored", "de vestir"], confianza: "media", prendas: ["pantalon", "blazer"], grupo: "formal" },
  ],

  // ---------------------------------------------------------------- atributos de forma (dos valores distintos del mismo grupo = conflicto)
  atributos: {
    manga: [
      { canon: "manga larga", alias: ["mangas largas", "m larga", "long sleeve", "long sleeves"], confianza: "alta" },
      { canon: "manga larga", alias: ["ml"], confianza: "media" },
      { canon: "manga corta", alias: ["mangas cortas", "m corta", "short sleeve", "short sleeves"], confianza: "alta" },
      { canon: "manga corta", alias: ["mc"], confianza: "media" },
      { canon: "manga tres cuartos", alias: ["manga 3 4", "m 3 4", "tres cuartos", "3 4"], confianza: "media" },
      { canon: "sin mangas", alias: ["sin manga", "s manga", "s mangas", "s mg", "sleeveless"], confianza: "alta" },
      { canon: "manga globo", alias: ["manga abullonada", "manga bombacha", "puff sleeve", "puff sleeves", "manga farol"], confianza: "media" },
      { canon: "manga campana", alias: ["bell sleeve", "bell sleeves"], confianza: "alta" },
      { canon: "manga murcielago", alias: ["batwing", "manga dolman"], confianza: "media" },
    ],
    cuello: [
      { canon: "cuello redondo", alias: ["cuello o", "escote redondo", "round neck", "crew neck"], confianza: "media" },
      { canon: "cuello v", alias: ["escote v", "cuello en v", "v neck"], confianza: "alta" },
      { canon: "escote u", alias: ["cuello u", "escote en u", "cuello en u", "escote redondo en u", "cuello escote redondo en u"], confianza: "media" },
      { canon: "cuello alto", alias: ["cuello tortuga", "cuello subido", "cuello cisne", "turtleneck", "mock neck"], confianza: "media" },
      { canon: "cuello camisero", alias: ["cuello polo", "cuello solapa"], confianza: "media" },
      { canon: "escote cuadrado", alias: ["square neck", "cuello cuadrado"], confianza: "alta" },
      { canon: "escote corazon", alias: ["sweetheart", "corazon"], confianza: "media" },
      { canon: "halter", alias: ["cuello halter", "al cuello", "amarrado al cuello"], confianza: "media" },
      { canon: "strapless", alias: ["sin tirantes", "bandeau", "top tubo"], confianza: "media" },
      { canon: "hombros descubiertos", alias: ["off shoulder", "off the shoulder", "hombros caidos", "bardot", "hombros al aire"], confianza: "media" },
      { canon: "espalda descubierta", alias: ["open back", "espalda abierta"], confianza: "media" },
    ],
    largo: [
      { canon: "mini", alias: ["micro", "minifalda", "minivestido"], confianza: "alta" },
      { canon: "midi", alias: ["media pierna", "a media pierna", "longuette"], confianza: "alta" },
      { canon: "maxi", alias: ["largo", "larga", "long"], confianza: "media" },
      { canon: "corto", alias: ["corta", "cortito", "cortita", "short length"], confianza: "media" },
    ],
    tiro: [
      { canon: "tiro alto", alias: ["cintura alta", "high waist", "high rise", "talle alto"], confianza: "alta" },
      { canon: "tiro medio", alias: ["cintura media", "mid rise", "mid waist"], confianza: "alta" },
      { canon: "tiro bajo", alias: ["cintura baja", "low rise", "low waist"], confianza: "alta" },
    ],
    detalles: [
      { canon: "con bolsillos", alias: ["c bolsillos", "bolsillos", "con bolsillo", "pockets"], confianza: "media" },
      { canon: "con cierre", alias: ["c cierre", "cierre", "zipper"], confianza: "media" },
      { canon: "con botones", alias: ["c botones", "botones", "abotonado"], confianza: "media" },
      { canon: "con volados", alias: ["volados", "volante", "volantes", "vuelos", "ruffle", "ruffles"], confianza: "media" },
      { canon: "con cinturon", alias: ["c cinturon", "cinturon incluido"], confianza: "media" },
      { canon: "bordado", alias: ["bordada", "embroidered", "broderie"], confianza: "media" },
    ],
  },

  // ---------------------------------------------------------------- abreviaturas
  abreviaturas: [
    ["ml", "manga larga"], ["m.l.", "manga larga"], ["mc", "manga corta"], ["m.c.", "manga corta"],
    ["m3/4", "manga tres cuartos"], ["m 3/4", "manga tres cuartos"], ["3/4", "tres cuartos"], ["s/mg", "sin manga"],
    ["s/mga", "sin manga"], ["c/u", "cada uno"], ["pant", "pantalon"], ["pantal", "pantalon"],
    ["blz", "blazer"], ["blus", "blusa"], ["chom", "chompa"], ["shrt", "short"],
    ["fal", "falda"], ["jns", "jean"], ["legg", "legging"], ["conj", "conjunto"],
    ["cjto", "conjunto"], ["sud", "sudadera"], ["alg", "algodon"], ["algod", "algodon"],
    ["pes", "poliester"], ["lic", "licra"], ["vsc", "viscosa"], ["dnm", "denim"],
    ["ss", "primavera verano"], ["s/s", "primavera verano"], ["fw", "otono invierno"], ["f/w", "otono invierno"],
    ["aw", "otono invierno"], ["a/w", "otono invierno"], ["pv", "primavera verano"], ["p/v", "primavera verano"],
    ["oi", "otono invierno"], ["o/i", "otono invierno"], ["ver", "verano"], ["inv", "invierno"],
    ["oto", "otono"], ["temp", "temporada"], ["colec", "coleccion"], ["t.u.", "talla unica"],
    ["t/u", "talla unica"], ["std", "estandar"], ["tll", "talla"], ["pza", "pieza"],
    ["pzas", "piezas"], ["pz", "pieza"], ["pzs", "piezas"], ["pcs", "piezas"],
    ["und", "unidad"], ["unid", "unidad"], ["uds", "unidades"], ["doc", "docena"],
    ["nvo", "nuevo"], ["nva", "nueva"], ["dcto", "descuento"], ["dscto", "descuento"],
    ["prom", "promocion"], ["ref", "referencia"], ["cod", "codigo"], ["art", "articulo"],
    ["mod", "modelo"],
  ],

  // ---------------------------------------------------------------- ruido
  ruido: [
    "adulto", "adultos", "agotado", "al", "amarilla", "amarillo", "antracita", "art",
    "articulo", "azul", "beige", "best", "bestseller", "bicolor", "black", "blanca",
    "blanco", "blue", "bonita", "bonito", "borgona", "boutique", "brand", "brown",
    "burdeos", "cafe", "calidad", "camel", "caqui", "casual", "celeste", "champan",
    "chic", "chica", "chicas", "cobalto", "cod", "codigo", "coleccion", "collection",
    "color", "colores", "comfort", "comfy", "comoda", "comodo", "con", "confort",
    "crema", "crudo", "cute", "cyber", "dama", "damas", "dcto", "de",
    "del", "descuento", "diseno", "disenos", "disponible", "docena", "docenas", "dorada",
    "dorado", "e", "el", "elegante", "en", "especial", "estandar", "estilo",
    "estilos", "exclusiva", "exclusivo", "fashion", "femenina", "femenino", "fresca", "fresco",
    "friday", "fucsia", "girl", "girls", "glamour", "grafito", "granate", "gray",
    "green", "grey", "gris", "guinda", "hermosa", "hermoso", "hot", "importada",
    "ingreso", "invierno", "item", "jaspeado", "juvenil", "khaki", "la", "ladies",
    "lady", "lanzamiento", "las", "ligera", "ligero", "linda", "lindo", "linea",
    "liquidacion", "llegada", "look", "los", "marino", "marron", "mayor", "mayorista",
    "medida", "medidas", "melange", "menor", "mod", "modelo", "modelos", "moderna",
    "moderno", "morada", "morado", "mostaza", "mujer", "mujeres", "multicolor", "nacional",
    "naranja", "navy", "negra", "negro", "new", "novedad", "novedades", "nude",
    "nueva", "nuevas", "nuevo", "nuevos", "oferta", "ofertas", "oficial", "orange",
    "otono", "outfit", "outlet", "par", "para", "pares", "pcs", "piedra",
    "pieza", "piezas", "pink", "plateada", "plateado", "plomo", "por", "primavera",
    "primera", "prod", "producto", "promo", "promocion", "purple", "pz", "pza",
    "pzas", "pzs", "rebaja", "red", "ref", "referencia", "remate", "retail",
    "roja", "rojo", "rosada", "rosado", "sale", "seller", "senorita", "senoritas",
    "serie", "sexy", "shop", "sin", "size", "sku", "srta", "standar",
    "standard", "std", "stock", "store", "suave", "surtida", "surtido", "surtidos",
    "talla", "tallas", "taupe", "teen", "teens", "temp", "temporada", "tendencia",
    "terracota", "tienda", "tiendas", "tipo", "tll", "topo", "trend", "trendy",
    "turquesa", "ud", "uds", "ultimas", "ultimo", "un", "una", "und",
    "unica", "unico", "unid", "unidad", "unidades", "unitalla", "variado", "variedad",
    "varios", "verano", "verde", "versatil", "vino", "viral", "white", "woman",
    "women", "womens", "wow", "xl", "xs", "xxl", "xxs", "xxxl",
    "y", "yellow",
  ],

  compuestos: [
    ["minifalda", "mini", "falda"], ["minivestido", "mini", "vestido"], ["midifalda", "midi", "falda"],
    ["midivestido", "midi", "vestido"], ["maxifalda", "maxi", "falda"], ["maxivestido", "maxi", "vestido"],
    ["minishort", "mini", "short"], ["croptop", "crop", "top"], ["tanktop", "tank", "top"],
    ["tshirt", "t", "shirt"], ["wideleg", "wide", "leg"], ["paperbag", "paper", "bag"],
    ["animalprint", "animal", "print"], ["tiedye", "tie", "dye"], ["bodysuit", "body", "suit"],
    ["sweatshirt", "sweat", "shirt"], ["jumpsuit", "jump", "suit"],
  ],

  plurales: {
    invariables: ["tenis", "lentes", "gafas", "lunes", "crisis", "iris", "oasis"],
    irregulares: {
      pantalones: "pantalon", lunares: "lunar", flores: "flor", jeans: "jean",
      shorts: "short", pants: "pant", leggings: "legging", bodies: "body",
      bodys: "body", panties: "panty", blazers: "blazer", sneakers: "sneaker",
      bermudas: "bermuda",
    },
  },

  ambiguos: ["top", "mezclilla", "jersey", "gabardina", "denim", "jean", "jeans", "buzo", "canguro", "polera", "camiseta", "casaca", "chompa", "saco", "jumper", "enterito", "enteriza", "mono", "culotte", "bikini", "malla", "calza", "hilo", "lana", "estampado", "campana", "set", "vest", "pollera", "franela", "topos", "argolla", "s", "m l", "s m", "rosa", "clasico"],

  categoriasVecinas: [
    ["pantalones", "jeans"],
    ["camisas y blusas", "tops", "bodys"],
    ["casacas", "abrigos", "blazers"],
    ["chompas", "chalecos"],
    ["chompas", "poleras"],
    ["vestidos", "enterizos", "conjuntos"],
    ["faldas", "shorts"],
    ["bolsos y carteras", "mochilas", "rinoneras"],
  ],

  // ---------------------------------------------------------------- patrones de código (precios primero; luego en este orden)
  patrones: {
    precios: [
      { nombre: "precio_soles", campo: "descartar", regex: "\\bs\\/\\.?\\s?\\d+(?:[.,]\\d{1,2})?\\b|\\b\\d+(?:[.,]\\d{1,2})?\\s?(?:soles|sol)\\b" },
      { nombre: "precio_dolares", campo: "descartar", regex: "\\$\\s?\\d+(?:[.,]\\d{1,2})?" },
      { nombre: "descuento_porcentaje", campo: "descartar", regex: "-?\\b\\d{1,2}\\s?%\\s?(?:dcto|dscto|desc|descuento|off)\\b|\\b(?:dcto|dscto|desc|descuento|off)\\.?\\s?-?\\d{1,2}\\s?%" },
    ],
    orden: [
      { nombre: "codigo_modelo_guion_temporada", campo: "codigo", regex: "\\b\\d{1,4}\\s?[-_/|]\\s?(?:ss|fw|aw)\\s?(?:20)?\\d{2}\\b" },
      { nombre: "codigo_temporada_modelo", campo: "codigo", regex: "\\b(?:ss|fw|aw|pf)\\s?(?:20)?\\d{2}[\\s\\-_/]+\\d{2,4}[a-z]?\\b" },
      { nombre: "temporada_ss_fw_aw", campo: "temporada", regex: "\\b(?:ss|fw|aw|pf|s\\/s|f\\/w|a\\/w)\\s?[-_/']?\\s?(?:20)?\\d{2}\\b" },
      { nombre: "temporada_pv_oi", campo: "temporada", regex: "\\b(?:p\\/?v|o\\/?i)\\s?[-_/']?\\s?(?:20)?\\d{2}\\b" },
      { nombre: "temporada_en_palabras", campo: "temporada", regex: "\\b(?:primavera|verano|otono|invierno|ver|inv|oto|pri)\\s?[-_/']?\\s?(?:20)?\\d{2}\\b" },
      { nombre: "codigo_cayla_interno", campo: "codigo", regex: "\\b[a-z]{3}-\\d{4}(?:-[a-z]{3}-[a-z0-9]{1,4})?\\b" },
      { nombre: "curva_de_tallas", campo: "descartar", regex: "\\b(?:xxs|xs|s|m|l|xl|xxl|xxxl)(?:\\s?[/\\-,]\\s?(?:xxs|xs|s|m|l|xl|xxl|xxxl)){2,}\\b" },
      { nombre: "talla_con_prefijo", campo: "descartar", regex: "\\b(?:talla|tallas|tll|t)[\\s.:\\-]*(?:xxs|xs|s|m|l|xl|xxl|xxxl|[2-4]xl|\\d{2}|unica|std)\\b" },
      { nombre: "talla_unica", campo: "descartar", regex: "\\b(?:talla\\s+)?(?:unica|unico|t[./]u\\.?|std|estandar|standar|standard|one\\s?size)\\b" },
      { nombre: "composicion_porcentaje", campo: "descartar", regex: "\\b\\d{1,3}\\s?%\\s?[a-z]{2,}(?:\\s+\\d{1,3}\\s?%\\s?[a-z]{2,})*" },
      { nombre: "cantidad_por_bulto", campo: "pack", regex: "\\bx\\s?\\d{1,3}\\b|\\b\\d{1,3}\\s?(?:pzs?|pzas?|pcs?|piezas?|unds?|unid(?:ades)?|uds?|docenas?|pares?)\\b" },
      { nombre: "especificacion_rib", campo: "descartar", regex: "\\brib\\s?\\d\\s?[x/]\\s?\\d\\b" },
      { nombre: "gramaje", campo: "descartar", regex: "\\b\\d{2,3}\\s?(?:gr|gsm|g\\/m2)\\b" },
      { nombre: "medida_en_cm", campo: "descartar", regex: "\\b\\d{1,3}\\s?(?:cm|mm|mts?)\\b" },
      { nombre: "anio_suelto", campo: "temporada", regex: "\\b(?:19|20)\\d{2}\\b" },
      { nombre: "prefijo_de_codigo", campo: "codigo", regex: "\\b(?:ref|art|mod|cod|codigo|modelo|item|sku)\\.?[\\s:#-]*(?=[a-z]*\\d)[a-z0-9][a-z0-9-]*\\b" },
      { nombre: "codigo_letra_numero", campo: "codigo", regex: "\\b[a-z]{1,3}-?\\d{2,4}[a-z]?\\b" },
      { nombre: "codigo_letra_espacio_numero", campo: "codigo", regex: "\\b[b-df-np-tv-wz]\\s\\d{2,3}\\b" },
      { nombre: "codigo_numerico_solo", campo: "codigo", regex: "\\b(?!(?:19|20)\\d{2}\\b)\\d{3,5}\\b" },
    ],
  },

  diferenciadores: ["plus", "petit", "curvy", "edicion", "reedicion", "ii", "iii", "iv", "v2", "v3"],
};
