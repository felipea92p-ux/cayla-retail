import { describe, it, expect } from "vitest";
import {
  cambianEnCaja,
  campanasDeLaFicha,
  cobraPorVariante,
  detalleCampana,
  fraseCajaCobra,
  insigniaCampana,
  precioConDescuento,
  precioDeHoy,
  type CampanaDelVocabulario,
  type CampanaDeVariante,
} from "./precio-de-hoy";
import { descuentoDeCampana } from "./vender-reglas";

const ANIVERSARIO: CampanaDeVariante = { etiquetaId: "e-aniv", nombre: "Aniversario CAYLA", pct: 10, hasta: "2026-10-25" };
const LIQUIDAR: CampanaDeVariante = { etiquetaId: "e-liq", nombre: "Para liquidar", pct: 20, hasta: null };
const HOY = "2026-10-21";

const vocabulario: CampanaDelVocabulario[] = [
  { id: "e-aniv", nombre: "Aniversario CAYLA", descuentoPct: 10, vigenteDesde: "2026-10-01", vigenteHasta: "2026-10-25", categoriaIds: [] },
  { id: "e-liq", nombre: "Para liquidar", descuentoPct: 20, vigenteDesde: null, vigenteHasta: null, categoriaIds: ["cat-faldas"] },
  { id: "e-bf", nombre: "Black Friday", descuentoPct: 30, vigenteDesde: "2026-11-27", vigenteHasta: "2026-11-30", categoriaIds: [] },
  { id: "e-nuevo", nombre: "Nuevo", descuentoPct: null, vigenteDesde: null, vigenteHasta: null, categoriaIds: [] },
];

describe("precioConDescuento: la cuenta de la caja", () => {
  it("es el precio menos el descuento de campaña, al céntimo", () => {
    expect(precioConDescuento(79.9, 10)).toBe(71.9);
    expect(precioConDescuento(89.9, 20)).toBe(71.9); // 71.92 exacto se baja al múltiplo de S/ 0.10 (ADR-0403)
    expect(precioConDescuento(39, 20)).toBe(31.2);
  });

  it("coincide con la caja en todos los precios de S/ 1 a S/ 300 y los % de siempre", () => {
    for (let c = 100; c <= 30000; c += 10) {
      const precio = c / 100;
      for (const pct of [10, 15, 20, 25, 30, 50]) {
        const caja = (Math.round(precio * 100) - Math.round(descuentoDeCampana(precio, pct) * 100)) / 100;
        expect(precioConDescuento(precio, pct)).toBe(caja);
      }
    }
  });
});

describe("precioDeHoy: el resumen de una prenda", () => {
  it("sin campaña en ninguna variante no hay nada que decir", () => {
    expect(precioDeHoy([{ id: "a", precio: 79.9 }], () => null)).toBeNull();
  });

  it("una campaña en todas: lista, lo que cobra la caja y la campaña", () => {
    const p = precioDeHoy(
      [
        { id: "a", precio: 79.9 },
        { id: "b", precio: 79.9 },
      ],
      () => ANIVERSARIO,
    );
    expect(p).toEqual({ lista: { desde: 79.9, hasta: 79.9 }, cobra: { desde: 71.9, hasta: 71.9 }, campana: ANIVERSARIO, otras: 0, rebajadas: 2, total: 2 });
  });

  it("solo una parte rebajada: el rango de lo que cobra incluye las que no lo están", () => {
    const p = precioDeHoy(
      [
        { id: "a", precio: 79.9 },
        { id: "b", precio: 79.9 },
      ],
      (id) => (id === "a" ? ANIVERSARIO : null),
    );
    expect(p?.cobra).toEqual({ desde: 71.9, hasta: 79.9 });
    expect(p?.rebajadas).toBe(1);
    expect(p?.total).toBe(2);
  });

  it("dos campañas en la prenda: nombra la mayor y cuenta la otra", () => {
    const p = precioDeHoy(
      [
        { id: "a", precio: 79.9 },
        { id: "b", precio: 79.9 },
      ],
      (id) => (id === "a" ? ANIVERSARIO : LIQUIDAR),
    );
    expect(p?.campana).toBe(LIQUIDAR);
    expect(p?.otras).toBe(1);
  });

  it("a igual %, la de nombre primero (el desempate de la caja)", () => {
    const otra: CampanaDeVariante = { ...ANIVERSARIO, etiquetaId: "e-z", nombre: "Zeta" };
    const alfa: CampanaDeVariante = { ...ANIVERSARIO, etiquetaId: "e-a", nombre: "Alfa" };
    const p = precioDeHoy(
      [
        { id: "a", precio: 50 },
        { id: "b", precio: 50 },
      ],
      (id) => (id === "a" ? otra : alfa),
    );
    expect(p?.campana.nombre).toBe("Alfa");
  });

  it("las variantes sin precio (o en 0) no cuentan", () => {
    const p = precioDeHoy(
      [
        { id: "a", precio: 0 },
        { id: "b", precio: 79.9 },
      ],
      () => ANIVERSARIO,
    );
    expect(p?.total).toBe(1);
    expect(precioDeHoy([{ id: "a", precio: 0 }], () => ANIVERSARIO)).toBeNull();
  });

  it("una campaña sin descuento (0 %) no rebaja", () => {
    expect(precioDeHoy([{ id: "a", precio: 79.9 }], () => ({ ...ANIVERSARIO, pct: 0 }))).toBeNull();
  });
});

describe("campanasDeLaFicha: la regla de la base sobre lo que está en pantalla", () => {
  it("una etiqueta puesta a mano y en su temporada rebaja", () => {
    const m = campanasDeLaFicha([{ id: "a", etiquetaIds: ["e-aniv"] }], "cat-blusas", vocabulario, HOY);
    expect(m.get("a")).toEqual(ANIVERSARIO);
  });

  it("la categoría elegida en la campaña rebaja sin marcar la variante", () => {
    const m = campanasDeLaFicha([{ id: "a", etiquetaIds: [] }], "cat-faldas", vocabulario, HOY);
    expect(m.get("a")).toEqual(LIQUIDAR);
  });

  it("de varias, la mayor", () => {
    const m = campanasDeLaFicha([{ id: "a", etiquetaIds: ["e-aniv"] }], "cat-faldas", vocabulario, HOY);
    expect(m.get("a")?.nombre).toBe("Para liquidar");
  });

  it("una que todavía no empieza, una que ya pasó o una sin descuento no rebajan", () => {
    expect(campanasDeLaFicha([{ id: "a", etiquetaIds: ["e-bf", "e-nuevo"] }], null, vocabulario, HOY).size).toBe(0);
    expect(campanasDeLaFicha([{ id: "a", etiquetaIds: ["e-aniv"] }], null, vocabulario, "2026-10-26").size).toBe(0);
  });

  it("el último día de la campaña todavía rebaja", () => {
    expect(campanasDeLaFicha([{ id: "a", etiquetaIds: ["e-aniv"] }], null, vocabulario, "2026-10-25").get("a")?.pct).toBe(10);
  });
});

describe("cómo se dice", () => {
  const todas = precioDeHoy([{ id: "a", precio: 79.9 }], () => ANIVERSARIO)!;

  it("la insignia es el %", () => {
    expect(insigniaCampana(todas)).toBe("−10 %");
    expect(insigniaCampana({ ...todas, campana: { ...ANIVERSARIO, pct: 12.5 } })).toBe("−12.5 %");
  });

  it("el detalle dice la campaña, hasta cuándo y los dos precios", () => {
    expect(detalleCampana(todas)).toBe("Aniversario CAYLA (−10 %) hasta el 25 oct.: la caja cobra S/ 71.90 en vez de S/ 79.90.");
  });

  it("igual que lo guardado: lo que la caja cobra hoy", () => {
    expect(fraseCajaCobra(todas, todas, { desde: 79.9, hasta: 79.9 })).toEqual({
      texto: "Con Aniversario CAYLA (−10 %) la caja cobra S/ 71.90 hasta el 25 oct.",
      alGuardar: false,
    });
  });

  it("una campaña puesta y sin guardar: lo que cobrará al guardar", () => {
    expect(fraseCajaCobra(null, todas, { desde: 79.9, hasta: 79.9 })?.texto).toBe(
      "Al guardar, con Aniversario CAYLA (−10 %) la caja cobrará S/ 71.90 hasta el 25 oct.",
    );
  });

  it("la campaña quitada y sin guardar: vuelve el precio de lista", () => {
    expect(fraseCajaCobra(todas, null, { desde: 79.9, hasta: 79.9 })?.texto).toBe(
      "Al guardar, la caja vuelve a cobrar S/ 79.90: ya no tendrá Aniversario CAYLA (−10 %).",
    );
  });

  it("un precio nuevo con la misma campaña también es «al guardar»", () => {
    const tras = precioDeHoy([{ id: "a", precio: 89.9 }], () => ANIVERSARIO);
    expect(fraseCajaCobra(todas, tras, { desde: 89.9, hasta: 89.9 })?.texto).toBe(
      "Al guardar, con Aniversario CAYLA (−10 %) la caja cobrará S/ 80.90 hasta el 25 oct.",
    );
  });

  it("solo una parte y precios distintos: el rango y cuántas", () => {
    const p = precioDeHoy(
      [
        { id: "a", precio: 69.9 },
        { id: "b", precio: 79.9 },
        { id: "c", precio: 79.9 },
      ],
      (id) => (id === "c" ? null : LIQUIDAR),
    )!;
    expect(fraseCajaCobra(p, p, null)?.texto).toBe("Con Para liquidar (−20 %) la caja cobra de S/ 55.90 a S/ 79.90 en 2 de 3 variantes.");
  });

  it("con precio propio de la tienda, nombra su caja", () => {
    expect(fraseCajaCobra(todas, todas, null, "Trujillo")?.texto).toBe("Con Aniversario CAYLA (−10 %) la caja de Trujillo cobra S/ 71.90 hasta el 25 oct.");
  });

  it("sin campaña ni antes ni ahora, no dice nada", () => {
    expect(fraseCajaCobra(null, null, { desde: 79.9, hasta: 79.9 })).toBeNull();
  });
});

describe("cambianEnCaja: qué etiquetas de papel quedan viejas al guardar", () => {
  const antes = cobraPorVariante(
    [
      { id: "a", precio: 79.9 },
      { id: "b", precio: 79.9 },
      { id: "c", precio: 79.9 },
    ],
    new Map(),
  );

  it("las que entran a una campaña, las que salen y las que cambian de precio", () => {
    const despues = cobraPorVariante(
      [
        { id: "a", precio: 79.9 },
        { id: "b", precio: 89.9 },
        { id: "c", precio: 79.9 },
      ],
      new Map([["a", ANIVERSARIO]]),
    );
    expect(cambianEnCaja(antes, despues)).toEqual(["a", "b"]);
  });

  it("una variante nueva no está en la cuenta (sus etiquetas salen por lo que entró)", () => {
    expect(cambianEnCaja(antes, cobraPorVariante([{ id: "z", precio: 79.9 }], new Map([["z", ANIVERSARIO]])))).toEqual([]);
  });

  it("sin cambios, nada", () => {
    expect(cambianEnCaja(antes, antes)).toEqual([]);
  });
});
