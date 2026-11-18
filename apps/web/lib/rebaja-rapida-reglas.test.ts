import { describe, expect, it } from "vitest";
import {
  camposDeLaHojaDeDescuento,
  claveModeloColor,
  comoDeshacerAgregar,
  descuentoConPct,
  descuentosDeLaTienda,
  detalleDePieza,
  leerDescuentos,
  leerPrendasBuscadas,
  leerRebajaDePrenda,
  nombreDeDescuento,
  pctDeDescuento,
  nombreDeLugar,
  pctQueCobra,
  piezasDeDescuento,
  precioConPct,
  quedaBajoCosto,
  sugerenciasDeAgregar,
  textoDeLaHojaDeDescuento,
  textoPct,
  type LugarDeRebaja,
  type PrendaDeLugar,
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
  it("lo que le sigue llegando: la caja cobra el mayor", () => {
    const t = [tiene({}), tiene({ etiquetaId: "top", nombre: "Top", pct: 25, movible: false }), tiene({ etiquetaId: "ani", nombre: "Aniversario", pct: 10, como: "categoria" })];
    expect(pctQueCobra(t, "c10", 20)).toBe(25);
    expect(pctQueCobra([tiene({})], "c10", 20)).toBe(20);
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

describe("Las prendas del panel de un descuento (ADR-0677)", () => {
  const talla = (o: Partial<PrendaDeLugar>): PrendaDeLugar => ({ varianteId: "v", productoId: "falda", referencia: "Falda Renata", color: "Negro", colorHex: null, talla: "M", precio: 74.9, ...o });
  const sinNada = { vitrina: null, tallasPorColor: new Map<string, number>(), costos: new Map<string, number>() };

  it("junta las tallas por modelo y color, como cuenta la fila", () => {
    const piezas = piezasDeDescuento(
      [talla({ varianteId: "n-s", talla: "S" }), talla({ varianteId: "n-m", talla: "M" }), talla({ varianteId: "b-m", color: "Beige" })],
      10,
      sinNada,
    );
    expect(piezas.map((p) => [p.clave, p.variantes])).toEqual([
      [claveModeloColor("falda", "Beige"), ["b-m"]],
      [claveModeloColor("falda", "Negro"), ["n-s", "n-m"]],
    ]);
  });

  it("nombra las tallas solo si no van todas las de ese color", () => {
    const tallasPorColor = new Map([[claveModeloColor("falda", "Negro"), 2], [claveModeloColor("falda", "Beige"), 3]]);
    const piezas = piezasDeDescuento([talla({ varianteId: "n-s", talla: "S" }), talla({ varianteId: "n-m" }), talla({ varianteId: "b-m", color: "Beige" })], 10, { ...sinNada, tallasPorColor });
    expect(piezas.map(detalleDePieza)).toEqual(["Beige · M", "Negro"]);
  });

  it("la que se agregó recién va primero, aunque por nombre fuera después", () => {
    const prendas = [talla({ varianteId: "a", productoId: "blusa", referencia: "Blusa Emma" }), talla({ varianteId: "z", productoId: "vestido", referencia: "Vestido Sofía" })];
    expect(piezasDeDescuento(prendas, 10, sinNada).map((p) => p.referencia)).toEqual(["Blusa Emma", "Vestido Sofía"]);
    expect(piezasDeDescuento(prendas, 10, { ...sinNada, recientes: [claveModeloColor("vestido", "Negro")] }).map((p) => p.referencia)).toEqual(["Vestido Sofía", "Blusa Emma"]);
  });

  it("el precio es el menor de sus tallas, con el mismo redondeo de la caja", () => {
    const [p] = piezasDeDescuento([talla({ varianteId: "s", precio: 79.9 }), talla({ varianteId: "m", precio: 74.9 })], 10, sinNada);
    expect([p.precio, p.precioConPct]).toEqual([74.9, precioConPct(74.9, 10)]);
  });

  it("avisa «bajo costo» si alguna talla queda bajo lo que costó; sin costo a la vista, nunca", () => {
    const prendas = [talla({ varianteId: "m", precio: 50 })];
    expect(piezasDeDescuento(prendas, 30, { ...sinNada, costos: new Map([["m", 40]]) })[0].bajoCosto).toBe(true);
    expect(piezasDeDescuento(prendas, 10, { ...sinNada, costos: new Map([["m", 40]]) })[0].bajoCosto).toBe(false);
    expect(piezasDeDescuento(prendas, 30, { ...sinNada, costos: new Map([["m", 0]]) })[0].bajoCosto).toBe(false);
  });

  it("la foto y la categoría salen de la vitrina; sin vitrina, la prenda sin foto", () => {
    const vitrina = new Map([["m", { productoId: "falda", colorNombre: "Negro", categoria: { nombre: "Faldas", prefijo: "FAL", familia: "ROPA" }, fotoUrl: "/f.jpg" }]]);
    expect(piezasDeDescuento([talla({ varianteId: "m" })], 10, { ...sinNada, vitrina })[0]).toMatchObject({ fotoUrl: "/f.jpg", categoria: { prefijo: "FAL" } });
    expect(piezasDeDescuento([talla({ varianteId: "m" })], 10, sinNada)[0]).toMatchObject({ fotoUrl: null, categoria: null });
  });
});

describe("Agregar prendas a un descuento (ADR-0677)", () => {
  const fila = (o: Record<string, unknown>) => ({ variante_id: "v1", producto_id: "blusa", referencia: "Blusa Emma", codigo: "BLU-1", color: "Negro", color_hex: "#111111", talla: "M", precio: "79.90", foto: null, categoria: "Blusas", categoria_prefijo: "BLU", categoria_familia: "ROPA", exacta: false, ...o });

  it("lee lo que devuelve la búsqueda; lo que no tiene forma no entra", () => {
    const [b] = leerPrendasBuscadas([fila({ exacta: true }), { variante_id: 3 }]);
    expect(b).toMatchObject({ varianteId: "v1", productoId: "blusa", precio: 79.9, exacta: true, categoria: { prefijo: "BLU" } });
    expect(leerPrendasBuscadas(null)).toEqual([]);
  });

  it("sugiere un modelo en su color una sola vez, con su precio menor y si ya está en el descuento", () => {
    const buscadas = leerPrendasBuscadas([
      fila({ variante_id: "n-s", talla: "S", precio: 84.9 }),
      fila({ variante_id: "n-m" }),
      fila({ variante_id: "b-m", color: "Beige" }),
    ]);
    const s = sugerenciasDeAgregar(buscadas, new Set([claveModeloColor("blusa", "Beige")]));
    expect(s.map((x) => [x.color, x.precio, x.yaEsta])).toEqual([
      ["Negro", 79.9, false],
      ["Beige", 79.9, true],
    ]);
  });

  it("deshacer devuelve cada talla a donde estaba: a su otro lugar, o sin %; la que ya estaba aquí no se toca", () => {
    const antes = new Map([["s", "c10"], ["m", "aqui"]]);
    expect(comoDeshacerAgregar(["s", "m", "l", "l"], antes, "aqui")).toEqual({ devolver: [{ varianteId: "s", a: "c10" }], quitar: ["l"] });
  });

  it("CONTROL: sin saber dónde estaba, deshacer la dejaría sin % (y la del −10 % lo perdería)", () => {
    expect(comoDeshacerAgregar(["s"], new Map(), "aqui")).toEqual({ devolver: [], quitar: ["s"] });
  });
});

describe("Nuevo descuento y cambiar el % (ADR-0677)", () => {
  const d = (o: Partial<{ etiquetaId: string; pct: number; todas: boolean; rigeAqui: boolean; activo: boolean; prendas: number }>) => ({ etiquetaId: "c10", pct: 10, todas: false, rigeAqui: true, activo: true, prendas: 5, ...o });

  it("un % vale de 1 a 70, a dos decimales (lo mismo que la base)", () => {
    expect([pctDeDescuento(25), pctDeDescuento(12.345), pctDeDescuento(70), pctDeDescuento(71), pctDeDescuento(0), pctDeDescuento(null), pctDeDescuento(NaN)]).toEqual([25, 12.35, 70, null, null, null, null]);
  });

  it("«ya existe» es el encendido con ese % donde se mira: de la tienda o de todas, nunca uno apagado ni el mismo que se cambia", () => {
    const lista = [d({}), d({ etiquetaId: "t10", todas: true }), d({ etiquetaId: "off", pct: 20, activo: false }), d({ etiquetaId: "aqp", pct: 30, rigeAqui: false })];
    expect(descuentoConPct(lista, 10, false)?.etiquetaId).toBe("c10");
    expect(descuentoConPct(lista, 10, true)?.etiquetaId).toBe("t10");
    expect(descuentoConPct(lista, 20, false)).toBeNull();
    expect(descuentoConPct(lista, 30, false)).toBeNull();
    expect(descuentoConPct(lista, 10, false, "c10")).toBeNull();
  });

  it("el botón dice lo que va a pasar", () => {
    expect(textoDeLaHojaDeDescuento({ cambiando: false, existe: false, pct: 25 })).toBe("Crear −25 %");
    expect(textoDeLaHojaDeDescuento({ cambiando: false, existe: true, pct: 10 })).toBe("Abrir −10 %");
    expect(textoDeLaHojaDeDescuento({ cambiando: true, existe: false, pct: 25 })).toBe("Cambiar a −25 %");
    expect(textoDeLaHojaDeDescuento({ cambiando: true, existe: true, pct: 15 })).toBe("Juntar en −15 %");
    expect(textoDeLaHojaDeDescuento({ cambiando: false, existe: false, pct: null })).toBe("Crear");
  });

  it("la guía pide el % y quién lo hace; abrir uno que ya existe no pide quién", () => {
    expect(camposDeLaHojaDeDescuento({ pct: null, existeSinCambiar: false, responsableListo: false, responsableMotivo: null }).map((c) => `${c.id}:${c.hecho}`)).toEqual(["pct:false", "responsable:false"]);
    expect(camposDeLaHojaDeDescuento({ pct: 10, existeSinCambiar: true, responsableListo: false, responsableMotivo: null }).map((c) => c.id)).toEqual(["pct"]);
  });
});
