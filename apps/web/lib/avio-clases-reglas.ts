import type { MaterialVista, UnidadInsumo, UnidadMedidaAvio } from "./insumos-reglas";

export type { UnidadMedidaAvio };

// Las clases de avío (ADR-0580): botón, cierre, hilo, etiqueta, elástico y cinta, pretina, otro. Reglas puras, sin React ni red.
//
// EL PROBLEMA. Hasta hoy el sistema no sabía que un botón es un botón: `insumos.tipo` solo valía «tela» o «avio». Por eso la hoja proponía «unidades» para TODO avío —y el hilo, que se compra por
// CONO, nacía mal medido para siempre (`fn_insumos_unidad_firme` congela la unidad al primer lote)— y la medida que de verdad distingue un avío de otro (18 L de línea, 40 cm de largo, 3 cm de
// ancho, título 40) terminaba escrita dentro del nombre, donde `fn_clave_texto` no la ve: «Botón nácar 18mm» y «Botón nácar 18 mm» entraban como DOS fichas, cada una con su stock.
//
// CONTRATO
//   PROMETE: para un comportamiento dado, qué unidad se PROPONE, si la clase lleva color y qué medida admite — exactamente lo mismo que `retail.fn_medida_cuadra` y `retail.fn_material_leer`
//            (`supabase/migrations/20261030144000`), y `textoDeMedida` dice exactamente lo mismo que `retail.fn_medida_texto`. Sus pruebas lo exigen valor por valor.
//   ASUME:   el nombre de una clase se renombra (es una fila que el líder edita) y su COMPORTAMIENTO no (es un CHECK cerrado). Por eso toda regla se indexa por el comportamiento, jamás por el
//            nombre visible (ADR-0290).
//   NO HACE: no decide quién crea una clase (la política `avio_clases_insert_autenticado`) ni toca la base.

/** Lo cerrado: de aquí salen las reglas. Una clase NUEVA es una fila; un comportamiento nuevo es código nuevo. */
export type ComportamientoClase = "pieza" | "largo" | "ancho" | "titulo" | "etiqueta" | "otro";

export type ClaseDeAvio = {
  id: string;
  nombre: string;
  /** Las 2 a 4 letras con que empieza el código de sus fichas (`BOT-01`). */
  prefijo: string;
  comportamiento: ComportamientoClase;
  /** La unidad que la hoja propone. No la impone: la elige quien tiene el avío en la mano, y después no se cambia. */
  unidadSugerida: UnidadInsumo;
  pideColor: boolean;
  orden: number;
  activo: boolean;
  nota: string | null;
};

export const UNIDADES_MEDIDA: Record<UnidadMedidaAvio, { corta: string; larga: string; ayuda: string }> = {
  linea: { corta: "L", larga: "Líneas (L)", ayuda: "La medida de toda la vida del botón: 18 L ≈ 11,4 mm." },
  milimetro: { corta: "mm", larga: "Milímetros", ayuda: "El diámetro, si el proveedor lo dice en milímetros." },
  centimetro: { corta: "cm", larga: "Centímetros", ayuda: "El largo del cierre o el ancho del elástico." },
  titulo: { corta: "título", larga: "Título del hilo", ayuda: "El grosor: 40 es más fino que 20." },
};

type ReglaDeComportamiento = {
  /** Las unidades de medida que admite. Vacío = no se mide. */
  medidas: readonly UnidadMedidaAvio[];
  /** `true`: sin su medida la ficha no se puede guardar (es lo que la distingue de otra de su clase). */
  requerida: boolean;
  /** Cómo se llama esa medida en la hoja. */
  comoSeLlama: string;
  /** Lo que se escribe de ejemplo en la caja. */
  ejemplo: string;
  /** Por qué se pide, en palabras de tienda. */
  porQue: string;
};

/** La tabla de verdad. Es la MISMA que `retail.fn_medida_cuadra` y los `raise` de `fn_material_leer`; `avio-clases-reglas.test.ts` lo comprueba comportamiento por comportamiento. */
export const COMPORTAMIENTOS: Record<ComportamientoClase, ReglaDeComportamiento> = {
  pieza: { medidas: ["linea", "milimetro"], requerida: false, comoSeLlama: "Medida", ejemplo: "18", porQue: "Un botón de 18 L y uno de 24 L son dos avíos distintos." },
  largo: { medidas: ["centimetro"], requerida: true, comoSeLlama: "Largo", ejemplo: "40", porQue: "Un cierre de 20 cm y uno de 40 cm no se pueden mezclar." },
  ancho: { medidas: ["centimetro"], requerida: true, comoSeLlama: "Ancho", ejemplo: "3", porQue: "Lo que distingue un elástico de otro es su ancho." },
  titulo: { medidas: ["titulo"], requerida: true, comoSeLlama: "Título", ejemplo: "40", porQue: "El grosor del hilo: con el equivocado la costura se nota." },
  etiqueta: { medidas: [], requerida: false, comoSeLlama: "Medida", ejemplo: "", porQue: "Una etiqueta no se mide: lo que la distingue es su nombre." },
  otro: { medidas: ["linea", "milimetro", "centimetro", "titulo"], requerida: false, comoSeLlama: "Medida", ejemplo: "", porQue: "Si este avío se distingue por una medida, escríbela; si no, déjala vacía." },
};

/** Las unidades de medida que admite un comportamiento. Vacío = esa clase no se mide (la etiqueta). */
export function medidasDe(c: ComportamientoClase): readonly UnidadMedidaAvio[] {
  return COMPORTAMIENTOS[c].medidas;
}

/** ¿Esa unidad de medida es la de esa clase? Es `retail.fn_medida_cuadra`. */
export function medidaCuadra(c: ComportamientoClase, u: UnidadMedidaAvio): boolean {
  return COMPORTAMIENTOS[c].medidas.includes(u);
}

/** Sin esta medida la ficha no se guarda: es lo que distingue un cierre de 20 cm de uno de 40. */
export function medidaRequerida(c: ComportamientoClase): boolean {
  return COMPORTAMIENTOS[c].requerida;
}

/** Esa clase no se mide: lo que la distingue es su nombre (la etiqueta de marca, de talla, de composición). */
export function medidaProhibida(c: ComportamientoClase): boolean {
  return COMPORTAMIENTOS[c].medidas.length === 0;
}

/**
 * La medida dicha en palabras: «18 L», «11.4 mm», «40 cm», «título 40».
 *
 * El punto decimal es a propósito: la base compone con él el nombre de cada color (`retail.fn_medida_texto`, que usa `trim_scale`), y si la web dijera «11,4» el título de la ficha y el nombre de
 * su color no se leerían igual. Un decimal que no aporta no se escribe (18.00 → «18 L»).
 */
export function textoDeMedida(valor: number | null, unidad: UnidadMedidaAvio | null): string | null {
  if (valor === null || unidad === null || !Number.isFinite(valor)) return null;
  const n = String(Number(valor.toFixed(2)));
  return unidad === "titulo" ? `título ${n}` : `${n} ${UNIDADES_MEDIDA[unidad].corta}`;
}

/**
 * El nombre con el que se lee una ficha de Insumos: el que le pusieron, más su medida («Botón nácar 18 L»).
 *
 * Es lo MISMO que compone la base en `fn_insumos_copias_de_la_tela` para el nombre de cada color («Botón nácar 18 L · Negro»): si la web lo dijera distinto, el título de la ficha y la lista
 * de sus colores no se leerían igual. Una tela no tiene medida, así que devuelve su nombre tal cual.
 */
export function nombreDeMaterial(m: Pick<MaterialVista, "nombre" | "medida">): string {
  const t = m.medida ? textoDeMedida(m.medida.valor, m.medida.unidad) : null;
  return t === null ? m.nombre : `${m.nombre} ${t}`;
}

/** La clase elegida, o `null`: lo que la hoja usa para decidir qué pedir. Una clase desactivada no se ofrece. */
export function claseElegida(clases: readonly ClaseDeAvio[], id: string): ClaseDeAvio | null {
  return clases.find((c) => c.id === id && c.activo) ?? null;
}

/** Las clases que se pueden elegir, en el orden en que el líder las puso (y, a igual orden, por nombre). */
export function clasesOfrecidas(clases: readonly ClaseDeAvio[]): ClaseDeAvio[] {
  return clases.filter((c) => c.activo).sort((a, b) => a.orden - b.orden || a.nombre.localeCompare(b.nombre, "es"));
}

/**
 * El prefijo con que empezarán los códigos de una clase nueva («Broche» → BRO). Dos clases no pueden compartirlo (el código de sus fichas se mezclaría), así que si ya está tomado se prueba con
 * la siguiente letra del nombre y, si tampoco, con un número. Devuelve `null` solo si el nombre no tiene ni dos letras.
 */
export function prefijoLibre(nombre: string, usados: readonly string[]): string | null {
  const letras = nombre
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase()
    .replace(/[^A-Z]/g, "");
  if (letras.length < 2) return null;
  const tomados = new Set(usados.map((p) => p.toUpperCase()));
  const base = letras.slice(0, 3);
  const candidatos = [base, ...[...letras.slice(3)].map((l) => base.slice(0, 2) + l), ...[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => `${base.slice(0, 3)}${n}`)];
  return candidatos.find((c) => c.length >= 2 && c.length <= 4 && !tomados.has(c)) ?? null;
}

const esObjeto = (x: unknown): x is Record<string, unknown> => typeof x === "object" && x !== null && !Array.isArray(x);
const texto = (x: unknown): string | null => (typeof x === "string" && x.trim() !== "" ? x : null);

const COMPORTAMIENTO_CONOCIDO = (x: unknown): x is ComportamientoClase => typeof x === "string" && x in COMPORTAMIENTOS;
const UNIDAD_CONOCIDA = (x: unknown): x is UnidadInsumo => typeof x === "string" && ["metro", "unidad", "kilo", "cono", "par", "docena"].includes(x);

/** Las filas de `retail.avio_clases` tal como llegan de la base. Lo que no se entiende se descarta: una clase a medias no se ofrece. */
export function leerClasesDeAvio(filas: unknown): ClaseDeAvio[] {
  const lista = Array.isArray(filas) ? filas : [];
  return lista.flatMap((f): ClaseDeAvio[] => {
    if (!esObjeto(f) || !texto(f.id) || !texto(f.nombre) || !texto(f.prefijo)) return [];
    if (!COMPORTAMIENTO_CONOCIDO(f.comportamiento) || !UNIDAD_CONOCIDA(f.unidad_sugerida)) return [];
    return [
      {
        id: f.id as string,
        nombre: f.nombre as string,
        prefijo: f.prefijo as string,
        comportamiento: f.comportamiento,
        unidadSugerida: f.unidad_sugerida,
        pideColor: f.pide_color !== false,
        orden: typeof f.orden === "number" ? f.orden : 100,
        activo: f.activo !== false,
        nota: texto(f.nota),
      },
    ];
  });
}
