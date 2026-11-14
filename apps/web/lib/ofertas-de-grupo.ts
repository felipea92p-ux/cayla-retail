import { descuentoUnitarioPorPorcentaje } from "./vender-reglas";
import { titularDeOferta } from "./campana-reglas";

/**
 * «Llevar varias y pagar menos» (ADR-0655, actividad 6): el 3x2, «N por S/ X» y «la N.ª al X %».
 *
 * ES LA MISMA REGLA, AL CÉNTIMO, QUE `retail.fn_ofertas_de_grupo` (20261114003000): la caja la usa para mostrar el ticket y `registrar_venta`
 * la vuelve a hacer para exigirla y validarla (parte 3). Si divergen, la venta se rechaza en el mostrador. Las dos se prueban con los mismos
 * ejemplos (`ofertas-de-grupo.test.ts` y `scripts/pruebas/ofertas_de_grupo.mjs`).
 *
 * Decisiones de Felipe (2026-11-13):
 *   · varios grupos: de la más cara a la más barata (empate: el orden del ticket), en grupos de N; lo que no completa un grupo paga su precio;
 *   · el ahorro de cada grupo se reparte entre sus prendas en proporción a su precio, en céntimos exactos (lo que sobra, a las de mayor resto);
 *   · en el 3x2, las N−M más baratas de cada grupo van gratis; en «la N.ª al X %», la más barata lleva X % menos con el redondeo de la caja.
 *
 * Va en céntimos enteros, nunca en coma flotante: 79.90 · 49.90 · 39.90 en 3x2 tiene que dar 18.79 · 11.73 · 9.38 aquí y en la base.
 */

export type TipoDeGrupo = "nxm" | "n_por_monto" | "nesima_pct";

/** Una oferta de grupo, como la devuelve la base. */
export type OfertaDeGrupo = {
  reglaId: string;
  tipo: TipoDeGrupo;
  /** Cuántas prendas arman un grupo. */
  lleva: number;
  /** En «lleva N, paga M», M. */
  paga: number | null;
  /** En «N por S/ X», X. */
  monto: number | null;
  /** En «la N.ª al X %», X. */
  porcentaje: number | null;
  /** Con qué se arma el grupo: cualquier prenda de la oferta o solo del mismo modelo. */
  agrupa: "campana" | "modelo";
};

/** Una línea del ticket: su precio por unidad, cuántas lleva, la oferta de grupo que rige para esa prenda (o ninguna) y su modelo. */
export type LineaDeGrupo = { precio: number; cantidad: number; oferta: OfertaDeGrupo | null; modeloId?: string | null };

/** Lo que la regla dice de una línea con oferta de grupo: cuánto ahorra (todas sus unidades) y cuántas le faltan al último grupo. */
export type GrupoDeLinea = { reglaId: string; descuento: number; faltan: number };

type Unidad = { linea: number; u: number; cent: number; clave: string; oferta: OfertaDeGrupo };

/** Para cada línea, en el mismo orden: su parte del ahorro, o `null` si su prenda no tiene oferta de grupo. */
export function ofertasDeGrupo(lineas: readonly LineaDeGrupo[]): (GrupoDeLinea | null)[] {
  const unidades: Unidad[] = [];
  lineas.forEach((l, i) => {
    if (!l.oferta) return;
    const clave = `${l.oferta.reglaId}|${l.oferta.agrupa === "modelo" ? (l.modeloId ?? "") : ""}`;
    for (let u = 1; u <= Math.max(0, Math.trunc(l.cantidad)); u++) {
      unidades.push({ linea: i, u, cent: Math.round(l.precio * 100), clave, oferta: l.oferta });
    }
  });

  const parteDe = new Map<number, number>(); // línea → céntimos
  const faltanDe = new Map<string, number>(); // clave → cuántas le faltan al último grupo
  const cubos = new Map<string, Unidad[]>();
  for (const x of unidades) cubos.set(x.clave, [...(cubos.get(x.clave) ?? []), x]);

  for (const [clave, cubo] of cubos) {
    const n = cubo[0].oferta.lleva;
    // De la más cara a la más barata; empate: el orden del ticket.
    const orden = [...cubo].sort((a, b) => b.cent - a.cent || a.linea - b.linea || a.u - b.u);
    faltanDe.set(clave, orden.length % n === 0 ? 0 : n - (orden.length % n));
    const completos = Math.floor(orden.length / n);
    for (let g = 0; g < completos; g++) {
      const grupo = orden.slice(g * n, g * n + n);
      const ahorro = ahorroDelGrupo(grupo.map((x) => x.cent), grupo[0].oferta);
      for (const [j, parte] of repartir(ahorro, grupo.map((x) => x.cent)).entries()) {
        parteDe.set(grupo[j].linea, (parteDe.get(grupo[j].linea) ?? 0) + parte);
      }
    }
  }

  return lineas.map((l, i) => {
    if (!l.oferta || Math.trunc(l.cantidad) <= 0) return null;
    const clave = `${l.oferta.reglaId}|${l.oferta.agrupa === "modelo" ? (l.modeloId ?? "") : ""}`;
    return { reglaId: l.oferta.reglaId, descuento: (parteDe.get(i) ?? 0) / 100, faltan: faltanDe.get(clave) ?? 0 };
  });
}

/** Lo que regala un grupo completo (precios de la más cara a la más barata), en céntimos. */
function ahorroDelGrupo(centDesc: readonly number[], o: OfertaDeGrupo): number {
  const suma = centDesc.reduce((a, b) => a + b, 0);
  if (o.tipo === "nxm") return centDesc.slice(o.paga ?? centDesc.length).reduce((a, b) => a + b, 0);
  if (o.tipo === "n_por_monto") return Math.max(suma - Math.round((o.monto ?? 0) * 100), 0);
  const masBarata = centDesc[centDesc.length - 1];
  return Math.round(descuentoUnitarioPorPorcentaje(masBarata / 100, o.porcentaje ?? 0) * 100);
}

/** El ahorro repartido en proporción al precio, en céntimos exactos: la base entera y lo que sobra, uno a uno, a las de mayor resto
 *  (empate: la que va antes, de la más cara a la más barata). La suma es siempre el ahorro. */
function repartir(ahorro: number, cent: readonly number[]): number[] {
  const total = cent.reduce((a, b) => a + b, 0);
  if (total <= 0 || ahorro <= 0) return cent.map(() => 0);
  const base = cent.map((c) => Math.floor((ahorro * c) / total));
  const resto = cent.map((c) => (ahorro * c) % total);
  let falta = ahorro - base.reduce((a, b) => a + b, 0);
  const orden = cent.map((_, i) => i).sort((a, b) => resto[b] - resto[a] || a - b);
  for (const i of orden) {
    if (falta <= 0) break;
    base[i] += 1;
    falta -= 1;
  }
  return base;
}

// ---- «Así funciona en la caja»: un ejemplo con prendas de verdad (la hoja de la oferta, ADR-0655) -------------------------------------

/** Una prenda que la oferta alcanza, para armar el ejemplo: su nombre (el del modelo), su precio y su modelo. */
export type PrendaParaEjemplo = { nombre: string; precio: number; productoId?: string | null };

/** Un grupo de ejemplo cobrado con la regla de la caja: cada prenda con lo que paga, y el total. */
export type EjemploDeGrupo = { lineas: { nombre: string; precio: number; paga: number }[]; total: number; paga: number; ahorro: number };

/** Arma un grupo de ejemplo con las prendas que la oferta alcanza y lo cobra con `ofertasDeGrupo`. Con «cualquier prenda», las N más caras de
 *  modelos distintos (si no hay N modelos, repite); con «del mismo modelo», N del modelo más caro. `null` si la oferta no alcanza ninguna. */
export function ejemploDeGrupo(prendas: readonly PrendaParaEjemplo[], oferta: OfertaDeGrupo): EjemploDeGrupo | null {
  const validas = prendas.filter((p) => Number.isFinite(p.precio) && p.precio > 0);
  if (validas.length === 0 || oferta.lleva < 1) return null;
  // Un modelo una vez, con su precio más alto, de la más cara a la más barata (empate: por nombre, para que el ejemplo no cambie solo).
  const porModelo = new Map<string, PrendaParaEjemplo>();
  for (const p of validas) {
    const clave = p.productoId ?? p.nombre;
    const ya = porModelo.get(clave);
    if (!ya || p.precio > ya.precio) porModelo.set(clave, p);
  }
  const modelos = [...porModelo.values()].sort((a, b) => b.precio - a.precio || a.nombre.localeCompare(b.nombre, "es"));
  const elegidas = oferta.agrupa === "modelo" ? Array.from({ length: oferta.lleva }, () => modelos[0]) : Array.from({ length: oferta.lleva }, (_, i) => modelos[i % modelos.length]);
  const grupos = ofertasDeGrupo(elegidas.map((p) => ({ precio: p.precio, cantidad: 1, oferta, modeloId: p.productoId ?? p.nombre })));
  const lineas = elegidas.map((p, i) => ({ nombre: p.nombre, precio: p.precio, paga: (Math.round(p.precio * 100) - Math.round((grupos[i]?.descuento ?? 0) * 100)) / 100 }));
  const totalC = elegidas.reduce((a, p) => a + Math.round(p.precio * 100), 0);
  const pagaC = lineas.reduce((a, l) => a + Math.round(l.paga * 100), 0);
  return { lineas, total: totalC / 100, paga: pagaC / 100, ahorro: (totalC - pagaC) / 100 };
}

// ---- La caja: el carrito con sus grupos (ADR-0655, actividad 6, parte 3) --------------------------------------------------------------

/** La oferta de grupo que rige hoy para una prenda en la tienda (`ofertas_de_grupo_vigentes`), con su modelo y su nombre. */
export type OfertaDeGrupoDeVariante = OfertaDeGrupo & { modeloId: string | null; nombre: string; titular: string };

/** Lo que el ticket dice de una línea con oferta de grupo: la oferta, cuánto ahorra la línea y cuántas prendas faltan para otro grupo. */
export type GrupoEnTicket = { titular: string; nombre: string; ahorro: number; faltan: number };

type LineaCobrable = { claveLinea: string; varianteId: string; cantidad: number; precioUnitario: number; descuentoUnitario: number };

/** Una línea que viaja a `registrar_venta`: su descuento ya trae la parte del grupo, que va también aparte con su oferta. */
export type ConGrupo<L> = L & { descuentoGrupoUnitario: number; ofertaGrupoId: string | null };

/**
 * El carrito como se cobra: cada prenda de una oferta de grupo en su propia línea (cantidad 1), con su parte del ahorro sumada a su descuento
 * —el de la caja o el puesto a mano: se SUMAN, Felipe 2026-11-13—. Una línea de varias unidades no cabe en un descuento por unidad cuando sus
 * prendas quedan en partes distintas, y `registrar_venta` lo exige; las demás líneas viajan como siempre. Es el mismo orden que ve la base,
 * así que la cuenta es la misma (`fn_ofertas_de_grupo`). `porLinea` es lo que el ticket dice de cada línea con oferta de grupo.
 */
export function carritoConGrupos<L extends LineaCobrable>(
  carrito: readonly L[],
  ofertas: Readonly<Record<string, OfertaDeGrupoDeVariante>>,
): { lineas: ConGrupo<L>[]; porLinea: Map<string, GrupoEnTicket> } {
  const lineas: ConGrupo<L>[] = [];
  for (const l of carrito) {
    const oferta = ofertas[l.varianteId];
    if (!oferta) {
      lineas.push({ ...l, descuentoGrupoUnitario: 0, ofertaGrupoId: null });
      continue;
    }
    for (let u = 0; u < Math.max(0, Math.trunc(l.cantidad)); u++) lineas.push({ ...l, cantidad: 1, descuentoGrupoUnitario: 0, ofertaGrupoId: null });
  }
  const grupos = ofertasDeGrupo(
    lineas.map((l) => {
      const o = ofertas[l.varianteId];
      return { precio: l.precioUnitario, cantidad: l.cantidad, oferta: o ?? null, modeloId: o?.modeloId ?? null };
    }),
  );
  const porLinea = new Map<string, GrupoEnTicket>();
  const conGrupo = lineas.map((l, i) => {
    const g = grupos[i];
    const o = ofertas[l.varianteId];
    if (!g || !o) return l;
    const ya = porLinea.get(l.claveLinea);
    porLinea.set(l.claveLinea, { titular: o.titular, nombre: o.nombre, ahorro: (Math.round((ya?.ahorro ?? 0) * 100) + Math.round(g.descuento * 100)) / 100, faltan: g.faltan });
    if (g.descuento <= 0) return l;
    return {
      ...l,
      descuentoUnitario: (Math.round(l.descuentoUnitario * 100) + Math.round(g.descuento * 100)) / 100,
      descuentoGrupoUnitario: g.descuento,
      ofertaGrupoId: g.reglaId,
    };
  });
  return { lineas: conGrupo, porLinea };
}

// ---- Los apartados: la misma cuenta, con el orden de la base (ADR-0655, actividad 6, parte 4) -----------------------------------------

/** Una línea de Apartar: junta las unidades de una misma prenda (variante). */
type LineaApartada = { varianteId: string; cantidad: number; precio: number };

/** Lo que el apartado dice de una prenda con oferta de grupo: la del ticket, más la oferta y lo que ahorra TODA la línea (va en
 *  `p_items.descuento_grupo`). */
export type GrupoEnApartado = GrupoEnTicket & { ofertaGrupoId: string };

/**
 * Un apartado con sus grupos: la cuenta de `separar_prendas` (20261114032000). Cada prenda va de a una y en el orden de la base —de la más
 * cara a la más barata y, a igual precio, por prenda—, no en el del ticket: `separacion_items` no guarda en qué orden se escanearon, y al
 * editar el apartado la base vuelve a armar los grupos con ese orden. Si divergen, `separar_prendas` lo rechaza
 * (`separacion_grupo_no_coincide`). `ahorro` es lo que ahorra todo el apartado.
 */
export function apartadoConGrupos(
  lineas: readonly LineaApartada[],
  ofertas: Readonly<Record<string, OfertaDeGrupoDeVariante>>,
): { porVariante: Map<string, GrupoEnApartado>; ahorro: number } {
  // Más de 10 de una prenda la base no la cuenta: el tope por prenda la rechaza antes (son 2).
  const unidades = lineas.flatMap((l) => (ofertas[l.varianteId] ? Array.from({ length: Math.max(0, Math.min(Math.trunc(l.cantidad), 10)) }, () => l) : []));
  // A igual precio, por prenda: el orden de un uuid en Postgres es el de su texto en minúsculas.
  const orden = [...unidades].sort(
    (a, b) => Math.round(b.precio * 100) - Math.round(a.precio * 100) || (a.varianteId < b.varianteId ? -1 : a.varianteId > b.varianteId ? 1 : 0),
  );
  const grupos = ofertasDeGrupo(orden.map((u) => ({ precio: u.precio, cantidad: 1, oferta: ofertas[u.varianteId], modeloId: ofertas[u.varianteId].modeloId })));
  const porVariante = new Map<string, GrupoEnApartado>();
  let ahorroC = 0;
  orden.forEach((u, i) => {
    const g = grupos[i];
    const o = ofertas[u.varianteId];
    if (!g) return;
    const ya = porVariante.get(u.varianteId);
    const parteC = Math.round(g.descuento * 100);
    ahorroC += parteC;
    porVariante.set(u.varianteId, { titular: o.titular, nombre: o.nombre, ahorro: (Math.round((ya?.ahorro ?? 0) * 100) + parteC) / 100, faltan: g.faltan, ofertaGrupoId: o.reglaId });
  });
  return { porVariante, ahorro: ahorroC / 100 };
}

/** Una fila de `ofertas_de_grupo_vigentes(sede)` (20261114011000). */
export type FilaOfertaDeGrupo = {
  variante_id: string;
  regla_id: string;
  producto_id: string | null;
  tipo: string;
  lleva: number;
  paga: number | null;
  monto: number | string | null;
  porcentaje: number | string | null;
  agrupa: string;
  oferta_nombre: string;
  etiqueta_nombre: string;
};

/** Las filas de la base, por prenda, como las usa la caja. Una fila con una forma que esta web no conoce se ignora (la base la rechazaría
 *  igual al cobrar, pero no se cobra lo que no se sabe mostrar). */
export function ofertasDeGrupoDeFilas(filas: readonly FilaOfertaDeGrupo[] | null | undefined): Record<string, OfertaDeGrupoDeVariante> {
  const por: Record<string, OfertaDeGrupoDeVariante> = {};
  for (const f of filas ?? []) {
    if (f.tipo !== "nxm" && f.tipo !== "n_por_monto" && f.tipo !== "nesima_pct") continue;
    const forma = { tipo: f.tipo, lleva: Number(f.lleva), paga: f.paga === null ? null : Number(f.paga), monto: f.monto === null ? null : Number(f.monto), porcentaje: f.porcentaje === null ? null : Number(f.porcentaje) } as const;
    por[f.variante_id] = {
      reglaId: f.regla_id,
      ...forma,
      agrupa: f.agrupa === "modelo" ? "modelo" : "campana",
      modeloId: f.producto_id,
      nombre: f.etiqueta_nombre,
      titular: titularDeOferta({ tipo: forma.tipo, lleva: forma.lleva, paga: forma.paga ?? 0, monto: forma.monto ?? 0, porcentaje: forma.porcentaje ?? 0 }),
    };
  }
  return por;
}
