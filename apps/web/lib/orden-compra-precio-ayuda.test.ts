import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  ayudaDePrecio,
  bandaDePrecio,
  conRebaja,
  costoMaximoQueAguanta,
  cuentaDeLinea,
  MOTIVOS,
  precioMinimoPiso,
  razonPorMil,
  type AvisoDePrecio,
  type BandaDePrecio,
  type EntradaAyudaPrecio,
  type IdAviso,
} from "./orden-compra-precio-ayuda";

// La ayuda de precio de «Nueva orden de compra» (diseño `docs/pantallas/compras-ordenes-precio-y-stock.md`, §4.2 y §4.5). El ejemplo que se
// repite: costo 25, precio 59.90, la categoría «Polos» con precio del medio 49.90 (14 prendas), con factura.

const REF = { nombre: "Polos", precioDelMedio: 49.9, prendas: 14 };
const entrada = (o: Partial<EntradaAyudaPrecio> = {}): EntradaAyudaPrecio => ({ costo: 25, descuentoPct: 0, conFactura: true, precio: 59.9, referencia: REF, ...o });
const ids = (o: Partial<EntradaAyudaPrecio> = {}): IdAviso[] => ayudaDePrecio(entrada(o)).avisos.map((a) => a.id);
const aviso = (o: Partial<EntradaAyudaPrecio>, id: IdAviso): AvisoDePrecio => {
  const a = ayudaDePrecio(entrada(o)).avisos.find((x) => x.id === id);
  if (!a) throw new Error(`no salió el aviso ${id}`);
  return a;
};
const S = (n: string) => `S/ ${n}`;

describe("la cuenta de una línea (§4.2)", () => {
  it("con factura el IGV se cancela: costo 25 y precio 59.90 dejan S/ 29.58 y 58.3 %", () => {
    const c = cuentaDeLinea(25, 0, true, 59.9);
    expect(c.costoNeto).toBe(25);
    expect(c.costoReal).toBeCloseTo(21.1864, 3);
    expect(c.precioSinIgv).toBeCloseTo(50.7627, 3);
    expect(c.ganancia).toBeCloseTo(29.5763, 3);
    expect(c.margenPorMil).toBe(583);
    expect(c.recargo).toBeCloseTo(2.396, 3);
  });

  it("sin factura el IGV queda dentro del costo: la misma compra deja S/ 25.76 y 50.8 %", () => {
    const c = cuentaDeLinea(25, 0, false, 59.9);
    expect(c.costoReal).toBe(25);
    expect(c.ganancia).toBeCloseTo(25.7627, 3);
    expect(c.margenPorMil).toBe(508);
  });

  it("con factura el margen es (precio − costo) ÷ precio, para cualquier par de números", () => {
    const fallas: string[] = [];
    for (let costo = 1; costo <= 300; costo += 7.3) {
      for (const k of [1.01, 1.3, 2, 2.4, 3.7, 5]) {
        const precio = Math.round(costo * k * 100) / 100;
        const c = cuentaDeLinea(Math.round(costo * 100) / 100, 0, true, precio);
        const esperado = Math.round(((precio - Math.round(costo * 100) / 100) / precio) * 1000);
        if (Math.abs((c.margenPorMil as number) - esperado) > 1) fallas.push(`${costo}/${precio}: ${c.margenPorMil} ≠ ${esperado}`);
      }
    }
    expect(fallas).toEqual([]);
  });

  it("sin factura baja entre 7 y 10 puntos cuando con factura sería de 45 a 60 %", () => {
    for (const precio of [36.4, 40, 45, 50]) {
      const con = cuentaDeLinea(20, 0, true, precio).margenPorMil as number;
      const sin = cuentaDeLinea(20, 0, false, precio).margenPorMil as number;
      expect(con - sin).toBeGreaterThanOrEqual(70);
      expect(con - sin).toBeLessThanOrEqual(100);
    }
  });

  it("el descuento del proveedor baja el costo neto antes de calcular nada", () => {
    expect(cuentaDeLinea(100, 10, true, null).costoNeto).toBe(90);
    expect(cuentaDeLinea(100, 10, false, null).costoReal).toBe(90);
    // Un descuento fuera de rango se acota: nunca un costo negativo ni mayor al escrito.
    expect(cuentaDeLinea(100, 150, true, null).costoNeto).toBe(0);
    expect(cuentaDeLinea(100, -5, true, null).costoNeto).toBe(100);
  });

  it("sin precio no hay ganancia, margen ni recargo", () => {
    const c = cuentaDeLinea(25, 0, true, null);
    expect([c.precioSinIgv, c.ganancia, c.margenPorMil, c.recargo]).toEqual([null, null, null, null]);
    expect(cuentaDeLinea(25, 0, true, 0).ganancia).toBeNull();
  });
});

describe("la rebaja (ADR-0403: el precio rebajado baja al S/ 0.10)", () => {
  it("59.90 con 15 % queda en 50.90 y con 35 % en 38.90; 49.90 con 35 % en 32.40, no en 32.44", () => {
    expect(conRebaja(59.9, 21.19, 15).precio).toBe(50.9);
    expect(conRebaja(59.9, 21.19, 35).precio).toBe(38.9);
    expect(conRebaja(49.9, 21.19, 35).precio).toBe(32.4);
    expect(conRebaja(10, 5, 35).precio).toBe(6.5);
  });

  it("el ejemplo: con 35 % de rebaja quedan S/ 11.78 y 35.7 %; con 15 %, S/ 21.95 y 50.9 %", () => {
    const real = 25 / 1.18;
    const r35 = conRebaja(59.9, real, 35);
    expect(r35.ganancia).toBeCloseTo(11.78, 2);
    expect(r35.margenPorMil).toBe(357);
    const r15 = conRebaja(59.9, real, 15);
    expect(r15.ganancia).toBeCloseTo(21.95, 2);
    expect(r15.margenPorMil).toBe(509);
  });

  it("nunca sube el precio y, mientras más alto el precio, nunca queda menos", () => {
    let antes = -1;
    const fallas: number[] = [];
    for (let c = 10; c <= 60000; c += 10) {
      const r = conRebaja(c / 100, 10, 35);
      if (r.precio > c / 100 || r.precio < antes) fallas.push(c);
      antes = r.precio;
    }
    expect(fallas).toEqual([]);
  });
});

describe("el piso: aguantar 35 % de rebaja y dejar 20 % del precio rebajado", () => {
  it("el ejemplo: con costo real 21.19 el menor precio que lo logra es S/ 48.20", () => {
    expect(precioMinimoPiso(25 / 1.18)).toBe(48.2);
  });

  it("es el MENOR precio que lo logra: él cumple y 10 céntimos menos, no", () => {
    const fallas: string[] = [];
    for (let real = 1; real <= 400; real += 3.17) {
      const p = precioMinimoPiso(real);
      if (p === null) {
        fallas.push(`${real}: sin precio`);
        continue;
      }
      if (conRebaja(p, real, 35).margenPorMil < 200) fallas.push(`${real}: ${p} no cumple`);
      if (p > 0.1 && conRebaja(Math.round((p - 0.1) * 100) / 100, real, 35).margenPorMil >= 200) fallas.push(`${real}: ${p - 0.1} ya cumplía`);
    }
    expect(fallas).toEqual([]);
  });

  it("sin costo, o con un costo que ningún precio hasta el tope aguanta, no hay precio mínimo", () => {
    expect(precioMinimoPiso(0)).toBeNull();
    expect(precioMinimoPiso(-3)).toBeNull();
    expect(precioMinimoPiso(5000)).toBeNull();
  });

  it("el costo máximo es el mayor costo que se puede escribir para que ese precio aguante: él cumple y un centavo más, no", () => {
    const fallas: string[] = [];
    for (const [desc, factura] of [[0, true], [0, false], [12, true], [12, false]] as const) {
      for (let p = 1; p <= 400; p += 7.9) {
        const precio = Math.round(p * 100) / 100;
        const max = costoMaximoQueAguanta(precio, desc, factura);
        if (max === null) continue;
        const margen = (x: number) => conRebaja(precio, cuentaDeLinea(x, desc, factura, null).costoReal, 35).margenPorMil;
        if (margen(max) < 200) fallas.push(`${precio}/${desc}/${factura}: ${max} no cumple`);
        if (margen(Math.round((max + 0.01) * 100) / 100) >= 200) fallas.push(`${precio}/${desc}/${factura}: ${max} + 0.01 aún cumplía`);
      }
    }
    expect(fallas).toEqual([]);
  });

  it("el piso y el costo máximo se parecen en lo que dicen: pagar hasta el máximo con el precio mínimo cuadra", () => {
    const p = precioMinimoPiso(25 / 1.18) as number;
    const max = costoMaximoQueAguanta(p, 0, true) as number;
    expect(max).toBeGreaterThanOrEqual(24.9);
    expect(max).toBeLessThanOrEqual(25.1);
  });

  it("un precio de 10 céntimos rebajado queda en 0 y nunca aguanta; con descuento total no hay costo máximo", () => {
    expect(costoMaximoQueAguanta(0.1, 0, true)).toBeNull();
    expect(costoMaximoQueAguanta(59.9, 100, true)).toBeNull();
  });
});

describe("dónde está el precio frente al precio del medio", () => {
  it("el precio en céntimos enteros: 54.89 contra 49.90 es justo 1.100 y no 1.1000001", () => {
    expect(razonPorMil(54.89, 49.9)).toBe(1100);
    expect(razonPorMil(59.9, 49.9)).toBe(1200);
    expect(razonPorMil(24.95, 49.9)).toBe(500);
  });

  it("cada milésima cae en UNA sola banda y las bandas van en orden, sin huecos ni cruces", () => {
    const orden: BandaDePrecio[] = ["cero-de-menos", "muy-bajo", "bajo", "normal", "algo-alto", "alto", "muy-alto", "cero-de-mas"];
    const fallas: string[] = [];
    let anterior = 0;
    const vistas = new Set<BandaDePrecio>();
    for (let r = 0; r <= 20000; r++) {
      const b = bandaDePrecio(r);
      const k = orden.indexOf(b);
      if (k < anterior) fallas.push(`${r}: ${b} después de ${orden[anterior]}`);
      anterior = Math.max(anterior, k);
      vistas.add(b);
    }
    expect(fallas).toEqual([]);
    expect(vistas.size).toBe(orden.length);
  });

  it("los cortes exactos: 1/8, 0.50, 0.90, 1.10, 1.25, 1.50 y 8", () => {
    const casos: [number, BandaDePrecio][] = [
      [125, "cero-de-menos"],
      [126, "muy-bajo"],
      [499, "muy-bajo"],
      [500, "bajo"],
      [899, "bajo"],
      [900, "normal"],
      [1100, "normal"],
      [1101, "algo-alto"],
      [1250, "algo-alto"],
      [1251, "alto"],
      [1500, "alto"],
      [1501, "muy-alto"],
      [7999, "muy-alto"],
      [8000, "cero-de-mas"],
    ];
    for (const [razon, banda] of casos) expect([razon, bandaDePrecio(razon)]).toEqual([razon, banda]);
  });
});

describe("la ayuda: cada escena del ejemplo (Polos 49.90 con 14 prendas, costo 25, con factura)", () => {
  const escenas: [string, Partial<EntradaAyudaPrecio>, IdAviso[]][] = [
    ["precio igual al del medio: las cuentas cierran", { precio: 49.9 }, ["todo-calza"]],
    ["algo alto (20 % arriba)", { precio: 59.9 }, ["precio-algo-alto", "cuenta-menos"]],
    ["alto (40 % arriba)", { precio: 69.9 }, ["precio-alto", "cuenta-menos"]],
    ["muy alto (el doble)", { precio: 99.9 }, ["precio-muy-alto", "cuenta-menos"]],
    ["bajo (20 % abajo): aguanta poco la rebaja", { precio: 39.9 }, ["rebaja-poco", "precio-bajo", "cuenta-mas"]],
    ["muy bajo con costo bajo: aguanta la rebaja", { precio: 19.9, costo: 8 }, ["precio-muy-bajo", "cuenta-mas"]],
    ["un cero de más", { precio: 499 }, ["cero-de-mas"]],
    ["un cero de menos (no se repite como «no cubre el costo»)", { precio: 4.9 }, ["cero-de-menos"]],
    ["precio bajo el costo (no se repite como «precio bajo»)", { precio: 20 }, ["precio-no-cubre-costo"]],
    ["sin precio todavía", { precio: null }, ["ayuda-sin-precio"]],
    ["sin costo todavía", { costo: null }, ["sin-costo"]],
    ["costo en cero", { costo: 0 }, ["sin-costo"]],
    ["descuento de 100 %: el costo queda en cero", { descuentoPct: 100 }, ["sin-costo"]],
    ["sin factura", { conFactura: false }, ["precio-algo-alto", "cuenta-menos", "sin-factura"]],
    ["la categoría tiene 2 prendas: no hay con qué comparar", { referencia: { nombre: "Vestidos", precioDelMedio: 129.9, prendas: 2 } }, ["sin-referencia"]],
    ["la categoría tiene 5 prendas: referencia débil", { referencia: { nombre: "Pantalones", precioDelMedio: 49.9, prendas: 5 } }, ["precio-algo-alto", "cuenta-menos", "referencia-debil"]],
    ["la categoría no tiene precio del medio", { referencia: { nombre: "Casacas", precioDelMedio: null, prendas: 6 } }, ["sin-referencia"]],
  ];
  for (const [nombre, o, esperados] of escenas) {
    it(nombre, () => expect(ids(o)).toEqual(esperados));
  }

  it("un margen de 96 % pide confirmar el costo y el precio (y se lee después de lo urgente)", () => {
    expect(ids({ costo: 2.5 })).toEqual(["precio-algo-alto", "cuenta-menos", "margen-muy-alto"]);
  });

  it("una familia fuera de los motores (bolsas, cajas) no recibe ninguna ayuda", () => {
    const a = ayudaDePrecio(entrada({ fueraDeLosMotores: true, precio: 0 }));
    expect(a.avisos).toEqual([]);
    expect(a.cuenta).toBeNull();
    expect(a.precioHabitual).toBeNull();
  });

  it("los números del ejemplo: S/ 29.58 · 58.3 %, y con 15 % y 35 % de rebaja", () => {
    const a = ayudaDePrecio(entrada());
    expect(a.cuenta?.margenPorMil).toBe(583);
    expect(a.rebaja15).toMatchObject({ precio: 50.9, margenPorMil: 509 });
    expect(a.rebaja35).toMatchObject({ precio: 38.9, margenPorMil: 357 });
    expect(a.precioMinimo).toBe(48.2);
  });

  it("«precio algo alto»: dice cuánto y qué porcentaje, y la cuenta de las unidades marca hasta dónde se puede vender menos", () => {
    expect(aviso({}, "precio-algo-alto").texto).toBe(
      `Cobras ${S("10.00")} más que el precio del medio de Polos (${S("49.90")}), un 20.0 % arriba. Conviene poder nombrar dos razones que el cliente vea o toque sin que se las expliquen.`,
    );
    expect(aviso({}, "cuenta-menos").texto).toBe(
      `Cobrando ${S("59.90")} en vez de ${S("49.90")}, ganas ${S("8.47")} más por prenda: puedes vender hasta 29 % menos prendas que al precio del medio y ganar lo mismo.`,
    );
  });

  it("sin factura dice cuánto IGV no se recupera y compara con una factura del mismo monto", () => {
    expect(aviso({ conFactura: false }, "sin-factura").texto).toBe(
      `Sin factura no recuperas el IGV: tu costo real es ${S("25.00")} por prenda, ${S("3.81")} más que con una factura del mismo monto. Por eso tu ganancia es 50.8 % y con esa factura sería 58.3 %.`,
    );
  });

  it("antes de escribir el precio muestra el del medio y el menor que aguanta la rebaja", () => {
    expect(aviso({ precio: null }, "ayuda-sin-precio").texto).toBe(
      `A ${S("49.90")}, el precio del medio de Polos (14 prendas), con tu costo real de ${S("21.19")} te quedarían ${S("21.10")} por prenda (49.9 %). Para aguantar una rebaja de 35 % necesitas cobrar desde ${S("48.20")}.`,
    );
  });

  it("«aguanta poco la rebaja» ofrece las dos salidas: un precio desde S/ X, o pagar como máximo S/ Y", () => {
    const t = aviso({ precio: 39.9 }, "rebaja-poco").texto;
    expect(t).toContain(`te quedan ${S("0.76")} por prenda (3.5 %)`);
    expect(t).toContain(`un precio desde ${S("48.20")}`);
    expect(t).toMatch(/pagar como máximo S\/ \d+\.\d{2} por prenda/);
  });

  it("una prenda que con 35 % de rebaja pierde plata lo dice con el precio que sí no pierde", () => {
    const a = aviso({ precio: 36, costo: 25 }, "rebaja-pierde");
    expect(a.nivel).toBe("atencion");
    expect(a.texto).toMatch(/perderías S\/ \d+\.\d{2} por prenda/);
    expect(a.texto).toMatch(/el precio tendría que ser desde S\/ \d+\.\d{2}/);
  });

  it("el precio habitual es el del medio, solo si hay prendas para decirlo (también sin costo)", () => {
    expect(ayudaDePrecio(entrada()).precioHabitual).toBe(49.9);
    expect(ayudaDePrecio(entrada({ costo: null })).precioHabitual).toBe(49.9);
    expect(ayudaDePrecio(entrada({ referencia: { nombre: "V", precioDelMedio: 129.9, prendas: 2 } })).precioHabitual).toBeNull();
    expect(ayudaDePrecio(entrada({ referencia: { nombre: "V", precioDelMedio: null, prendas: 9 } })).precioHabitual).toBeNull();
  });
});

describe("el costo contra el último que se pagó: la banda de ADR-0298", () => {
  const con = (costo: number, previo: number | null, extra: Partial<EntradaAyudaPrecio> = {}) => ids({ costo, costoDeReferencia: previo, precio: 59.9, ...extra }).filter((i) => i === "costo-sube" || i === "costo-baja");

  it("sube = más del doble; justo el doble pasa", () => {
    expect(con(25, 12.5)).toEqual([]);
    expect(con(25, 12.49)).toEqual(["costo-sube"]);
    expect(con(25, 10)).toEqual(["costo-sube"]);
  });

  it("baja = menos de 2/3; justo 2/3 pasa", () => {
    expect(con(25, 37.5)).toEqual([]);
    expect(con(25, 37.51)).toEqual(["costo-baja"]);
    expect(con(25, 40)).toEqual(["costo-baja"]);
  });

  it("se compara el costo NETO del descuento del proveedor: costo 50 con 50 % de descuento (25) contra 10", () => {
    expect(con(50, 10, { descuentoPct: 50 })).toEqual(["costo-sube"]);
    expect(con(50, 10, { descuentoPct: 0 })).toEqual(["costo-sube"]);
    expect(con(50, 25, { descuentoPct: 50 })).toEqual([]);
  });

  it("sin último costo, o con uno que no sirve, no dice nada", () => {
    for (const previo of [null, 0, -5, Number.NaN]) expect(con(25, previo)).toEqual([]);
  });

  it("la banda es la MISMA que la de la base (`fn_costo_fuera_de_banda`): cambiarla en uno obliga a mirar el otro", () => {
    const sql = readFileSync(new URL("../../../supabase/migrations/20260930120000_costo_fuera_de_banda.sql", import.meta.url), "utf8");
    expect(sql).toContain("p_costo_nuevo > p_costo_vigente * 2");
    expect(sql).toContain("p_costo_nuevo * 3 < p_costo_vigente * 2");
  });

  it("con un costo que sube, las cuentas no «cierran» aunque el precio calce con la categoría", () => {
    expect(ids({ precio: 49.9, costoDeReferencia: 10 })).toEqual(["costo-sube", "precio-normal"]);
    expect(ids({ precio: 49.9, costoDeReferencia: 25 })).toEqual(["todo-calza"]);
  });

  it("sale después de un error de precio: el más grave primero, aunque el aviso del costo se haya armado antes", () => {
    expect(ids({ precio: 20, costoDeReferencia: 10 })).toEqual(["precio-no-cubre-costo", "costo-sube"]);
    expect(ids({ precio: 499, costoDeReferencia: 10 })).toEqual(["cero-de-mas", "costo-sube"]);
  });

  it("sirve aun sin precio escrito", () => {
    expect(ids({ precio: null, costoDeReferencia: 10 })).toEqual(["costo-sube", "ayuda-sin-precio"]);
  });
});

describe("invariantes: lo que debe ser cierto para CUALQUIER combinación", () => {
  const referencias = [REF, { nombre: "Pantalones", precioDelMedio: 99.9, prendas: 5 }, { nombre: "Vestidos", precioDelMedio: 129.9, prendas: 2 }, { nombre: "Casacas", precioDelMedio: null, prendas: 0 }];
  const MARCAS_DE_PRECIO: IdAviso[] = ["precio-muy-alto", "precio-alto", "precio-algo-alto", "precio-normal", "precio-bajo", "precio-muy-bajo"];
  const URGENTES: IdAviso[] = ["precio-no-cubre-costo", "cero-de-mas", "cero-de-menos"];

  const corridas: { e: EntradaAyudaPrecio; avisos: AvisoDePrecio[]; minimo: number | null }[] = [];
  for (const costo of [2.5, 25, 120]) {
    for (const descuentoPct of [0, 12]) {
      for (const conFactura of [true, false]) {
        for (const referencia of referencias) {
          for (const costoDeReferencia of [undefined, 12]) {
            for (const precio of [null, ...Array.from({ length: 600 }, (_, i) => Math.round((0.1 + i * 1.0) * 100) / 100)]) {
              const e: EntradaAyudaPrecio = { costo, descuentoPct, conFactura, precio, referencia, costoDeReferencia };
              const a = ayudaDePrecio(e);
              corridas.push({ e, avisos: a.avisos, minimo: a.precioMinimo });
            }
          }
        }
      }
    }
  }
  const siempre = (nombre: string, malo: (c: (typeof corridas)[number]) => boolean) =>
    it(nombre, () => {
      const casos = corridas.filter(malo).slice(0, 3).map((c) => JSON.stringify({ e: c.e, ids: c.avisos.map((a) => a.id) }));
      expect(casos).toEqual([]);
    });

  siempre("ningún texto trae NaN, undefined ni Infinity, y ninguno queda vacío", (c) => c.avisos.some((a) => [a.texto, a.porQue, a.etiqueta, a.teoria].some((t) => !t.trim() || /NaN|undefined|Infinity/.test(t))));
  siempre("los soles siempre llevan el espacio duro de `soles()` y nunca un espacio suelto", (c) => c.avisos.some((a) => /S\/ \d/.test(a.texto + a.porQue)));
  siempre("el vocabulario de tienda: «cliente», nunca «clienta», y sin jerga a la vista", (c) =>
    c.avisos.some((a) => /clienta|mediana|markup|markdown|elasticidad|margen mantenido|\bIMU\b|GMROI/i.test(`${a.etiqueta} ${a.texto}`)),
  );
  siempre("los avisos no se repiten y salen del más grave al menos grave", (c) => {
    const rango = { error: 0, atencion: 1, info: 2, exito: 3 } as const;
    const idsC = c.avisos.map((a) => a.id);
    return new Set(idsC).size !== idsC.length || c.avisos.some((a, i) => i > 0 && rango[a.nivel] < rango[c.avisos[i - 1].nivel]);
  });
  siempre("hay a lo más UN aviso de dónde está el precio y UNO de rebaja", (c) => {
    const idsC = c.avisos.map((a) => a.id);
    return idsC.filter((i) => MARCAS_DE_PRECIO.includes(i)).length > 1 || idsC.filter((i) => i === "rebaja-pierde" || i === "rebaja-poco").length > 1;
  });
  siempre("un error de precio no convive con consejos de estrategia ni con el éxito", (c) => {
    const idsC = c.avisos.map((a) => a.id);
    return idsC.some((i) => URGENTES.includes(i)) && idsC.some((i) => ["todo-calza", "precio-bajo", "precio-muy-bajo", "cuenta-mas", "cuenta-menos", "margen-muy-alto", "rebaja-pierde", "rebaja-poco"].includes(i));
  });
  siempre("«las cuentas cierran» solo sale cuando no hay nada urgente ni que vigilar, y reemplaza a «precio normal»", (c) => {
    const idsC = c.avisos.map((a) => a.id);
    return idsC.includes("todo-calza") && (idsC.includes("precio-normal") || c.avisos.some((a) => a.nivel === "error" || a.nivel === "atencion"));
  });
  siempre("«necesitas un precio desde S/ X» no contradice a la cuenta: desde ese precio el aviso de rebaja no sale; por debajo, sale (salvo entre dos pasos de 10 céntimos)", (c) => {
    const { precio } = c.e;
    const cuenta = precio !== null && precio > 0 ? cuentaDeLinea(c.e.costo as number, c.e.descuentoPct, c.e.conFactura, precio) : null;
    if (!cuenta || (cuenta.ganancia as number) < 0.005) return false; // sin ganancia, otro aviso habla
    if (c.avisos.some((a) => a.id === "cero-de-menos")) return false; // con un posible cero de menos primero se corrige el precio: la rebaja calla a propósito
    const hayRebaja = c.avisos.some((a) => a.id === "rebaja-pierde" || a.id === "rebaja-poco");
    const p = precio as number;
    // El mínimo es «de a S/ 0.10»: desde ahí SIEMPRE aguanta (sin aviso); con aviso, siempre queda por debajo; y sin aviso por debajo del mínimo
    // solo cabe entre dos pasos (a menos de 10 céntimos de él), porque la cuenta es la de los céntimos reales.
    if (c.minimo !== null && p >= c.minimo) return hayRebaja;
    if (hayRebaja) return false;
    return c.minimo === null || c.minimo - p >= 0.1 + 1e-9;
  });
  siempre("«rebaja-poco» nombra un precio mínimo que de verdad aguanta", (c) => {
    const a = c.avisos.find((x) => x.id === "rebaja-poco");
    if (!a || c.minimo === null) return false;
    return !a.texto.includes(`desde ${S(c.minimo.toLocaleString("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 }))}`);
  });
  siempre("cada lista de motivos que un aviso abre existe y deja una salida sin compromiso", (c) =>
    c.avisos.some((a) => a.motivo !== undefined && !(MOTIVOS[a.motivo]?.opciones.some((o) => /Aún no lo sé|Otro/.test(o)))),
  );
});

describe("entradas raras: nunca lanza y nunca deja un NaN a la vista", () => {
  const raros = [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY, -1, 0, 1e-9, 1e9];
  it("cualquier mezcla de costo, precio, descuento, último costo y precio del medio raros devuelve algo coherente", () => {
    const fallas: string[] = [];
    for (const costo of [null, ...raros, 25]) {
      for (const precio of [null, ...raros, 59.9]) {
        for (const descuentoPct of [...raros, 0, 150]) {
          for (const medio of [null, Number.NaN, 0, -5, 49.9]) {
            for (const prendas of [-1, 0, 3, 50]) {
              const e: EntradaAyudaPrecio = { costo, precio, descuentoPct, conFactura: true, referencia: { nombre: "Polos", precioDelMedio: medio, prendas }, costoDeReferencia: Number.NaN };
              try {
                const a = ayudaDePrecio(e);
                const texto = JSON.stringify(a);
                if (/NaN|Infinity|undefined/.test(texto)) fallas.push(`${JSON.stringify(e)} → ${texto.slice(0, 120)}`);
                // JSON.stringify vuelve `null` un NaN: los números se miran uno por uno.
                const numeros = [...Object.values(a.cuenta ?? {}), ...Object.values(a.rebaja15 ?? {}), ...Object.values(a.rebaja35 ?? {}), a.precioMinimo, a.precioHabitual];
                if (numeros.some((n) => n !== null && (typeof n !== "number" || !Number.isFinite(n)))) fallas.push(`${JSON.stringify(e)} → número no finito`);
              } catch (err) {
                fallas.push(`${JSON.stringify(e)} lanzó ${String(err)}`);
              }
            }
          }
        }
      }
    }
    expect(fallas.slice(0, 3)).toEqual([]);
  });
});

describe("las listas de motivos", () => {
  it("cada una tiene pregunta, al menos 3 opciones, sin repetidas y una salida sin compromiso", () => {
    for (const [clave, m] of Object.entries(MOTIVOS)) {
      expect(m.pregunta.trim(), clave).not.toBe("");
      expect(m.opciones.length, clave).toBeGreaterThanOrEqual(3);
      expect(new Set(m.opciones).size, clave).toBe(m.opciones.length);
      expect(m.opciones.some((o) => /Aún no lo sé|Otro/.test(o)), clave).toBe(true);
    }
  });

  it("el motivo de un precio alto pregunta qué ve el CLIENTE; el de uno bajo, qué estrategia se aplica", () => {
    expect(MOTIVOS.alto.pregunta).toMatch(/cliente/);
    expect(MOTIVOS.bajo.pregunta).toMatch(/estrategia/);
  });
});
