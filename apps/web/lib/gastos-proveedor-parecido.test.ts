import { describe, expect, it } from "vitest";
import { sumarProveedorDeGasto } from "./gastos-reglas";

// «¿No está? Súmalo» en Registrar gasto (2026-09-25). Aparte de `gastos-reglas.test.ts` para no pisar su bloque de
// imports mientras Finanzas sigue creciendo.

const hidrandina = { id: "h", nombre: "Hidrandina SA", ruc: "20132023540" };
const contador = { id: "c", nombre: "Estudio Contable Ríos", ruc: null };
const existentes = [hidrandina, contador];
const nadie = new Set<string>();

describe("sumarProveedorDeGasto: qué pasa al sumar el proveedor de un gasto", () => {
  it("el caso que la base dejaba pasar: «Hidrandina S.A.A.» junto a «Hidrandina SA» pregunta antes de sumar", () => {
    const r = sumarProveedorDeGasto({ nombre: "Hidrandina S.A.A.", ruc: "" }, existentes, nadie);
    expect(r).toEqual({ paso: "preguntar", parecidos: [{ proveedor: hidrandina, por: "raiz" }] });
  });

  it("«No, es otro» deja sumar: la pregunta no vuelve por el mismo proveedor", () => {
    expect(sumarProveedorDeGasto({ nombre: "Hidrandina S.A.A.", ruc: "" }, existentes, new Set(["h"]))).toEqual({ paso: "sumar" });
  });

  it("el nombre IGUAL para la base (mayúsculas, tildes, espacios) es ese mismo: se elige, no se crea otro", () => {
    expect(sumarProveedorDeGasto({ nombre: "  estudio contable  RIOS ", ruc: "" }, existentes, nadie)).toEqual({ paso: "es", proveedor: contador, por: "nombre" });
    // Aunque haya dicho «es otro»: con el mismo nombre la base devolvería el que ya existe.
    expect(sumarProveedorDeGasto({ nombre: "Hidrandina SA", ruc: "" }, existentes, new Set(["h"]))).toEqual({ paso: "es", proveedor: hidrandina, por: "nombre" });
  });

  it("el mismo RUC contesta primero, con cualquier nombre o sin nombre todavía (como la RPC)", () => {
    expect(sumarProveedorDeGasto({ nombre: "Luz del norte", ruc: "20132023540" }, existentes, nadie)).toEqual({ paso: "es", proveedor: hidrandina, por: "ruc" });
    expect(sumarProveedorDeGasto({ nombre: "", ruc: "20132023540" }, existentes, nadie)).toEqual({ paso: "es", proveedor: hidrandina, por: "ruc" });
    // «No, es otro» no cambia lo que haría la base con ese RUC.
    expect(sumarProveedorDeGasto({ nombre: "Hidrandina S.A.A.", ruc: "20132023540" }, existentes, new Set(["h"]))).toEqual({ paso: "es", proveedor: hidrandina, por: "ruc" });
  });

  it("con otro RUC válido no pregunta: SUNAT ya dice que son dos", () => {
    expect(sumarProveedorDeGasto({ nombre: "Hidrandina S.A.A.", ruc: "20999999991" }, existentes, nadie)).toEqual({ paso: "sumar" });
  });

  it("un RUC a medio escribir no cuenta: sigue la pregunta por el nombre", () => {
    expect(sumarProveedorDeGasto({ nombre: "Hidrandina S.A.A.", ruc: "2013202354" }, existentes, nadie).paso).toBe("preguntar");
  });

  it("con el mismo nombre y otro RUC, la base devuelve el que ya existe (busca el RUC y después el nombre)", () => {
    expect(sumarProveedorDeGasto({ nombre: "Hidrandina SA", ruc: "20999999991" }, existentes, nadie)).toEqual({ paso: "es", proveedor: hidrandina, por: "nombre" });
  });

  it("sin nombre ni RUC conocido, falta escribir; un nombre sin parecidos se suma", () => {
    expect(sumarProveedorDeGasto({ nombre: "   ", ruc: "" }, existentes, nadie)).toEqual({ paso: "incompleto" });
    expect(sumarProveedorDeGasto({ nombre: "Sedalib", ruc: "" }, existentes, nadie)).toEqual({ paso: "sumar" });
  });

  it("el tope va después de «es otro»: contestados los primeros, se pregunta por los que siguen", () => {
    const tiendas = ["Divas", "Divas Now", "Divas Kids", "Divas Home"].map((nombre, i) => ({ id: String(i), nombre, ruc: null }));
    const primera = sumarProveedorDeGasto({ nombre: "Divas SAC", ruc: "" }, tiendas, nadie, 2);
    expect(primera.paso === "preguntar" && primera.parecidos.map((p) => p.proveedor.nombre)).toEqual(["Divas", "Divas Home"]);
    const segunda = sumarProveedorDeGasto({ nombre: "Divas SAC", ruc: "" }, tiendas, new Set(["0", "3"]), 2);
    expect(segunda.paso === "preguntar" && segunda.parecidos.map((p) => p.proveedor.nombre)).toEqual(["Divas Kids", "Divas Now"]);
  });
});
