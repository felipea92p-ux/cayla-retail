import { claveReferencia, construirCeldas, leerCantidad, leerErrorAlta, tituloReferencia, type CeldaAlta, type ColorAlta } from "./alta-producto";
import type { CampoDeGuia } from "./guia-campos";
import { compararTallas } from "./tallas";

// «Modelo nuevo» dentro de la orden de producción (ADR-0361, segunda parte): las reglas puras. Sin Supabase ni `next/*`, para que las importen la
// página (servidor) y el formulario (cliente), y para que la pantalla pueda DECIR qué falta con las mismas reglas que la base va a aplicar.
//
// La base es la que manda: `abrir_produccion_con_modelo_nuevo` (20261009120000) valida todo otra vez. Acá solo se adelanta, en la pantalla, lo que ya
// se sabe, y se reutiliza lo del alta de producto (`alta-producto.ts`: celdas, cantidades, espejo de nombre y clave) en vez de copiarlo: dos formas de
// armar una matriz talla × color terminan dando dos matrices distintas.

export type TallaDeCategoria = { id: string; valor: string; habitual: boolean };
export type CategoriaDeModelo = {
  id: string;
  nombre: string;
  prefijo: string | null;
  /** Código de la familia (`categorias.familia`): agrupa el selector. */
  familia: string | null;
  tallas: TallaDeCategoria[];
};
/** El color tal como lo entiende el selector del alta (`ElegirColores`): con su familia, tipo y sinónimos para agruparlo y buscarlo. */
export type ColorDeModelo = ColorAlta;
export type FamiliaDeModelo = { codigo: string; nombre: string };
export type VocabularioModeloNuevo = { categorias: CategoriaDeModelo[]; colores: ColorDeModelo[]; familias: FamiliaDeModelo[] };

/** Lo que la persona va escribiendo. `cantidades` va por clave de celda (`claveCelda(tallaId, color)`), como en el alta. */
export type BorradorModelo = {
  nombre: string;
  categoria: CategoriaDeModelo | null;
  tallaIds: string[];
  colorCodigos: string[];
  precio: string;
  esMuestra: boolean;
  cantidades: Record<string, string>;
};

export const BORRADOR_VACIO: BorradorModelo = { nombre: "", categoria: null, tallaIds: [], colorCodigos: [], precio: "", esMuestra: false, cantidades: {} };

type TallaEmbebida = { id: string; valor: string; activo: boolean };
/** Una fila de `categorias` con sus tallas habilitadas embebidas (`categoria_tallas ( habitual, talla:tallas (…) )`). PostgREST puede devolver el embebido
 *  de una relación a-uno como objeto o como lista de uno, según el tipo generado: las dos formas se leen. */
export type FilaCategoria = {
  id: string;
  nombre: string;
  prefijo: string | null;
  familia: string | null;
  categoria_padre_id: string | null;
  categoria_tallas: { habitual: boolean; talla: TallaEmbebida | TallaEmbebida[] | null }[] | null;
};

/** Lo que el formulario necesita para ofrecer tallas, colores y categorías: SOLO las hojas del árbol de categorías (un producto nace en una hoja, no en
 *  «Indumentaria»), solo tallas activas y en el orden canónico, agrupadas por familia. El orden de las categorías es el que se lee en el selector. */
/** Una fila de `colores` como la devuelve la base. */
export type FilaColor = { codigo: string; nombre: string; hex: string | null; familia_color: string | null; tipo: string | null; sinonimos: string[] | null; pantone_tcx: string | null };

export function armarVocabulario(filas: readonly FilaCategoria[], colores: readonly FilaColor[], familias: readonly FamiliaDeModelo[]): VocabularioModeloNuevo {
  const esPadre = new Set(filas.map((f) => f.categoria_padre_id).filter((x): x is string => !!x));
  const nombreDeFamilia = new Map(familias.map((f) => [f.codigo, f.nombre]));
  const categorias: CategoriaDeModelo[] = filas
    .filter((f) => !esPadre.has(f.id))
    .map((f) => {
      const vistas = new Map<string, TallaDeCategoria>();
      for (const ct of f.categoria_tallas ?? []) {
        const t = Array.isArray(ct.talla) ? ct.talla[0] : ct.talla;
        if (t && t.activo && !vistas.has(t.id)) vistas.set(t.id, { id: t.id, valor: t.valor, habitual: ct.habitual });
      }
      return {
        id: f.id,
        nombre: f.nombre,
        prefijo: f.prefijo,
        familia: f.familia,
        tallas: [...vistas.values()].sort((a, b) => compararTallas(a.valor, b.valor)),
      };
    })
    .sort((a, b) => {
      const fa = nombreDeFamilia.get(a.familia ?? "") ?? a.familia ?? "";
      const fb = nombreDeFamilia.get(b.familia ?? "") ?? b.familia ?? "";
      return fa.localeCompare(fb, "es") || a.nombre.localeCompare(b.nombre, "es");
    });
  const coloresListos: ColorDeModelo[] = colores.map((c) => ({
    codigo: c.codigo,
    nombre: c.nombre,
    hex: c.hex,
    familiaColor: c.familia_color ?? "",
    tipo: c.tipo,
    sinonimos: c.sinonimos ?? [],
    pantoneTcx: c.pantone_tcx ?? null,
  }));
  return { categorias, colores: coloresListos, familias: [...familias] };
}

/** Las tallas que la categoría trae marcadas de fábrica (su curva habitual): lo que se preelige al elegirla. */
export function tallasHabituales(categoria: CategoriaDeModelo | null): string[] {
  if (!categoria) return [];
  return ordenarTallas(categoria, categoria.tallas.filter((t) => t.habitual).map((t) => t.id));
}

/** Los ids pedidos que de verdad son de la categoría (una talla de otra categoría no existe acá), en el orden canónico S · M · L. */
export function ordenarTallas(categoria: CategoriaDeModelo | null, ids: readonly string[]): string[] {
  if (!categoria) return [];
  const pedidas = new Set(ids);
  return categoria.tallas
    .filter((t) => pedidas.has(t.id))
    .sort((a, b) => compararTallas(a.valor, b.valor))
    .map((t) => t.id);
}

/** Los colores elegidos, en el orden del vocabulario (no en el orden de los clics): así la matriz se ve igual la próxima vez. */
export function ordenarColoresElegidos(colores: readonly ColorDeModelo[], codigos: readonly string[]): string[] {
  const pedidos = new Set(codigos);
  return colores.filter((c) => pedidos.has(c.codigo)).map((c) => c.codigo);
}

/** Las celdas de la matriz: una por talla × color elegidos. Sin tallas ni colores es UNA sola variante (una correa, un gorro), igual que en el alta. */
export function celdasDelBorrador(b: BorradorModelo, colores: readonly ColorDeModelo[]): CeldaAlta[] {
  return construirCeldas(ordenarTallas(b.categoria, b.tallaIds), ordenarColoresElegidos(colores, b.colorCodigos));
}

/** Lo escrito en una celda: vacío = 0; solo enteros de 0 a 9999; `null` si no es una cantidad. Es la misma lectura que usa el alta. */
export function cantidadDeCelda(b: BorradorModelo, clave: string): number | null {
  return leerCantidad(b.cantidades[clave] ?? "");
}

/** Cuántas prendas lleva la orden y cuántas celdas tienen algo que no es una cantidad. Una celda con texto raro no suma. */
export function resumenCantidades(b: BorradorModelo, celdas: readonly CeldaAlta[]): { total: number; invalidas: number } {
  let total = 0;
  let invalidas = 0;
  for (const celda of celdas) {
    const n = cantidadDeCelda(b, celda.clave);
    if (n === null) invalidas += 1;
    else total += n;
  }
  return { total, invalidas };
}

/** `p_variantes` de la función: solo las celdas con cantidad. Sin talla o sin color va `null` (la base lo lee como «Única» / «Sin color»). */
export function lineasRpc(b: BorradorModelo, celdas: readonly CeldaAlta[]): { talla_id: string | null; color_codigo: string | null; cantidad: number }[] {
  const lineas: { talla_id: string | null; color_codigo: string | null; cantidad: number }[] = [];
  for (const celda of celdas) {
    const n = cantidadDeCelda(b, celda.clave);
    if (n !== null && n > 0) lineas.push({ talla_id: celda.tallaId, color_codigo: celda.color, cantidad: n });
  }
  return lineas;
}

/** El precio escrito: 0 si está vacío, `NaN` si no es un número (la pantalla lo cuenta como falta). */
export function precioDelBorrador(b: BorradorModelo): number {
  const t = b.precio.trim();
  return t === "" ? 0 : Number(t);
}

export type ProblemaModelo = { campo: "nombre" | "categoria" | "tallas" | "precio" | "cantidades"; texto: string };

/** Lo que falta para abrir la orden, en el orden en que la persona lo encuentra en pantalla. Sale de lo que la base rechaza (nombre con al menos una
 *  letra o un número, categoría activa, tallas de la categoría, precio en una producción, cantidades enteras y al menos una celda con prendas), más lo que el
 *  alta de producto también exige (elegir al menos una talla). Lo OPCIONAL de verdad —los colores, el precio de una muestra— no es una falta. */
export function problemasDelModelo(b: BorradorModelo, celdas: readonly CeldaAlta[]): ProblemaModelo[] {
  const p: ProblemaModelo[] = [];
  if (!b.nombre.trim()) p.push({ campo: "nombre", texto: "Escribe el nombre del modelo." });
  else if (claveReferencia(b.nombre) === "") p.push({ campo: "nombre", texto: "El nombre necesita al menos una letra o un número." });

  if (!b.categoria) {
    p.push({ campo: "categoria", texto: "Elige la categoría." });
  } else if (b.categoria.tallas.length === 0) {
    p.push({ campo: "tallas", texto: "Esa categoría no tiene tallas habilitadas: pídele a un líder que las habilite." });
  } else if (ordenarTallas(b.categoria, b.tallaIds).length === 0) {
    p.push({ campo: "tallas", texto: "Elige al menos una talla." });
  }

  const precio = precioDelBorrador(b);
  if (Number.isNaN(precio) || precio < 0) p.push({ campo: "precio", texto: "El precio tiene que ser un número, de 0 para arriba." });
  else if (!b.esMuestra && precio <= 0) p.push({ campo: "precio", texto: "Pon el precio a tienda. Una muestra sí puede ir sin precio." });

  const { total, invalidas } = resumenCantidades(b, celdas);
  if (invalidas > 0) p.push({ campo: "cantidades", texto: "Las cantidades son números enteros, de 0 a 9999." });
  else if (total === 0) p.push({ campo: "cantidades", texto: "Escribe cuántas prendas de cada talla y color." });
  return p;
}

/** El nombre como lo va a guardar la base (`fn_titulo_referencia`): «  short  SASTRE » → «Short Sastre». */
export function nombreDelModelo(b: BorradorModelo): string {
  return tituloReferencia(b.nombre);
}

export type TextosDeOrden = { tela: string; avios: string; maquila: string };

/** Los parámetros de `abrir_produccion_con_modelo_nuevo`. Los NOMBRES son la parte frágil (un `p_` mal escrito falla recién en la base): la prueba
 *  los compara con la firma de la migración y con los tipos generados. */
export function paramsRpcModeloNuevo(o: {
  ubicacionId: string;
  borrador: BorradorModelo;
  celdas: readonly CeldaAlta[];
  costos: TextosDeOrden;
  fechaEntrega: string;
  nota: string;
  confirmoDistinto: boolean;
  token: string;
}) {
  const numero = (t: string) => (t.trim() === "" ? 0 : Number(t));
  return {
    p_ubicacion_id: o.ubicacionId,
    p_referencia: nombreDelModelo(o.borrador),
    p_categoria_id: o.borrador.categoria?.id ?? "",
    p_variantes: lineasRpc(o.borrador, o.celdas),
    p_precio: precioDelBorrador(o.borrador),
    p_costo_tela: numero(o.costos.tela),
    p_costo_avios: numero(o.costos.avios),
    p_costo_maquila: numero(o.costos.maquila),
    p_es_muestra: o.borrador.esMuestra,
    p_fecha_entrega: o.fechaEntrega || undefined,
    p_nota: o.nota.trim() || undefined,
    p_confirmo_distinto: o.confirmoDistinto,
    p_token: o.token,
  };
}

export type ErrorModeloNuevo =
  | { tipo: "nombre_duplicado" | "nombre_casi_igual"; existenteId: string | null; mensaje: string }
  | { tipo: "funcion_ausente" }
  | { tipo: "otro" };

export const TEXTO_FUNCION_AUSENTE =
  "Crear un modelo desde la orden todavía no está activo en la base de datos. Créalo en Productos y vuelve a abrir la orden.";

/** Qué pasó al guardar. Los avisos de nombre repetido son los mismos que ya entiende el alta (`leerErrorAlta`): el `hint` estable y, en `details`, el id del
 *  modelo que ya existe. «La función no existe» es lo que pasa si la web se publica antes que la migración (la base va primero): se dice en una frase. */
export function leerErrorModeloNuevo(error: { message: string; code?: string | null; hint?: string | null; details?: string | null } | null): ErrorModeloNuevo {
  if (!error) return { tipo: "otro" };
  const alta = leerErrorAlta(error);
  if (alta.tipo === "nombre_duplicado" || alta.tipo === "nombre_casi_igual") return alta;
  const sinFuncion = error.code === "PGRST202" || error.code === "42883" || /could not find the function|function .* does not exist/i.test(error.message);
  return sinFuncion ? { tipo: "funcion_ausente" } : { tipo: "otro" };
}

/** Los campos de la guía de foco de «Nueva orden» (ADR-0284): qué está hecho, qué sigue y qué falta. NO agrega reglas: sale de `problemasDelModelo` (lo que la base
 *  rechaza) y la prueba exige que coincidan. Con un modelo que ya existe solo hay dos cosas que decidir: cuál y cuántas. Lo opcional de verdad (el precio de una
 *  muestra, los colores) no figura como falta: un campo es «requerido» si la regla lo exige, o si ya tiene un problema (un precio escrito mal en una muestra). */
export function camposDeGuiaOrden(o: { esNuevo: boolean; hayModelo: boolean; borrador: BorradorModelo; celdas: readonly CeldaAlta[]; totalExistente: number }): CampoDeGuia[] {
  if (!o.esNuevo) {
    return [
      { id: "modelo", nombre: "Modelo", requerido: true, hecho: o.hayModelo, pendiente: "Elige el modelo que se va a producir." },
      { id: "cantidades", nombre: "Cuántas prendas", requerido: true, hecho: o.totalExistente > 0, pendiente: "Escribe cuántas prendas de cada talla y color." },
    ];
  }
  const b = o.borrador;
  const problemas = problemasDelModelo(b, o.celdas);
  const hay = (campo: ProblemaModelo["campo"]) => problemas.some((p) => p.campo === campo);
  const frase = (campo: ProblemaModelo["campo"]) => problemas.find((p) => p.campo === campo)?.texto ?? "";
  const conCategoria = b.categoria !== null;
  const conPrecio = b.precio.trim() !== "";
  return [
    { id: "nombre", nombre: "Nombre", requerido: true, hecho: !hay("nombre"), pendiente: frase("nombre") },
    { id: "categoria", nombre: "Categoría", requerido: true, hecho: !hay("categoria"), pendiente: frase("categoria") },
    { id: "tallas", nombre: "Tallas", requerido: conCategoria || hay("tallas"), hecho: conCategoria && !hay("tallas"), pendiente: frase("tallas") },
    { id: "precio", nombre: "Precio", requerido: !b.esMuestra || hay("precio"), hecho: !hay("precio") && (conPrecio || !b.esMuestra), pendiente: frase("precio") },
    { id: "cantidades", nombre: "Cuántas prendas", requerido: true, hecho: !hay("cantidades"), pendiente: frase("cantidades") },
  ];
}

