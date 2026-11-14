import { descuentoDeCampana, descuentoUnitarioPorPorcentaje, RAZON_CAMPANA } from "./vender-reglas";
import { escalonesDeFila, titularDeEscalon, titularDeMonto, titularDeOferta } from "./campana-reglas";

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

export type TipoDeGrupo = "nxm" | "n_por_monto" | "nesima_pct" | "monto";

/** Un escalón de «Gastar un monto y ahorrar» (ADR-0655, actividad 8): desde cuánto suma la compra y cuánto ahorra (soles o %). */
export type Escalon = { desde: number; ahorra: number };

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
  /** En un monto: sus escalones (de menor a mayor) y si ahorra en soles o en %. Todas sus prendas son un solo grupo. */
  escalones?: readonly Escalon[];
  ahorroEn?: "soles" | "pct";
};

/** Cómo va un monto en el ticket: el escalón alcanzado (o ninguno) y lo que falta para el siguiente. */
export type EnMonto = { ahorroEn: "soles" | "pct"; alcanzado: Escalon | null; siguiente: { escalon: Escalon; falta: number } | null };

/** Una línea del ticket: su precio por unidad, cuántas lleva, la oferta de grupo que rige para esa prenda (o ninguna) y su modelo. `rebaja`:
 *  lo que le ahorra por unidad su rebaja de campaña (el «% menos»), si la tiene; con ella la cuenta elige la que más ahorra (decisión 2). */
export type LineaDeGrupo = { precio: number; cantidad: number; oferta: OfertaDeGrupo | null; modeloId?: string | null; rebaja?: number };

/** Lo que la regla dice de una línea con oferta de grupo: cuánto ahorra (todas sus unidades) y cuántas le faltan al último grupo (en un
 *  monto, 0: lo que le falta va en soles, en `monto`). Con `descuento` > 0 la línea va con su grupo y deja su rebaja: nunca las dos. */
export type GrupoDeLinea = { reglaId: string; descuento: number; faltan: number; monto?: EnMonto };

type Unidad = { linea: number; u: number; cent: number; clave: string; oferta: OfertaDeGrupo };

const claveDeLinea = (l: LineaDeGrupo & { oferta: OfertaDeGrupo }) => `${l.oferta.reglaId}|${l.oferta.agrupa === "modelo" ? (l.modeloId ?? "") : ""}`;

/**
 * Para cada línea, en el mismo orden: su parte del ahorro, o `null` si su prenda no tiene oferta de grupo.
 *
 * Decisión 2 de Felipe (2026-11-14, «como Shopify: la mejor»): una prenda con rebaja y oferta de grupo lleva la que más le ahorra al cliente
 * en esta compra, nunca las dos. Por cada oferta (y modelo, si arma por modelo) se comparan dos cuentas: A, todas van con la oferta (la que
 * no completa un grupo conserva su rebaja); B, las rebajadas se quedan con su rebaja y no entran. Gana la que más ahorra; si empatan, B.
 * Es LA MISMA REGLA, al céntimo, que `retail.fn_repartir_grupos` (20261114155000).
 */
export function ofertasDeGrupo(lineas: readonly LineaDeGrupo[]): (GrupoDeLinea | null)[] {
  const a = cuentaDeGrupos(lineas);
  // La rebaja de toda la línea, en céntimos; un monto nunca la tiene (con rebaja la prenda no cuenta para él).
  const rebajaDe = (l: LineaDeGrupo) =>
    l.oferta && l.oferta.tipo !== "monto" ? Math.max(0, Math.round((l.rebaja ?? 0) * 100)) * Math.max(0, Math.trunc(l.cantidad)) : 0;
  if (!lineas.some((l) => rebajaDe(l) > 0)) return a;
  const b = cuentaDeGrupos(lineas.map((l) => (rebajaDe(l) > 0 ? { ...l, oferta: null } : l)));
  const cubos = new Map<string, { conA: number; conB: number; hayRebaja: boolean }>();
  lineas.forEach((l, i) => {
    if (!l.oferta || Math.trunc(l.cantidad) <= 0) return;
    const clave = claveDeLinea({ ...l, oferta: l.oferta });
    const c = cubos.get(clave) ?? { conA: 0, conB: 0, hayRebaja: false };
    const rebaja = rebajaDe(l);
    const parteA = Math.round((a[i]?.descuento ?? 0) * 100);
    c.conA += parteA > 0 ? parteA : rebaja;
    c.conB += rebaja > 0 ? rebaja : Math.round((b[i]?.descuento ?? 0) * 100);
    c.hayRebaja ||= rebaja > 0;
    cubos.set(clave, c);
  });
  return lineas.map((l, i) => {
    const conA = a[i];
    if (!conA || !l.oferta) return conA;
    const c = cubos.get(claveDeLinea({ ...l, oferta: l.oferta }));
    if (!c?.hayRebaja || c.conB < c.conA) return conA;
    return { ...conA, descuento: rebajaDe(l) > 0 ? 0 : (b[i]?.descuento ?? 0) };
  });
}

/** La cuenta de siempre, sin rebajas: los grupos de la más cara a la más barata y su ahorro repartido (`retail.fn_cuenta_de_grupos`). */
function cuentaDeGrupos(lineas: readonly LineaDeGrupo[]): (GrupoDeLinea | null)[] {
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
  const montoDe = new Map<string, EnMonto>(); // clave → cómo va el monto
  const cubos = new Map<string, Unidad[]>();
  for (const x of unidades) cubos.set(x.clave, [...(cubos.get(x.clave) ?? []), x]);

  for (const [clave, cubo] of cubos) {
    const n = cubo[0].oferta.lleva;
    // De la más cara a la más barata; empate: el orden del ticket.
    const orden = [...cubo].sort((a, b) => b.cent - a.cent || a.linea - b.linea || a.u - b.u);
    // Un monto (actividad 8): todas sus prendas son un grupo; vale el escalón más alto al que llega la suma, repartido como el 3x2.
    if (cubo[0].oferta.tipo === "monto") {
      const o = cubo[0].oferta;
      const totalC = orden.reduce((a, x) => a + x.cent, 0);
      const escalones = [...(o.escalones ?? [])].sort((a, b) => a.desde - b.desde);
      const alcanzado = escalones.filter((e) => Math.round(e.desde * 100) <= totalC).at(-1) ?? null;
      const siguiente = escalones.find((e) => Math.round(e.desde * 100) > totalC) ?? null;
      const ahorroEn = o.ahorroEn === "pct" ? "pct" : "soles";
      montoDe.set(clave, { ahorroEn, alcanzado, siguiente: siguiente ? { escalon: siguiente, falta: (Math.round(siguiente.desde * 100) - totalC) / 100 } : null });
      faltanDe.set(clave, 0);
      if (!alcanzado) continue;
      const ahorro =
        ahorroEn === "pct"
          ? Math.round(descuentoUnitarioPorPorcentaje(totalC / 100, alcanzado.ahorra) * 100)
          : Math.min(Math.round(alcanzado.ahorra * 100), totalC);
      for (const [j, parte] of repartir(ahorro, orden.map((x) => x.cent)).entries()) {
        parteDe.set(orden[j].linea, (parteDe.get(orden[j].linea) ?? 0) + parte);
      }
      continue;
    }
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
    const monto = montoDe.get(clave);
    return { reglaId: l.oferta.reglaId, descuento: (parteDe.get(i) ?? 0) / 100, faltan: faltanDe.get(clave) ?? 0, ...(monto ? { monto } : {}) };
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
  const modelos = modelosParaEjemplo(prendas);
  if (modelos.length === 0 || oferta.lleva < 1) return null;
  const elegidas = oferta.agrupa === "modelo" ? Array.from({ length: oferta.lleva }, () => modelos[0]) : Array.from({ length: oferta.lleva }, (_, i) => modelos[i % modelos.length]);
  return cobrarEjemplo(elegidas, oferta);
}

/** Un modelo una vez, con su precio más alto, de la más cara a la más barata (empate: por nombre, para que el ejemplo no cambie solo). */
function modelosParaEjemplo(prendas: readonly PrendaParaEjemplo[]): PrendaParaEjemplo[] {
  const porModelo = new Map<string, PrendaParaEjemplo>();
  for (const p of prendas.filter((x) => Number.isFinite(x.precio) && x.precio > 0)) {
    const clave = p.productoId ?? p.nombre;
    const ya = porModelo.get(clave);
    if (!ya || p.precio > ya.precio) porModelo.set(clave, p);
  }
  return [...porModelo.values()].sort((a, b) => b.precio - a.precio || a.nombre.localeCompare(b.nombre, "es"));
}

/** Las prendas elegidas cobradas con `ofertasDeGrupo`: lo que paga cada una y el total. */
function cobrarEjemplo(elegidas: readonly PrendaParaEjemplo[], oferta: OfertaDeGrupo): EjemploDeGrupo {
  const grupos = ofertasDeGrupo(elegidas.map((p) => ({ precio: p.precio, cantidad: 1, oferta, modeloId: p.productoId ?? p.nombre })));
  const lineas = elegidas.map((p, i) => ({ nombre: p.nombre, precio: p.precio, paga: (Math.round(p.precio * 100) - Math.round((grupos[i]?.descuento ?? 0) * 100)) / 100 }));
  const totalC = elegidas.reduce((a, p) => a + Math.round(p.precio * 100), 0);
  const pagaC = lineas.reduce((a, l) => a + Math.round(l.paga * 100), 0);
  return { lineas, total: totalC / 100, paga: pagaC / 100, ahorro: (totalC - pagaC) / 100 };
}

/** El ejemplo de un monto (la hoja, actividad 8): las prendas más caras de modelos distintos hasta llegar al primer escalón (a lo más 6; si
 *  no alcanzan, se repite la más cara), cobradas con la cuenta de la caja. `null` si la oferta no alcanza ninguna prenda. */
export function ejemploDeMonto(prendas: readonly PrendaParaEjemplo[], oferta: OfertaDeGrupo): EjemploDeGrupo | null {
  const modelos = modelosParaEjemplo(prendas);
  if (modelos.length === 0) return null;
  const umbralC = Math.round(([...(oferta.escalones ?? [])].sort((a, b) => a.desde - b.desde)[0]?.desde ?? 0) * 100);
  const elegidas: PrendaParaEjemplo[] = [];
  let sumaC = 0;
  for (let i = 0; elegidas.length < 6 && (sumaC < umbralC || elegidas.length === 0); i++) {
    const p = modelos[i] ?? modelos[0];
    elegidas.push(p);
    sumaC += Math.round(p.precio * 100);
  }
  return cobrarEjemplo(elegidas, oferta);
}

// ---- La caja: el carrito con sus grupos (ADR-0655, actividad 6, parte 3) --------------------------------------------------------------

/** La oferta de grupo que rige hoy para una prenda en la tienda (`ofertas_de_grupo_vigentes`), con su modelo y su nombre. */
export type OfertaDeGrupoDeVariante = OfertaDeGrupo & { modeloId: string | null; nombre: string; titular: string };

/** Lo que el ticket dice de una línea con oferta de grupo: la oferta, cuánto ahorra la línea y cuántas prendas faltan para otro grupo (en un
 *  monto, cómo va: el escalón alcanzado y lo que falta para el siguiente). */
export type GrupoEnTicket = {
  titular: string;
  nombre: string;
  ahorro: number;
  faltan: number;
  monto?: EnMonto;
  /** Decisión 2: las prendas de la línea que van con el grupo en vez de su rebaja (el % de esa rebaja, cuántas y de cuántas). */
  sinRebaja?: { pct: number; unidades: number; de: number };
};

/** Un «Gastar un monto y ahorrar» que rige hoy en la tienda (`ofertas_de_monto_vigentes`, actividad 8): uno de la campaña con las prendas que
 *  alcanza; uno de toda la compra con las que NO. */
export type OfertaDeMontoVigente = OfertaDeGrupoDeVariante & {
  cuenta: "campana" | "compra";
  variantes: ReadonlySet<string> | null;
  excluidas: ReadonlySet<string>;
};

/** El monto que rige para una prenda (el más antiguo que la alcanza: el orden de la base), o `null`. Quien llama ya sabe que la prenda no
 *  tiene un «% menos» ni una oferta de grupo: esas no cuentan para el monto (decisión 3 de Felipe). */
export function montoDeVariante(montos: readonly OfertaDeMontoVigente[], varianteId: string): OfertaDeMontoVigente | null {
  return montos.find((m) => (m.cuenta === "compra" ? !m.excluidas.has(varianteId) : (m.variantes?.has(varianteId) ?? false))) ?? null;
}

/** Lo que el ticket dice de una prenda de un monto: «S/ 30 menos desde S/ 300» (el escalón alcanzado o, si no llega, el primero). */
function titularEnMonto(o: OfertaDeGrupoDeVariante, m: EnMonto | undefined): string {
  if (!m?.alcanzado) return o.titular;
  return titularDeEscalon(m.alcanzado, m.ahorroEn);
}

type LineaCobrable = {
  claveLinea: string;
  varianteId: string;
  cantidad: number;
  precioUnitario: number;
  descuentoUnitario: number;
  campana?: unknown;
  razonDescuento?: string;
};

/** El % de la campaña de una línea, si lo trae (`CampanaLinea`). */
function pctDeCampana(campana: unknown): number {
  const pct = campana && typeof campana === "object" ? (campana as { pct?: unknown }).pct : null;
  return typeof pct === "number" && pct > 0 ? pct : 0;
}

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
  montos: readonly OfertaDeMontoVigente[] = [],
): { lineas: ConGrupo<L>[]; porLinea: Map<string, GrupoEnTicket> } {
  // La oferta de cada prenda: la de grupo; si no tiene, un monto, salvo que tenga un «% menos» (no cuenta para el monto, decisión 3).
  const ofertaDe = (l: L): OfertaDeGrupoDeVariante | null => ofertas[l.varianteId] ?? (l.campana ? null : montoDeVariante(montos, l.varianteId));
  const lineas: ConGrupo<L>[] = [];
  for (const l of carrito) {
    const oferta = ofertaDe(l);
    if (!oferta) {
      lineas.push({ ...l, descuentoGrupoUnitario: 0, ofertaGrupoId: null });
      continue;
    }
    for (let u = 0; u < Math.max(0, Math.trunc(l.cantidad)); u++) lineas.push({ ...l, cantidad: 1, descuentoGrupoUnitario: 0, ofertaGrupoId: null });
  }
  const ofertaDeLinea = lineas.map((l) => ofertaDe(l));
  const grupos = ofertasDeGrupo(
    lineas.map((l, i) => {
      const o = ofertaDeLinea[i];
      // Decisión 2: la rebaja de su campaña (la que la caja le pone), para que la cuenta elija la que más ahorra.
      const pct = pctDeCampana(l.campana);
      return { precio: l.precioUnitario, cantidad: l.cantidad, oferta: o ?? null, modeloId: o?.modeloId ?? null, rebaja: pct > 0 ? descuentoDeCampana(l.precioUnitario, pct) : 0 };
    }),
  );
  const porLinea = new Map<string, GrupoEnTicket>();
  const conGrupo = lineas.map((l, i) => {
    const g = grupos[i];
    const o = ofertaDeLinea[i];
    if (!g || !o) return l;
    const ya = porLinea.get(l.claveLinea);
    // Una prenda que va con su grupo deja su rebaja (nunca las dos); un descuento a mano sí se suma a su parte (Felipe 2026-11-13).
    const dejaRebaja = g.descuento > 0 && l.descuentoUnitario > 0 && l.razonDescuento === RAZON_CAMPANA;
    const pct = pctDeCampana(l.campana);
    const sinRebaja = pct > 0 ? { pct, unidades: (ya?.sinRebaja?.unidades ?? 0) + (dejaRebaja ? 1 : 0), de: (ya?.sinRebaja?.de ?? 0) + 1 } : undefined;
    porLinea.set(l.claveLinea, {
      titular: titularEnMonto(o, g.monto),
      nombre: o.nombre,
      ahorro: (Math.round((ya?.ahorro ?? 0) * 100) + Math.round(g.descuento * 100)) / 100,
      faltan: g.faltan,
      ...(g.monto ? { monto: g.monto } : {}),
      ...(sinRebaja && sinRebaja.unidades > 0 ? { sinRebaja } : {}),
    });
    if (g.descuento <= 0) return l;
    const base = dejaRebaja ? 0 : l.descuentoUnitario;
    return {
      ...l,
      ...(dejaRebaja ? { razonDescuento: "", razonDescuentoOtro: "", argumentoDescuento: "" } : {}),
      descuentoUnitario: (Math.round(base * 100) + Math.round(g.descuento * 100)) / 100,
      descuentoGrupoUnitario: g.descuento,
      ofertaGrupoId: g.reglaId,
    };
  });
  return { lineas: conGrupo, porLinea };
}

/** Cómo se dibuja una línea del ticket (decisión 2): las prendas que van con su grupo en vez de su rebaja, sin la rebaja (lo que ahorra el
 *  grupo lo dice su pie). Si todas van, la línea va sin rebaja; si alguna la conserva («en 3 de 4»), la línea lleva solo la de esas: su
 *  importe es lo que de verdad se cobra antes del grupo, y el total del ticket cuadra a la vista. */
export function lineaSinSuRebaja<L extends { cantidad: number; descuentoUnitario: number; razonDescuento: string }>(l: L, g: GrupoEnTicket | undefined): L {
  if (!g?.sinRebaja || l.razonDescuento !== RAZON_CAMPANA || l.cantidad <= 0) return l;
  const conRebaja = Math.max(0, l.cantidad - g.sinRebaja.unidades);
  if (conRebaja === 0) return { ...l, descuentoUnitario: 0, razonDescuento: "" };
  return { ...l, descuentoUnitario: (l.descuentoUnitario * conRebaja) / l.cantidad };
}

// ---- Los apartados: la misma cuenta, con el orden de la base (ADR-0655, actividad 6, parte 4) -----------------------------------------

/** Una línea de Apartar: junta las unidades de una misma prenda (variante). `rebaja`: lo que le ahorra por unidad su campaña, si la tiene. */
type LineaApartada = { varianteId: string; cantidad: number; precio: number; rebaja?: number; rebajaPct?: number };

/** Lo que el apartado dice de una prenda con oferta de grupo: la del ticket, más la oferta y lo que ahorra TODA la línea (va en
 *  `p_items.descuento_grupo`). `dejaRebaja`: la rebaja que dejan las de la línea que van con su grupo (decisión 2: nunca las dos; la base la
 *  saca de cada fila y no la cobra). */
export type GrupoEnApartado = GrupoEnTicket & { ofertaGrupoId: string; dejaRebaja: number };

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
  const grupos = ofertasDeGrupo(
    orden.map((u) => ({ precio: u.precio, cantidad: 1, oferta: ofertas[u.varianteId], modeloId: ofertas[u.varianteId].modeloId, rebaja: u.rebaja ?? 0 })),
  );
  const porVariante = new Map<string, GrupoEnApartado>();
  let ahorroC = 0;
  orden.forEach((u, i) => {
    const g = grupos[i];
    const o = ofertas[u.varianteId];
    if (!g) return;
    const ya = porVariante.get(u.varianteId);
    const parteC = Math.round(g.descuento * 100);
    ahorroC += parteC;
    const dejaC = parteC > 0 ? Math.round((u.rebaja ?? 0) * 100) : 0;
    const conRebaja = (u.rebaja ?? 0) > 0;
    const sinRebaja = conRebaja
      ? { pct: u.rebajaPct ?? 0, unidades: (ya?.sinRebaja?.unidades ?? 0) + (dejaC > 0 ? 1 : 0), de: (ya?.sinRebaja?.de ?? 0) + 1 }
      : undefined;
    porVariante.set(u.varianteId, {
      titular: titularEnMonto(o, g.monto),
      nombre: o.nombre,
      ahorro: (Math.round((ya?.ahorro ?? 0) * 100) + parteC) / 100,
      faltan: g.faltan,
      ofertaGrupoId: o.reglaId,
      dejaRebaja: (Math.round((ya?.dejaRebaja ?? 0) * 100) + dejaC) / 100,
      ...(g.monto ? { monto: g.monto } : {}),
      ...(sinRebaja && sinRebaja.unidades > 0 ? { sinRebaja } : {}),
    });
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

/** Una fila de `ofertas_de_monto_vigentes(sede)` (20261114044000). */
export type FilaOfertaDeMonto = {
  regla_id: string;
  oferta_nombre: string;
  etiqueta_nombre: string;
  escalones: unknown;
  ahorro_en: string;
  cuenta: string;
  variantes: string[] | null;
  excluidas: string[] | null;
};

/** Las filas de la base como las usa la caja, en el orden de la base (el más antiguo gana). Una fila que esta web no sabe leer se ignora:
 *  no se cobra lo que no se sabe mostrar (la base la exigiría igual). */
export function ofertasDeMontoDeFilas(filas: readonly FilaOfertaDeMonto[] | null | undefined): OfertaDeMontoVigente[] {
  const montos: OfertaDeMontoVigente[] = [];
  for (const f of filas ?? []) {
    const escalones = escalonesDeFila(f.escalones);
    if (!escalones || (f.ahorro_en !== "soles" && f.ahorro_en !== "pct") || (f.cuenta !== "campana" && f.cuenta !== "compra")) continue;
    montos.push({
      reglaId: f.regla_id,
      tipo: "monto",
      lleva: 0,
      paga: null,
      monto: null,
      porcentaje: null,
      agrupa: "campana",
      escalones,
      ahorroEn: f.ahorro_en,
      modeloId: null,
      nombre: f.etiqueta_nombre,
      titular: titularDeMonto(escalones, f.ahorro_en),
      cuenta: f.cuenta,
      variantes: f.cuenta === "compra" ? null : new Set(f.variantes ?? []),
      excluidas: new Set(f.cuenta === "compra" ? (f.excluidas ?? []) : []),
    });
  }
  return montos;
}
