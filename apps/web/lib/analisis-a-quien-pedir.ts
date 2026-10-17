// Análisis v4 (ADR-0357, «Actualización 2026-10-16 — Análisis para decidir compras», A8 y F1): a quién se le pide cada modelo que se acaba y
// cómo se agrupan por proveedor (el modo «Por proveedor» de «Se está acabando»). Lógica pura, sin base ni React; la prueba es `analisis-a-quien-pedir.test.ts`.
//
// EL PROBLEMA. «Comprar» sacaba el proveedor de la última compra o producción (`fn_origen_producto`), y en producción ningún modelo tiene
// ninguna: la fila no decía a quién pedir y «Comprar todas» mezclaba a todos. El catálogo SÍ trae el proveedor de casi todos los modelos
// (`productos.proveedor_id`, ~260 de ~357).
//
// LA REGLA (de más fuerte a más débil):
//   1. El origen REAL manda: si el modelo viene del Taller (producción terminada), es del Taller; si tiene una compra, es el proveedor de
//      esa compra (`proveedorId`), aunque la ficha del modelo anote otro. Si ese proveedor está ARCHIVADO tampoco se cae al de la ficha (queda «Sin
//      proveedor» con su motivo): si debiera, está por decidir con Felipe, y hoy ningún modelo tiene compras (ADR-0357, act. 2026-10-16).
//   2. Sin origen, el proveedor del CATÁLOGO, y se dice que lo es («Proveedor del catálogo»): es el proveedor con el que se compra
//      «habitualmente» ese modelo, no el de una compra que ya pasó.
//   3. Sin nada, «Sin proveedor». Nunca se inventa uno.
//   Un proveedor ARCHIVADO (1 o 2) no se recomienda como «Pídelo a …» (Felipe 2026-10-16, F1): el modelo cuenta como «Sin proveedor» y dice cuál está
//   archivado y que hay que elegir otro.
//
// LO QUE NO HACE. El proveedor del catálogo NUNCA decide si un modelo se hace en el Taller o se compra a terceros: producción no tiene hoy
// ni una orden terminada ni un movimiento en el Taller, y 26 modelos apuntan a «CAYLA SAC» (la marca propia, que puede ser el Taller o
// una maquila). Esa decisión es de Felipe (D9). Tampoco cambia a dónde lleva «Comprar» (`analisis-acciones.ts`, A9): eso es texto.

import type { LlegadaPrenda, PrendaAnalisis, ProveedoresAnalisis } from "./analisis-tipos";
import { diasQueQuedan, llegadasDe, ordenSeAcaba, plural, porLlegar } from "./analisis-reglas";

/** De dónde sale el proveedor de un modelo. `archivado`: tiene uno, pero ya no se trabaja con él (no se le pide). */
export type FuenteProveedor = "compra" | "catalogo" | "taller" | "ninguno" | "archivado";

/**
 * A quién se le pide un modelo, y de dónde se sabe. Un proveedor ARCHIVADO (Felipe 2026-10-16: «no se recomienda como Pídelo a») se
 * nombra pero no se le pide: el modelo cuenta como «Sin proveedor» hasta que se elija otro.
 */
export type ProveedorDelModelo =
  | { fuente: "compra" | "catalogo"; id: string; nombre: string }
  | { fuente: "archivado"; id: string; nombre: string }
  | { fuente: "taller" }
  | { fuente: "ninguno" };

/** El nombre del grupo de lo que no tiene proveedor, y el del Taller. */
const TEXTO_SIN_PROVEEDOR = "Sin proveedor";
const TEXTO_TALLER = "Taller de CAYLA";

/**
 * Quién es el proveedor de ese id: su nombre y si sigue activo. Con un proveedor activo es a quien se le pide (`compra` o `catalogo`); uno
 * archivado no se recomienda («Pídelo a …» es una indicación, y llamar a alguien con quien ya no se trabaja cuesta un día). null si no se conoce.
 */
function proveedorDeId(p: ProveedoresAnalisis, id: string, fuente: "compra" | "catalogo"): ProveedorDelModelo | null {
  const x = p.nombres[id];
  if (!x) return null;
  return x.activo ? { fuente, id, nombre: x.nombre } : { fuente: "archivado", id, nombre: x.nombre };
}

/**
 * A quién se le pide el modelo. El origen real manda; el catálogo solo entra cuando NO hay origen (nunca para decidir entre el Taller y
 * terceros). Un origen «terceros» cuyo proveedor no se puede nombrar (no debería pasar: toda compra tiene proveedor) queda en «ninguno»
 * en vez de adivinar con el catálogo.
 */
export function proveedorDelModelo(m: Pick<PrendaAnalisis, "origen" | "proveedorId" | "productoId">, p: ProveedoresAnalisis): ProveedorDelModelo {
  if (m.origen === "taller") return { fuente: "taller" };
  if (m.origen === "terceros") return (m.proveedorId ? proveedorDeId(p, m.proveedorId, "compra") : null) ?? { fuente: "ninguno" };
  const id = p.delCatalogo[m.productoId];
  return (id ? proveedorDeId(p, id, "catalogo") : null) ?? { fuente: "ninguno" };
}

/**
 * El nombre de un proveedor sin su sufijo legal («Textiles Andinos del Perú S.A.C.» → «Textiles Andinos del Perú»): en una fila de 140 px el
 * sufijo se llevaba una línea y, con un nombre largo, la palabra que distingue al proveedor. El nombre completo va en el tooltip y en el
 * `aria-label`. Solo quita el sufijo del FINAL (SAC, S.A.C., S.A., SA, E.I.R.L., EIRL, S.R.L., SRL), con o sin coma delante, y nunca deja el
 * nombre vacío (un proveedor que se llama «S.A.C.» queda como está).
 */
export function nombreCortoProveedor(nombre: string): string {
  const SUFIJO = /[\s,]+(?:s\.?\s?a\.?\s?c\.?|e\.?\s?i\.?\s?r\.?\s?l\.?|s\.?\s?r\.?\s?l\.?|s\.?\s?a\.?)$/i;
  let corto = nombre.trim();
  // Hasta dos veces: un nombre con dos sufijos pegados («Andes S.A. S.A.C.») no debe dejar el primero.
  for (let i = 0; i < 2; i++) {
    const sin = corto.replace(SUFIJO, "").replace(/[\s,]+$/, "");
    if (sin === corto || sin === "") break;
    corto = sin;
  }
  return corto;
}

/** «Pídelo a Textil Andino» (sin su sufijo legal) / «Pídelo al Taller»; null si no hay a quién (o su proveedor está archivado): la fila lo dice aparte. */
export function textoPidelo(q: ProveedorDelModelo): string | null {
  if (q.fuente === "taller") return "Pídelo al Taller";
  if (q.fuente === "ninguno" || q.fuente === "archivado") return null;
  return `Pídelo a ${nombreCortoProveedor(q.nombre)}`;
}

/** Lo mismo con el nombre COMPLETO, para el tooltip y el `aria-label` de la fila. */
export function textoPideloCompleto(q: ProveedorDelModelo): string | null {
  if (q.fuente === "taller") return "Pídelo al Taller";
  if (q.fuente === "ninguno" || q.fuente === "archivado") return null;
  return `Pídelo a ${q.nombre}`;
}

/**
 * «Viene de Textil Andino» / «Viene del Taller» / «Viene de tu almacén»: de quién viene lo que YA está en camino a tiempo (esa fila no se
 * pide otra vez: `Pídelo a …` es para lo que falta). Lo dice el origen de lo que llega (el de más unidades): el Taller, el Taller; el almacén o
 * otra tienda, así; una compra, el proveedor de la última compra del modelo (`fuente: "compra"`). La llegada NO trae el proveedor de su orden
 * (`LlegadaPrenda` es de/cantidad/fecha), así que el proveedor ANOTADO en la ficha del catálogo (`fuente: "catalogo"`) no se nombra: es con quien
 * se compra «habitualmente», no necesariamente de quien viene lo que está en camino, y quien persigue una entrega llamaría a otro. null si no se
 * sabe de quién (una compra sin proveedor nombrable o solo anotado en la ficha, un proveedor archivado) o si no viene nada a tiempo: nunca se
 * inventa uno. Nombrar al de la orden en tránsito pide que la lectura traiga el proveedor de cada llegada (otra actividad).
 */
export function textoVieneDe(llega: readonly LlegadaPrenda[], q: ProveedorDelModelo, hoy: string): string | null {
  const aTiempo = llega.filter((x) => x.cantidad > 0 && llegadasDe([x], hoy).vienen > 0);
  if (aTiempo.length === 0) return null;
  const porOrigen = new Map<LlegadaPrenda["de"], number>();
  for (const x of aTiempo) porOrigen.set(x.de, (porOrigen.get(x.de) ?? 0) + x.cantidad);
  const [origen] = [...porOrigen.entries()].sort((a, b) => b[1] - a[1])[0]!;
  if (origen === "taller") return "Viene del Taller";
  if (origen === "almacen") return "Viene de tu almacén";
  if (origen === "tienda") return "Viene de otra tienda";
  return q.fuente === "compra" ? `Viene de ${nombreCortoProveedor(q.nombre)}` : null;
}

/**
 * Lo que todavía hay que pedir: lo que se acaba y NO viene en camino (una llegada atrasada no cuenta como que viene: `porLlegar`). Es la
 * regla única de «A quién pedir» y del pie de «Compra» en Hoy, y no depende del filtro del carril: así la tarjeta no aparece ni desaparece
 * al cambiar de filtro y no empuja los botones del filtro de debajo del mouse (ADR-0185).
 */
export function modelosPorPedir<T extends Pick<PrendaAnalisis, "llega">>(modelos: readonly T[], hoy: string): T[] {
  return modelos.filter((m) => porLlegar(m, hoy) === 0);
}

/**
 * De dónde se sabe, corto, en palabras de tienda, para ir bajo el nombre del proveedor o en la tarjetita de la ficha: «anotado en su ficha»
 * (el catálogo: la ficha del modelo en Catálogo) y «le compraste la última vez» (una compra). «Proveedor del catálogo» se leía como el
 * catálogo de ventas (Felipe 2026-10-16, prueba con una compradora).
 */
export const FUENTE_CORTA: Record<FuenteProveedor, string> = {
  compra: "le compraste la última vez",
  catalogo: "anotado en su ficha",
  taller: "lo hace el Taller de CAYLA",
  ninguno: "falta elegirlo en el catálogo",
  archivado: "su proveedor está archivado: elige otro",
};

/** De dónde se sabe, completo, para el tooltip de «Pídelo a …». */
export const FUENTE_LARGA: Record<FuenteProveedor, string> = {
  compra: "Es el proveedor de la última compra de este modelo.",
  catalogo: "Está anotado en la ficha del modelo (Catálogo). El sistema no tiene una compra con esta prenda ni una producción terminada de este modelo.",
  taller: "Este modelo lo hace el Taller de CAYLA.",
  ninguno: "Este modelo no tiene proveedor en el catálogo: elígelo en su ficha.",
  archivado: "El proveedor de este modelo está archivado: ya no se trabaja con él. Elige otro en la ficha del modelo (Catálogo).",
};

/**
 * Lo que la fila de «Comprar» dice A LA VISTA bajo «Pídelo a …»: de dónde se sabe el nombre, SIEMPRE («le compraste la última vez» o «anotado en su
 * ficha»), para que nadie tome por el de su última compra uno que solo está anotado, ni al revés. Un tooltip no se alcanza con el dedo ni con el
 * teclado. Del Taller no dice nada: «Pídelo al Taller» ya es el dato.
 */
export const textoFuenteDeLaFila = (q: ProveedorDelModelo): string | null => (q.fuente === "compra" || q.fuente === "catalogo" ? FUENTE_CORTA[q.fuente] : null);

/**
 * Lo que dice la fila de «Comprar» cuando NO puede decir «Pídelo a …» porque a quién pedir no está claro: sin proveedor (falta elegirlo) o con
 * uno archivado (elige otro). null si sí hay a quién (o es del Taller).
 */
export function textoSinAQuienPedir(q: ProveedorDelModelo): { titulo: string; detalle: string } | null {
  if (q.fuente === "ninguno") return { titulo: "Sin proveedor", detalle: FUENTE_CORTA.ninguno };
  if (q.fuente === "archivado") return { titulo: "Sin proveedor activo", detalle: FUENTE_CORTA.archivado };
  return null;
}

/** Un proveedor (o el Taller, o «Sin proveedor») con los modelos que se le piden, del más urgente al menos. */
export type GrupoProveedor<T extends PrendaAnalisis = PrendaAnalisis> = {
  /** `p:<id>` · `taller` · `ninguno`. */
  clave: string;
  nombre: string;
  /** De dónde se sabe, sin repetir y en este orden: compra, catálogo, Taller, ninguno, archivado. Un mismo proveedor puede salir de las dos primeras. */
  fuentes: FuenteProveedor[];
  modelos: T[];
  /** Cuántos ya se agotaron. */
  agotados: number;
  /** Los días que le quedan al más urgente (0 = ya se agotó); null si ninguno tiene ritmo. */
  masUrgente: number | null;
  /** Solo en «Sin proveedor»: los nombres de los proveedores archivados de sus modelos, sin repetir y por orden alfabético. */
  archivados: string[];
};

const ORDEN_FUENTES: readonly FuenteProveedor[] = ["compra", "catalogo", "taller", "ninguno", "archivado"];

/** La clave del grupo «Sin proveedor»: también es donde caen los modelos cuyo proveedor está archivado. */
export const CLAVE_SIN_PROVEEDOR = "ninguno";

/**
 * Los modelos que hay que pedir, agrupados por a quién. Dentro de cada grupo, del más urgente al menos (`ordenSeAcaba`); entre grupos,
 * primero el de quien tiene lo más urgente (lo agotado antes que lo que queda), a igual plazo el que tiene más modelos, después por nombre.
 * «Sin proveedor» va siempre al final: no es alguien a quien se le pueda pedir. Ahí caen también los modelos de un proveedor ARCHIVADO
 * (con `archivados` diciendo cuál): no se le recomienda «Pídelo a …» a quien ya no se le pide.
 */
export function agruparPorProveedor<T extends PrendaAnalisis>(modelos: readonly T[], p: ProveedoresAnalisis): GrupoProveedor<T>[] {
  const grupos = new Map<string, { nombre: string; fuentes: Set<FuenteProveedor>; modelos: T[]; archivados: Set<string> }>();
  for (const m of modelos) {
    const q = proveedorDelModelo(m, p);
    const sin = q.fuente === "ninguno" || q.fuente === "archivado";
    const clave = q.fuente === "taller" ? "taller" : sin ? CLAVE_SIN_PROVEEDOR : `p:${q.id}`;
    const nombre = q.fuente === "taller" ? TEXTO_TALLER : sin ? TEXTO_SIN_PROVEEDOR : q.nombre;
    const g = grupos.get(clave) ?? { nombre, fuentes: new Set<FuenteProveedor>(), modelos: [], archivados: new Set<string>() };
    g.fuentes.add(q.fuente);
    if (q.fuente === "archivado") g.archivados.add(q.nombre);
    g.modelos.push(m);
    grupos.set(clave, g);
  }
  return [...grupos.entries()]
    .map(([clave, g]): GrupoProveedor<T> => {
      const ordenados = [...g.modelos].sort(ordenSeAcaba);
      const dias = ordenados.map((m) => diasQueQuedan(m)).filter((d): d is number => d !== null);
      return {
        clave,
        nombre: g.nombre,
        fuentes: ORDEN_FUENTES.filter((f) => g.fuentes.has(f)),
        modelos: ordenados,
        agotados: ordenados.filter((m) => diasQueQuedan(m) === 0).length,
        masUrgente: dias.length > 0 ? Math.min(...dias) : null,
        archivados: [...g.archivados].sort((a, b) => a.localeCompare(b, "es")),
      };
    })
    .sort(
      (a, b) =>
        Number(a.clave === CLAVE_SIN_PROVEEDOR) - Number(b.clave === CLAVE_SIN_PROVEEDOR) ||
        (a.masUrgente ?? Infinity) - (b.masUrgente ?? Infinity) ||
        b.modelos.length - a.modelos.length ||
        a.nombre.localeCompare(b.nombre, "es"),
    );
}

/** Cuántos proveedores se ven antes de «Ver N más»: con 17 proveedores, la tarjeta no debe empujar nada fuera de la pantalla. */
export const PROVEEDORES_A_LA_VISTA = 4;

/**
 * Qué grupos se ven y cuáles quedan tras «Ver N más» (Felipe 2026-10-16): el tope de `aLaVista` cuenta solo a quienes se les pide;
 * «Sin proveedor» NO cuenta para él y, si trae un agotado, SIEMPRE se ve (`fijo`, al final de la lista, aun con «Ver más» cerrado): un modelo
 * agotado sin a quién pedírselo es justo lo que no puede quedar plegado, porque si nadie elige su proveedor no entra en ninguna compra. Sin
 * ningún agotado, sigue la suerte de los demás: se ve si no hay nada plegado y, si lo hay, va al final de lo plegado.
 */
export function repartirGrupos<G extends Pick<GrupoProveedor, "clave" | "agotados">>(grupos: readonly G[], aLaVista = PROVEEDORES_A_LA_VISTA): { visibles: G[]; resto: G[]; fijo: G | null } {
  const conQuien = grupos.filter((g) => g.clave !== CLAVE_SIN_PROVEEDOR);
  const sin = grupos.find((g) => g.clave === CLAVE_SIN_PROVEEDOR) ?? null;
  const visibles = conQuien.slice(0, aLaVista);
  const resto = conQuien.slice(aLaVista);
  if (!sin) return { visibles, resto, fijo: null };
  if (sin.agotados > 0 || resto.length === 0) return { visibles, resto, fijo: sin };
  return { visibles, resto: [...resto, sin], fijo: null };
}

/** Cuántos proveedores (el Taller cuenta como uno a quien pedirle) y cuántos modelos sin proveedor tienen estos grupos. */
export function resumenDeGrupos(grupos: readonly Pick<GrupoProveedor, "clave" | "modelos">[]): { proveedores: number; sinProveedor: number; modelos: number } {
  const conQuien = grupos.filter((g) => g.clave !== CLAVE_SIN_PROVEEDOR);
  return {
    proveedores: conQuien.length,
    sinProveedor: grupos.filter((g) => g.clave === CLAVE_SIN_PROVEEDOR).reduce((n, g) => n + g.modelos.length, 0),
    modelos: grupos.reduce((n, g) => n + g.modelos.length, 0),
  };
}

/**
 * «Pídelas a 12 proveedores · 3 sin proveedor»; si ninguno tiene proveedor, «Falta elegir el proveedor en el catálogo». null si no hay nada
 * que pedir. Habla solo de lo que aún no viene en camino: el tooltip de «Compra» en Hoy lista esos mismos modelos y no más.
 */
export function textoPidelasA(r: { proveedores: number; sinProveedor: number }): string | null {
  if (r.proveedores === 0 && r.sinProveedor === 0) return null;
  if (r.proveedores === 0) return "Falta elegir el proveedor en el catálogo";
  const quienes = `Pídelas a ${r.proveedores} ${plural(r.proveedores, "proveedor", "proveedores")}`;
  return r.sinProveedor > 0 ? `${quienes} · ${r.sinProveedor} sin proveedor` : quienes;
}

/**
 * Lo que dice la cabecera de «A quién pedir» (el modo «Por proveedor» de «Se está acabando»): «Lo que aún no viene: 8 modelos de 5
 * proveedores». Con modelos sin proveedor, cada cifra dice lo cierto: «Lo que aún no viene: 7 modelos de 5 proveedores y 1 sin proveedor».
 */
export function resumenCabecera(r: { proveedores: number; sinProveedor: number; modelos: number }): string {
  const modelos = (n: number) => `${n} ${plural(n, "modelo", "modelos")}`;
  const aun = "Lo que aún no viene:";
  if (r.proveedores === 0) return `${aun} ${modelos(r.modelos)}, todos sin proveedor`;
  const conQuien = r.modelos - r.sinProveedor;
  const base = `${aun} ${modelos(conQuien)} de ${r.proveedores} ${plural(r.proveedores, "proveedor", "proveedores")}`;
  return r.sinProveedor > 0 ? `${base} y ${r.sinProveedor} sin proveedor` : base;
}

/** Lo que dice cada proveedor de sus modelos: «3 modelos · 1 agotado». */
export function textoModelosDelGrupo(g: Pick<GrupoProveedor, "modelos" | "agotados">): string {
  const n = g.modelos.length;
  const modelos = `${n} ${plural(n, "modelo", "modelos")}`;
  return g.agotados > 0 ? `${modelos} · ${g.agotados} ${plural(g.agotados, "agotado", "agotados")}` : modelos;
}

/** De dónde se sabe el proveedor de un grupo, en una frase corta: si mezcla compra y catálogo, lo dice. */
export function textoFuentesDelGrupo(fuentes: readonly FuenteProveedor[]): string {
  if (fuentes.length === 0) return "";
  if (fuentes.length === 1) return FUENTE_CORTA[fuentes[0]!];
  if (fuentes.length === 2 && fuentes.includes("compra") && fuentes.includes("catalogo")) return `${FUENTE_CORTA.compra} · ${FUENTE_CORTA.catalogo}`;
  return fuentes.map((f) => FUENTE_CORTA[f]).join(" · ");
}
