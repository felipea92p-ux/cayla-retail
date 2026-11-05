import { describe, expect, it } from "vitest";
import {
  cuantasCaben,
  dibujoDeLaInsignia,
  insigniasDeLaTarjeta,
  leerInsignias,
  sinLasQueLaTiendaYaDice,
  TOPE_DE_INSIGNIAS_EN_LA_TARJETA,
  type Insignia,
} from "./insignias";

const ins = (n: number, nombre: string): Insignia => ({ id: `7b7b7b7b-1111-4222-8333-44444444444${n}`, nombre });
const HALLOWEEN = ins(1, "Halloween");
const REEDICION = ins(2, "Reedición");
const MANO = ins(3, "Hecho a mano");
const GATO = ins(4, "Día Internacional del Gato");

describe("leerInsignias: lo que la base entrega, sin confiar en ello", () => {
  it("lee {id, nombre}; una con un dato raro o repetida se deja fuera y las demás se ven", () => {
    expect(leerInsignias([HALLOWEEN, REEDICION])).toEqual([HALLOWEEN, REEDICION]);
    expect(leerInsignias([HALLOWEEN, { id: "no-es-uuid", nombre: "Rota" }, { id: REEDICION.id, nombre: "   " }, 7, null, HALLOWEEN, REEDICION])).toEqual([HALLOWEEN, REEDICION]);
    expect(leerInsignias([])).toEqual([]);
  });
});

describe("dibujoDeLaInsignia: el dibujo sale del nombre, igual que en el ERP", () => {
  it("la calabaza, el pastel, el gato; sin familia, el de una etiqueta", () => {
    expect(dibujoDeLaInsignia("Halloween")).toBe("halloween");
    expect(dibujoDeLaInsignia("Aniversario CAYLA")).toBe("aniversario");
    expect(dibujoDeLaInsignia("  DÍA INTERNACIONAL DEL GATO ")).toBe("gato");
    expect(dibujoDeLaInsignia("Estreno")).toBe("generico");
  });
});

describe("sinLasQueLaTiendaYaDice: no se repite lo que la tienda cuenta con sus propios números", () => {
  const nuevo = ins(5, "Nuevo");
  const top = ins(6, "  TOP  Ventas ");
  it("«Nuevo» no se repite si la prenda ya es nueva; «Top ventas» no, si ya dice su puesto", () => {
    expect(sinLasQueLaTiendaYaDice([nuevo, top, HALLOWEEN], { nuevo: true, masVendido: true })).toEqual([HALLOWEEN]);
  });
  it("si la tienda no lo dice, la insignia asignada se ve igual (es lo que se marcó)", () => {
    expect(sinLasQueLaTiendaYaDice([nuevo, top, HALLOWEEN], { nuevo: false, masVendido: false })).toEqual([nuevo, top, HALLOWEEN]);
    expect(sinLasQueLaTiendaYaDice([nuevo, top], { nuevo: true, masVendido: false })).toEqual([top]);
  });
  it("un nombre que solo se parece (otra cosa) se ve siempre", () => {
    const otra = ins(7, "Colección nueva");
    expect(sinLasQueLaTiendaYaDice([otra], { nuevo: true, masVendido: true })).toEqual([otra]);
  });
});

describe("insigniasDeLaTarjeta: hasta 3 en total y un «+N»", () => {
  const cinco = [HALLOWEEN, REEDICION, MANO, GATO, ins(8, "Navidad")];
  const sin = { nuevo: false, masVendido: false };

  it("el tope es 3", () => {
    expect(TOPE_DE_INSIGNIAS_EN_LA_TARJETA).toBe(3);
  });

  it("sin nada propio: caben 3 y el resto es el «+N»", () => {
    const r = insigniasDeLaTarjeta(cinco, { propias: 0, ...sin });
    expect(r.visibles).toEqual([HALLOWEEN, REEDICION, MANO]);
    expect(r.mas).toBe(2);
    expect(r.nombres).toEqual(["Halloween", "Reedición", "Hecho a mano", "Día Internacional del Gato", "Navidad"]);
  });

  it("lo propio de la tarjeta (descuento, «Nuevo», puesto) cuenta contra el tope: con «Nuevo» caben 2, con dos propias 1", () => {
    expect(insigniasDeLaTarjeta(cinco, { propias: 1, ...sin })).toMatchObject({ visibles: [HALLOWEEN, REEDICION], mas: 3 });
    expect(insigniasDeLaTarjeta(cinco, { propias: 2, ...sin })).toMatchObject({ visibles: [HALLOWEEN], mas: 4 });
  });

  it("si lo propio ya llena el tope, ninguna asignada se dibuja y todas van al «+N»", () => {
    const r = insigniasDeLaTarjeta([HALLOWEEN, REEDICION], { propias: 3, ...sin });
    expect(r).toMatchObject({ visibles: [], mas: 2 });
    expect(r.nombres).toEqual(["Halloween", "Reedición"]);
  });

  it("si caben todas, no hay «+N»", () => {
    expect(insigniasDeLaTarjeta([HALLOWEEN, REEDICION], { propias: 1, ...sin })).toMatchObject({ visibles: [HALLOWEEN, REEDICION], mas: 0 });
    expect(insigniasDeLaTarjeta([], { propias: 0, ...sin })).toEqual({ visibles: [], mas: 0, nombres: [] });
  });

  it("lo que ya dice la tienda no ocupa lugar ni cuenta en el «+N»", () => {
    const r = insigniasDeLaTarjeta([ins(5, "Nuevo"), HALLOWEEN, REEDICION], { propias: 1, nuevo: true, masVendido: false });
    expect(r.visibles).toEqual([HALLOWEEN, REEDICION]);
    expect(r.mas).toBe(0);
    expect(r.nombres).toEqual(["Halloween", "Reedición"]);
  });

  it("el tope se puede cambiar sin tocar la regla", () => {
    expect(insigniasDeLaTarjeta(cinco, { propias: 0, ...sin }, 2)).toMatchObject({ visibles: [HALLOWEEN, REEDICION], mas: 3 });
  });
});

describe("cuantasCaben: las chips que caben ENTERAS en una fila, con lugar para el «+N»", () => {
  const m = { hueco: 4, anchoMas: 22 };
  it("si caben todas y no hay más, caben todas (sin lugar para el «+N»)", () => {
    expect(cuantasCaben([44, 70, 80], { ...m, disponible: 44 + 70 + 80 + 8, ocultasDeAntemano: false })).toBe(3);
  });
  it("si no cabe la última, se deja fuera y se cuenta en el «+N» (que también tiene que caber)", () => {
    // 44 + 70 + 22 + 8 = 144 ≤ 150; con la tercera (80) no.
    expect(cuantasCaben([44, 70, 80], { ...m, disponible: 150, ocultasDeAntemano: false })).toBe(2);
    // Justo antes de caber con el «+N»: 44 + 70 + 4 + 22 + 4 = 144 > 143 → solo la primera.
    expect(cuantasCaben([44, 70, 80], { ...m, disponible: 143, ocultasDeAntemano: false })).toBe(1);
  });
  it("si el tope de 3 ya dejó insignias en el «+N», ese chip siempre va y ocupa su lugar", () => {
    expect(cuantasCaben([44, 70, 80], { ...m, disponible: 44 + 70 + 80 + 8, ocultasDeAntemano: true })).toBe(2);
    expect(cuantasCaben([44, 70], { ...m, disponible: 44 + 70 + 4 + 4 + 22, ocultasDeAntemano: true })).toBe(2);
  });
  it("una tarjeta tan angosta que solo cabe el «+N»: 0 chips y el resto contado", () => {
    expect(cuantasCaben([60, 70], { ...m, disponible: 40, ocultasDeAntemano: false })).toBe(0);
    expect(cuantasCaben([60], { ...m, disponible: 50, ocultasDeAntemano: true })).toBe(0);
  });
  it("sin chips: 0", () => {
    expect(cuantasCaben([], { ...m, disponible: 100, ocultasDeAntemano: false })).toBe(0);
    expect(cuantasCaben([], { ...m, disponible: 100, ocultasDeAntemano: true })).toBe(0);
  });
  it("nunca devuelve una fila más ancha que el espacio (con una barrida de anchos)", () => {
    const anchos = [38, 44, 90, 80];
    for (let disponible = 0; disponible <= 400; disponible += 7) {
      for (const ocultasDeAntemano of [false, true]) {
        const k = cuantasCaben(anchos, { ...m, disponible, ocultasDeAntemano });
        const usado = anchos.slice(0, k).reduce((a, b) => a + b, 0) + Math.max(0, k - 1) * m.hueco;
        const hayMas = k < anchos.length || ocultasDeAntemano;
        const total = usado + (hayMas ? (k > 0 ? m.hueco : 0) + m.anchoMas : 0);
        if (k > 0 || !hayMas) expect(total).toBeLessThanOrEqual(disponible);
      }
    }
  });
});
