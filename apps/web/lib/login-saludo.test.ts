import { describe, expect, it } from "vitest";
import {
  ESPERA_EN,
  MS_DE_LA_SALIDA_EN_EL_CENTRO,
  PAUSA_MINIMA_EN_EL_CENTRO,
  instanteParaSeguir,
  msCorridosDeLaSalida,
  msDelVuelo,
  opacidadDelSaludo,
} from "./login-entrada";
import { FRASE_DE_ENTRADA, FRASE_DE_SALIDA, cuentaParaSaludar, nombreParaSaludar, saludoDe } from "./login-saludo";

describe("a quién se saluda", () => {
  it("una persona, por su nombre de pila", () => {
    expect(nombreParaSaludar("Camila Mendoza Ríos", false)).toBe("Camila");
    expect(nombreParaSaludar("  Ana   María  Soto ", false)).toBe("Ana");
  });
  it("una terminal, por el nombre completo del aparato", () => {
    expect(nombreParaSaludar("Terminal Ventas TRU", true)).toBe("Terminal Ventas TRU");
    expect(nombreParaSaludar("  Terminal   Caja  LIM ", true)).toBe("Terminal Caja LIM");
  });
  it("sin nombre (vacío, null, un número) solo va la frase", () => {
    for (const raro of ["", "   ", null, undefined, 42, {}]) expect(nombreParaSaludar(raro, false)).toBeNull();
    expect(saludoDe("entrar", null, false)).toEqual({ frase: FRASE_DE_ENTRADA, nombre: null });
  });
  it("el nombre se muestra tal cual: no se cambia ni se adivina el género", () => {
    expect(saludoDe("entrar", "Andrés Peña", false).nombre).toBe("Andrés");
    expect(saludoDe("entrar", "Andrés Peña", false).frase).toBe("Bienvenido(a)");
  });
});

describe("la frase", () => {
  it("al entrar «Bienvenido(a)» y al salir «Hasta luego»", () => {
    expect(saludoDe("entrar", "Camila", false)).toEqual({ frase: "Bienvenido(a)", nombre: "Camila" });
    expect(saludoDe("salir", "Camila", false)).toEqual({ frase: "Hasta luego", nombre: "Camila" });
    expect(FRASE_DE_SALIDA).toBe("Hasta luego");
  });
});

describe("lo que contesta la base", () => {
  it("lee la fila de la persona (objeto o lista) y si es un aparato", () => {
    expect(cuentaParaSaludar({ nombre: "Camila Mendoza" }, "")).toEqual({ nombre: "Camila Mendoza", terminal: false });
    expect(cuentaParaSaludar([{ nombre: "Terminal Ventas TRU" }], "Terminal Ventas TRU")).toEqual({ nombre: "Terminal Ventas TRU", terminal: true });
    expect(cuentaParaSaludar({ nombre: "Camila" }, null)?.terminal).toBe(false); // una base vieja sin fn_mi_terminal: es una persona
  });
  it("cualquier forma rara es «no sé»", () => {
    for (const raro of [null, undefined, "x", 3, [], {}, { nombre: "" }, { nombre: 5 }]) expect(cuentaParaSaludar(raro, "")).toBeNull();
  });
});

describe("la pausa en el centro y cuándo se ve el saludo", () => {
  it("el vuelo nunca sigue antes de que haya flotado la pausa mínima, aunque la pantalla ya esté lista", () => {
    expect(instanteParaSeguir(0, "entrar")).toBe(ESPERA_EN + PAUSA_MINIMA_EN_EL_CENTRO);
    expect(instanteParaSeguir(0, "salir")).toBe(MS_DE_LA_SALIDA_EN_EL_CENTRO + PAUSA_MINIMA_EN_EL_CENTRO);
  });
  it("y si la pantalla tarda más, flota lo que haga falta", () => {
    expect(instanteParaSeguir(9000, "entrar")).toBe(9000);
    expect(instanteParaSeguir(9000, "salir")).toBe(9000);
  });
  it("con la pausa, en el centro el tiempo está detenido (el saludo ya se ve entero) durante al menos 450 ms", () => {
    const sigue = instanteParaSeguir(0, "entrar");
    expect(msDelVuelo(sigue - 1, sigue)).toBe(ESPERA_EN);
    expect(opacidadDelSaludo("entrar", msDelVuelo(ESPERA_EN + 200, sigue))).toBe(1);
    const sigueSalida = instanteParaSeguir(0, "salir");
    expect(msCorridosDeLaSalida(sigueSalida - 1, sigueSalida)).toBe(MS_DE_LA_SALIDA_EN_EL_CENTRO);
    expect(opacidadDelSaludo("salir", msCorridosDeLaSalida(MS_DE_LA_SALIDA_EN_EL_CENTRO + 200, sigueSalida))).toBe(1);
  });
  it.each(["entrar", "salir"] as const)("%s: no se ve al principio, asoma antes de llegar al centro, está entero en el centro y se va cuando el vuelo sigue", (modo) => {
    const centro = modo === "salir" ? MS_DE_LA_SALIDA_EN_EL_CENTRO : ESPERA_EN;
    expect(opacidadDelSaludo(modo, 0)).toBe(0);
    expect(opacidadDelSaludo(modo, centro - 320)).toBe(0);
    expect(opacidadDelSaludo(modo, centro - 160)).toBeGreaterThan(0);
    expect(opacidadDelSaludo(modo, centro - 160)).toBeLessThan(1);
    expect(opacidadDelSaludo(modo, centro)).toBe(1);
    expect(opacidadDelSaludo(modo, centro + 150)).toBeGreaterThan(0);
    expect(opacidadDelSaludo(modo, centro + 150)).toBeLessThan(1);
    expect(opacidadDelSaludo(modo, centro + 300)).toBe(0);
    expect(opacidadDelSaludo(modo, centro + 5000)).toBe(0);
  });
  it("sin rebote: sube y baja una sola vez", () => {
    let bajando = false;
    let previa = 0;
    for (let ms = 0; ms <= 3000; ms += 10) {
      const o = opacidadDelSaludo("entrar", ms);
      expect(o).toBeGreaterThanOrEqual(0);
      expect(o).toBeLessThanOrEqual(1);
      if (o < previa - 1e-9) bajando = true;
      if (bajando) expect(o).toBeLessThanOrEqual(previa + 1e-9);
      previa = o;
    }
  });
});
