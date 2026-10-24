import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { ARBOL, esGrupo, type Hoja } from "./menu";
import type { ClaveModulo } from "./modulos";
import { VISTAS_DE_COMPRAS, entradaDeCompras, pestanasDeCompras, totalPorRevisar, vistasDeCompras } from "./compras-pestanas-reglas";

// ADR-0504: los tres roles reales de producción (consultados el 2026-10-24) reparten los tres módulos distinto. La fila del menú se abre con
// cualquiera; cada pestaña solo está para quien tiene SU módulo.
const COMPRAS: ClaveModulo[] = ["facturas_compra", "fondos", "por_pagar", "ordenes_compra"];
const PRODUCCION: ClaveModulo[] = ["facturas_compra"];
const TERMINAL_ALMACEN: ClaveModulo[] = ["facturas_compra", "por_pagar"];

const claves = (m: ClaveModulo[]) => vistasDeCompras(m).map((v) => v.clave);

describe("qué pestañas trae cada cuenta", () => {
  it("Compras ve las tres; Producción, solo el Historial; la Terminal Almacén, el Historial y Por pagar", () => {
    expect(claves(COMPRAS)).toEqual(["historial", "revisar", "porpagar"]);
    expect(claves(PRODUCCION)).toEqual(["historial"]);
    expect(claves(TERMINAL_ALMACEN)).toEqual(["historial", "porpagar"]);
  });

  it("sin ninguno de los tres módulos no hay pestañas ni entrada", () => {
    expect(claves(["ordenes_compra", "proveedores"])).toEqual([]);
    expect(entradaDeCompras(["ordenes_compra"])).toBeNull();
    expect(entradaDeCompras([])).toBeNull();
  });

  it("quien no ve el Historial cae en la primera pestaña que sí ve, no en «Sin acceso»", () => {
    expect(entradaDeCompras(COMPRAS)).toBe("/compras");
    expect(entradaDeCompras(["fondos"])).toBe("/compras/fondos");
    expect(entradaDeCompras(["por_pagar"])).toBe("/compras/por-pagar");
    expect(entradaDeCompras(["fondos", "por_pagar"])).toBe("/compras/fondos");
  });
});

describe("el contador de cada pestaña", () => {
  const todas = vistasDeCompras(COMPRAS);
  const conteo = (clave: string, c: Parameters<typeof pestanasDeCompras>[1]) => pestanasDeCompras(todas, c).find((p) => p.clave === clave)!;

  it("el Historial nunca lleva contador: es el libro, no una tarea", () => {
    expect(conteo("historial", { revisar: 7, porPagar: { conSaldo: 3, vencidas: 1 } })).toEqual({ clave: "historial", etiqueta: "Historial", href: "/compras" });
  });

  it("Revisar: ámbar con lo que espera; en cero, gris, y se ve el 0", () => {
    expect(conteo("revisar", { revisar: 7 })).toMatchObject({ conteo: 7, pide: "por revisar" });
    expect(conteo("revisar", { revisar: 7 }).tono).toBeUndefined();
    expect(conteo("revisar", { revisar: 0 })).toMatchObject({ conteo: 0, tono: "neutro" });
  });

  it("Por pagar: ámbar solo si hay vencidas y las dice; con deuda al día o sin deuda, gris", () => {
    expect(conteo("porpagar", { porPagar: { conSaldo: 4, vencidas: 1 } })).toMatchObject({ conteo: 4, pide: "por pagar, 1 vencida" });
    expect(conteo("porpagar", { porPagar: { conSaldo: 4, vencidas: 2 } })).toMatchObject({ pide: "por pagar, 2 vencidas" });
    expect(conteo("porpagar", { porPagar: { conSaldo: 4, vencidas: 2 } }).tono).toBeUndefined();
    expect(conteo("porpagar", { porPagar: { conSaldo: 3, vencidas: 0 } })).toMatchObject({ conteo: 3, tono: "neutro" });
    expect(conteo("porpagar", { porPagar: { conSaldo: 0, vencidas: 0 } })).toMatchObject({ conteo: 0, tono: "neutro" });
  });

  it("si un conteo no se pudo leer (null) o no se pidió, la pestaña no lo muestra: nunca un 0 inventado", () => {
    for (const c of [{}, { revisar: null, porPagar: null }, { revisar: undefined }] as const) {
      expect(conteo("revisar", c).conteo).toBeUndefined();
      expect(conteo("porpagar", c).conteo).toBeUndefined();
    }
  });

  it("totalPorRevisar suma las cuatro cifras de la bandeja", () => {
    expect(totalPorRevisar({ plata: 2, papeles: 3, gastos: 1, cierres: 1 })).toBe(7);
    expect(totalPorRevisar({ plata: 0, papeles: 0, gastos: 0, cierres: 0 })).toBe(0);
  });
});

describe("coherencia con el resto del sistema (si una cambia sin la otra, esto avisa)", () => {
  it("la fila «Historial de compras» del menú se abre con el módulo de CADA pestaña y no pide un permiso de dinero", () => {
    const compras = ARBOL.find((n) => n.id === "compras");
    expect(compras && esGrupo(compras)).toBe(true);
    const fila = (compras as { hijos: readonly (Hoja | { id: string })[] }).hijos.find((h) => h.id === "compras.comprobantes") as Hoja;
    expect(fila.ruta).toBe("/compras");
    const abre = [fila.modulo, ...(fila.modulosAlternos ?? [])];
    for (const v of VISTAS_DE_COMPRAS) expect(abre, `la fila no abre con «${v.modulo}»`).toContain(v.modulo);
    // `exige` se suma al módulo: con `verDineroCompras` un rol con solo «Revisar compras» no vería la fila (ADR-0504, decisión 2).
    expect(fila.exige).toBeUndefined();
  });

  it("«Revisar compras» y «Por pagar» ya no son filas sueltas del menú", () => {
    const compras = ARBOL.find((n) => n.id === "compras") as { hijos: readonly { id: string; ruta?: string }[] };
    const rutas = compras.hijos.map((h) => h.ruta);
    expect(rutas).not.toContain("/compras/fondos");
    expect(rutas).not.toContain("/compras/por-pagar");
  });

  it("cada pestaña tiene su puerta: la de Revisar y la de Por pagar piden su módulo, y la entrada acepta los tres", () => {
    const leer = (ruta: string) => readFileSync(new URL(ruta, import.meta.url), "utf8");
    expect(leer("../app/(app)/compras/fondos/layout.tsx")).toContain('exigirModulo("fondos")');
    expect(leer("../app/(app)/compras/por-pagar/page.tsx")).toContain('exigirModulo("por_pagar")');
    expect(leer("../app/(app)/compras/page.tsx")).toContain('exigirModulo("facturas_compra", "fondos", "por_pagar")');
  });
});
