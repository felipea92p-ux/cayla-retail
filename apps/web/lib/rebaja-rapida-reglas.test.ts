import { describe, expect, it } from "vitest";
import {
  camposDeRebaja,
  descuentosDeLaTienda,
  hayQueQuitar,
  leerDescuentos,
  leerRebajaDePrenda,
  lugarConPct,
  nombreDeDescuento,
  nombreDeLugar,
  pctElegido,
  pctQueCobra,
  precioConPct,
  quedaBajoCosto,
  saleDe,
  textoDelBoton,
  textoPct,
  type LugarDeRebaja,
  type RebajaQueTiene,
} from "./rebaja-rapida-reglas";

const LUGARES: LugarDeRebaja[] = [
  { etiquetaId: "c10", nombre: "Rebaja −10 % · Tienda Lima", pct: 10, esCajon: true, movible: true, hasta: null, prendas: 37 },
  { etiquetaId: "liq", nombre: "Para liquidar", pct: 15, esCajon: false, movible: true, hasta: "2026-12-31", prendas: 139 },
];
const tiene = (o: Partial<RebajaQueTiene>): RebajaQueTiene => ({ etiquetaId: "liq", nombre: "Para liquidar", pct: 15, como: "a_mano", esCajon: false, movible: true, ...o });

describe("«Poner un %»: lo que dice la hoja (ADR-0669)", () => {
  it("lee lo que devuelve la base", () => {
    const r = leerRebajaDePrenda({
      prenda: { variante_id: "v", producto_id: "p", referencia: "Blusa Emma", color: "Negro", talla: "M", precio: "79.90", modelo_prendas: 6, modelo_colores: 2, piso_sin_perder: "32.00", categoria: { nombre: "Blusas" } },
      tiene: [{ etiqueta_id: "liq", nombre: "Para liquidar", pct: "15.00", como: "a_mano", es_cajon: false, movible: true }],
      lugares: [{ etiqueta_id: "c10", nombre: "Rebaja −10 %", pct: "10.00", es_cajon: true, movible: true, prendas: 37 }],
      es_lider: true,
    });
    expect(r?.prenda).toMatchObject({ referencia: "Blusa Emma", precio: 79.9, modeloPrendas: 6, piso: 32 });
    expect(r?.tiene[0]).toMatchObject({ pct: 15, como: "a_mano", movible: true });
    expect(r?.lugares[0]).toMatchObject({ pct: 10, esCajon: true, prendas: 37 });
    expect(r?.esLider).toBe(true);
    expect(leerRebajaDePrenda({})).toBeNull();
  });
  it("nombra los % como se leen en un botón", () => {
    expect(textoPct(20)).toBe("−20 %");
    expect(textoPct(12.5)).toBe("−12.5 %");
    expect(nombreDeLugar(LUGARES[0])).toBe("−10 %");
    expect(nombreDeLugar(LUGARES[1])).toBe("−15 % · Para liquidar");
  });
  it("el precio con el %, con el redondeo de la caja, y si queda bajo el costo", () => {
    expect(precioConPct(79.9, 20)).toBe(63.9);
    expect(quedaBajoCosto({ precio: 79.9, piso: 32 }, 20)).toBe(false);
    expect(quedaBajoCosto({ precio: 79.9, piso: 32 }, 70)).toBe(true);
    expect(quedaBajoCosto({ precio: 79.9, piso: null }, 70)).toBe(false);
  });
  it("lo elegido: un lugar da su %; «otro %» vale de 1 a 70", () => {
    expect(pctElegido({ tipo: "lugar", etiquetaId: "liq" }, LUGARES)).toBe(15);
    expect(pctElegido({ tipo: "otro", pct: 25 }, LUGARES)).toBe(25);
    expect(pctElegido({ tipo: "otro", pct: 71 }, LUGARES)).toBeNull();
    expect(pctElegido({ tipo: "otro", pct: null }, LUGARES)).toBeNull();
    expect(pctElegido(null, LUGARES)).toBeNull();
  });
  it("«otro %» que ya existe usa ese lugar (el cajón antes que la campaña)", () => {
    expect(lugarConPct(15, LUGARES)?.etiquetaId).toBe("liq");
    expect(lugarConPct(10, [...LUGARES, { ...LUGARES[1], etiquetaId: "otra", pct: 10 }])?.etiquetaId).toBe("c10");
    expect(lugarConPct(25, LUGARES)).toBeNull();
  });
  it("de dónde sale y qué le sigue llegando: la caja cobra el mayor", () => {
    const t = [tiene({}), tiene({ etiquetaId: "top", nombre: "Top", pct: 25, movible: false }), tiene({ etiquetaId: "ani", nombre: "Aniversario", pct: 10, como: "categoria" })];
    expect(saleDe(t, "c10")).toEqual(["−15 % · Para liquidar"]);
    expect(saleDe(t, "liq")).toEqual([]);
    expect(pctQueCobra(t, "c10", 20)).toBe(25);
    expect(pctQueCobra([tiene({})], "c10", 20)).toBe(20);
    expect(hayQueQuitar(t)).toBe(true);
    expect(hayQueQuitar([tiene({ como: "categoria" })])).toBe(false);
  });
  it("la guía: a qué, cuánto y quién, en ese orden", () => {
    const c = camposDeRebaja({ alcance: null, eleccion: null, pct: null, responsableListo: false, responsableMotivo: null });
    expect(c.map((x) => `${x.id}:${x.hecho}`)).toEqual(["alcance:false", "pct:false", "responsable:false"]);
    expect(camposDeRebaja({ alcance: "modelo", eleccion: { tipo: "otro", pct: 90 }, pct: null, responsableListo: true, responsableMotivo: null })[1].pendiente).toBe("Escribe un % de 1 a 70.");
    expect(textoDelBoton(null)).toBe("Poner el %");
    expect(textoDelBoton(20)).toBe("Poner −20 %");
  });
});

describe("La lista de descuentos (ADR-0677)", () => {
  const fila = (o: Record<string, unknown>) => ({ etiqueta_id: "c10", pct: "10.00", todas: false, rige_aqui: true, activo: true, prendas: 15, ...o });

  it("lee las filas de la base, y sin forma conocida no dibuja la sección", () => {
    expect(leerDescuentos([fila({})])).toEqual([{ etiquetaId: "c10", pct: 10, todas: false, rigeAqui: true, activo: true, prendas: 15 }]);
    expect(leerDescuentos(null)).toBeNull();
    expect(leerDescuentos({ error: "x" })).toBeNull();
    expect(leerDescuentos([{ pct: 10 }, fila({ pct: "nada" })])).toEqual([]);
  });

  it("en la tienda salen los activos que rigen ahí, del menor al mayor; con el mismo %, el de la tienda antes que el de todas", () => {
    const lista = leerDescuentos([
      fila({ etiqueta_id: "t20", pct: 20, todas: true }),
      fila({ etiqueta_id: "c20", pct: 20 }),
      fila({ etiqueta_id: "c10", pct: 10 }),
      fila({ etiqueta_id: "aqp", pct: 15, rige_aqui: false, prendas: 0 }),
      fila({ etiqueta_id: "off", pct: 30, activo: false, prendas: 0 }),
    ])!;
    expect(descuentosDeLaTienda(lista).map((d) => d.etiquetaId)).toEqual(["c10", "c20", "t20"]);
  });

  it("CONTROL: sin filtrar, el de otra tienda y el apagado también saldrían", () => {
    const lista = leerDescuentos([fila({ etiqueta_id: "aqp", rige_aqui: false }), fila({ etiqueta_id: "off", activo: false })])!;
    expect(lista).toHaveLength(2);
    expect(descuentosDeLaTienda(lista)).toHaveLength(0);
  });

  it("el lector oye el %, cuántas prendas y si es de todas las tiendas", () => {
    expect(nombreDeDescuento({ pct: 10, prendas: 15, todas: false })).toBe("Descuento −10 %, 15 prendas");
    expect(nombreDeDescuento({ pct: 12.5, prendas: 1, todas: true })).toBe("Descuento −12.5 %, 1 prenda, todas las tiendas");
  });
});
