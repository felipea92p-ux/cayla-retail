// Análisis v4 (ADR-0356): el contrato entre lo que lee el servidor y lo que dibuja cada pestaña. Una sola forma de «prenda»
// para las cuatro preguntas (Hoy · Se está acabando · No se vende · Qué pedir) y para su ficha: así una prenda dice lo mismo
// en la lista de Hoy, en su carril y en su hoja. Solo tipos: las reglas viven en `analisis-reglas.ts` y la lectura en
// `analisis-datos.ts`.
//
// «Prenda» aquí es UNA TALLA de un color de un modelo (una variante): «Camisa Oxford · Celeste · S». Es la pieza que se acaba,
// que se queda quieta y que se pide. El modelo entero (todas sus tallas y colores) se arma en la ficha con `productoId`.

import type { DiaVenta, PreparacionSede } from "./motor-demanda-reglas";

/** Las cuatro pestañas, en el orden de la pantalla. */
export const VISTAS_ANALISIS = ["hoy", "acaba", "nose", "pedir"] as const;
export type VistaAnalisis = (typeof VISTAS_ANALISIS)[number];

/** De dónde sale una prenda cuando se repone: el Taller de CAYLA o un proveedor de afuera («Proveedor taller / terceros»). */
export type OrigenPrenda = "taller" | "terceros";

/** Una tienda de la red, como la nombra Análisis: el código corto («AQP») va en las píldoras; la ciudad, en los botones. */
export type SedeAnalisis = {
  id: string;
  /** El código de la tienda (`ubicaciones.codigo`): «TRU», «AQP», «LIM». */
  codigo: string;
  /** El nombre del sistema: «Tienda AQP». */
  nombre: string;
  /** La ciudad para hablar en tienda: «Arequipa» («o pedir a Arequipa»). Si no se conoce, el nombre. */
  ciudad: string;
};

/** Lo que una prenda tiene y vendió en OTRA tienda (las tres se ven igual para la encargada y el líder: decisión 8). */
export type PrendaEnOtraSede = {
  sedeId: string;
  /** Libre en esa tienda (piso + almacén, sin apartadas ni Cuarentena). */
  stock: number;
  /** Vendidas con su prenda en los últimos 30 días, en esa tienda. */
  vendidas30: number;
};

/** De dónde llega lo que viene en camino a MI tienda. */
export type OrigenLlegada = "compra" | "almacen" | "taller" | "tienda";

/** Una parte de lo que viene en camino: «Compra 10 · llega el 15 oct». */
export type LlegadaPrenda = {
  de: OrigenLlegada;
  cantidad: number;
  /** Cuándo se espera (YYYY-MM-DD), o null si nadie la anotó. */
  fecha: string | null;
};

/** Una prenda (variante) vista desde MI tienda, con lo que se sabe de ella en la red. */
export type PrendaAnalisis = {
  varianteId: string;
  productoId: string;
  /** El nombre del modelo: «Camisa Oxford». */
  nombre: string;
  /** El color: «Celeste». */
  color: string;
  /** `colores.hex`, o null si el color no es uno (estampado, multicolor). */
  colorHex: string | null;
  /** La talla como se lee en tienda: «S», «28», «Estándar», «Única». */
  talla: string;
  /** La categoría (`categorias.nombre`), su prefijo y su familia: para el ícono de la prenda sin foto y para agrupar. */
  categoria: string | null;
  categoriaPrefijo: string | null;
  categoriaFamilia: string | null;
  fotoUrl: string | null;
  /** Precio de venta vigente y costo de cada una (null si no se sabe). La encargada y el líder ven lo mismo (ADR-0328 enmendado). */
  precio: number | null;
  costo: number | null;
  /** De dónde se repone: el Taller o un proveedor; null si no se sabe. */
  origen: OrigenPrenda | null;
  /** El proveedor con el que se compró la última vez (para abrir Compras con él), si es de terceros. */
  proveedorId: string | null;

  /** En MI tienda: lo libre colgado y lo libre guardado (sin apartadas ni Cuarentena). */
  piso: number;
  almacen: number;
  /** Vendidas con su prenda en mis últimos 30 días. */
  vendidas30: number;
  /** Vendidas por semana en mi tienda: 8 semanas, de la más vieja a la actual (la última puede estar a medias). */
  semanas: number[];
  /** Días desde la última venta en mi tienda o, si nunca se vendió aquí, desde que llegó. null si no hay de dónde contarlos. */
  diasSinVender: number | null;
  /** Unidades que llegaron a mi tienda en los últimos 30 días, y cuántas de ellas ya se vendieron («se vende lo que llega»). */
  llegaron30: number;
  vendidasDeLasQueLlegaron30: number;

  /** Las otras tiendas, una fila por tienda activa (aunque no tenga nada: «Lima 0»). */
  otras: PrendaEnOtraSede[];
  /** Lo que viene en camino a mi tienda, sume de donde sume. Vacío si no viene nada. */
  llega: LlegadaPrenda[];
};

/**
 * Una prenda vista desde UNA tienda (la fila que devuelve la base por tienda): lo mismo que `PrendaAnalisis` sin lo que se arma
 * cruzando tiendas. Con las filas de las tres tiendas, `analisis-datos.ts` arma las prendas de la mía (sus `otras` y su `llega`).
 */
export type PrendaSede = Omit<PrendaAnalisis, "otras" | "llega">;

/** Cuántas prendas de MI tienda cayeron en cada tramo de días sin venderse (unidades, no modelos). */
export type EdadInventario = { hasta30: number; de31a60: number; de61a90: number; masDe90: number };

/** Lo que se dice de cada tienda en «Por tienda» (Hoy) y en «Por tienda» (No se vende). */
export type ResumenSedeAnalisis = {
  sedeId: string;
  /** Prendas que se están acabando (grupo «Cómpralas»). */
  seAcaban: number;
  /** Prendas quietas desde el umbral de liquidar (grupos «Mándalas» y «Liquidar»). */
  noSeMueven: number;
  /** De cada 10 prendas que llegaron en 30 días, cuántas se vendieron; null si no llegó nada. */
  vendioDe10: number | null;
  edad: EdadInventario;
  /** Unidades libres en la tienda. */
  unidades: number;
  /** Si esa tienda ya puede recibir recomendaciones (ADR-0346). */
  puedeHablar: boolean;
};

/** Qué pantallas ve la cuenta (ADR-0161): un botón que lleva a «Sin acceso» no se muestra (ADR-0245). */
export type AccesoAnalisis = {
  /** Existencias ▸ Reponer a piso (bajar). */
  existencias: boolean;
  traslados: boolean;
  /** «Pedir a otra tienda»: lo acepta la base con Traslados o con Análisis. */
  pedir: boolean;
  /** Compras con su dinero a la vista (Nueva compra). */
  compras: boolean;
  produccion: boolean;
  etiquetas: boolean;
  movimientos: boolean;
  /** Inventario ▸ Por regularizar (ventas sin su prenda). */
  regularizar: boolean;
  /** Inventario ▸ Cuadrar el piso. */
  cuadrar: boolean;
  /** Inventario ▸ Conteo. */
  conteo: boolean;
  /** Inventario ▸ Frescura del piso. */
  frescura: boolean;
};

/** La lectura del motor (ADR-0346) de una tienda, con sus días para dibujar «Ventas con su prenda, día a día». */
export type PreparacionAnalisis = PreparacionSede & { dias: DiaVenta[]; hoy: string };

/** Todo lo que la pantalla necesita, leído una vez por el servidor. */
export type DatosAnalisis = {
  /** Hoy en Lima (YYYY-MM-DD). */
  hoy: string;
  /** Mi tienda (la del selector de sede). */
  sede: SedeAnalisis;
  /** Las tiendas activas de la red, la mía primero. */
  sedes: SedeAnalisis[];
  /** El motor en cada tienda; la mía decide si Análisis recomienda o dice «Todavía no». */
  preparacion: PreparacionAnalisis[];
  /** Si mi tienda puede recibir recomendaciones (las tres condiciones de ADR-0346). */
  puedeHablar: boolean;
  /** Mis prendas con algo que decir: libres, vendidas en 30 días o en camino. */
  prendas: PrendaAnalisis[];
  /** Una por tienda activa, en el orden de `sedes`. */
  resumenSedes: ResumenSedeAnalisis[];
  /** Desde cuántos días sin venderse se liquida (uno para todos, ADR-0356). */
  liquidarDesde: number;
  /** De cada 100 líneas vendidas en mis 30 días, cuántas llevaron rebaja; null si no se vendió nada. */
  rebajaDe100: number | null;
  /** Lo que más rinde por categoría en 90 días: ganancia por cada S/ 1 que hay en ropa de esa categoría. */
  rinde: { categoria: string; porSol: number }[];
  /** El último conteo de mi tienda: cuántas prendas se contaron y cuántas coincidieron; null si no hay. */
  conteo: { contadas: number; coinciden: number } | null;
  /** «Te pidieron y no había», sin resolver: qué se pidió y cuándo (YYYY-MM-DD). */
  noHabia: { que: string; dia: string }[];
  /** Lo que no se pudo leer (principio 9): cada parte que falló, en una frase. Vacío si todo respondió. */
  fallas: string[];
};
