/**
 * Qué cambió en la ficha de un producto contra lo que había al abrirla (ADR-0257).
 *
 * EL PROBLEMA. «Editar producto» guarda todo junto, al final, pero el interruptor «Activa» y los precios se ven como acciones
 * que ya ocurrieron: una colaboradora apagaba una talla y se iba creyendo que estaba hecho, o no sabía qué paso seguía. Ahora
 * la pantalla dice «Tienes N cambios sin guardar», marca cada fila tocada y, al guardar, lista lo que va a cambiar. Todo eso
 * sale de esta función; la pantalla no cuenta nada por su cuenta.
 *
 * UNA sola cuenta decide si hay algo que guardar (`resumenDeCambios(...).total > 0`): la barra de cambios aparece con ella y,
 * sin la barra, no hay dónde guardar. Por eso compara TODO lo editable. `FichaEditable` lista cada campo; `CAMPOS_CUBIERTOS`
 * (abajo) hace fallar la compilación si se agrega uno y no se decide cómo se compara, y la prueba exige que tocar cualquiera
 * de ellos cuente. Un campo que se escape de aquí sería un campo que no se puede guardar.
 *
 * Pura (sin React ni supabase): la usa `ProductoForm`, y la prueba de al lado la recorre entera.
 *
 * Las variantes llegan aquí desde la sección de ADR-0263 (corregir color y talla, agregar colores y tallas, precio en
 * bloque): `variantesParaResumen` (lib/variantes-ficha-reglas.ts) las traduce a `VarianteFicha`. Con los ejes de cada una,
 * la hoja dice las correcciones como las dice la tienda («3 variantes pasan de Sin color a Negro») y junta en UNA línea
 * los precios que cambiaron igual (un precio en bloque sobre 12 variantes no son 12 renglones).
 */

import { SIN_PROPIA } from "./temporada-reglas";
import { NACEN_SIN_UNIDADES } from "./variantes-ficha-reglas";

/* ====================== lo que se compara ====================== */

export type FotoFicha = { id: string | null; url: string; esPrincipal: boolean; colorCodigo: string | null };

/** Un eje de la identidad de una variante: `clave` se compara (el código del color, el id de la talla; "" = sin), `texto`
 *  se dice («Negro», «S»). */
export type EjeIdentidad = { clave: string; texto: string };

export type VarianteFicha = {
  /** `null` = fila nueva, todavía sin guardar. */
  id: string | null;
  /** Cómo la nombra la pantalla: «Beige XS». Una fila nueva sin color ni talla es «Variante nueva». */
  nombre: string;
  activo: boolean;
  precio: string;
  /** El costo que se GUARDARÍA, no el que está escrito: una variante existente con el campo vacío conserva el suyo. */
  costo: string;
  etiquetaIds: string[];
  /** Color y talla (ADR-0263: se corrigen aunque la variante tenga historia; si ya se vendió, solo un líder). `clave` es lo
   *  que se compara (los códigos), `texto` lo que se dice («Beige XS»). Con `ejes`, la hoja sabe CUÁL de los dos cambió
   *  y agrupa las correcciones iguales. */
  identidad: { clave: string; texto: string; ejes?: { color: EjeIdentidad; talla: EjeIdentidad } };
  /** Sus unidades en stock (todas las sedes), si se saben: al desactivarla, la hoja dice que siguen en el inventario. */
  unidades?: number | null;
};

export type FichaEditable = {
  referencia: string;
  categoriaId: string;
  descripcion: string;
  estado: string;
  stockMinimo: string;
  temporada: string;
  permitirVentaSinStock: boolean;
  tejidoId: string;
  patronId: string;
  marcaId: string;
  proveedorId: string;
  /** color → clave de su temporada propia; un color sin entrada sigue a su prenda. */
  temporadaColor: Record<string, string>;
  fotos: FotoFicha[];
  variantes: VarianteFicha[];
};

/**
 * Cada campo de `FichaEditable` tiene que aparecer aquí. Agregar uno al tipo sin agregarlo a esta lista no compila: es el
 * recordatorio de que hay que decidir cómo se compara (y cómo se cuenta) antes de que la pantalla lo deje editar.
 */
export const CAMPOS_CUBIERTOS: Record<keyof FichaEditable, true> = {
  referencia: true,
  categoriaId: true,
  descripcion: true,
  estado: true,
  stockMinimo: true,
  temporada: true,
  permitirVentaSinStock: true,
  tejidoId: true,
  patronId: true,
  marcaId: true,
  proveedorId: true,
  temporadaColor: true,
  fotos: true,
  variantes: true,
};

/** Cómo se llama cada cosa que la ficha guarda por id o por clave. */
export type NombresFicha = {
  categoria: (id: string) => string;
  tejido: (id: string) => string;
  patron: (id: string) => string;
  marca: (id: string) => string;
  proveedor: (id: string) => string;
  /** La temporada de la PRENDA («Verano», o «Igual que su categoría (Verano)» si no tiene propia). */
  temporada: (clave: string) => string;
  /** La temporada de un COLOR («Invierno», o «Igual que su prenda»). */
  temporadaColor: (clave: string) => string;
  color: (codigo: string) => string;
  etiqueta: (id: string) => string;
};

/* ====================== lo que se dice ====================== */

export type CampoDato =
  | "referencia"
  | "categoria"
  | "marcaProveedor"
  | "descripcion"
  | "tejido"
  | "patron"
  | "estado"
  | "stockMinimo"
  | "temporada"
  | "ventaSinStock";

/** Un eje que cambió en una corrección: de qué a qué, en palabras. */
export type EjeCorregido = { antes: string; despues: string };

export type Cambio =
  /** `unidades`: las que tiene en stock, si se saben y son más de 0 (siguen en el inventario: desactivar no las saca). */
  | { tipo: "desactiva"; indice: number; nombre: string; unidades?: number }
  | { tipo: "activa"; indice: number; nombre: string }
  | { tipo: "nueva"; indice: number; nombre: string; precio: string }
  /** Con los ejes de la variante: `color` y/o `talla` = el eje que cambió; `queda` = el que NO cambió, en palabras («S»). */
  | { tipo: "identidad"; indice: number; nombre: string; antes: string; despues: string; color?: EjeCorregido; talla?: EjeCorregido; queda?: string }
  | { tipo: "precio"; indice: number; nombre: string; antes: string; despues: string }
  | { tipo: "costo"; indice: number; nombre: string; antes: string; despues: string }
  | { tipo: "etiquetas"; indice: number; nombre: string; suman: string[]; quitan: string[] }
  | { tipo: "fotos_suman"; cantidad: number }
  | { tipo: "fotos_quitan"; cantidad: number }
  | { tipo: "foto_principal" }
  | { tipo: "fotos_color"; cantidad: number }
  | { tipo: "fotos_orden" }
  | { tipo: "dato"; campo: CampoDato; etiqueta: string; antes: string; despues: string }
  | { tipo: "temporada_color"; color: string; antes: string; despues: string };

export type ResumenCambios = {
  /** Cuántas cosas cambiaron. Es lo que dice la barra y lo que decide si hay algo que guardar. */
  total: number;
  cambios: Cambio[];
  /** En presente, para la barra y la hoja: «1 variante se desactiva», «2 precios cambian». */
  frases: string[];
  /** En pasado, para el aviso de éxito: «1 variante desactivada», «2 precios cambiados». */
  frasesPasado: string[];
};

export const SIN_CAMBIOS: ResumenCambios = { total: 0, cambios: [], frases: [], frasesPasado: [] };

/* ====================== comparar ====================== */

/** Un número escrito de dos maneras es el mismo número: «90», «90.0» y «90.00» no son un cambio. Un campo vacío nunca es cero. */
function mismoNumero(a: string, b: string): boolean {
  const x = a.trim();
  const y = b.trim();
  if (x === y) return true;
  if (x === "" || y === "") return false;
  return Number(x) === Number(y);
}

const numeroONada = (v: string): string => {
  const t = v.trim();
  return t !== "" && Number.isFinite(Number(t)) ? String(Number(t)) : t;
};

type DatoDeFicha = {
  campo: CampoDato;
  etiqueta: string;
  /** Lo que se compara. */
  valor: (f: FichaEditable) => string;
  /** Lo que se le dice a la persona. */
  texto: (f: FichaEditable, n: NombresFicha) => string;
};

const DATOS: readonly DatoDeFicha[] = [
  { campo: "referencia", etiqueta: "Nombre", valor: (f) => f.referencia.trim(), texto: (f) => f.referencia.trim() || "(vacío)" },
  {
    campo: "categoria",
    etiqueta: "Categoría",
    valor: (f) => f.categoriaId,
    texto: (f, n) => (f.categoriaId ? n.categoria(f.categoriaId) : "(sin categoría)"),
  },
  {
    campo: "marcaProveedor",
    etiqueta: "Marca y proveedor",
    valor: (f) => `${f.marcaId}|${f.proveedorId}`,
    // Cada uno puede faltar (ADR-0283): se dice cuál, no un «(sin elegir)» que no aclara qué falta.
    texto: (f, n) =>
      f.marcaId || f.proveedorId
        ? `${f.marcaId ? n.marca(f.marcaId) : "sin marca"} · ${f.proveedorId ? n.proveedor(f.proveedorId) : "sin proveedor"}`
        : "(sin marca ni proveedor)",
  },
  {
    campo: "descripcion",
    etiqueta: "Descripción",
    valor: (f) => f.descripcion.trim(),
    texto: (f) => (f.descripcion.trim() ? `«${f.descripcion.trim()}»` : "(sin descripción)"),
  },
  { campo: "tejido", etiqueta: "Tejido", valor: (f) => f.tejidoId, texto: (f, n) => (f.tejidoId ? n.tejido(f.tejidoId) : "ninguno") },
  { campo: "patron", etiqueta: "Patrón", valor: (f) => f.patronId, texto: (f, n) => (f.patronId ? n.patron(f.patronId) : "ninguno") },
  { campo: "estado", etiqueta: "Estado", valor: (f) => f.estado, texto: (f) => (f.estado === "activo" ? "Activo" : "Descontinuado") },
  { campo: "stockMinimo", etiqueta: "Stock mínimo", valor: (f) => numeroONada(f.stockMinimo), texto: (f) => f.stockMinimo.trim() || "sin definir" },
  { campo: "temporada", etiqueta: "Temporada", valor: (f) => f.temporada, texto: (f, n) => n.temporada(f.temporada) },
  {
    campo: "ventaSinStock",
    etiqueta: "Venta sin stock",
    valor: (f) => String(f.permitirVentaSinStock),
    texto: (f) => (f.permitirVentaSinStock ? "sí" : "no"),
  },
];

/** Qué eje cambió en una corrección (y cómo se llama el que no), si la pantalla mandó los ejes de las dos. */
function ejesCorregidos(antes: VarianteFicha, ahora: VarianteFicha): { color?: EjeCorregido; talla?: EjeCorregido; queda?: string } {
  const a = antes.identidad.ejes;
  const b = ahora.identidad.ejes;
  if (!a || !b) return {};
  const cambiaColor = a.color.clave !== b.color.clave;
  const cambiaTalla = a.talla.clave !== b.talla.clave;
  return {
    ...(cambiaColor ? { color: { antes: a.color.texto, despues: b.color.texto } } : {}),
    ...(cambiaTalla ? { talla: { antes: a.talla.texto, despues: b.talla.texto } } : {}),
    ...(cambiaColor !== cambiaTalla ? { queda: cambiaColor ? b.talla.texto : b.color.texto } : {}),
  };
}

function cambiosDeVariantes(inicial: readonly VarianteFicha[], actual: readonly VarianteFicha[], nombres: NombresFicha): Cambio[] {
  const cambios: Cambio[] = [];
  const alAbrir = new Map<string, VarianteFicha>();
  for (const v of inicial) if (v.id !== null) alAbrir.set(v.id, v);

  actual.forEach((v, indice) => {
    const antes = v.id === null ? undefined : alAbrir.get(v.id);
    // Una fila que no existía al abrir (o que todavía no tiene id) se agrega: es UN cambio, con lo que trae escrito.
    if (!antes) {
      cambios.push({ tipo: "nueva", indice, nombre: v.nombre, precio: v.precio });
      return;
    }
    if (v.identidad.clave !== antes.identidad.clave) {
      cambios.push({ tipo: "identidad", indice, nombre: v.nombre, antes: antes.identidad.texto, despues: v.identidad.texto, ...ejesCorregidos(antes, v) });
    }
    if (v.activo && !antes.activo) cambios.push({ tipo: "activa", indice, nombre: v.nombre });
    if (!v.activo && antes.activo) {
      cambios.push({ tipo: "desactiva", indice, nombre: v.nombre, ...(v.unidades && v.unidades > 0 ? { unidades: v.unidades } : {}) });
    }
    if (!mismoNumero(v.precio, antes.precio)) cambios.push({ tipo: "precio", indice, nombre: v.nombre, antes: antes.precio, despues: v.precio });
    if (!mismoNumero(v.costo, antes.costo)) cambios.push({ tipo: "costo", indice, nombre: v.nombre, antes: antes.costo, despues: v.costo });
    const suman = v.etiquetaIds.filter((id) => !antes.etiquetaIds.includes(id));
    const quitan = antes.etiquetaIds.filter((id) => !v.etiquetaIds.includes(id));
    if (suman.length > 0 || quitan.length > 0) {
      cambios.push({ tipo: "etiquetas", indice, nombre: v.nombre, suman: suman.map(nombres.etiqueta), quitan: quitan.map(nombres.etiqueta) });
    }
  });
  return cambios;
}

function cambiosDeFotos(inicial: readonly FotoFicha[], actual: readonly FotoFicha[]): Cambio[] {
  // Una foto ya guardada se reconoce por su id; una recién subida, todavía sin fila, por su dirección.
  const clave = (f: FotoFicha) => f.id ?? f.url;
  const alAbrir = new Map(inicial.map((f) => [clave(f), f]));
  const ahora = new Set(actual.map(clave));
  const cambios: Cambio[] = [];

  const suman = actual.filter((f) => !alAbrir.has(clave(f))).length;
  const quitan = inicial.filter((f) => !ahora.has(clave(f))).length;
  if (suman > 0) cambios.push({ tipo: "fotos_suman", cantidad: suman });
  if (quitan > 0) cambios.push({ tipo: "fotos_quitan", cantidad: quitan });

  const principal = (fotos: readonly FotoFicha[]) => {
    const p = fotos.find((f) => f.esPrincipal);
    return p ? clave(p) : null;
  };
  if (principal(inicial) !== principal(actual)) cambios.push({ tipo: "foto_principal" });

  const enComun = actual.filter((f) => alAbrir.has(clave(f)));
  const conOtroColor = enComun.filter((f) => (alAbrir.get(clave(f))?.colorCodigo ?? null) !== (f.colorCodigo ?? null)).length;
  if (conOtroColor > 0) cambios.push({ tipo: "fotos_color", cantidad: conOtroColor });

  const ordenAntes = inicial.filter((f) => ahora.has(clave(f))).map(clave);
  const ordenAhora = enComun.map(clave);
  if (ordenAntes.join("\n") !== ordenAhora.join("\n")) cambios.push({ tipo: "fotos_orden" });
  return cambios;
}

function cambiosDeTemporadaPorColor(inicial: Readonly<Record<string, string>>, actual: Readonly<Record<string, string>>, nombres: NombresFicha): Cambio[] {
  const colores = Array.from(new Set([...Object.keys(inicial), ...Object.keys(actual)])).sort();
  const cambios: Cambio[] = [];
  for (const c of colores) {
    const antes = inicial[c] ?? SIN_PROPIA;
    const despues = actual[c] ?? SIN_PROPIA;
    if (antes !== despues) cambios.push({ tipo: "temporada_color", color: nombres.color(c), antes: nombres.temporadaColor(antes), despues: nombres.temporadaColor(despues) });
  }
  return cambios;
}

/** Lo que cambió entre lo que había al abrir la ficha (`inicial`) y lo que hay ahora en pantalla (`actual`). */
export function resumenDeCambios(inicial: FichaEditable, actual: FichaEditable, nombres: NombresFicha): ResumenCambios {
  const cambios: Cambio[] = [
    ...cambiosDeVariantes(inicial.variantes, actual.variantes, nombres),
    ...cambiosDeFotos(inicial.fotos, actual.fotos),
  ];
  for (const d of DATOS) {
    if (d.valor(inicial) !== d.valor(actual)) {
      cambios.push({ tipo: "dato", campo: d.campo, etiqueta: d.etiqueta, antes: d.texto(inicial, nombres), despues: d.texto(actual, nombres) });
    }
  }
  cambios.push(...cambiosDeTemporadaPorColor(inicial.temporadaColor, actual.temporadaColor, nombres));
  if (cambios.length === 0) return SIN_CAMBIOS;
  return { total: cambios.length, cambios, frases: frasesDe(cambios, false), frasesPasado: frasesDe(cambios, true) };
}

/* ====================== frases ====================== */

const plural = (n: number, uno: string, varios: string) => `${n} ${n === 1 ? uno : varios}`;

function frasesDe(cambios: readonly Cambio[], pasado: boolean): string[] {
  const de = (tipo: Cambio["tipo"]) => cambios.filter((c) => c.tipo === tipo).length;
  const fotos = cambios.filter((c) => c.tipo.startsWith("foto")).length;
  const filas: [number, string, string, string, string][] = [
    [de("desactiva"), "variante se desactiva", "variantes se desactivan", "variante desactivada", "variantes desactivadas"],
    [de("activa"), "variante se activa", "variantes se activan", "variante activada", "variantes activadas"],
    [de("nueva"), "variante se agrega", "variantes se agregan", "variante agregada", "variantes agregadas"],
    [de("identidad"), "variante cambia de color o talla", "variantes cambian de color o talla", "variante corregida de color o talla", "variantes corregidas de color o talla"],
    [de("precio"), "precio cambia", "precios cambian", "precio cambiado", "precios cambiados"],
    [de("costo"), "costo cambia", "costos cambian", "costo cambiado", "costos cambiados"],
    [de("etiquetas"), "variante cambia sus etiquetas", "variantes cambian sus etiquetas", "variante con etiquetas nuevas", "variantes con etiquetas nuevas"],
    [de("dato"), "dato de la prenda cambia", "datos de la prenda cambian", "dato de la prenda cambiado", "datos de la prenda cambiados"],
    [de("temporada_color"), "temporada por color cambia", "temporadas por color cambian", "temporada por color cambiada", "temporadas por color cambiadas"],
  ];
  const frases: string[] = [];
  for (const [n, presenteUno, presenteVarios, pasadoUno, pasadoVarios] of filas) {
    if (n > 0) frases.push(pasado ? plural(n, pasadoUno, pasadoVarios) : plural(n, presenteUno, presenteVarios));
  }
  // Las fotos van en una sola frase: «2 fotos suben y 1 se quita» pesa más que la cuenta de cada gesto.
  if (fotos > 0) frases.push(pasado ? "fotos actualizadas" : "las fotos cambian");
  return frases;
}

function soles(valor: string, vacio: string): string {
  const t = valor.trim();
  if (t === "") return vacio;
  const n = Number(t);
  if (!Number.isFinite(n)) return t;
  return `S/ ${Number.isInteger(n) ? n : n.toFixed(2)}`;
}

/** «S/ 90», «S/ 90.50», o «sin precio» si el campo está vacío. */
export const formatoPrecio = (valor: string): string => soles(valor, "sin precio");

/** Lo mismo para el costo: «S/ 60», o «sin costo» si nunca se declaró. */
export const formatoCosto = (valor: string): string => soles(valor, "sin costo");

/* ====================== para la hoja «Revisa y guarda los cambios» ====================== */

export type ClaveGrupo = "desactivan" | "activan" | "agregan" | "identidad" | "precios" | "costos" | "etiquetas" | "fotos" | "datos" | "temporadaColor";

export type LineaCambio = { texto: string; antes?: string; despues?: string; detalle?: string };
/** `cantidad`: cuántos cambios hay en el grupo (lo que dice su insignia). Puede ser más que las líneas: los cambios iguales
 *  se juntan en una («3 variantes pasan de Sin color a Negro»). `nota`: lo que conviene saber antes de confirmar. */
export type GrupoCambios = { clave: ClaveGrupo; titulo: string; lineas: LineaCambio[]; cantidad: number; nota?: string };

const TITULO_GRUPO: Record<ClaveGrupo, string> = {
  desactivan: "Se desactivan",
  activan: "Se activan",
  agregan: "Se agregan",
  identidad: "Color o talla corregidos",
  precios: "Precios",
  costos: "Costos",
  etiquetas: "Etiquetas",
  fotos: "Fotos",
  datos: "Datos de la prenda",
  temporadaColor: "Temporada por color",
};

/** Lo que conviene saber antes de confirmar, dicho una vez por grupo (no en cada línea). «Etiquetas de precio», no
 *  «etiquetas» a secas: el modal de corregir dice que conservan sus etiquetas DE CAMPAÑA («Nuevo»), y leídas seguidas
 *  parecían contradecirse. */
export const NOTA_CORREGIDAS =
  "Conservan su stock y su historia. Su código se recalcula y el de antes sigue sonando en la caja: reimprime sus etiquetas de precio.";
export const NOTA_DESACTIVADAS_CON_STOCK = "Desactivar no saca sus unidades del inventario: solo dejan de venderse.";

/** «Negro S, Negro M, Negro L y 3 más». */
function listaCorta(nombres: readonly string[]): string {
  return nombres.length <= 4 ? nombres.join(", ") : `${nombres.slice(0, 3).join(", ")} y ${nombres.length - 3} más`;
}

/** «Negro S» si es una; «3 variantes: Negro S, Negro M, Negro L» si son varias. */
const variantesNombradas = (nombres: readonly string[]) => (nombres.length === 1 ? nombres[0] : `${nombres.length} variantes: ${listaCorta(nombres)}`);

function lineaDeFotos(c: Cambio): LineaCambio | null {
  switch (c.tipo) {
    case "fotos_suman":
      return { texto: c.cantidad === 1 ? "Se suma 1 foto" : `Se suman ${c.cantidad} fotos` };
    case "fotos_quitan":
      return { texto: c.cantidad === 1 ? "Se quita 1 foto" : `Se quitan ${c.cantidad} fotos` };
    case "foto_principal":
      return { texto: "Cambia la foto principal" };
    case "fotos_color":
      return { texto: c.cantidad === 1 ? "Cambia el color de 1 foto" : `Cambia el color de ${c.cantidad} fotos` };
    case "fotos_orden":
      return { texto: "Cambia el orden de las fotos" };
    default:
      return null;
  }
}

/**
 * Los cambios ordenados por grupo, listos para pintar. Los grupos vacíos no salen.
 *
 * Lo que cambió IGUAL se junta en una línea, en el lugar donde apareció el primero: las correcciones del mismo color (o de la
 * misma talla) —«3 variantes pasan de Sin color a Negro», con sus tallas al lado—, los precios y costos que pasan del mismo
 * monto al mismo monto (un precio en bloque) y las variantes nuevas con el mismo precio (un «Agregar color»).
 */
export function agruparCambios(cambios: readonly Cambio[]): GrupoCambios[] {
  // Cada grupo es una lista de lugares: una línea ya hecha, o la llave de una línea que junta varios cambios.
  const grupos = new Map<ClaveGrupo, (LineaCambio | string)[]>();
  const cantidades = new Map<ClaveGrupo, number>();
  const juntas = new Map<string, { nombres: string[]; hacer: (nombres: readonly string[]) => LineaCambio }>();
  const contar = (clave: ClaveGrupo) => cantidades.set(clave, (cantidades.get(clave) ?? 0) + 1);
  const sumar = (clave: ClaveGrupo, linea: LineaCambio | string) => grupos.set(clave, [...(grupos.get(clave) ?? []), linea]);
  const juntar = (clave: ClaveGrupo, llave: string, nombre: string, hacer: (nombres: readonly string[]) => LineaCambio) => {
    const k = `${clave}\n${llave}`;
    const previa = juntas.get(k);
    if (previa) return void previa.nombres.push(nombre);
    juntas.set(k, { nombres: [nombre], hacer });
    sumar(clave, k);
  };
  let desactivadasConStock = false;

  for (const c of cambios) {
    switch (c.tipo) {
      case "desactiva":
        contar("desactivan");
        if (c.unidades) desactivadasConStock = true;
        sumar("desactivan", { texto: c.nombre, ...(c.unidades ? { detalle: `${c.unidades} u. en stock` } : {}) });
        break;
      case "activa":
        contar("activan");
        sumar("activan", { texto: c.nombre });
        break;
      case "nueva": {
        contar("agregan");
        const precio = formatoPrecio(c.precio);
        juntar("agregan", precio, c.nombre, (nombres) => ({ texto: variantesNombradas(nombres), detalle: precio }));
        break;
      }
      case "identidad": {
        contar("identidad");
        const { color, talla } = c;
        // Los ejes que no cambiaron se dicen al lado (las tallas de un color corregido); sin talla o sin color, nada.
        const detalle = (quedan: readonly string[]) => {
          const vistos = [...new Set(quedan.filter((q) => q && q !== "sin talla" && q !== "Sin color"))];
          return vistos.length > 0 ? { detalle: vistos.join(", ") } : {};
        };
        if (color && !talla) {
          juntar("identidad", `color\n${color.antes}\n${color.despues}`, c.queda ?? "", (quedan) => ({
            texto: `${plural(quedan.length, "variante pasa", "variantes pasan")} de ${color.antes} a ${color.despues}`,
            ...detalle(quedan),
          }));
        } else if (talla && !color) {
          juntar("identidad", `talla\n${talla.antes}\n${talla.despues}`, c.queda ?? "", (quedan) => ({
            texto: `${plural(quedan.length, "variante pasa", "variantes pasan")} de talla ${talla.antes} a ${talla.despues}`,
            ...detalle(quedan),
          }));
        } else if (color && talla) {
          sumar("identidad", { texto: `${c.antes} pasa a ser ${c.despues}` });
        } else {
          // Sin los ejes (quien llama no los mandó): la variante, de qué a qué.
          sumar("identidad", { texto: c.nombre, antes: c.antes, despues: c.despues });
        }
        break;
      }
      case "precio": {
        contar("precios");
        const [antes, despues] = [formatoPrecio(c.antes), formatoPrecio(c.despues)];
        juntar("precios", `${antes}\n${despues}`, c.nombre, (nombres) => ({ texto: variantesNombradas(nombres), antes, despues }));
        break;
      }
      case "costo": {
        contar("costos");
        const [antes, despues] = [formatoCosto(c.antes), formatoCosto(c.despues)];
        juntar("costos", `${antes}\n${despues}`, c.nombre, (nombres) => ({ texto: variantesNombradas(nombres), antes, despues }));
        break;
      }
      case "etiquetas":
        contar("etiquetas");
        sumar("etiquetas", {
          texto: c.nombre,
          detalle: [...c.suman.map((e) => `+ ${e}`), ...c.quitan.map((e) => `− ${e}`)].join("  "),
        });
        break;
      case "dato":
        contar("datos");
        sumar("datos", { texto: c.etiqueta, antes: c.antes, despues: c.despues });
        break;
      case "temporada_color":
        contar("temporadaColor");
        sumar("temporadaColor", { texto: c.color, antes: c.antes, despues: c.despues });
        break;
      default: {
        const linea = lineaDeFotos(c);
        if (linea) {
          contar("fotos");
          sumar("fotos", linea);
        }
      }
    }
  }

  const notas: Partial<Record<ClaveGrupo, string>> = {
    identidad: NOTA_CORREGIDAS,
    agregan: NACEN_SIN_UNIDADES,
    ...(desactivadasConStock ? { desactivan: NOTA_DESACTIVADAS_CON_STOCK } : {}),
  };
  return (Object.keys(TITULO_GRUPO) as ClaveGrupo[]).flatMap((clave) => {
    const lugares = grupos.get(clave);
    if (!lugares) return [];
    const lineas = lugares.map((l) => {
      if (typeof l !== "string") return l;
      const junta = juntas.get(l)!;
      return junta.hacer(junta.nombres);
    });
    const nota = notas[clave];
    return [{ clave, titulo: TITULO_GRUPO[clave], lineas, cantidad: cantidades.get(clave) ?? lineas.length, ...(nota ? { nota } : {}) }];
  });
}

/* ====================== para «¿Salir sin guardar?» ====================== */

/** Lo que dice el aviso de salida de la ficha (el de Compras y Recibir, `useSalidaSinGuardar`): cuántos cambios se pierden y de qué prenda. */
export function textoDeSalidaDeFicha(cantidad: number, nombre: string): string {
  const cuantos = cantidad === 1 ? "1 cambio sin guardar" : `${cantidad} cambios sin guardar`;
  return `Tienes ${cuantos} en «${nombre}». Si sales ahora, se pierden.`;
}

/* ====================== para las filas de la ficha ====================== */

/** Los cambios que le tocan a UNA variante de la tabla (por su posición en la lista de la pantalla). */
export function cambiosDeVariante(resumen: ResumenCambios, indice: number): Cambio[] {
  return resumen.cambios.filter((c) => "indice" in c && c.indice === indice);
}

/** Lo que dice la fila tocada, a la derecha: «Se desactiva al guardar · Precio: antes S/ 90». Vacío si no cambió nada. */
export function textoPendienteDeVariante(cambios: readonly Cambio[]): string {
  const partes: string[] = [];
  for (const c of cambios) {
    if (c.tipo === "desactiva") partes.push("Se desactiva al guardar");
    else if (c.tipo === "activa") partes.push("Se activa al guardar");
    else if (c.tipo === "nueva") partes.push("Se agrega al guardar");
    else if (c.tipo === "identidad") partes.push(`Color y talla: antes ${c.antes}`);
    else if (c.tipo === "precio") partes.push(`Precio: antes ${formatoPrecio(c.antes)}`);
    else if (c.tipo === "costo") partes.push(`Costo: antes ${formatoCosto(c.antes)}`);
    else if (c.tipo === "etiquetas") partes.push("Etiquetas cambian");
  }
  return partes.join(" · ");
}

/** El cambio de un dato de la prenda (nombre, stock mínimo…), si lo hay: para la línea «antes: …» bajo su campo. */
export function cambioDeDato(resumen: ResumenCambios, campo: CampoDato): Extract<Cambio, { tipo: "dato" }> | null {
  const c = resumen.cambios.find((x): x is Extract<Cambio, { tipo: "dato" }> => x.tipo === "dato" && x.campo === campo);
  return c ?? null;
}
