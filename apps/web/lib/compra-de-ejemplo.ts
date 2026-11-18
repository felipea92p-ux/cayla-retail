// «En caja» de la hoja de ofertas (ADR-0677, actividad 8 de la maqueta `docs/maquetas/campanas-simple-2026-11/`): una compra con prendas de
// verdad —las que la oferta alcanza—, cobrada con la misma cuenta de Vender, que cambia con cada toque. Responde «¿cuánto paga el cliente?».
// Lógica pura: la hoja solo la dibuja. Las cuentas son las de la caja: un % con `descuentoDeCampana` (el precio bajado al múltiplo de
// S/ 0.10, igual que `retail.fn_descuento_campana`) y los grupos y los montos con `ejemploDeGrupo` / `ejemploDeMonto` (`ofertasDeGrupo`).

import { descuentoDeCampana } from "./descuento-por-porcentaje";
import { ejemploDeGrupo, ejemploDeMonto, modelosParaEjemplo, type OfertaDeGrupo, type PrendaParaEjemplo } from "./ofertas-de-grupo";
import { problemasDeForma, type FormaDeOferta } from "./campana-reglas";

/** Cuántas prendas lleva la compra de un %: las suficientes para ver que la rebaja es por prenda, sin llenar la columna. */
const PRENDAS_CON_PCT = 3;

/** Una prenda de la compra con lo que la caja le cobra. En un grupo la caja reparte el ahorro entre sus prendas (ninguna sale «gratis»). */
export type LineaDeEjemplo = { id: string | null; nombre: string; precio: number; paga: number };

/** El monto de la compra contra el primer escalón: si llega, cuánto ahorra; si no, cuánto le falta. */
export type MontoDeEjemplo = { desde: number; llega: boolean; ahorro: number; falta: number };

export type CompraDeEjemplo =
  /** Todavía no eligió qué le da al cliente. */
  | { estado: "elige" }
  /** La oferta no alcanza ninguna prenda a la venta (o sus números aún no valen: no hay nada que cobrar). */
  | { estado: "sin-prendas" }
  | { estado: "lista"; lineas: LineaDeEjemplo[]; suma: number; paga: number; ahorro: number; monto: MontoDeEjemplo | null };

type FormaVista = Pick<FormaDeOferta, "tipo" | "porcentaje" | "lleva" | "paga" | "monto" | "agrupa" | "escalones" | "ahorroEn">;

const centimos = (n: number) => Math.round(n * 100);

/**
 * La compra de ejemplo de una oferta. `elegido`: si la persona ya eligió qué le da (antes, no hay compra). `prendas`: las que la oferta
 * alcanza, con su precio más bajo en las tiendas (el que cobra la caja). Estable: con las mismas prendas, la misma compra.
 */
export function compraDeEjemplo(o: FormaVista, elegido: boolean, prendas: readonly PrendaParaEjemplo[]): CompraDeEjemplo {
  if (!elegido) return { estado: "elige" };
  if (problemasDeForma(o).length > 0) return { estado: "sin-prendas" };
  if (o.tipo === "pct") return compraConPct(o.porcentaje, prendas);
  const forma: OfertaDeGrupo = {
    reglaId: "ejemplo", tipo: o.tipo, lleva: o.lleva, paga: o.paga, monto: o.monto, porcentaje: o.porcentaje, agrupa: o.agrupa,
    escalones: o.escalones, ahorroEn: o.ahorroEn,
  };
  const e = o.tipo === "monto" ? ejemploDeMonto(prendas, forma) : ejemploDeGrupo(prendas, forma);
  if (!e) return { estado: "sin-prendas" };
  if (o.tipo === "monto") {
    // En un monto la caja reparte el ahorro entre las prendas; en el ejemplo se ve como una línea aparte («Desde S/ 300 · −S/ 30»), que es
    // como lo piensa quien la arma. Cada prenda, a su precio.
    const desde = [...(o.escalones ?? [])].sort((a, b) => a.desde - b.desde)[0]?.desde ?? 0;
    const llega = centimos(e.total) >= centimos(desde);
    return {
      estado: "lista",
      lineas: e.lineas.map((l) => ({ id: l.id ?? null, nombre: l.nombre, precio: l.precio, paga: l.precio })),
      suma: e.total,
      paga: e.paga,
      ahorro: e.ahorro,
      monto: { desde, llega, ahorro: e.ahorro, falta: llega ? 0 : (centimos(desde) - centimos(e.total)) / 100 },
    };
  }
  return {
    estado: "lista",
    lineas: e.lineas.map((l) => ({ id: l.id ?? null, nombre: l.nombre, precio: l.precio, paga: l.paga })),
    suma: e.total,
    paga: e.paga,
    ahorro: e.ahorro,
    monto: null,
  };
}

/** Un % menos: las prendas más caras de modelos distintos, cada una con su rebaja de la caja. */
function compraConPct(pct: number, prendas: readonly PrendaParaEjemplo[]): CompraDeEjemplo {
  const elegidas = modelosParaEjemplo(prendas).slice(0, PRENDAS_CON_PCT);
  if (elegidas.length === 0) return { estado: "sin-prendas" };
  const lineas = elegidas.map((p) => {
    const paga = (centimos(p.precio) - centimos(descuentoDeCampana(p.precio, pct))) / 100;
    return { id: p.id ?? null, nombre: p.nombre, precio: p.precio, paga };
  });
  const sumaC = lineas.reduce((a, l) => a + centimos(l.precio), 0);
  const pagaC = lineas.reduce((a, l) => a + centimos(l.paga), 0);
  return { estado: "lista", lineas, suma: sumaC / 100, paga: pagaC / 100, ahorro: (sumaC - pagaC) / 100, monto: null };
}
