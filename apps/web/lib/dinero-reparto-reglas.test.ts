import { describe, expect, it } from "vitest";
import type { FilaCuenta, GrupoCuentas } from "./dinero-telar-reglas";
import { colorDeCuentaEnReparto, colorDeGrupoEnReparto, porcentajesEnteros, repartoDeDinero, trazoDeArco } from "./dinero-reparto-reglas";

const r2 = (n: number) => Math.round(n * 100) / 100;
const f = (id: string, nombre: string, saldo: number | null, tipo: FilaCuenta["tipo"] = "banco"): FilaCuenta => ({ id, nombre, tipo, saldo, escala: null, insignia: null, detalle: null });
const g = (clave: string, titulo: string, posicion: number, filas: FilaCuenta[]): GrupoCuentas => ({
  clave, titulo, posicion, filas, nota: null,
  total: r2(filas.reduce((a, x) => a + (x.saldo ?? 0), 0)),
  ocultos: filas.some((x) => x.saldo === null),
});

// Un día cualquiera con cifras inventadas: tres tiendas, el Taller, los bancos y lo en camino, con una cuenta en negativo.
const HOY = [
  g("aqp", "Tienda AQP", 0, [f("cAQP", "Caja Operativa", 500, "cajon"), f("fAQP", "Caja fuerte", 1000, "caja_fuerte")]),
  g("lim", "Tienda LIM", 1, [f("cLIM", "Caja Operativa", 200, "cajon"), f("fLIM", "Caja fuerte", 0, "caja_fuerte")]),
  g("tru", "Tienda TRU", 2, [f("cTRU", "Caja Operativa", 300, "cajon"), f("fTRU", "Caja fuerte", 3400, "caja_fuerte")]),
  g("tal", "Taller", 3, [f("fondo", "Fondo fijo", 0, "cajon")]),
  g("empresa", "CAYLA entera", -1, [f("lider", "Efectivo entregado al líder", 25, "por_rendir"), f("bcp", "BCP Empresa", 3000), f("ibk", "Interbank Empresa", 17000)]),
  g("camino", "En camino", -1, [f("izi", "Por depositar Izipay", 100, "por_abonar"), f("vend", "Por depositar Vendemás", -24000, "por_abonar")]),
];

describe("porcentajesEnteros", () => {
  it("suma siempre 100: tres tercios dan 33 + 33 + 34, no 99", () => {
    const p = porcentajesEnteros([1, 1, 1]);
    expect(p.reduce((a, b) => a + b, 0)).toBe(100);
    expect([...p].sort()).toEqual([33, 33, 34]);
  });
  it("le da el entero que sobra al que tiene mayor resto", () => {
    expect(porcentajesEnteros([60.6, 39.4])).toEqual([61, 39]);
  });
  it("con todo en cero no inventa porcentajes", () => {
    expect(porcentajesEnteros([0, 0])).toEqual([0, 0]);
  });
  it("lo que pesa menos de 1 % queda en cero y no le quita un punto a nadie: el resto sigue sumando 100", () => {
    expect(porcentajesEnteros([980, 15, 5])).toEqual([98, 2, 0]);
    expect(porcentajesEnteros([980, 15, 5]).reduce((a, b) => a + b, 0)).toBe(100);
  });
  it("para muchas combinaciones, la suma es 100 y nadie se aleja más de un punto de su valor exacto", () => {
    for (let a = 1; a <= 40; a++) {
      for (let b = 1; b <= 40; b += 3) {
        const partes = [a, b, 17, 5.5];
        const total = partes.reduce((x, y) => x + y, 0);
        const p = porcentajesEnteros(partes);
        expect(p.reduce((x, y) => x + y, 0)).toBe(100);
        p.forEach((v, i) => expect(Math.abs(v - (partes[i]! / total) * 100)).toBeLessThan(1));
      }
    }
  });
});

describe("el color de cada cuenta", () => {
  it("CAYLA entera va en verdes, lo en camino en pizarra y cada sede en su pareja de terracotas, siempre con tokens", () => {
    expect(colorDeGrupoEnReparto({ clave: "empresa", posicion: -1 })).toBe("var(--color-verde)");
    expect(colorDeGrupoEnReparto({ clave: "camino", posicion: -1 })).toBe("var(--color-pizarra)");
    expect(colorDeGrupoEnReparto({ clave: "aqp", posicion: 0 })).toBe("var(--color-rojo)");
    expect(colorDeGrupoEnReparto({ clave: "lim", posicion: 1 })).toBe("var(--color-rojo-profundo)");
    expect(colorDeGrupoEnReparto({ clave: "tru", posicion: 2 })).toBe("var(--color-reparto-ocre)");
    expect(colorDeGrupoEnReparto({ clave: "tal", posicion: 3 })).toBe("var(--color-taupe)");
  });
  it("con más sedes que parejas se repiten desde la primera, y una sede sin lugar en la lista va en taupe", () => {
    expect(colorDeGrupoEnReparto({ clave: "otra", posicion: 4 })).toBe("var(--color-rojo)");
    expect(colorDeGrupoEnReparto({ clave: "x", posicion: -1 })).toBe("var(--color-taupe)");
  });
  it("dentro de una sede, el cajón y la caja fuerte llevan cada uno su tono de la pareja", () => {
    const aqp = { clave: "aqp", posicion: 0 };
    expect(colorDeCuentaEnReparto(aqp, 0)).toBe("var(--color-rojo)");
    expect(colorDeCuentaEnReparto(aqp, 1)).toBe("var(--color-reparto-arcilla)");
  });
  it("los bancos toman verdes distintos, el hondo y el verde claro, y la menta queda para lo que suma poco", () => {
    const emp = { clave: "empresa", posicion: -1 };
    expect([0, 1, 2].map((i) => colorDeCuentaEnReparto(emp, i))).toEqual(["var(--color-reparto-menta)", "var(--color-verde)", "var(--color-reparto-verde-claro)"]);
  });
  it("nunca un hex ni una mezcla suelta: todo sale de un token", () => {
    for (const grupo of HOY) for (let i = 0; i < 8; i++) expect(colorDeCuentaEnReparto(grupo, i)).toMatch(/^var\(--color-[a-z-]+\)$/);
  });
});

describe("repartoDeDinero", () => {
  const r = repartoDeDinero(HOY)!;
  it("cada porción es una cuenta: los bancos se ven uno por uno y no como un solo bloque «CAYLA entera»", () => {
    expect(r.porciones.map((p) => p.id)).toEqual(["ibk", "bcp", "lider", "fTRU", "cTRU", "fAQP", "cAQP", "cLIM", "izi"]);
  });
  it("va por sede, de la que más tiene a la que menos, y dentro de cada sede de la cuenta que más tiene a la que menos", () => {
    const sedes = r.porciones.map((p) => p.lugar ?? p.id);
    expect(sedes.slice(3, 5)).toEqual(["Tienda TRU", "Tienda TRU"]);
    expect(r.porciones.find((p) => p.id === "fTRU")!.desde).toBeLessThan(r.porciones.find((p) => p.id === "cTRU")!.desde);
  });
  it("dice a qué sede es cada cuenta, y deja en blanco las que se explican solas", () => {
    expect(r.porciones.find((p) => p.id === "cTRU")!.lugar).toBe("Tienda TRU");
    expect(r.porciones.find((p) => p.id === "bcp")!.lugar).toBeNull();
    expect(r.porciones.find((p) => p.id === "izi")!.lugar).toBeNull();
  });
  it("lo negativo no entra al círculo: se dice aparte, y el total lo resta (es el «Tienes» de la cabecera)", () => {
    expect(r.aparte).toEqual([{ id: "vend", titulo: "Por depositar Vendemás", lugar: null, monto: -24000 }]);
    expect(r.enCuentas).toBe(25525);
    expect(r.neto).toBe(1525);
  });
  it("las cuentas en cero no se dibujan", () => {
    expect(r.porciones.map((p) => p.id)).not.toContain("fLIM");
    expect(r.porciones.map((p) => p.id)).not.toContain("fondo");
  });
  it("los porcentajes enteros suman 100 y lo que pesa menos de 1 % dice cero", () => {
    expect(r.porciones.reduce((a, p) => a + p.pctEntero, 0)).toBe(100);
    expect(r.porciones.find((p) => p.id === "lider")!.pctEntero).toBe(0);
  });
  it("los ángulos cubren el círculo completo sin saltos, cada uno proporcional a su plata", () => {
    expect(r.porciones[0]!.desde).toBe(0);
    expect(r.porciones.at(-1)!.hasta).toBe(360);
    r.porciones.slice(1).forEach((p, i) => expect(p.desde).toBeCloseTo(r.porciones[i]!.hasta, 9));
    for (const p of r.porciones) expect(p.hasta - p.desde).toBeCloseTo((p.monto / r.enCuentas) * 360, 6);
  });
  it("cada cuenta lleva el color de su familia: los bancos en verde, las tiendas en terracota y lo en camino en pizarra", () => {
    const c = (id: string) => r.porciones.find((p) => p.id === id)!.color;
    expect(c("ibk")).toBe("var(--color-reparto-verde-claro)");
    expect(c("bcp")).toBe("var(--color-verde)");
    expect(c("fTRU")).toBe("var(--color-reparto-terracota)");
    expect(c("cTRU")).toBe("var(--color-reparto-ocre)");
    expect(c("fAQP")).toBe("var(--color-reparto-arcilla)");
    expect(c("cAQP")).toBe("var(--color-rojo)");
    expect(c("izi")).toBe("var(--color-pizarra)");
    expect(r.porciones.every((p) => !p.color.includes("#"))).toBe(true);
  });
  it("el color de una cuenta no cambia porque hoy tenga más o menos plata", () => {
    const otro = repartoDeDinero(HOY.map((gr) => ({ ...gr, filas: gr.filas.map((x) => (x.id === "cTRU" ? { ...x, saldo: 9000 } : x)) })))!;
    expect(otro.porciones.find((p) => p.id === "cTRU")!.color).toBe(r.porciones.find((p) => p.id === "cTRU")!.color);
  });
  it("una cuenta cuyo saldo no se ve no entra ni suma, y se avisa", () => {
    const oculto = repartoDeDinero(HOY.map((gr) => (gr.clave === "aqp" ? g("aqp", "Tienda AQP", 0, [f("cAQP", "Caja Operativa", null, "cajon"), f("fAQP", "Caja fuerte", 1000, "caja_fuerte")]) : gr)))!;
    expect(oculto.ocultos).toBe(true);
    expect(oculto.porciones.map((p) => p.id)).not.toContain("cAQP");
    expect(r.ocultos).toBe(false);
  });
  it("con todas las sedes no hay un alcance propio: es CAYLA entera", () => {
    expect(r.alcance).toBeNull();
  });
  it("con una sola sede también hay círculo y dice de quién es: el cajón y la caja fuerte de Tienda TRU", () => {
    const uno = repartoDeDinero([HOY[2]!])!;
    expect(uno.alcance).toBe("Tienda TRU");
    expect(uno.porciones.map((p) => p.id)).toEqual(["fTRU", "cTRU"]);
    expect(uno.neto).toBe(3700);
  });
  it("con una sola cuenta con plata hay un anillo entero: toda la plata está en un solo lugar (Lima, con su caja fuerte en cero)", () => {
    const lim = repartoDeDinero([g("lim", "Tienda LIM", 1, [f("c", "Caja Operativa", 209, "cajon"), f("f", "Caja fuerte", 0, "caja_fuerte")])])!;
    expect(lim.alcance).toBe("Tienda LIM");
    expect(lim.porciones).toHaveLength(1);
    expect(lim.porciones[0]).toMatchObject({ id: "c", pctEntero: 100, desde: 0, hasta: 360 });
    expect(lim.enCuentas).toBe(209);
    expect(lim.neto).toBe(209);
  });
  it("sin ninguna cuenta con plata el anillo está vacío, no desaparece; lo negativo se dice aparte", () => {
    const taller = repartoDeDinero([g("tal", "Taller", 3, [f("a", "Fondo fijo", 0, "cajon"), f("b", "Caja Operativa", 0, "caja_fuerte")])])!;
    expect(taller.alcance).toBe("Taller");
    expect(taller.porciones).toEqual([]);
    expect(taller.enCuentas).toBe(0);
    expect(taller.neto).toBe(0);
    const negativo = repartoDeDinero([g("tal", "Taller", 3, [f("a", "Fondo fijo", -40, "cajon")])])!;
    expect(negativo.porciones).toEqual([]);
    expect(negativo.aparte.map((x) => x.id)).toEqual(["a"]);
    expect(negativo.neto).toBe(-40);
  });
  it("sin ningún grupo de cuentas no hay resumen", () => {
    expect(repartoDeDinero([])).toBeNull();
  });
});

describe("trazoDeArco", () => {
  it("la primera porción arranca arriba, a las 12, y gira con el reloj", () => {
    const d = trazoDeArco(0, 90, 80, 100, 0);
    expect(d).toBe("M100 20A80 80 0 0 1 180 100");
  });
  it("una sola porción es el círculo entero: dos medias vueltas, sin hueco, y no un arco que acaba donde empieza", () => {
    const d = trazoDeArco(0, 360, 80, 100);
    expect(d).toBe("M100 20A80 80 0 1 1 100 180A80 80 0 1 1 100 20");
  });
  it("una porción de más de media vuelta pide el arco grande", () => {
    expect(trazoDeArco(0, 200, 80, 100, 0)).toContain("A80 80 0 1 1");
    expect(trazoDeArco(0, 170, 80, 100, 0)).toContain("A80 80 0 0 1");
  });
  it("deja un hueco entre porciones, pero una rebanada fina no desaparece ni se voltea", () => {
    const fina = trazoDeArco(10, 10.5, 80, 100, 2.4);
    const [ini, fin] = fina.replace("M", "").split("A");
    expect(ini).not.toBe(fin!.split(" ").slice(-2).join(" "));
    expect(fina).toContain("A80 80 0 0 1");
  });
});
