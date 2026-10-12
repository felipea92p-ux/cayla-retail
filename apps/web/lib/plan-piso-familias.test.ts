import { describe, expect, it } from "vitest";
import {
  armarColorDeLaTienda,
  claveDeFamilia,
  DIFERENCIA_MINIMA,
  HEX_DE_NEUTRO,
  lecturaDelColor,
  MAX_FAMILIAS,
  MINIMO_DE_VENTAS,
  notaDelColor,
  palabraDeMarca,
  palabraDeMarcaDeColor,
  SIN_FAMILIA,
  textoDeAMirar,
  textoDeVentasDeFamilia,
  type FamiliaDeColor,
  type TallaParaColor,
  type VentaParaColor,
  type Veredicto,
  veredictoDeReparto,
  Z_MINIMO,
} from "./plan-piso-familias";
import { armarPropuesta } from "./mix-piso";
import type { CategoriaMix, GrupoMix } from "./plan-piso-grupos";
import type { LecturaDelPiso } from "./piso-plan";

/** Datos INVENTADOS con la forma de Tienda TRU del 2026-10-12: [color, familia, hex, colgadas, vendidas confirmadas en 14 días]. */
const TRU: [string, string, string | null, number, number][] = [
  ["Negro", "neutro", "#1f1f1d", 31, 41], ["Blanco", "neutro", "#fbfaf7", 30, 29], ["Crudo", "neutro", "#efe6d4", 15, 12], ["Gris antracita", "neutro", "#4a4a4d", 16, 3],
  ["Gris perla", "neutro", "#c9cacd", 14, 3], ["Nude", "neutro", "#e8c9b5", 5, 1], ["Crema", "neutro", "#f6edd6", 3, 2], ["Perla", "neutro", "#f1efe9", 1, 4],
  ["Gris", "neutro", "#8b8d90", 2, 3], ["Gris piedra", "neutro", "#c4bba6", 1, 1], ["Gris melange", "neutro", "#b5b5b3", 1, 1],
  ["Beige", "tierra", "#cdb592", 34, 21], ["Arena", "tierra", "#d8c39d", 31, 3], ["Chocolate", "tierra", "#5a3b2e", 21, 26], ["Marrón", "tierra", "#7b5337", 13, 10],
  ["Moka", "tierra", "#8d6a52", 9, 10], ["Camel", "tierra", "#b98a54", 7, 5], ["Coñac", "tierra", "#9a5a32", 5, 1], ["Tostado", "tierra", "#b3774a", 1, 1],
  ["Topo", "tierra", "#8a7a6a", 0, 5], ["Caqui", "tierra", "#b4a47a", 0, 1], ["Terracota", "tierra", "#b5604a", 0, 1],
  ["Celeste", "azul", "#a9cbe4", 27, 26], ["Azul denim", "azul", "#4b6a8c", 11, 6], ["Azul marino", "azul", "#1f2f4d", 7, 4], ["Azul claro", "azul", "#b8d0e8", 6, 2],
  ["Azul eléctrico", "azul", "#1f4fd8", 2, 2], ["Azul intermedio", "azul", "#5f84b0", 4, 0], ["Hielo bleach", "azul", "#cfdbe6", 3, 0], ["Índigo", "azul", "#2d3e6b", 2, 0],
  ["Turquesa", "azul", "#3fb0b5", 0, 1], ["Azul acero", "azul", "#6f8aa3", 1, 0], ["Azul zafiro", "azul", "#2a4ea0", 1, 0], ["Azul medio", "azul", "#4a76b8", 1, 0], ["Azul natural", "azul", "#7a95b3", 1, 0],
  ["Vino", "rojo", "#6b1f2b", 14, 17], ["Rojo", "rojo", "#c0392b", 5, 1], ["Rojo tomate", "rojo", "#d4503a", 1, 0], ["Marsala", "rojo", "#8e3a45", 1, 0], ["Cereza", "rojo", "#a3202f", 1, 0], ["Coral", "rojo", "#ef7b6a", 1, 0],
  ["Rosado", "rosado", "#e8a3b5", 6, 4], ["Palo rosa", "rosado", "#d9a5a0", 4, 3], ["Rosa pálido", "rosado", "#f2cdd2", 3, 2], ["Rosa chicle", "rosado", "#f27fa8", 1, 1], ["Rosa sandía", "rosado", "#f2607a", 1, 0],
  ["Salvia", "verde", "#9aa88a", 1, 2], ["Pistacho", "verde", "#b9cf9a", 2, 1], ["Verde oliva", "verde", "#6b7040", 3, 0], ["Verde militar", "verde", "#4a5b3a", 1, 0], ["Verde agua", "verde", "#a5d6c4", 1, 0],
  ["Vainilla", "amarillo", "#f3e6b3", 2, 9], ["Amarillo mantequilla", "amarillo", "#f5dc8a", 3, 3], ["Amarillo limón", "amarillo", "#f0e04a", 2, 1], ["Amarillo", "amarillo", "#f2c830", 0, 1], ["Mostaza", "amarillo", "#c79a1e", 0, 1],
  ["Ciruela", "morado", "#5a2a4a", 1, 1], ["Mora", "morado", "#5b2c5f", 2, 0], ["Lavanda", "morado", "#b7a6d6", 1, 0], ["Lila", "morado", "#c8a2d0", 1, 0], ["Glicina", "morado", "#b69ac4", 1, 0], ["Morado", "morado", "#6a3d9a", 1, 0],
  ["Naranja", "naranja", "#e8742a", 1, 1],
];
const ANOTADAS_TRU: Record<string, number> = { neutro: 52, tierra: 40, azul: 22, rojo: 9, rosado: 7, verde: 4, amarillo: 6, morado: 2, naranja: 1 };

// El código de un color es único en `retail.colores`: aquí sale del nombre entero (con sólo las primeras letras, «Azul marino» y «Azul claro» se fundirían en uno).
const codigoDe = (color: string): string => color.toUpperCase().replace(/[^A-ZÑ0-9]/g, "");
const talla = (color: string, familia: string | null, hex: string | null, colgadas: number, vendidas: number): TallaParaColor => ({ colorCodigo: codigoDe(color), color, colorHex: hex, familiaColor: familia, pisoLibre: colgadas, vendidas14: vendidas });
const tallasDe = (filas: typeof TRU): TallaParaColor[] => filas.map(([c, f, h, col, v]) => talla(c, f, h, col, v));
const ventasDe = (filas: typeof TRU, anotadas: Record<string, number>): VentaParaColor[] => {
  const conf: Record<string, number> = {};
  for (const [, f, , , v] of filas) conf[f] = (conf[f] ?? 0) + v;
  return [...new Set([...Object.keys(conf), ...Object.keys(anotadas)])].map((f) => ({ familiaColor: f, escaneadas: conf[f] ?? 0, anotadas: anotadas[f] ?? 0 }));
};
const tru = () => armarColorDeLaTienda({ tallas: tallasDe(TRU), ventas: ventasDe(TRU, ANOTADAS_TRU) })!;

describe("la regla de evidencia: solo marca lo que el azar no explica", () => {
  it("con menos ventas que el mínimo no opina, aunque la diferencia sea enorme", () => {
    expect(veredictoDeReparto({ vendidas: 20, esperadas: 2, totalVentas: MINIMO_DE_VENTAS - 1 })).toBeNull();
    expect(veredictoDeReparto({ vendidas: 20, esperadas: 2, totalVentas: MINIMO_DE_VENTAS })).toBe("falta");
  });

  it("dentro de lo esperado no marca", () => {
    expect(veredictoDeReparto({ vendidas: 100, esperadas: 100, totalVentas: 400 })).toBeNull();
    expect(veredictoDeReparto({ vendidas: 110, esperadas: 100, totalVentas: 400 })).toBeNull();
  });

  it("el borde del residuo: justo en Z_MINIMO marca, un poco menos no", () => {
    // z = (esperadas·1,2 − esperadas)/√esperadas = 0,2·√esperadas: con esperadas = 100 vale 2 exacto.
    expect(Z_MINIMO).toBe(2);
    expect(veredictoDeReparto({ vendidas: 120, esperadas: 100, totalVentas: 400 })).toBe("falta");
    expect(veredictoDeReparto({ vendidas: 119, esperadas: 100, totalVentas: 400 })).toBeNull();
    expect(veredictoDeReparto({ vendidas: 80, esperadas: 100, totalVentas: 400 })).toBe("sobra");
    expect(veredictoDeReparto({ vendidas: 81, esperadas: 100, totalVentas: 400 })).toBeNull();
  });

  it("la varianza no baja de 2: con casi nada esperado, 3 ventas no son una señal (el «Gris» de TRU), pero 4 con 1 colgada sí (la «Perla»)", () => {
    expect(veredictoDeReparto({ vendidas: 3, esperadas: 1.49, totalVentas: 273 })).toBeNull();
    expect(veredictoDeReparto({ vendidas: 4, esperadas: 0.74, totalVentas: 273 })).toBe("falta");
    expect(veredictoDeReparto({ vendidas: 5, esperadas: 0, totalVentas: 273 })).toBe("falta");
  });

  it("además del residuo pide DIFERENCIA_MINIMA prendas: dos de más no son una señal", () => {
    expect(DIFERENCIA_MINIMA).toBe(3);
    expect(veredictoDeReparto({ vendidas: 2, esperadas: 0, totalVentas: 273 })).toBeNull(); // z = 1,4
    expect(veredictoDeReparto({ vendidas: 3, esperadas: 0, totalVentas: 273 })).toBe("falta"); // z = 2,1 y 3 prendas: se acabó y se vende
    // Un residuo que pasa de 2 con menos de 3 prendas de diferencia (solo con esperadas fraccionarias muy chicas) tampoco marca.
    expect(veredictoDeReparto({ vendidas: 3, esperadas: 0.05, totalVentas: 273 })).toBeNull();
  });

  it("es simétrica: lo que marca «falta» al vender de más marca «sobra» al vender lo mismo de menos", () => {
    for (const esperadas of [10, 25, 60, 150, 400]) {
      for (const d of [3, 5, 9, 20, 50]) {
        const arriba = veredictoDeReparto({ vendidas: esperadas + d, esperadas, totalVentas: 1000 });
        const abajo = veredictoDeReparto({ vendidas: Math.max(0, esperadas - d), esperadas, totalVentas: 1000 });
        if (esperadas - d >= 0) expect(arriba === "falta").toBe(abajo === "sobra");
      }
    }
  });

  it("lo que no es una cuenta (NaN, infinito, negativo) nunca marca ni revienta: sin dato no hay marca, no un cero", () => {
    expect(veredictoDeReparto({ vendidas: Number.NaN, esperadas: 5, totalVentas: 300 })).toBeNull();
    expect(veredictoDeReparto({ vendidas: -4, esperadas: 5, totalVentas: 300 })).toBeNull();
    expect(veredictoDeReparto({ vendidas: 10, esperadas: -3, totalVentas: 300 })).toBeNull();
    expect(veredictoDeReparto({ vendidas: 10, esperadas: Number.POSITIVE_INFINITY, totalVentas: 300 })).toBeNull();
    expect(veredictoDeReparto({ vendidas: 10, esperadas: 5, totalVentas: Number.NaN })).toBeNull();
  });
});

describe("TRU de ejemplo: lo que dice la franja", () => {
  const f = tru();
  const familia = (clave: string) => f.familias.find((x) => x.clave === clave)!;

  it("cuenta lo que cuelga y lo que se vendió, con las «sin registrar» solo por familia", () => {
    expect(f.colgadas).toBe(367);
    expect(f.confirmadas).toBe(273);
    expect(f.anotadas).toBe(143);
    expect(f.vendidas).toBe(416);
    expect(f.confirmadasPorColor).toBe(273);
    expect(f.hayVentas).toBe(true);
    expect(f.hayDetalleDeColor).toBe(true);
  });

  it("los porcentajes de lo que cuelga suman 100 (con el redondeo)", () => {
    const suma = f.familias.reduce((s, x) => s + x.pctColgadas, 0);
    expect(suma).toBeGreaterThan(99.5);
    expect(suma).toBeLessThan(100.5);
    expect(familia("tierra").pctColgadas).toBe(33);
    expect(familia("neutro").pctColgadas).toBe(32.4);
  });

  it("muestra las 6 más relevantes por el mayor de lo que cuelga o lo que vende, y el resto en «Otras»", () => {
    expect(f.visibles.map((x) => x.clave)).toEqual(["neutro", "tierra", "azul", "rojo", "amarillo", "rosado"]);
    expect(f.otras!.familias.map((x) => x.clave)).toEqual(["verde", "morado", "naranja"]);
    expect(f.visibles.length).toBe(MAX_FAMILIAS);
    // Amarillo cuelga 1,9 % pero vende 5 %: por «lo que cuelga» habría caído en «Otras» detrás de Verde (2,2 %).
    expect(familia("amarillo").pctColgadas).toBeLessThan(familia("verde").pctColgadas);
    expect(f.visibles.map((x) => x.clave)).toContain("amarillo");
  });

  it("«Otras» suma exactamente sus familias", () => {
    const o = f.otras!;
    expect(o.colgadas).toBe(o.familias.reduce((s, x) => s + x.colgadas, 0));
    expect(o.colgadas).toBe(16);
    expect(o.pctColgadas).toBeCloseTo(4.4, 1);
  });

  it("solo Amarillo lleva marca de familia, y la frase la nombra con sus dos cifras", () => {
    expect(f.familias.filter((x) => x.veredicto !== null).map((x) => [x.clave, x.veredicto])).toEqual([["amarillo", "falta"]]);
    expect(f.lectura.tipo).toBe("aparte");
    expect(f.lectura.frase).toBe("Dentro de lo esperado, salvo Amarillo (vende 5 % y cuelga 1.9 %).");
    expect(f.lectura.familias).toEqual(["Amarillo"]);
  });

  it("Tierra se ve equilibrada, pero el desglose descubre a Arena, Chocolate y Topo", () => {
    const t = familia("tierra");
    expect(t.veredicto).toBeNull();
    const marca = (n: string) => t.colores.find((c) => c.nombre === n)!;
    expect(marca("Arena").veredicto).toBe("sobra");
    expect(marca("Chocolate").veredicto).toBe("falta");
    expect(marca("Topo").veredicto).toBe("falta");
    expect(marca("Topo").agotado).toBe(true);
    expect(marca("Chocolate").agotado).toBe(false);
    expect(marca("Beige").veredicto).toBeNull();
    expect(t.aMirar).toBe(3);
  });

  it("los colores con marca de TODA la tienda, completos (si cambia un umbral, esto lo dice)", () => {
    const marcados = f.familias.flatMap((x) => x.colores.filter((c) => c.veredicto !== null).map((c) => `${c.nombre}:${c.veredicto}`)).sort();
    expect(marcados).toEqual(["Arena:sobra", "Chocolate:falta", "Gris antracita:sobra", "Gris perla:sobra", "Negro:falta", "Perla:falta", "Topo:falta", "Vainilla:falta", "Vino:falta"]);
    // «Gris» (2 colgadas, 3 vendidas) NO es una señal: era el falso positivo de la primera versión.
    expect(familia("neutro").colores.find((c) => c.nombre === "Gris")!.veredicto).toBeNull();
  });

  it("dentro de una familia van primero los que se venden y faltan, luego los que cuelgan y no salen, y al final el resto del que más cuelga al que menos", () => {
    const orden = familia("tierra").colores.map((c) => c.nombre);
    expect(orden.slice(0, 3)).toEqual(["Chocolate", "Topo", "Arena"]);
    const resto = familia("tierra").colores.slice(3);
    expect(resto.map((c) => c.colgadas)).toEqual([...resto.map((c) => c.colgadas)].sort((a, b) => b - a));
  });

  it("«N colores a mirar» cuenta los de cada familia y «Otras» suma los de las suyas", () => {
    expect(familia("neutro").aMirar).toBe(4);
    expect(familia("rojo").aMirar).toBe(1);
    expect(familia("azul").aMirar).toBe(0);
    expect(f.otras!.aMirar).toBe(familia("verde").aMirar + familia("morado").aMirar + familia("naranja").aMirar);
  });

  it("un color de la familia se pinta con el que más cuelga; Neutro, con su gris fijo", () => {
    expect(familia("tierra").hex).toBe("#cdb592");
    expect(familia("azul").hex).toBe("#a9cbe4");
    expect(familia("neutro").hex).toBe(HEX_DE_NEUTRO);
  });
});

describe("cuando la tienda casi no tiene ventas confirmadas (AQP: 169 de 170 anotadas)", () => {
  const tallas = tallasDe([["Negro", "neutro", "#1f1f1d", 40, 1], ["Beige", "tierra", "#cdb592", 40, 1], ["Celeste", "azul", "#a9cbe4", 45, 1], ["Vino", "rojo", "#6b1f2b", 10, 0]]);
  const ventas = [
    { familiaColor: "neutro", escaneadas: 1, anotadas: 60 }, { familiaColor: "tierra", escaneadas: 1, anotadas: 40 },
    { familiaColor: "azul", escaneadas: 1, anotadas: 10 }, { familiaColor: "rojo", escaneadas: 0, anotadas: 15 },
  ];
  const f = armarColorDeLaTienda({ tallas, ventas })!;

  it("la familia sí tiene evidencia (cuentan las anotadas) y el color no (solo cuentan las confirmadas)", () => {
    expect(f.vendidas).toBe(128);
    expect(f.confirmadasPorColor).toBe(3);
    expect(f.hayVentas).toBe(true);
    expect(f.hayDetalleDeColor).toBe(false);
  });

  it("marca a la familia que cuelga de más, y a ningún color", () => {
    expect(f.familias.find((x) => x.clave === "azul")!.veredicto).toBe("sobra");
    expect(f.familias.flatMap((x) => x.colores).every((c) => c.veredicto === null)).toBe(true);
  });
});

describe("pocas ventas: no opina", () => {
  const f = armarColorDeLaTienda({ tallas: tallasDe([["Negro", "neutro", "#1f1f1d", 50, 5], ["Vainilla", "amarillo", "#f3e6b3", 1, 9]]), ventas: [{ familiaColor: "neutro", escaneadas: 5, anotadas: 0 }, { familiaColor: "amarillo", escaneadas: 9, anotadas: 0 }] })!;

  it("sin las ventas mínimas, ninguna marca y la frase lo dice", () => {
    expect(f.hayVentas).toBe(false);
    expect(f.familias.every((x) => x.veredicto === null)).toBe(true);
    expect(f.lectura).toEqual({ tipo: "sin-ventas", frase: "Todavía hay pocas ventas para opinar (14 en 14 días): esto es solo lo que cuelga.", familias: [] });
  });
});

describe("la frase de la tienda", () => {
  const fam = (nombre: string, veredicto: Veredicto | null, pctColgadas: number, pctVendidas: number): FamiliaDeColor => ({
    clave: nombre.toLowerCase(), nombre, hex: null, colgadas: 1, pctColgadas, confirmadas: 1, anotadas: 0, vendidas: 1, pctVendidas, esperadas: 1, veredicto, colores: [], aMirar: 0,
  });

  it("sin familias que se aparten dice que lo que cuelga se parece a lo que se vende", () => {
    expect(lecturaDelColor({ familias: [fam("Neutro", null, 30, 31)], vendidas: 100 })).toEqual({ tipo: "parejo", frase: "Lo que cuelga se parece a lo que vendes.", familias: [] });
  });

  it("nombra hasta dos con su cifra (las que más venden primero) y cuenta el resto, sin «y … y»", () => {
    const familias = [fam("Azul", "sobra", 30, 15), fam("Rojo", "falta", 4.6, 8.8), fam("Amarillo", "falta", 1.3, 4.7), fam("Morado", "falta", 0.7, 1.8)];
    const l = lecturaDelColor({ familias, vendidas: 170 });
    expect(l.frase).toBe("Dentro de lo esperado, salvo Azul (cuelga 30\u00a0% y vende 15\u00a0%), Rojo (vende 8.8\u00a0% y cuelga 4.6\u00a0%) y 2 familias más.");
    expect(l.frase.match(/ y /g)!.length).toBe(1 + 2); // «cuelga … y vende», «vende … y cuelga» y el «y 2 familias más»: ninguno es un «A y B y C»
    expect(l.familias).toEqual(["Azul", "Rojo", "Amarillo", "Morado"]);
  });

  it("dos familias van unidas con «y»; una que sobra se dice con lo que cuelga primero y una que falta con lo que vende primero", () => {
    const l = lecturaDelColor({ familias: [fam("Azul", "sobra", 30, 15), fam("Rojo", "falta", 4.6, 8.8)], vendidas: 170 });
    expect(l.frase).toBe("Dentro de lo esperado, salvo Azul (cuelga 30\u00a0% y vende 15\u00a0%) y Rojo (vende 8.8\u00a0% y cuelga 4.6\u00a0%).");
  });
});

describe("las palabras de la pantalla", () => {
  it("la marca de una familia y la de un color", () => {
    expect(palabraDeMarca("falta")).toBe("Le falta lugar");
    expect(palabraDeMarca("sobra")).toBe("Cuelga de más");
    expect(palabraDeMarcaDeColor({ veredicto: "falta", agotado: false })).toBe("Se vende y falta");
    expect(palabraDeMarcaDeColor({ veredicto: "falta", agotado: true })).toBe("Se acabó y se vende");
    expect(palabraDeMarcaDeColor({ veredicto: "sobra", agotado: false })).toBe("Cuelga y no sale");
    expect(palabraDeMarcaDeColor({ veredicto: null, agotado: false })).toBeNull();
  });

  it("«N colores a mirar» concuerda y calla en cero", () => {
    expect(textoDeAMirar(0)).toBe("");
    expect(textoDeAMirar(1)).toBe("1 color a mirar");
    expect(textoDeAMirar(4)).toBe("4 colores a mirar");
  });

  it("las ventas de una familia en una línea, con «sin registrar» solo si las hay", () => {
    expect(textoDeVentasDeFamilia({ vendidas: 124, confirmadas: 84, anotadas: 40 })).toBe("124 ventas: 84 confirmadas y 40 sin registrar");
    expect(textoDeVentasDeFamilia({ vendidas: 84, confirmadas: 84, anotadas: 0 })).toBe("84 ventas");
    expect(textoDeVentasDeFamilia({ vendidas: 1, confirmadas: 1, anotadas: 0 })).toBe("1 venta");
    expect(textoDeVentasDeFamilia({ vendidas: 3, confirmadas: 1, anotadas: 2 })).toBe("3 ventas: 1 confirmada y 2 sin registrar");
  });
});

describe("la nota al pie dice de dónde salen las ventas, según los datos", () => {
  const base = { hayVentas: true, hayDetalleDeColor: true, vendidas: 416, confirmadas: 273, anotadas: 143 };

  it("con ventas de las dos clases dice cuántas son de cada una y que por color solo cuentan las confirmadas", () => {
    expect(notaDelColor(base, 14)).toBe("Las marcas comparan lo que cuelga con tus 416 ventas de 14 días (273 confirmadas y 143 sin registrar). Por color solo se cuentan las confirmadas.");
  });

  it("sin «sin registrar» no las menciona", () => {
    expect(notaDelColor({ ...base, vendidas: 273, anotadas: 0 }, 14)).toBe("Las marcas comparan lo que cuelga con tus 273 ventas de 14 días. Por color solo se cuentan las confirmadas.");
  });

  it("casi todo sin registrar: avisa que por color todavía no se puede ver qué sale", () => {
    const n = notaDelColor({ hayVentas: true, hayDetalleDeColor: false, vendidas: 128, confirmadas: 3, anotadas: 125 }, 14);
    expect(n).toContain("(3 confirmadas y 125 sin registrar)");
    expect(n).toContain("por color todavía no se puede ver qué sale");
  });

  it("con pocas ventas dice cuántas hacen falta, no una cifra suelta", () => {
    expect(notaDelColor({ hayVentas: false, hayDetalleDeColor: false, vendidas: 14, confirmadas: 14, anotadas: 0 }, 14)).toBe("Con 30 ventas o más en 14 días, la franja marca lo que se aparta de lo que vendes.");
  });
});

describe("lo que no es un color, una cuenta rara o un orden distinto", () => {
  it("sin nada colgado no hay franja (no hay qué repartir), aunque haya ventas", () => {
    expect(armarColorDeLaTienda({ tallas: [], ventas: [] })).toBeNull();
    expect(armarColorDeLaTienda({ tallas: tallasDe([["Negro", "neutro", "#1f1f1d", 0, 5]]), ventas: [{ familiaColor: "neutro", escaneadas: 5, anotadas: 0 }] })).toBeNull();
  });

  it("lo que no tiene familia (Estampado, Multicolor) es su propia familia «Sin familia», sin color que pintar", () => {
    const f = armarColorDeLaTienda({ tallas: [talla("Estampado", null, null, 10, 0), talla("Negro", "neutro", "#1f1f1d", 10, 0)], ventas: [] })!;
    const sin = f.familias.find((x) => x.clave === SIN_FAMILIA)!;
    expect(sin.nombre).toBe("Sin familia");
    expect(sin.hex).toBeNull();
    expect(sin.colgadas).toBe(10);
    expect(claveDeFamilia(null)).toBe(SIN_FAMILIA);
    expect(claveDeFamilia("  ")).toBe(SIN_FAMILIA);
    expect(claveDeFamilia(" azul ")).toBe("azul");
  });

  it("una familia que la base creó y el código aún no conoce sale con su propio nombre, no escondida", () => {
    const f = armarColorDeLaTienda({ tallas: [talla("Menta", "turquesa", "#7fd1b9", 5, 0), talla("Negro", "neutro", "#1f1f1d", 5, 0)], ventas: [] })!;
    expect(f.familias.find((x) => x.clave === "turquesa")!.nombre).toBe("Turquesa");
  });

  it("cuentas inválidas (NaN, negativas, cero) no suman ni crean familias", () => {
    const f = armarColorDeLaTienda({
      tallas: [talla("Negro", "neutro", "#1f1f1d", 10, 0), talla("Rojo", "rojo", "#c0392b", Number.NaN, -3), talla("Azul", "azul", "#2a4ea0", -5, Number.NaN)],
      ventas: [{ familiaColor: "rojo", escaneadas: Number.NaN, anotadas: -2 }],
    })!;
    expect(f.familias.map((x) => x.clave)).toEqual(["neutro"]);
    expect(f.colgadas).toBe(10);
    expect(f.vendidas).toBe(0);
  });

  it("un hex mal escrito deja el color sin hex (nunca se pinta algo inventado); y si otra talla trae el hex bueno, se queda con él", () => {
    const f = armarColorDeLaTienda({ tallas: [talla("Verde", "verde", "verde", 3, 0), { ...talla("Verde", "verde", "#2e7d32", 2, 0) }], ventas: [] })!;
    expect(f.familias[0]!.colores[0]!.hex).toBe("#2e7d32");
    const sinHex = armarColorDeLaTienda({ tallas: [talla("Verde", "verde", "#2e7d3", 3, 0)], ventas: [] })!;
    expect(sinHex.familias[0]!.hex).toBeNull();
  });

  it("varias tallas del mismo color suman en una sola entrada del desglose", () => {
    const f = armarColorDeLaTienda({ tallas: [talla("Negro", "neutro", "#1f1f1d", 4, 1), talla("Negro", "neutro", "#1F1F1D", 6, 2)], ventas: [] })!;
    expect(f.familias[0]!.colores).toHaveLength(1);
    expect(f.familias[0]!.colores[0]).toMatchObject({ colgadas: 10, confirmadas: 3, hex: "#1f1f1d" });
  });

  it("el resultado no depende del orden en que llegó la lectura (ni del de las tallas, ni del de las ventas)", () => {
    const a = armarColorDeLaTienda({ tallas: tallasDe(TRU), ventas: ventasDe(TRU, ANOTADAS_TRU) });
    const al = (i: number) => (i * 7919) % 1000;
    const tallas = tallasDe(TRU).map((t, i) => ({ t, k: al(i) })).sort((x, y) => x.k - y.k).map((x) => x.t);
    const ventas = ventasDe(TRU, ANOTADAS_TRU).map((v, i) => ({ v, k: al(i + 3) })).sort((x, y) => x.k - y.k).map((x) => x.v);
    expect(armarColorDeLaTienda({ tallas, ventas })).toEqual(a);
  });

  it("si cada familia vende en la misma proporción que cuelga, nadie lleva marca (aunque haya mil ventas)", () => {
    const colg: [string, number][] = [["neutro", 100], ["tierra", 60], ["azul", 40], ["rojo", 20], ["rosado", 10]];
    const tallas = colg.map(([f, n]) => talla(`C-${f}`, f, "#112233", n, 0));
    const ventas = colg.map(([f, n]) => ({ familiaColor: f, escaneadas: n * 4, anotadas: n * 2 }));
    const f = armarColorDeLaTienda({ tallas, ventas })!;
    expect(f.familias.every((x) => x.veredicto === null)).toBe(true);
    expect(f.lectura.tipo).toBe("parejo");
  });
});

describe("la franja cuenta lo mismo que el riel", () => {
  const GRUPOS: GrupoMix[] = [
    { clave: "polos", nombre: "Polos", rol: "destino", enRiel: true, orden: 10 },
    { clave: "jeans", nombre: "Jeans", rol: "destino", enRiel: true, orden: 20 },
    { clave: "accesorios", nombre: "Accesorios", rol: "conveniencia", enRiel: false, orden: 70 },
  ];
  const cat = (categoriaId: string, grupoClave: string | null): CategoriaMix => ({ categoriaId, categoria: categoriaId, prefijo: null, familia: "indumentaria", grupoClave, confirmada: false, confirmadaEn: null, version: 1 });
  const CATEGORIAS = [cat("c-polos", "polos"), cat("c-jeans", "jeans"), cat("c-acc", "accesorios"), cat("c-nueva", null)];
  const t = (categoriaId: string, color: string, familia: string, pisoLibre: number, vendidas14 = 0) => ({
    varianteId: `${categoriaId}-${color}`, productoId: categoriaId, referencia: "R", categoriaId, tallaId: null, talla: null, colorCodigo: color.toUpperCase(), color, colorHex: "#445566", familiaColor: familia,
    retirada: false, fotoUrl: null, pisoLibre, almacenLibre: 0, enCamino: 0, vendidasHoy: 0, vendidasAyer: 0, vendidas14,
  });
  const lectura: LecturaDelPiso = {
    ubicacionId: "sede", separaPiso: true, cuadradoEn: null, hoy: "2026-10-12", dias: 14,
    tallas: [t("c-polos", "Negro", "neutro", 30, 10), t("c-polos", "Beige", "tierra", 20, 5), t("c-jeans", "Azul", "azul", 10, 3), t("c-acc", "Rojo", "rojo", 11, 4), t("c-nueva", "Verde", "verde", 7, 2)],
    ventas: [
      { categoriaId: "c-polos", tallaId: null, talla: null, familiaColor: "neutro", escaneadas: 10, anotadas: 5 }, { categoriaId: "c-polos", tallaId: null, talla: null, familiaColor: "tierra", escaneadas: 5, anotadas: 0 },
      { categoriaId: "c-jeans", tallaId: null, talla: null, familiaColor: "azul", escaneadas: 3, anotadas: 1 }, { categoriaId: "c-acc", tallaId: null, talla: null, familiaColor: "rojo", escaneadas: 4, anotadas: 9 },
      { categoriaId: "c-nueva", tallaId: null, talla: null, familiaColor: "verde", escaneadas: 2, anotadas: 2 },
    ],
    anotadasRecientes: [], curvas: [],
  };
  const p = armarPropuesta({ grupos: GRUPOS, categorias: CATEGORIAS, lectura, capacidad: 600, codigoSede: "tru" });

  it("suma EXACTAMENTE lo que cuelga en el riel: ni los grupos de fuera del riel ni las categorías sin grupo cuentan", () => {
    expect(p.colgadasEnElRiel).toBe(60);
    expect(p.colorDeLaTienda!.colgadas).toBe(p.colgadasEnElRiel);
    expect(p.colorDeLaTienda!.familias.map((x) => x.clave).sort()).toEqual(["azul", "neutro", "tierra"]);
  });

  it("las ventas son las del riel: no entran las de fuera del riel ni las de una categoría sin grupo", () => {
    const c = p.colorDeLaTienda!;
    expect(c.confirmadas).toBe(10 + 5 + 3);
    expect(c.anotadas).toBe(5 + 0 + 1);
    expect(c.confirmadas).toBe(p.ventasConfirmadasDelRiel);
    expect(c.anotadas).toBe(p.ventasAnotadasDelRiel);
  });

  it("sin nada colgado en el riel no hay franja", () => {
    const vacia = armarPropuesta({ grupos: GRUPOS, categorias: CATEGORIAS, lectura: { ...lectura, tallas: lectura.tallas.map((x) => ({ ...x, pisoLibre: 0 })) }, capacidad: 600, codigoSede: "tru" });
    expect(vacia.colorDeLaTienda).toBeNull();
  });

  it("la franja no cambia ninguna cuenta de la propuesta (solo se dibuja)", () => {
    const otra = armarPropuesta({ grupos: GRUPOS, categorias: CATEGORIAS, lectura: { ...lectura, tallas: lectura.tallas.map((x) => ({ ...x, familiaColor: null })) }, capacidad: 600, codigoSede: "tru" });
    expect({ ...otra, colorDeLaTienda: null }).toEqual({ ...p, colorDeLaTienda: null });
  });
});
