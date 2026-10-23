import { describe, it, expect } from "vitest";
import {
  alcanceCampana,
  alternarSede,
  avisoReimprimir,
  chipDeTarjeta,
  conteoDeTarjeta,
  destinoReimprimir,
  DESCUENTOS_RAPIDOS,
  nombreBajoCosto,
  objecionVigencia,
  parsearDescuento,
  parsearFecha,
  prendasBajoCosto,
  prendasPorCategoria,
  prendasQueCambianDePrecioHoy,
  textoConteoTarjeta,
  textoSedesDeCampana,
  type PrendaConCosto,
  type TiendaOpcion,
} from "./etiqueta-campana";
import { descuentoDeCampana } from "./vender-reglas";

const HOY = "2026-10-17";

describe("parsearDescuento", () => {
  it.each([
    ["20", 20],
    ["12,5", 12.5],
    ["12.5", 12.5],
    ["20 %", 20],
    [" 100 ", 100],
    ["0,5", 0.5],
  ])("%j → %d", (entrada, esperado) => {
    expect(parsearDescuento(entrada)).toEqual({ ok: true, valor: esperado });
  });

  it("vacío = sin descuento (etiqueta informativa)", () => {
    expect(parsearDescuento("")).toEqual({ ok: true, valor: null });
    expect(parsearDescuento("  %  ")).toEqual({ ok: true, valor: null });
  });

  it.each(["0", "0,00", "101", "100,01", "-5", "veinte", "12,555", "1e2"])("rechaza %j", (entrada) => {
    expect(parsearDescuento(entrada).ok).toBe(false);
  });
});

describe("parsearFecha", () => {
  it("acepta una fecha real y el vacío", () => {
    expect(parsearFecha("2026-11-09")).toEqual({ ok: true, valor: "2026-11-09" });
    expect(parsearFecha("")).toEqual({ ok: true, valor: null });
  });
  it.each(["2026-02-31", "09/11/2026", "2026-13-01", "mañana"])("rechaza %j", (entrada) => {
    expect(parsearFecha(entrada).ok).toBe(false);
  });
});

describe("objecionVigencia", () => {
  it("solo objeta cuando el inicio es posterior al fin", () => {
    expect(objecionVigencia("2026-12-01", "2026-11-01")).not.toBeNull();
    expect(objecionVigencia("2026-11-01", "2026-11-01")).toBeNull();
    expect(objecionVigencia(null, "2026-11-01")).toBeNull();
    expect(objecionVigencia("2026-11-01", null)).toBeNull();
  });
});

describe("prendasBajoCosto — el aviso al configurar una campaña", () => {
  const prenda = (id: string, categoriaId: string | null, precio: number, costo: number): PrendaConCosto => ({ id, categoriaId, precio, costo, nombre: id });
  const prendas = [prenda("jean", "c-jeans", 100, 40), prenda("polo", "c-polos", 50, 45), prenda("collar", "c-collares", 30, 10)];

  it("sin descuento no hay nada que avisar", () => {
    expect(prendasBajoCosto(null, prendas, new Set(["c-jeans", "c-polos"]), new Set())).toEqual([]);
  });
  it("un 20 % en jeans y polos deja el polo (50 → 39.90) por debajo de su costo (45)", () => {
    expect(prendasBajoCosto(20, prendas, new Set(["c-jeans", "c-polos"]), new Set()).map((p) => p.id)).toEqual(["polo"]);
  });
  it("solo cuenta lo que la campaña alcanza: el collar no está en las categorías", () => {
    expect(prendasBajoCosto(90, prendas, new Set(["c-polos"]), new Set()).map((p) => p.id)).toEqual(["polo"]);
  });
  it("las prendas etiquetadas a mano cuentan aunque su categoría no esté elegida", () => {
    expect(prendasBajoCosto(90, prendas, new Set(), new Set(["collar"])).map((p) => p.id)).toEqual(["collar"]);
  });
  it("quedar EXACTO en el costo no es estar por debajo", () => {
    // 100 con 10 % = se cobra 90.00, igual al costo.
    expect(prendasBajoCosto(10, [prenda("x", "c", 100, 90)], new Set(["c"]), new Set())).toEqual([]);
  });
  it("en céntimos: 19.90 con 20 % se cobra 15.90 (la cuenta exacta da 15.92, ADR-0403), igual a un costo de 15.90, y no avisa", () => {
    expect(prendasBajoCosto(20, [prenda("x", "c", 19.9, 15.9)], new Set(["c"]), new Set())).toEqual([]);
  });
  it("el precio sin céntimos de la campaña cuenta: con costo 15.91 ya avisa, aunque la cuenta exacta (15.92) no", () => {
    expect(prendasBajoCosto(20, [prenda("x", "c", 19.9, 15.91)], new Set(["c"]), new Set()).map((p) => p.id)).toEqual(["x"]);
  });
  it("cuenta el precio que se cobra (ADR-0403): un céntimo bajo el costo ya avisa", () => {
    // 100 con 10 % = 90.00: queda 1 céntimo bajo un costo de 90.01.
    expect(prendasBajoCosto(10, [prenda("x", "c", 100, 90.01)], new Set(["c"]), new Set()).map((p) => p.id)).toEqual(["x"]);
  });
  it("sin categorías ni prendas a mano, el alcance es vacío", () => {
    expect(prendasBajoCosto(99, prendas, new Set(), new Set())).toEqual([]);
  });
});

describe("el aviso mide el peor caso entre las tiendas (precio propio, Felipe 2026-10-10)", () => {
  // Prenda a 79.90 con costo 60 y TRU con precio propio 69.90, campaña de 20 %: la caja de TRU cobra 69.90 − 13.98 = 55.92 (bajo el costo)
  // y la de las demás 79.90 − 15.98 = 63.92 (no). El aviso con el precio de la prenda no lo veía.
  const base = { id: "falda", categoriaId: "c-faldas", costo: 60, nombre: "Falda Emma (FAL-0008)" };
  it("con el precio de la prenda (79.90) no avisa; con el peor caso (TRU 69.90) sí", () => {
    expect(prendasBajoCosto(20, [{ ...base, precio: 79.9 }], new Set(["c-faldas"]), new Set())).toEqual([]);
    const r = prendasBajoCosto(20, [{ ...base, precio: 69.9, enSede: "Trujillo" }], new Set(["c-faldas"]), new Set());
    expect(r.map((p) => p.id)).toEqual(["falda"]);
  });
  it("quedar justo en el costo no avisa", () => {
    // 75 − 15 = 60: igual al costo, no por debajo.
    expect(prendasBajoCosto(20, [{ ...base, precio: 75, enSede: "Trujillo" }], new Set(["c-faldas"]), new Set())).toEqual([]);
  });
  it("dice el precio más bajo y dónde cuando es el propio de una tienda; si es el de la prenda, solo el nombre", () => {
    expect(nombreBajoCosto({ nombre: "Falda Emma (FAL-0008)", precio: 69.9, enSede: "Trujillo" })).toBe("Falda Emma (FAL-0008) · precio más bajo: S/\u00a069.90 en Trujillo");
    expect(nombreBajoCosto({ nombre: "Falda Emma (FAL-0008)", precio: 79.9, enSede: null })).toBe("Falda Emma (FAL-0008)");
    expect(nombreBajoCosto({ nombre: "Falda Emma (FAL-0008)", precio: 79.9 })).toBe("Falda Emma (FAL-0008)");
  });
  it("no culpa a una tienda: dice un hecho aunque la prenda a su precio ya quede bajo el costo (79.90, costo 65, 25 %)", () => {
    // Con la prenda sola ya se cobra 59.92 < 65: el texto no dice «el problema es Trujillo», dice cuál es el precio más bajo.
    const texto = nombreBajoCosto({ nombre: "Falda Emma (FAL-0008)", precio: 69.9, enSede: "Trujillo" });
    expect(texto).not.toMatch(/propio de/);
    expect(texto).toContain("precio más bajo");
  });
  it("el precio más bajo da el cobrado más bajo: P − descuento no decrece con P (en céntimos, todos los % usuales)", () => {
    // Es el único supuesto de «peor caso»: si el más bajo no queda bajo el costo, ninguno otro lo hace.
    for (const pct of [5, 10, 12.5, 15, 20, 25, 33.33, 50, 99, 100]) {
      let anterior = -Infinity;
      for (let c = 1; c <= 30000; c++) {
        const precio = c / 100;
        const cobrado = Math.round((precio - descuentoDeCampana(precio, pct)) * 100);
        if (cobrado < anterior) throw new Error(`pct ${pct}: ${precio} cobra menos que el precio anterior`);
        anterior = cobrado;
      }
    }
  });
});

describe("cuánto alcanza una campaña, antes de guardar", () => {
  const prendas = [
    { id: "jean-28", categoriaId: "jeans" },
    { id: "jean-30", categoriaId: "jeans" },
    { id: "polo-s", categoriaId: "polos" },
    { id: "collar", categoriaId: null },
  ];

  it("cuenta las prendas a la venta de cada categoría; una prenda sin categoría no suma a ninguna", () => {
    const cuenta = prendasPorCategoria(prendas);
    expect(cuenta.get("jeans")).toBe(2);
    expect(cuenta.get("polos")).toBe(1);
    expect(cuenta.size).toBe(2);
  });

  it("suma las de sus categorías y las marcadas a mano, sin contar dos veces la que entra por las dos vías", () => {
    expect(alcanceCampana(prendas, new Set(["jeans"]), new Set(["jean-28", "polo-s"]))).toEqual({ porCategoria: 2, aMano: 1, total: 3 });
  });

  it("una marcada a mano que ya no está a la venta (talla desactivada) no cuenta", () => {
    expect(alcanceCampana(prendas, new Set(), new Set(["talla-desactivada", "collar"]))).toEqual({ porCategoria: 0, aMano: 1, total: 1 });
  });

  it("sin categorías ni prendas a mano, no alcanza a ninguna", () => {
    expect(alcanceCampana(prendas, new Set(), new Set())).toEqual({ porCategoria: 0, aMano: 0, total: 0 });
  });

  it("los descuentos de un toque son todos válidos para la base: entre 0 y 100", () => {
    for (const v of DESCUENTOS_RAPIDOS) expect(parsearDescuento(String(v))).toEqual({ ok: true, valor: v });
  });
});

// /formidable 2026-10-23 (ADR-0488): la hoja decía «23 prendas» (tallas) y el pase de la misma campaña «8 prendas» (modelo y color).
// Una prenda es un modelo en un color, como en el pase: sus tallas cuentan una vez.
describe("una prenda es un modelo en un color, como en el pase de Insignias", () => {
  const conModelo = [
    { id: "jean-28", categoriaId: "jeans", modelo: "jean·AZU" },
    { id: "jean-30", categoriaId: "jeans", modelo: "jean·AZU" },
    { id: "jean-28n", categoriaId: "jeans", modelo: "jean·NEG" },
    { id: "polo-s", categoriaId: "polos", modelo: "polo·BLA" },
    { id: "polo-m", categoriaId: "polos", modelo: "polo·BLA" },
  ];

  it("las tallas de un mismo modelo y color cuentan una vez, por categoría y en total", () => {
    expect(prendasPorCategoria(conModelo).get("jeans")).toBe(2);
    expect(prendasPorCategoria(conModelo).get("polos")).toBe(1);
    expect(alcanceCampana(conModelo, new Set(["jeans"]), new Set(["polo-s", "polo-m", "jean-30"]))).toEqual({ porCategoria: 2, aMano: 1, total: 3 });
  });

  it("un modelo que entra por su categoría no cuenta además como marcado a mano", () => {
    expect(alcanceCampana(conModelo, new Set(["polos"]), new Set(["polo-s"]))).toEqual({ porCategoria: 1, aMano: 0, total: 1 });
  });
});

describe("la tarjeta cuenta lo mismo que su hoja", () => {
  const aLaVenta = [
    { id: "jean-28", categoriaId: "jeans" },
    { id: "jean-30", categoriaId: "jeans" },
    { id: "polo-s", categoriaId: "polos" },
  ];

  it("una marca en una talla que ya no se vende no suma, pero se dice (Nuevo: 186 marcas, 164 a la venta)", () => {
    const c = conteoDeTarjeta(aLaVenta, new Set(), ["jean-28", "polo-s", "talla-desactivada"]);
    expect(c).toEqual({ porCategoria: 0, aMano: 2, total: 2, fueraDeVenta: 1 });
    expect(textoConteoTarjeta(c)).toEqual({ texto: "2 prendas a la venta", fuera: "1 marcada que ya no se vende" });
  });

  it("con categorías, dice cuántas entran por ellas; sin nada, «Sin prendas a la venta»", () => {
    expect(textoConteoTarjeta(conteoDeTarjeta(aLaVenta, new Set(["jeans"]), ["polo-s"])).texto).toBe("3 prendas a la venta · 2 por categoría");
    expect(textoConteoTarjeta(conteoDeTarjeta(aLaVenta, new Set(), []))).toEqual({ texto: "Sin prendas a la venta", fuera: null });
  });

  it("todas las marcas fuera de venta dan cero (Aniversario CAYLA: 8 marcas en tallas desactivadas)", () => {
    const c = conteoDeTarjeta(aLaVenta, new Set(), Array.from({ length: 8 }, (_, i) => `vieja-${i}`));
    expect(textoConteoTarjeta(c)).toEqual({ texto: "Sin prendas a la venta", fuera: "8 marcadas que ya no se venden" });
  });
});

describe("el chip de la temporada", () => {
  it("vigente y sin prendas va en ámbar; vigente con prendas, en verde", () => {
    expect(chipDeTarjeta({ estado: "vigente", hasta: "2026-12-31" }, 0, HOY)).toMatchObject({ texto: "Vigente", tono: "neutro", alerta: "Sin prendas" });
    expect(chipDeTarjeta({ estado: "vigente", hasta: "2026-12-31" }, 164, HOY)).toEqual({ texto: "Vigente", tono: "verde" });
  });
  it("quien no ve los conteos ve «Vigente» y «En N días», como antes", () => {
    expect(chipDeTarjeta({ estado: "vigente", hasta: null }, null, HOY)).toEqual({ texto: "Vigente", tono: "verde" });
    expect(chipDeTarjeta({ estado: "proxima", desde: "2026-11-09", enDias: 23 }, null, HOY)).toEqual({ texto: "En 23 días", tono: "ambar" });
  });
  it("una que viene sin prendas suma «Sin preparar» en ámbar; una lista va en pizarra", () => {
    expect(chipDeTarjeta({ estado: "proxima", desde: "2026-11-09", enDias: 23 }, 0, HOY)).toMatchObject({ texto: "En 23 días", tono: "neutro", alerta: "Sin preparar" });
    expect(chipDeTarjeta({ estado: "proxima", desde: "2026-10-24", enDias: 7 }, 7, HOY)).toEqual({ texto: "En 7 días", tono: "pizarra" });
    expect(chipDeTarjeta({ estado: "proxima", desde: "2026-10-18", enDias: 1 }, 0, HOY)).toMatchObject({ texto: "Mañana", alerta: "Sin preparar" });
  });
  it("una que pasó dice cuándo, con el año si no es este", () => {
    expect(chipDeTarjeta({ estado: "terminada", hasta: "2026-10-14" }, 0, HOY)).toEqual({ texto: "Pasó el 14 oct.", tono: "neutro" });
    expect(chipDeTarjeta({ estado: "terminada", hasta: "2025-12-25" }, 3, HOY)).toEqual({ texto: "Pasó el 25 dic. de 2025", tono: "neutro" });
  });
  it("sin fechas no hay chip", () => {
    expect(chipDeTarjeta(null, 0, HOY)).toBeNull();
  });
});

describe("prendasQueCambianDePrecioHoy — el papel que queda viejo al guardar una campaña", () => {
  const HOY_ = "2026-10-17";
  const aLaVenta = [
    { id: "blusa", categoriaId: "c-blusas" },
    { id: "falda", categoriaId: "c-faldas" },
    { id: "polo", categoriaId: "c-polos" },
  ];
  const manuales = new Set(["polo"]);
  type Campana = Parameters<typeof prendasQueCambianDePrecioHoy>[0];
  const vigente: Campana = { descuentoPct: 20, vigenteDesde: "2026-09-01", vigenteHasta: "2026-12-31", categoriaIds: ["c-blusas"], sedeIds: [] };
  const cambian = (antes: Campana, despues: Campana) => {
    const r = prendasQueCambianDePrecioHoy(antes, despues, aLaVenta, manuales, HOY_);
    return [...r.quedan, ...r.salen].sort();
  };

  it("otro % en una campaña vigente: todas las que alcanza (por categoría y a mano)", () => {
    expect(cambian(vigente, { ...vigente, descuentoPct: 30 })).toEqual(["blusa", "polo"]);
  });
  it("guardar sin cambiar nada que mueva un precio: ninguna", () => {
    expect(cambian(vigente, { ...vigente, vigenteHasta: "2027-01-15" })).toEqual([]);
  });
  it("correr las fechas al futuro: dejan de rebajar hoy", () => {
    expect(cambian(vigente, { ...vigente, vigenteDesde: "2026-11-01" })).toEqual(["blusa", "polo"]);
  });
  it("una que venía y ahora rige desde hoy: empiezan a rebajar", () => {
    expect(cambian({ ...vigente, vigenteDesde: "2026-11-01" }, { ...vigente, vigenteDesde: "2026-10-17" })).toEqual(["blusa", "polo"]);
  });
  it("quitar el descuento: vuelven a su precio", () => {
    expect(cambian(vigente, { ...vigente, descuentoPct: null })).toEqual(["blusa", "polo"]);
  });
  it("sumar una categoría: solo las que entran", () => {
    expect(cambian(vigente, { ...vigente, categoriaIds: ["c-blusas", "c-faldas"] })).toEqual(["falda"]);
  });
  it("una campaña que viene no toca ningún precio hoy, aunque cambie su %", () => {
    const viene = { ...vigente, vigenteDesde: "2026-11-09", vigenteHasta: "2026-11-30" };
    expect(cambian(viene, { ...viene, descuentoPct: 40 })).toEqual([]);
  });
  it("separa las que quedan rebajadas de las que vuelven a su precio", () => {
    expect(prendasQueCambianDePrecioHoy(vigente, { ...vigente, categoriaIds: ["c-faldas"] }, aLaVenta, manuales, HOY_)).toMatchObject({ quedan: ["falda"], salen: ["blusa"] });
    expect(prendasQueCambianDePrecioHoy(vigente, { ...vigente, descuentoPct: null }, aLaVenta, manuales, HOY_)).toMatchObject({ quedan: [], salen: ["blusa", "polo"] });
  });
  it("sin fechas rige siempre", () => {
    const siempre: Campana = { ...vigente, vigenteDesde: null, vigenteHasta: null };
    expect(cambian(siempre, { ...siempre, descuentoPct: 25 })).toEqual(["blusa", "polo"]);
  });
});

describe("destinoReimprimir — un enlace que el servidor acepte", () => {
  const ids = (n: number, letra: string) => Array.from({ length: n }, (_, i) => `${letra}${i}`);
  it("hasta 150 tallas, las exactas", () => {
    expect(destinoReimprimir({ quedan: ["a"], salen: ["b"] }, "bf")).toBe("/etiquetas-de-precio?variantes=a,b");
    expect(destinoReimprimir({ quedan: ids(150, "q"), salen: [] }, "bf")).toContain("?variantes=");
  });
  it("más de 150 que siguen en la campaña (354 de «Camisas y Blusas»): la impresión por campaña", () => {
    expect(destinoReimprimir({ quedan: ids(354, "q"), salen: [] }, "bf")).toBe("/etiquetas-de-precio?campana=bf");
  });
  it("más de 150 con algunas que salieron: ningún enlace sirve (la impresión por campaña no las ve)", () => {
    expect(destinoReimprimir({ quedan: ids(200, "q"), salen: ["s"] }, "bf")).toBeNull();
    expect(destinoReimprimir({ quedan: [], salen: ids(354, "s") }, "bf")).toBeNull();
  });
  it("sin nada que imprimir, nada", () => {
    expect(destinoReimprimir({ quedan: [], salen: [] }, "bf")).toBeNull();
  });
});

describe("avisoReimprimir", () => {
  // Un cambio igual en todas las tiendas: `n` prendas que se imprimen desde aquí.
  const parejo = (n: number) => ({ quedan: Array.from({ length: n }, (_, i) => `v${i}`), salen: [], total: n, dondeCambia: null, aqui: null });
  it("sin enlace, dice por dónde imprimirlas y no ofrece botón", () => {
    expect(avisoReimprimir(parejo(354), false)).toEqual({
      detalle: "Cambió el precio en caja de 354 prendas: sus etiquetas de papel dicen el de antes. Son muchas para abrirlas juntas: imprímelas por categoría desde Existencias.",
      boton: null,
    });
  });
  it("sin prendas que cambien, no hay nada que imprimir", () => {
    expect(avisoReimprimir(parejo(0))).toBeNull();
  });
  it("dice cuántas prendas y ofrece imprimir sus etiquetas, sin prometer un número de etiquetas", () => {
    expect(avisoReimprimir(parejo(12))).toEqual({ detalle: "Cambió el precio en caja de 12 prendas: sus etiquetas de papel dicen el de antes.", boton: "Imprimir sus etiquetas" });
    expect(avisoReimprimir(parejo(1))).toEqual({ detalle: "Cambió el precio en caja de 1 prenda: su etiqueta de papel dice el de antes.", boton: "Imprimir su etiqueta" });
  });
  it("un número (Prendas, Editar producto) es lo mismo que un cambio igual en todas las tiendas", () => {
    for (const n of [0, 1, 12]) expect(avisoReimprimir(n)).toEqual(avisoReimprimir(parejo(n)));
    expect(avisoReimprimir(354, false)).toEqual(avisoReimprimir(parejo(354), false));
  });
});

// ---- En qué tiendas rige una campaña (ADR-0486) ---------------------------------------------------------------------------

const TRU: TiendaOpcion = { id: "tru", nombre: "Tienda Trujillo" };
const AQP: TiendaOpcion = { id: "aqp", nombre: "Tienda Arequipa" };
const LIM: TiendaOpcion = { id: "lim", nombre: "Tienda Lima" };
const TRES = [AQP, LIM, TRU];

describe("alternarSede", () => {
  it("marca una tienda y la desmarca", () => {
    const una = alternarSede(new Set(), "tru", TRES);
    expect([...una]).toEqual(["tru"]);
    expect([...alternarSede(una, "tru", TRES)]).toEqual([]);
  });

  it("marcar dos deja dos", () => {
    expect([...alternarSede(new Set(["tru"]), "aqp", TRES)].sort()).toEqual(["aqp", "tru"]);
  });

  it("marcar TODAS las tiendas es «todas las sedes»: lista vacía, para que una tienda nueva no quede fuera", () => {
    expect(alternarSede(new Set(["tru", "aqp"]), "lim", TRES).size).toBe(0);
  });

  it("no cambia el conjunto que recibe", () => {
    const antes = new Set(["tru"]);
    alternarSede(antes, "aqp", TRES);
    expect([...antes]).toEqual(["tru"]);
  });

  it("con una sola tienda en el ERP, marcarla es «todas»: no hay nada que limitar", () => {
    expect(alternarSede(new Set(), "tru", [TRU]).size).toBe(0);
  });
});

describe("textoSedesDeCampana", () => {
  it("una campaña de todas las sedes no dice nada", () => {
    expect(textoSedesDeCampana([], TRES)).toBeNull();
  });

  it("una tienda: «Solo Tienda Trujillo»", () => {
    expect(textoSedesDeCampana(["tru"], TRES)).toBe("Solo Tienda Trujillo");
  });

  it("dos tiendas: en el orden en que se eligieron, unidas con «y»", () => {
    expect(textoSedesDeCampana(["lim", "tru"], TRES)).toBe("Solo Tienda Lima y Tienda Trujillo");
  });

  it("tres: con comas y «y»", () => {
    expect(textoSedesDeCampana(["aqp", "lim", "tru"], TRES)).toBe("Solo Tienda Arequipa, Tienda Lima y Tienda Trujillo");
  });

  it("una tienda que ya no se conoce no inventa un nombre", () => {
    expect(textoSedesDeCampana(["x"], TRES)).toBe("Solo en una tienda");
    expect(textoSedesDeCampana(["tru", "x"], TRES)).toBe("Solo en 2 tiendas");
    expect(textoSedesDeCampana(["tru"], [])).toBe("Solo en una tienda");
  });
});

describe("reimprimir cuando cambia dónde rige (ADR-0486): el papel viejo queda en otras tiendas", () => {
  const HOY_ = "2026-10-17";
  const aLaVenta = [
    { id: "blusa", categoriaId: "c-blusas" },
    { id: "falda", categoriaId: "c-faldas" },
    { id: "polo", categoriaId: "c-polos" },
  ];
  const manuales = new Set(["polo"]);
  type Campana = Parameters<typeof prendasQueCambianDePrecioHoy>[0];
  const todas: Campana = { descuentoPct: 20, vigenteDesde: "2026-09-01", vigenteHasta: "2026-12-31", categoriaIds: ["c-blusas"], sedeIds: [] };
  const soloTru: Campana = { ...todas, sedeIds: ["tru"] };
  const guardar = (antes: Campana, despues: Campana, aqui: string | null) =>
    prendasQueCambianDePrecioHoy(antes, despues, aLaVenta, manuales, HOY_, { tiendas: TRES, aqui });

  describe("solo cambian las tiendas: de todas las sedes a solo Trujillo", () => {
    it("cambia en Arequipa y Lima, no en Trujillo", () => {
      const c = guardar(todas, soloTru, "tru");
      expect(c.total).toBe(2);
      expect(c.dondeCambia).toEqual([AQP, LIM]);
    });
    it("guardado desde Trujillo: su papel no cambió, así que no hay botón y el aviso pide imprimirlas allá", () => {
      const c = guardar(todas, soloTru, "tru");
      expect(c).toMatchObject({ quedan: [], salen: [], aqui: null });
      expect(avisoReimprimir(c, destinoReimprimir(c, "aniv") !== null)).toEqual({
        detalle: "Cambió el precio en caja de 2 prendas en Tienda Arequipa y Tienda Lima: sus etiquetas de papel dicen el de antes. Imprímelas en esas tiendas.",
        boton: null,
      });
    });
    it("guardado desde Arequipa: el botón imprime las suyas, que vuelven a su precio", () => {
      const c = guardar(todas, soloTru, "aqp");
      expect(c).toMatchObject({ quedan: [], salen: ["blusa", "polo"], aqui: AQP });
      expect(destinoReimprimir(c, "aniv")).toBe("/etiquetas-de-precio?variantes=blusa,polo");
      expect(avisoReimprimir(c)?.boton).toBe("Imprimir las de Tienda Arequipa");
    });
    it("y de vuelta, de solo Trujillo a todas: las mismas tiendas, ahora con el descuento", () => {
      expect(guardar(soloTru, todas, "lim")).toMatchObject({ quedan: ["blusa", "polo"], salen: [], total: 2, dondeCambia: [AQP, LIM], aqui: LIM });
    });
  });

  describe("se suma una tienda: de solo Trujillo a Trujillo y Arequipa", () => {
    const truYAqp: Campana = { ...todas, sedeIds: ["tru", "aqp"] };
    it("cambia solo en la que entra", () => {
      expect(guardar(soloTru, truYAqp, "tru")).toMatchObject({ total: 2, dondeCambia: [AQP], aqui: null, quedan: [], salen: [] });
    });
    it("el aviso la nombra; desde ella, el botón imprime las suyas con el descuento", () => {
      expect(avisoReimprimir(guardar(soloTru, truYAqp, "tru"))?.detalle).toBe(
        "Cambió el precio en caja de 2 prendas en Tienda Arequipa: sus etiquetas de papel dicen el de antes. Imprímelas en esa tienda.",
      );
      const desdeAqp = guardar(soloTru, truYAqp, "aqp");
      expect(desdeAqp).toMatchObject({ quedan: ["blusa", "polo"], salen: [] });
      expect(avisoReimprimir(desdeAqp)?.boton).toBe("Imprimir las de Tienda Arequipa");
    });
  });

  describe("sin tiendas = todas", () => {
    it("marcar las tres tiendas es lo mismo que todas las sedes: no cambia ningún precio", () => {
      expect(guardar(todas, { ...todas, sedeIds: ["aqp", "lim", "tru"] }, "tru").total).toBe(0);
    });
    it("otro % de una campaña de todas las sedes cambia igual en cada tienda: el aviso no lista tiendas", () => {
      const c = guardar(todas, { ...todas, descuentoPct: 30 }, "lim");
      expect(c).toMatchObject({ quedan: ["blusa", "polo"], total: 2, dondeCambia: null, aqui: null });
      expect(avisoReimprimir(c)).toEqual({ detalle: "Cambió el precio en caja de 2 prendas: sus etiquetas de papel dicen el de antes.", boton: "Imprimir sus etiquetas" });
    });
  });

  it("otro % de una campaña de solo Trujillo: solo Trujillo; desde Lima no hay nada que imprimir", () => {
    const c = guardar(soloTru, { ...soloTru, descuentoPct: 30 }, "lim");
    expect(c).toMatchObject({ total: 2, dondeCambia: [TRU], aqui: null, quedan: [], salen: [] });
    expect(avisoReimprimir(c)?.detalle).toContain("en Tienda Trujillo:");
  });

  it("cambia en todas, pero no lo mismo: las nombra a todas y el botón imprime solo lo de aquí", () => {
    // Solo Trujillo con Blusas → todas las sedes con Blusas y Faldas: Trujillo suma la falda; Arequipa y Lima, las tres prendas.
    const c = guardar(soloTru, { ...todas, categoriaIds: ["c-blusas", "c-faldas"] }, "tru");
    expect(c).toMatchObject({ total: 3, dondeCambia: [AQP, LIM, TRU], aqui: TRU, quedan: ["falda"], salen: [] });
    expect(avisoReimprimir(c)).toEqual({
      detalle: "Cambió el precio en caja de 3 prendas en Tienda Arequipa, Tienda Lima y Tienda Trujillo: sus etiquetas de papel dicen el de antes.",
      boton: "Imprimir la de Tienda Trujillo",
    });
  });

  it("sin saber las tiendas (la base sin la migración) no inventa nombres ni se pierde una campaña limitada", () => {
    const c = prendasQueCambianDePrecioHoy(soloTru, { ...soloTru, descuentoPct: 30 }, aLaVenta, manuales, HOY_);
    expect(c).toMatchObject({ total: 2, dondeCambia: null, quedan: [], salen: [] });
    expect(avisoReimprimir(c)).toEqual({
      detalle: "Cambió el precio en caja de 2 prendas: sus etiquetas de papel dicen el de antes. Imprímelas en cada tienda.",
      boton: null,
    });
  });
});
