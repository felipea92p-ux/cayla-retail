import { agruparPorPrenda, type FilaPrenda } from "./existencias-prendas";
import { hoyEnLima } from "./resumen-periodo";
import { ventasNetasDe, type FilaResumen } from "./resumen-reglas";

/* ====================================================================
   existencias-resumen · la ventana de «Resumen disponible» (Felipe, 2026-10-01)

   Puro. Responde, para alguien que no es técnico y mira de un vistazo, cuatro preguntas:
     · ¿cuántas prendas hay por categoría, en el almacén y en el piso?     → `tablaPorCategoria`
     · ¿cuánto se vendió este mes, en total y por categoría?               → `resumenDeVentas`
     · ¿qué es lo que más se vende?                                        → `resumenDeVentas.masVendidas`
     · ¿de qué hay más, y qué sigue esperando en el almacén sin bajar?     → `resumenDeStock`

   LO QUE YA NO HACE. Sin cobertura ni «para cuántos días alcanza»: era una proyección que nadie podía comprobar con un mes
   de ventas de una tienda nueva. Solo cifras que se cuentan: lo que hay y lo que se vendió.

   EL MES. «Vendidas» arranca de cero el día 1 de cada mes, en hora de Lima: la ventana de la lectura es del día 1 a hoy
   (`mesEnCurso`), no «los últimos 30 días». No hay nada que reiniciar a mano: el 1 a las 00:00 la ventana ya empieza ese día.

   STOCK. Se cuenta lo LIBRE (`disponible`: sin lo apartado para clientas), las mismas cifras de la tarjeta «Resumen disponible» y de
   las tarjetas de cada prenda. Una prenda es modelo + color (sus tallas suman), como en el resto de Existencias.
   ==================================================================== */

/** Lo que se necesita de una fila de Existencias: las de siempre más la categoría. */
export type FilaDeStock = FilaPrenda & { categoria: string | null };

export const SIN_CATEGORIA = "Sin categoría";

/** Cuántas prendas se listan en cada sección: es un resumen, no un reporte. */
export const TOPE_DE_LA_LISTA = 5;

const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];

/** El mes en curso en hora de Lima: la ventana de lo vendido y cómo se nombra. */
export type MesEnCurso = {
  /** «aaaa-mm-01». */
  desde: string;
  /** «aaaa-mm-dd» de hoy en Lima. */
  hasta: string;
  /** «octubre». */
  nombre: string;
  /** «1 de octubre». */
  desdeTexto: string;
};

/** A partir de «aaaa-mm-dd» de hoy en Lima (`hoyEnLima`). Siempre desde el día 1: el 1 de cada mes el contador vuelve a cero. */
export function mesEnCurso(hoy: string): MesEnCurso {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(hoy);
  const mes = m ? Number(m[2]) : 0;
  if (!m || mes < 1 || mes > 12) throw new Error(`Fecha inválida: ${hoy}`);
  const nombre = MESES[mes - 1];
  return { desde: `${m[1]}-${m[2]}-01`, hasta: hoy, nombre, desdeTexto: `1 de ${nombre}` };
}

/** El mes en curso a partir de un instante (el reloj del servidor): «hoy» es el de Lima, no el de UTC. */
export function mesEnCursoDe(ahora: Date): MesEnCurso {
  return mesEnCurso(hoyEnLima(ahora));
}

/** Lo que se vendió de una prenda en el mes, tal como viaja al navegador: una fila por talla con ventas netas, nada más. */
export type VentaDelMes = {
  referencia: string;
  color: string | null;
  colorHex: string | null;
  fotoUrl: string | null;
  categoria: string | null;
  /** Ventas − devoluciones de esa talla en el mes (siempre > 0: las demás no viajan). */
  vendidas: number;
};

/** Del resultado de la base (todas las tallas de la sede, ~1.200) deja solo las que vendieron algo: el navegador recibe unas
 *  pocas filas, no 1 MB. Una talla con más devoluciones que ventas no cuenta (`ventasNetasDe` no baja de cero). */
export function recortarVentasDelMes(
  filas: readonly Pick<FilaResumen, "referencia" | "color" | "colorHex" | "fotoUrl" | "categoria" | "ventas" | "devoluciones">[],
): VentaDelMes[] {
  return filas.flatMap((f) => {
    const vendidas = ventasNetasDe(f.ventas, f.devoluciones);
    return vendidas > 0
      ? [{ referencia: f.referencia, color: f.color, colorHex: f.colorHex, fotoUrl: f.fotoUrl, categoria: f.categoria, vendidas }]
      : [];
  });
}

/** Lo que identifica una prenda al cruzar el stock con las ventas: modelo + color. */
export function claveDePrenda(referencia: string, color: string | null): string {
  return `${referencia}\u0000${color ?? ""}`;
}

function nombreDeCategoria(categoria: string | null | undefined): string {
  return categoria?.trim() || SIN_CATEGORIA;
}

function compararNombres(a: string, b: string): number {
  return a.localeCompare(b, "es");
}

/** Una prenda (modelo + color) con lo que hay hoy. `piso` y `almacen` son `null` donde no se separan (Taller). */
export type PrendaDelResumen = {
  clave: string;
  referencia: string;
  color: string | null;
  colorHex: string | null;
  fotoUrl: string | null;
  categoria: string;
  piso: number | null;
  almacen: number | null;
  /** Lo libre: piso + almacén. */
  total: number;
};

export type ResumenDeStock = {
  separa: boolean;
  total: number;
  /** `null` donde no se separan piso y almacén. */
  piso: number | null;
  almacen: number | null;
  /** Una por categoría con algo que hay, las de más unidades primero. */
  porCategoria: { nombre: string; piso: number | null; almacen: number | null; total: number }[];
  /** Las prendas con más unidades hoy. */
  masStock: PrendaDelResumen[];
  /** Las que tienen en el almacén y NINGUNA en el piso: la clienta todavía no las ve. Solo donde se separa piso y almacén. */
  esperando: { lista: PrendaDelResumen[]; prendas: number; unidades: number };
  /** Todas las prendas con stock, por si otra cuenta necesita cruzarlas (`resumenDeVentas`). */
  prendas: PrendaDelResumen[];
};

export function resumenDeStock(stock: readonly FilaDeStock[], opciones: { separa: boolean; tope?: number }): ResumenDeStock {
  const tope = opciones.tope ?? TOPE_DE_LA_LISTA;
  const separa = opciones.separa;
  const prendas: PrendaDelResumen[] = agruparPorPrenda(stock)
    .map((p) => ({
      clave: claveDePrenda(p.referencia, p.color),
      referencia: p.referencia,
      color: p.color,
      colorHex: p.colorHex,
      fotoUrl: p.fotoUrl,
      categoria: nombreDeCategoria(p.tallas[0]?.categoria),
      piso: separa ? p.piso : null,
      almacen: separa ? p.almacen : null,
      total: p.disponible,
    }))
    .filter((p) => p.total > 0);

  const porCategoria = new Map<string, { nombre: string; piso: number | null; almacen: number | null; total: number }>();
  for (const p of prendas) {
    const c = porCategoria.get(p.categoria) ?? { nombre: p.categoria, piso: separa ? 0 : null, almacen: separa ? 0 : null, total: 0 };
    c.total += p.total;
    if (separa) {
      c.piso = (c.piso ?? 0) + (p.piso ?? 0);
      c.almacen = (c.almacen ?? 0) + (p.almacen ?? 0);
    }
    porCategoria.set(p.categoria, c);
  }

  const masUnidadesPrimero = (a: PrendaDelResumen, b: PrendaDelResumen) => b.total - a.total || compararNombres(a.referencia, b.referencia);
  const sinNingunaEnElPiso = separa ? prendas.filter((p) => (p.piso ?? 0) === 0 && (p.almacen ?? 0) > 0) : [];

  return {
    separa,
    total: prendas.reduce((n, p) => n + p.total, 0),
    piso: separa ? prendas.reduce((n, p) => n + (p.piso ?? 0), 0) : null,
    almacen: separa ? prendas.reduce((n, p) => n + (p.almacen ?? 0), 0) : null,
    porCategoria: [...porCategoria.values()].sort((a, b) => b.total - a.total || compararNombres(a.nombre, b.nombre)),
    masStock: [...prendas].sort(masUnidadesPrimero).slice(0, tope),
    esperando: {
      lista: [...sinNingunaEnElPiso].sort((a, b) => (b.almacen ?? 0) - (a.almacen ?? 0) || compararNombres(a.referencia, b.referencia)).slice(0, tope),
      prendas: sinNingunaEnElPiso.length,
      unidades: sinNingunaEnElPiso.reduce((n, p) => n + (p.almacen ?? 0), 0),
    },
    prendas,
  };
}

/** Una prenda de las más vendidas del mes, con lo que queda hoy. */
export type PrendaVendida = {
  clave: string;
  referencia: string;
  color: string | null;
  colorHex: string | null;
  fotoUrl: string | null;
  categoria: string;
  vendidas: number;
  /** Lo que hay hoy de esa prenda (piso + almacén); 0 si ya no hay. */
  quedan: number;
};

export type ResumenDeVentas = {
  /** Unidades vendidas en el mes en toda la sede. */
  vendidas: number;
  /** Unidades vendidas por categoría. */
  porCategoria: ReadonlyMap<string, number>;
  /** Las que más salieron, de más a menos. */
  masVendidas: PrendaVendida[];
};

export function resumenDeVentas(ventas: readonly VentaDelMes[], stock: ResumenDeStock, tope: number = TOPE_DE_LA_LISTA): ResumenDeVentas {
  const quedanPorPrenda = new Map(stock.prendas.map((p) => [p.clave, p.total]));
  const porPrenda = new Map<string, PrendaVendida>();
  const porCategoria = new Map<string, number>();
  let vendidas = 0;
  for (const v of ventas) {
    if (v.vendidas <= 0) continue;
    const clave = claveDePrenda(v.referencia, v.color);
    const categoria = nombreDeCategoria(v.categoria);
    const p = porPrenda.get(clave) ?? {
      clave,
      referencia: v.referencia,
      color: v.color,
      colorHex: v.colorHex,
      fotoUrl: v.fotoUrl,
      categoria,
      vendidas: 0,
      quedan: quedanPorPrenda.get(clave) ?? 0,
    };
    p.vendidas += v.vendidas;
    porPrenda.set(clave, p);
    porCategoria.set(categoria, (porCategoria.get(categoria) ?? 0) + v.vendidas);
    vendidas += v.vendidas;
  }
  return {
    vendidas,
    porCategoria,
    masVendidas: [...porPrenda.values()].sort((a, b) => b.vendidas - a.vendidas || compararNombres(a.referencia, b.referencia)).slice(0, tope),
  };
}

export type FilaDeLaTabla = {
  nombre: string;
  piso: number | null;
  almacen: number | null;
  total: number;
  /** `null` mientras las ventas del mes no se han leído (o no se pudieron leer): no se inventa un cero. */
  vendidas: number | null;
};

/** La tabla «Por categoría»: lo que hay en el almacén y en el piso y lo vendido en el mes. Entra toda categoría con algo que hay
 *  o con algo vendido (una que se agotó vendiendo sigue a la vista), las de más unidades primero; al final, el total. */
export function tablaPorCategoria(stock: ResumenDeStock, ventas: ResumenDeVentas | null): { filas: FilaDeLaTabla[]; total: FilaDeLaTabla } {
  const filas = new Map<string, FilaDeLaTabla>(
    stock.porCategoria.map((c) => [c.nombre, { nombre: c.nombre, piso: c.piso, almacen: c.almacen, total: c.total, vendidas: ventas ? 0 : null }]),
  );
  if (ventas) {
    for (const [nombre, vendidas] of ventas.porCategoria) {
      const f = filas.get(nombre) ?? { nombre, piso: stock.separa ? 0 : null, almacen: stock.separa ? 0 : null, total: 0, vendidas: 0 };
      f.vendidas = vendidas;
      filas.set(nombre, f);
    }
  }
  return {
    filas: [...filas.values()].sort((a, b) => b.total - a.total || (b.vendidas ?? 0) - (a.vendidas ?? 0) || compararNombres(a.nombre, b.nombre)),
    total: { nombre: "Total", piso: stock.piso, almacen: stock.almacen, total: stock.total, vendidas: ventas ? ventas.vendidas : null },
  };
}
