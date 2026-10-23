// Análisis v4 (ADR-0357): el contrato entre lo que lee el servidor y lo que dibuja cada pestaña. Una sola forma de «prenda»
// para las cuatro preguntas (Hoy · Se está acabando · No se vende · Qué pedir) y para su ficha: así una prenda dice lo mismo
// en la lista de Hoy, en su carril y en su hoja. Solo tipos: las reglas viven en `analisis-reglas.ts` y la lectura en
// `analisis-datos.ts`.
//
// «Prenda» aquí es UNA TALLA de un color de un modelo (una variante): «Camisa Oxford · Celeste · S». Es la pieza que se acaba,
// que se queda quieta y que se pide. El modelo entero (todas sus tallas y colores) se arma en la ficha con `productoId`.

import type { DiaVenta, PreparacionSede } from "./motor-demanda-reglas";
import type { ModeloAnalisis } from "./analisis-modelo";

/** Las pestañas, en el orden de la pantalla. «Nunca salió al piso» (`piso`) va entre «No se vende» y «Qué pedir» (Felipe, 2026-10-07). */
export const VISTAS_ANALISIS = ["hoy", "acaba", "nose", "piso", "pedir"] as const;
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
  /** Precio de venta vigente y costo de cada una (null si no se sabe). La encargada y el líder ven lo mismo (ADR-0328 enmendado).
   *  El precio es el de MI tienda (su precio propio, si lo tiene; si no, el de la prenda): lo pone `conPreciosDeMiTienda` sobre lo
   *  que entrega la base, que es el precio de la prenda. Una fila de otra tienda trae el de la prenda y nunca se muestra. */
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
  /** Entre cuántos días se mide su ritmo: `vendidas30` entre esto. Desde el 2026-10-14, los días que estuvo colgada, de 7 a los días de
   *  ventas de mi tienda (`ventanaDeRitmo`); lo pone el cargador. Si falta, 30. Ejemplo inventado: una blusa colgada hace 4 días en una
   *  tienda que vende en el ERP hace 15 mide su ritmo entre 7, no entre 15 (si no, «dura» el doble de lo que dura). */
  diasDeVentas?: number;
  /** Los días de ventas de MI tienda en el ERP, hasta 30 (`diasDeVentas` de `analisis-reglas`): el techo de la ventana de cada prenda,
   *  para rearmarla en el modelo. Si falta, el modelo usa la ventana de su primera talla (como antes del 2026-10-14). */
  diasDeVentasTienda?: number;
  /** Vendidas por semana en mi tienda: 8 semanas, de la más vieja a la actual. La semana k (0 a 7) son los 7 días que terminan
   *  hoy − 7·(7−k) (`fn_analisis_sede`, 20261006214000): la última termina hoy. Las fechas de la ficha dependen de esto. */
  semanas: number[];
  /** Días en el piso sin venderse: desde la última venta en mi tienda o desde que salió al piso, lo que pasó después
   *  (`fn_analisis_sede`, 20261007120000). null si nunca salió al piso: eso lo cuenta «Nunca salió al piso», no «No se vende». */
  diasSinVender: number | null;
  /** La primera vez que estuvo en el piso de MI tienda (YYYY-MM-DD): un movimiento en el piso o su primera venta. null = nunca
   *  salió al piso (o la base todavía no lo sabe: `DatosAnalisis.sabePiso`). */
  salioAlPiso: string | null;
  /** Su última venta en MI tienda (YYYY-MM-DD, sin tope de fechas); null si nunca se vendió aquí. undefined si la base todavía no lo
   *  dice (sin 20261010120000): con esto se cuentan los días sin venderse del modelo entero (`analisis-modelo.ts`). */
  ultimaVenta?: string | null;
  /** Desde cuántos días sin venderse se vigila y se liquida, según la vara de su tipo (`analisis-vara.ts`). Sin ella (la vara no alcanza o
   *  no se leyó Frescura), «Liquidar desde» y un mes. */
  umbrales?: UmbralesQuieta;
  /** Unidades colgadas de esta prenda que pueden ser una venta sin registrar: una venta pendiente anotada en caja con su tipo, talla y
   *  color (la cuenta de Frescura, ADR-0208 act. 2026-10-10 (c)). Con alguna, no se sabe si se vendió: no se liquida (ADR-0357, act.
   *  2026-10-14). Sin la lectura de Frescura, undefined. */
  enDuda?: number;
  /** La primera vez que entró a MI tienda (YYYY-MM-DD); null si no se sabe. Con esto se cuentan los días que lleva guardada. */
  llego: string | null;
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

/** Qué pantallas ve la cuenta (ADR-0161): un botón que lleva a «Sin acceso» no se muestra (ADR-0245). */
export type AccesoAnalisis = {
  /** Existencias ▸ Reponer a piso (bajar). */
  existencias: boolean;
  traslados: boolean;
  /** «Pedir a otra tienda»: lo acepta la base con Traslados o con Análisis. */
  pedir: boolean;
  /** «Mi plata para compras» (clave `ordenes_compra`, ADR-0480): donde se anota lo comprado. */
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
  /** Compras ▸ Plan de campaña. */
  planCompra: boolean;
};

/** La lectura del motor (ADR-0346) de una tienda, con sus días para dibujar «Ventas con su prenda, día a día» y su primera venta en
 *  el ERP (YYYY-MM-DD, o null si todavía no vende): de ahí sale cuántos días de ventas tiene (`diasDeVentas`). */
export type PreparacionAnalisis = PreparacionSede & { dias: DiaVenta[]; hoy: string; primeraVenta: string | null };

/**
 * Los dos escalones de «No se vende» de un tipo de prenda, en días, sacados de la vara de su categoría en Frescura (ADR-0357, act.
 * 2026-10-14): se vigila desde lo que tardan 3 de cada 4 de su tipo que sí se vendieron (p75) y se liquida desde lo que tardan 9 de cada
 * 10 (p90). `vara` dice cuál juzgó (la del mes de la tienda, la de CAYLA o la de hoy) y `vendidas`, con cuántas ventas.
 */
export type UmbralesQuieta = { vigila: number; liquidar: number; vara: "mes" | "cayla" | "hoy"; vendidas: number };

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
  /** Mis MODELOS con algo que decir (libres, vendidos en 30 días o en camino), cada uno con todas sus tallas y colores adentro: lo
   *  que miden y listan todas las pestañas (ADR-0357, decisión 12, Felipe 2026-10-10: «si dice Chaleco Cecia, incluye todas las
   *  tallas y todos los colores»). */
  prendas: ModeloAnalisis[];
  /** Las mismas, talla por talla de cada color (las filas de la base): para lo que de verdad compara tallas («Qué pedir») y para el
   *  detalle del modelo. */
  tallas: PrendaAnalisis[];
  /** Cuántos días de ventas tiene mi tienda en el ERP, hasta 30 (`diasDeVentas`): el ritmo de todo Análisis y «en 8 días». */
  diasDeVentas: number;
  /** Si la base ya dice cuándo salió al piso cada prenda de mi tienda (20261007120000). Sin eso, «Nunca salió al piso» no inventa
   *  una lista: dice que todavía no lo puede saber. */
  sabePiso: boolean;
  /** Si la base dice la última venta de cada prenda (20261010120000). Sin eso, los días sin venderse de un modelo se cuentan con lo
   *  más reciente de sus tallas, y se dice una vez arriba. */
  sabeUltimaVenta: boolean;
  /** Desde cuántos días sin venderse se liquida (uno para todos, ADR-0357). */
  liquidarDesde: number;
  /** Si se leyó Frescura del piso de mi tienda (las dudas de ventas sin registrar y la vara de cada categoría): «sin_modulo» si quien
   *  mira no la ve, «fallo» si no respondió (y se dice en `fallas`), «no_aplica» si la sede no separa piso y almacén. */
  frescura: "ok" | "sin_modulo" | "fallo" | "no_aplica";
  /** Lo vendido «sin registrar» en mi tienda en los mismos 30 días de `vendidas30`, por tipo (nombre de la categoría): la venta que no
   *  dice qué prenda fue pero sí de qué tipo (`lib/vendido-sin-registrar.ts`). «Qué pedir» la suma a lo vendido de su tipo (ADR-0357,
   *  act. 2026-10-14). Vacío si no se pudo leer (y se dice en `fallas`). */
  sinPrendaPorTipo: Record<string, number>;
  /** Las ventas sin su prenda que todavía se pueden registrar (pendientes, sin tope de fechas) y las que se cerraron sin prenda en los
   *  mismos 30 días: lo que dice «Ver qué falta» (ADR-0357, act. 2026-10-14). Null la que no se pudo leer. */
  porRegistrar: { pendientes: number | null; cerradas30: number | null };
  /** De cada 100 líneas vendidas en mis 30 días, cuántas llevaron rebaja; null si no se vendió nada. */
  rebajaDe100: number | null;
  /** Lo que más rinde por categoría en 90 días: ganancia por cada S/ 1 que hay en ropa de esa categoría. */
  rinde: { categoria: string; porSol: number }[];
  /** El último conteo de mi tienda: cuántas prendas se contaron y cuántas coincidieron; null si no hay. */
  conteo: { contadas: number; coinciden: number } | null;
  /** «Te pidieron y no había», sin resolver: qué se pidió y el día de Lima en que se anotó (YYYY-MM-DD; null si no se lee). */
  noHabia: { que: string; dia: string | null }[];
  /** Lo que no se pudo leer (principio 9): cada parte que falló, en una frase. Vacío si todo respondió. */
  fallas: string[];
};
