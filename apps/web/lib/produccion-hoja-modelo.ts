// «Ver el modelo»: la hoja de un modelo del Resumen de Producción (tarea #8 del análisis docs/pantallas/produccion.md). Puro: sin Supabase ni React.
//
// CONTRATO
//   PROMETE: armar, para un modelo, lo que Felipe pidió ver junto a su foto: por color y talla, cuánto se vendió en los últimos `DIAS_RITMO_RECIENTE` días y
//            qué se vendió y ya no hay en tiendas, con totales por talla, por color y del modelo, y la foto de cada color cuando el catálogo la tiene. El stock
//            va como dato secundario (con ~1,2 unidades por variante casi no discrimina; lo que orienta es lo vendido).
//   ASUME:   las variantes que ya trae `FilaModelo` (talla, color, ventas netas de la red, stock en tiendas); un color o una talla que la variante no tiene
//            se dice «Sin color» / «Sin talla», nunca se inventa uno.
//            Y todo lo que la ficha de Catálogo ▸ Productos dice del modelo —código, marca, proveedor, material, patrón, descripción, precio— más lo que
//            Producción necesita para decidir: lo vendido y lo que hay en CADA tienda (también por color y talla), las órdenes abiertas del modelo y la tela y
//            los avíos que lleva, contra su saldo. Cada dato que no se pudo leer viene `null` y quien dibuja lo dice; nunca se inventa «Sin registrar».
//   NO HACE: no ordena los colores ni las tiendas por lo que vendieron (conteos, no rankings: con 2 ventas por celda un ranking es ruido, ADR-0346) ni decide qué
//            fabricar (eso es el estado del modelo y «Nueva orden»); no lee la base ni dibuja nada.

import type { FilaModelo } from "./produccion-decisiones";
import { baseDelRitmo, estadoPideFabricar, sugerenciaDeOrden, urlTrasladarModelo } from "./produccion-decisiones";
import { analizarInsumos, DIAS_OBJETIVO_PRODUCCION, type AnalisisInsumo, type Rendimiento, type SaldoParaAnalisis } from "./produccion-decision-reglas";
import { diaMes } from "./fechas-lima";
import type { DemandaDeSede } from "./produccion-por-tienda";
import { estadoEntrega, etapaActual, etapasDe, type EstadoEntrega } from "./produccion-reglas";
import { compararTallas } from "./tallas";

export const SIN_TALLA = "Sin talla";
export const SIN_COLOR = "Sin color";

/** Un color del modelo tal como lo conoce el catálogo: su nombre, su hex (si lo tiene) y la foto de ese color (si la tiene). La ficha del color (qué transmite y con qué se combina) NO viaja aquí: repetiría el vocabulario entero en cada modelo; la hoja la busca por el nombre en el vocabulario que el panel le da UNA sola vez (`FichasDeColor.tsx`). */
export type ColorParaHoja = { nombre: string; hex: string | null; fotoUrl: string | null };

/** Una talla y color: lo vendido en la ventana y lo que queda en tiendas. Si «se vendió y ya no hay» no se manda: sale de estas dos cifras (`seVendioYYaNoHay`), y no pesa en cada celda de cada modelo. */
export type CeldaDeHoja = { ventas: number; stock: number };

export type TotalDeHoja = { ventas: number; stock: number };

/** La sede y la talla donde Existencias puede abrir un color: `ubicacionId` `null` = el Taller, que es la sede en la que se ve Producción (no hace falta decirla). */
export type DondeVerlo = { ubicacionId: string | null; varianteId: string };

export type ColorDeHoja = ColorParaHoja & TotalDeHoja & {
  /** Dónde abrir este color en Existencias: la tienda que más tiene (o el Taller, si solo ahí hay) y la primera talla de la curva que sí tiene prendas allí. `null` si no hay stock en ninguna sede. */
  dondeVerlo: DondeVerlo | null;
  /** Una por talla de `HojaDeModelo.tallas`, en el mismo orden; `null` = ese color no se hace en esa talla. */
  celdas: (CeldaDeHoja | null)[];
};

/**
 * Lo que la ficha de Catálogo ▸ Productos dice de un modelo y que la hoja repite: de quién es (marca), quién lo trae (proveedor), de qué está hecho (material y patrón), su
 * código, su descripción y la temporada. Cada campo `null` = todavía sin registrar en el catálogo (es lo que falta completar en «Editar»).
 */
export type FichaDeModelo = {
  codigo: string | null;
  descripcion: string | null;
  marca: string | null;
  proveedor: string | null;
  tejido: string | null;
  patron: string | null;
  temporada: string | null;
};

/** Una tienda y lo suyo con este modelo: lo vendido, lo que hay, lo que viene, y la misma matriz color × talla (alineada con `HojaDeModelo.colores` × `tallas`). */
export type TiendaDeHoja = {
  id: string;
  nombre: string;
  ventas: number;
  stock: number;
  enCamino: number;
  /** Unidades por día con las que se midió en ESTA tienda; `null` si ahí no se pudo medir. */
  ritmoDia: number | null;
  /** Las ventas netas con las que se midió ese ritmo (0 sin ritmo). */
  ventasBase: number;
  /** Días que dura lo que hay en esta tienda a su ritmo; `null` sin ritmo. */
  dias: number | null;
  /** Por color (en el orden de `colores`) y por talla (en el de `tallas`); `null` = ese color no se hace en esa talla. */
  celdas: (CeldaDeHoja | null)[][];
};

/** Una orden de producción abierta del modelo, con lo que hace falta para decirla en una línea. */
export type OrdenDeHoja = {
  id: string;
  esMuestra: boolean;
  cantidad: number;
  /** Dónde va: «Corte», «Confección», «Acabados» (o las de la muestra) o «Lista para cerrar». */
  etapa: string;
  fechaEntrega: string | null;
  entrega: EstadoEntrega;
};

/** Lo que lleva una prenda de un insumo, contra su saldo (`analizarInsumos`). */
export type MaterialDeHoja = AnalisisInsumo & { porPrenda: number };

export type MaterialesDeHoja = {
  /** Para cuántas prendas se midió «alcanza» (las que faltan fabricar); 0 = solo se dice lo que lleva una y cuántas salen con el saldo. */
  prendas: number;
  lineas: MaterialDeHoja[];
};

/** Todo lo que la hoja de un modelo necesita: la fila del Resumen (sin sus variantes), la matriz ya armada y lo que sabe el catálogo, las tiendas, las órdenes y los insumos. */
export type HojaDeModelo = Omit<FilaModelo, "variantes"> & {
  /** En orden de curva (XS · S · M · L, 28 · 30); «Sin talla» al final. */
  tallas: string[];
  /** Por nombre, «Sin color» al final. */
  colores: ColorDeHoja[];
  porTalla: TotalDeHoja[];
  total: TotalDeHoja;
  /** A Mover mercadería con el Taller de origen y lo que se traslada puesto; `null` si no hay nada que trasladar o no se conoce el Taller. */
  hrefTrasladar: string | null;
  /** Hay una cantidad sugerida que decir (hay base y algo que fabricar): «Abrir orden sugerida» lleva la orden con la matriz ya llena; si no, «Abrir orden» la abre vacía. */
  sugerida: boolean;
  /** `null` = no se pudo leer del catálogo (la hoja lo dice; no escribe «sin registrar», que afirmaría que está vacío). */
  ficha: FichaDeModelo | null;
  /** El precio más bajo y el más alto de las variantes que se venden; `null` sin precios. */
  precioMin: number | null;
  precioMax: number | null;
  /** Las tiendas (y almacenes) de la red, en el orden del catálogo de sedes; vacío si no se pudo leer lo de cada una. */
  tiendas: TiendaDeHoja[];
  /** Las órdenes de producción abiertas de este modelo, la que se entrega antes primero. */
  ordenes: OrdenDeHoja[];
  /** La tela y los avíos que lleva, con su saldo; `null` si el modelo no tiene consumo medido (no hay una orden cerrada con insumos descontados). */
  materiales: MaterialesDeHoja | null;
};

const suma = (a: TotalDeHoja, c: CeldaDeHoja): TotalDeHoja => ({ ventas: a.ventas + c.ventas, stock: a.stock + c.stock });
const vacio = (): TotalDeHoja => ({ ventas: 0, stock: 0 });

/** Lo que `hojaDelModelo` recibe además de la fila: todo opcional, porque cada pieza se lee aparte y puede fallar sin tumbar a las demás. */
export type ExtrasDeHoja = {
  ficha?: FichaDeModelo | null;
  /** Los precios de las variantes que se venden. */
  precios?: readonly number[];
  /** Lo de cada sede (`demandaPorSede`): la hoja se queda con las tiendas y busca las variantes de SU modelo. */
  sedes?: readonly DemandaDeSede[];
  ordenes?: readonly OrdenDeHoja[];
  materiales?: MaterialesDeHoja | null;
};

/** Ordena etiquetas dejando `ultima` al final. */
function ordenar(etiquetas: Iterable<string>, ultima: string, comparar: (a: string, b: string) => number): string[] {
  return [...new Set(etiquetas)].sort((a, b) => (a === ultima ? 1 : b === ultima ? -1 : comparar(a, b)));
}

export function hojaDelModelo(fila: FilaModelo, coloresDelCatalogo: readonly ColorParaHoja[] = [], tallerId: string | null = null, extras: ExtrasDeHoja = {}): HojaDeModelo {
  const { variantes, ...resto } = fila;
  const tallas = ordenar(variantes.map((v) => v.talla ?? SIN_TALLA), SIN_TALLA, compararTallas);
  const nombresDeColor = ordenar(variantes.map((v) => v.color ?? SIN_COLOR), SIN_COLOR, (a, b) => a.localeCompare(b, "es"));
  const delCatalogo = new Map(coloresDelCatalogo.map((c) => [c.nombre, c]));

  const claveDe = (color: string, talla: string) => `${color}\u0000${talla}`;
  const porClave = new Map<string, CeldaDeHoja>();
  // Las variantes de cada celda color × talla (casi siempre una; dos si el catálogo repite la pareja): con ellas se busca lo de cada tienda.
  const idsPorClave = new Map<string, string[]>();
  const hexDeLaVariante = new Map<string, string | null>();
  for (const v of variantes) {
    const color = v.color ?? SIN_COLOR;
    const clave = claveDe(color, v.talla ?? SIN_TALLA);
    const previa = porClave.get(clave);
    porClave.set(clave, { ventas: (previa?.ventas ?? 0) + v.ventasNetas, stock: (previa?.stock ?? 0) + v.stockRed });
    idsPorClave.set(clave, [...(idsPorClave.get(clave) ?? []), v.varianteId]);
    if (!hexDeLaVariante.has(color)) hexDeLaVariante.set(color, v.colorHex);
  }

  const colores: ColorDeHoja[] = nombresDeColor.map((nombre) => {
    const celdas = tallas.map((t) => porClave.get(claveDe(nombre, t)) ?? null);
    const t = celdas.reduce<TotalDeHoja>((a, c) => (c ? suma(a, c) : a), vacio());
    const c = delCatalogo.get(nombre);
    return { nombre, hex: c?.hex ?? hexDeLaVariante.get(nombre) ?? null, fotoUrl: c?.fotoUrl ?? null, dondeVerlo: null, ...t, celdas };
  });
  const porTalla = tallas.map((_, i) => colores.reduce<TotalDeHoja>((a, c) => (c.celdas[i] ? suma(a, c.celdas[i]!) : a), vacio()));
  const total = porTalla.reduce<TotalDeHoja>((a, t) => ({ ventas: a.ventas + t.ventas, stock: a.stock + t.stock }), vacio());

  const tiendas: TiendaDeHoja[] = (extras.sedes ?? [])
    .filter((s) => s.tipo !== "taller")
    .map((s) => {
      let ventas = 0, stock = 0, enCamino = 0, ritmo = 0, hayRitmo = false, ventasBase = 0;
      for (const v of variantes) {
        const c = s.porVariante[v.varianteId];
        if (!c) continue;
        ventas += c.ventas;
        stock += c.stock;
        enCamino += c.enCamino;
        ventasBase += c.ventasBase;
        if (c.ritmoDia) {
          ritmo += c.ritmoDia;
          hayRitmo = true;
        }
      }
      const ritmoDia = hayRitmo ? ritmo : null;
      const celdas = nombresDeColor.map((nombre) =>
        tallas.map((t): CeldaDeHoja | null => {
          const ids = idsPorClave.get(claveDe(nombre, t));
          if (!ids) return null;
          return ids.reduce<CeldaDeHoja>((a, id) => ({ ventas: a.ventas + (s.porVariante[id]?.ventas ?? 0), stock: a.stock + (s.porVariante[id]?.stock ?? 0) }), { ventas: 0, stock: 0 });
        }),
      );
      return { id: s.id, nombre: s.nombre, ventas, stock, enCamino, ritmoDia, ventasBase, dias: ritmoDia ? stock / ritmoDia : null, celdas };
    });

  // «Ver en Existencias» tiene que abrir ALGO: la tienda con más prendas de ese color y su primera talla con stock; si no hay en tiendas, el Taller; si no hay en ninguna, nada (el enlace va a la lista).
  // Producción se ve parado en el Taller, y Existencias abre la sede en la que estás: sin esto, el botón caía en el Taller aunque lo que se vende estuviera en una tienda.
  const sedePorId = new Map((extras.sedes ?? []).map((x) => [x.id, x]));
  const dondeVerElColor = (nombre: string, i: number): DondeVerlo | null => {
    let mejor: { ubicacionId: string; varianteId: string; stock: number } | null = null;
    for (const t of tiendas) {
      const stock = (t.celdas[i] ?? []).reduce((a, c) => a + (c?.stock ?? 0), 0);
      if (stock <= (mejor?.stock ?? 0)) continue;
      for (const talla of tallas) {
        const id = (idsPorClave.get(claveDe(nombre, talla)) ?? []).find((v) => (sedePorId.get(t.id)?.porVariante[v]?.stock ?? 0) > 0);
        if (id) {
          mejor = { ubicacionId: t.id, varianteId: id, stock };
          break;
        }
      }
    }
    if (mejor) return { ubicacionId: mejor.ubicacionId, varianteId: mejor.varianteId };
    for (const talla of tallas) {
      const v = variantes.find((x) => (x.color ?? SIN_COLOR) === nombre && (x.talla ?? SIN_TALLA) === talla && x.stockTaller > 0);
      if (v) return { ubicacionId: null, varianteId: v.varianteId };
    }
    return null;
  };

  const precios = (extras.precios ?? []).filter((p) => Number.isFinite(p) && p > 0);
  return {
    ...resto,
    tallas,
    colores: colores.map((c, i) => ({ ...c, dondeVerlo: dondeVerElColor(c.nombre, i) })),
    porTalla,
    total,
    hrefTrasladar: urlTrasladarModelo(fila, tallerId),
    sugerida: sugerenciaDeOrden(fila) !== null,
    ficha: extras.ficha ?? null,
    precioMin: precios.length ? Math.min(...precios) : null,
    precioMax: precios.length ? Math.max(...precios) : null,
    tiendas,
    ordenes: [...(extras.ordenes ?? [])],
    materiales: extras.materiales ?? null,
  };
}

/** La matriz que la hoja dibuja: la de toda la red (`tiendaId` `null`) o la de UNA tienda. Mismas filas y columnas en las dos, para que al cambiar de tienda no se mueva nada. */
export type MatrizDeHoja = { colores: ColorDeHoja[]; porTalla: TotalDeHoja[]; total: TotalDeHoja };

export function matrizDeLaHoja(h: Pick<HojaDeModelo, "colores" | "porTalla" | "total" | "tiendas">, tiendaId: string | null): MatrizDeHoja {
  const t = tiendaId === null ? undefined : h.tiendas.find((x) => x.id === tiendaId);
  if (!t) return { colores: h.colores, porTalla: h.porTalla, total: h.total };
  const colores = h.colores.map((c, i) => {
    const celdas = t.celdas[i] ?? c.celdas.map(() => null);
    const suma0 = celdas.reduce<TotalDeHoja>((a, x) => (x ? suma(a, x) : a), vacio());
    return { ...c, ...suma0, celdas };
  });
  const porTalla = h.porTalla.map((_, j) => colores.reduce<TotalDeHoja>((a, c) => (c.celdas[j] ? suma(a, c.celdas[j]!) : a), vacio()));
  const total = porTalla.reduce<TotalDeHoja>((a, x) => ({ ventas: a.ventas + x.ventas, stock: a.stock + x.stock }), vacio());
  return { colores, porTalla, total };
}

/** La cantidad que de verdad hay que fabricar, dicha para quien decide: sin base (poca venta) no se afirma una cantidad (ADR-0346). La usan «falta» y el cálculo de insumos. */
export function prendasPorFabricar(h: Pick<HojaDeModelo, "estado" | "ventasBase" | "producir">): number {
  if (!estadoPideFabricar(h.estado)) return 0;
  return baseDelRitmo(h.ventasBase).pocaBase ? 0 : h.producir;
}

/** Las órdenes ABIERTAS (`en_proceso`) del modelo, la que se entrega antes primero y las que no tienen fecha al final. */
export function ordenesDelModelo(
  ordenes: readonly { id: string; productoId: string; estado: string; esMuestra: boolean; cantidadPlan: number; etapas: Parameters<typeof etapaActual>[0]; fechaEntrega: string | null }[],
  productoId: string,
  hoy: string,
): OrdenDeHoja[] {
  return ordenes
    .filter((o) => o.productoId === productoId && o.estado === "en_proceso")
    .map((o) => {
      const actual = etapaActual(o.etapas, o.esMuestra);
      const etapa = actual === "listo" ? "Lista para cerrar" : (etapasDe(o.esMuestra).find((e) => e.clave === actual)?.etiqueta ?? "En proceso");
      return { id: o.id, esMuestra: o.esMuestra, cantidad: o.cantidadPlan, etapa, fechaEntrega: o.fechaEntrega, entrega: estadoEntrega(o.fechaEntrega, hoy) };
    })
    .sort((a, b) => (a.fechaEntrega ?? "9999-12-31").localeCompare(b.fechaEntrega ?? "9999-12-31"));
}

/** Cuándo se entrega una orden, dicho como se lee en una fila: nunca una fecha cruda si lo útil es «en 3 días» o «vencida». Solo hechos: no estima cuánto trabajo queda. */
export function textoDeEntrega(o: Pick<OrdenDeHoja, "entrega" | "fechaEntrega">): string {
  const e = o.entrega;
  if (e.tipo === "sin_fecha") return "Sin fecha de entrega";
  if (e.tipo === "vencida") return e.dias === 1 ? "Vencida hace 1 día" : `Vencida hace ${e.dias} días`;
  if (e.tipo === "pronto") return e.dias === 0 ? "Se entrega hoy" : e.dias === 1 ? "Se entrega mañana" : `Se entrega en ${e.dias} días`;
  return `Se entrega el ${diaMes(o.fechaEntrega)}`;
}

/**
 * Lo que lleva el modelo de cada insumo y si alcanza para lo que falta fabricar. `null` sin rendimiento medido (nadie cerró una orden con insumos descontados: se mide con la primera).
 * Con `prendas` en 0 no se pregunta «¿alcanza?» —no hay qué fabricar—, y solo se dice lo que lleva una prenda y cuántas salen con el saldo de hoy.
 */
export function materialesDelModelo(rendimiento: readonly Rendimiento[], prendas: number, saldos: ReadonlyMap<string, SaldoParaAnalisis>): MaterialesDeHoja | null {
  if (rendimiento.length === 0) return null;
  const analisis = analizarInsumos([...rendimiento], prendas, new Map(saldos));
  const porPrenda = new Map(rendimiento.map((r) => [r.insumoId, r.porPrenda]));
  return { prendas, lineas: analisis.map((a) => ({ ...a, porPrenda: porPrenda.get(a.insumoId) ?? 0 })) };
}

/**
 * Lo que falta para cubrir `dias` días de venta, dicho para quien decide: cuánto, qué parte ya está hecha en el Taller y qué parte hay que fabricar. Es la misma cifra que sugiere «Nueva orden»
 * (`repartirFalta`). `null` si no falta nada, si el consejo del modelo no es fabricar («Alcanza», «Sobrestock», sin ritmo: `estadoPideFabricar`) o si solo hay una cantidad a fabricar con
 * poca base (ruido, ADR-0346: lo que se traslada del Taller sí se dice, es stock que ya existe). Cuando hay órdenes abiertas lo dice solo si de verdad se descontaron (`enProduccionContada`).
 */
export function fraseDeLaFalta(h: Pick<HojaDeModelo, "estado" | "ventasBase" | "trasladar" | "producir" | "enProduccionContada">, dias: number = DIAS_OBJETIVO_PRODUCCION): string | null {
  if (!estadoPideFabricar(h.estado)) return null;
  const fabricar = prendasPorFabricar(h);
  const falta = h.trasladar + fabricar;
  if (falta <= 0) return null;
  const partes = [
    h.trasladar > 0 ? `${h.trasladar} ${h.trasladar === 1 ? "ya está en el Taller y se traslada" : "ya están en el Taller y se trasladan"}` : null,
    fabricar > 0 ? `${fabricar} ${fabricar === 1 ? "hay que fabricarla" : "hay que fabricarlas"}` : null,
  ].filter(Boolean);
  const cuentan = h.enProduccionContada > 0 ? " Ya cuenta lo que hay en órdenes abiertas." : "";
  return `Para cubrir ${dias} días de venta ${falta === 1 ? "falta 1" : `faltan ${falta}`}: ${partes.join("; ")}.${cuentan}`;
}

/**
 * La hoja cuenta dos «ventas» que pueden no coincidir: el ritmo de arriba («se vende X por semana, N ventas») se midió solo con las tiendas donde se pudo medir, y la matriz suma las de
 * TODAS. Si difieren, lo dice, para que quien ve «12 ventas» arriba y «15» en el total no piense que una está mal. `null` si coinciden o no hay ritmo.
 */
export function aclaracionDeLaBase(h: Pick<HojaDeModelo, "ritmoDia" | "ventasBase" | "total">): string | null {
  if (!h.ritmoDia || h.total.ventas <= h.ventasBase) return null;
  return `El ritmo de arriba se midió con ${h.ventasBase} de estas ${h.total.ventas} ventas: las de las tiendas donde se pudo medir.`;
}

/** A dónde lleva «Ver en Existencias»: la sede y la talla de `dondeVerlo`; sin ninguna (no hay stock en ninguna sede), la lista de Existencias de la sede actual. */
export function hrefVerEnExistencias(d: DondeVerlo | null): string {
  if (!d) return "/inventario";
  return `/inventario?${d.ubicacionId ? `ubicacion=${encodeURIComponent(d.ubicacionId)}&` : ""}variante=${encodeURIComponent(d.varianteId)}`;
}

/**
 * La línea «Marca X · Proveedor Y» que va bajo el nombre de cada modelo de «¿Qué producir?»: de quién es y a quién se le compra, a la vista sin abrir la hoja. Con la ficha leída, lo que
 * falta se dice («Sin marca», «Sin proveedor»: es lo que se completa en «Editar» del catálogo). `null` si la ficha NO se pudo leer: decir «Sin marca» de lo que no se sabe afirmaría
 * que está vacío (la hoja ya avisa de la lectura fallida), así que la fila no dice nada.
 */
export function lineaDeOrigen(ficha: Pick<FichaDeModelo, "marca" | "proveedor"> | null): string | null {
  if (!ficha) return null;
  return `${ficha.marca ? `Marca ${ficha.marca}` : "Sin marca"} · ${ficha.proveedor ? `Proveedor ${ficha.proveedor}` : "Sin proveedor"}`;
}
