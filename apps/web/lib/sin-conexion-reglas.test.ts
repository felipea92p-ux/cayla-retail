import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { diaLima, esCopiaGuardada, hayRedReal, PANTALLAS_SIN_CONEXION, pantallaSinConexion, pruebaRed, VENTANA_RED_MS } from "./sin-conexion-reglas";

// Qué pantallas abren sin internet (ADR-0210, paso 3) y cómo se reconoce una copia guardada.

describe("pantallaSinConexion", () => {
  it("reconoce las tres pantallas con cola, con o sin barra final", () => {
    expect(pantallaSinConexion("/vender")?.soloDeHoy).toBe(true);
    expect(pantallaSinConexion("/recibir/")?.nombre).toBe("Recibir mercadería");
    // ADR-0330: «Ingreso sin comprobante» se fundió en /recibir; su ruta solo redirige.
    expect(pantallaSinConexion("/inventario/recibir")).toBeNull();
    expect(pantallaSinConexion("/productos/nuevo")).not.toBeNull();
  });

  it("no guarda pantallas con datos sensibles ni rutas que solo se parecen", () => {
    expect(pantallaSinConexion("/finanzas/gastos")).toBeNull();
    expect(pantallaSinConexion("/colaboradores")).toBeNull();
    expect(pantallaSinConexion("/vender/historial")).toBeNull();
    expect(pantallaSinConexion("/productos")).toBeNull();
  });
});

describe("public/sw.js repite la MISMA lista (no puede importar este archivo)", () => {
  const sw = readFileSync(join(__dirname, "..", "public", "sw.js"), "utf8");

  it("cada pantalla, con su regla de «solo de hoy»", () => {
    for (const p of PANTALLAS_SIN_CONEXION) {
      expect(sw).toContain(`{ ruta: "${p.ruta}", soloDeHoy: ${p.soloDeHoy} }`);
    }
  });

  it("y ninguna de más", () => {
    expect(sw.match(/\{ ruta: "/g)?.length).toBe(PANTALLAS_SIN_CONEXION.length);
  });
});

describe("diaLima", () => {
  it("las 23:30 de Lima siguen siendo ese día aunque en UTC ya sea el siguiente", () => {
    expect(diaLima(new Date("2026-09-26T04:30:00.000Z"))).toBe("2026-09-25");
    expect(diaLima(new Date("2026-09-26T05:30:00.000Z"))).toBe("2026-09-26");
  });
});

describe("esCopiaGuardada", () => {
  const ahora = new Date("2026-09-25T20:00:00.000Z");

  it("una página recién pedida no es copia, aunque el reloj de la caja esté un poco corrido", () => {
    expect(esCopiaGuardada("2026-09-25T19:59:58.000Z", ahora)).toBe(false);
    expect(esCopiaGuardada("2026-09-25T19:58:00.000Z", ahora)).toBe(false);
  });

  it("una carga de hace horas es la copia del service worker", () => {
    expect(esCopiaGuardada("2026-09-25T14:00:00.000Z", ahora)).toBe(true);
  });

  it("una fecha rota no se toma por copia", () => {
    expect(esCopiaGuardada("x", ahora)).toBe(false);
  });
});

describe("hayRedReal (navigator.onLine puede mentir «sin red», 2026-10-10)", () => {
  const ahoraMs = 1_000_000;
  it("si el navegador dice que hay red, hay red", () => {
    expect(hayRedReal({ navegadorDice: true, ultimaRespuestaMs: null, ahoraMs })).toBe(true);
  });
  it("el navegador dice «sin red» y la base nunca respondió: sin red", () => {
    expect(hayRedReal({ navegadorDice: false, ultimaRespuestaMs: null, ahoraMs })).toBe(false);
  });
  it("el navegador dice «sin red» pero la base respondió hace poco: hay red (el caso de la caja de TRU)", () => {
    expect(hayRedReal({ navegadorDice: false, ultimaRespuestaMs: ahoraMs - 5_000, ahoraMs })).toBe(true);
    expect(hayRedReal({ navegadorDice: false, ultimaRespuestaMs: ahoraMs - (VENTANA_RED_MS - 1), ahoraMs })).toBe(true);
  });
  it("la última respuesta ya es vieja: vuelve a mandar el navegador", () => {
    expect(hayRedReal({ navegadorDice: false, ultimaRespuestaMs: ahoraMs - VENTANA_RED_MS, ahoraMs })).toBe(false);
  });
  it("una respuesta «del futuro» (reloj movido) no prueba nada", () => {
    expect(hayRedReal({ navegadorDice: false, ultimaRespuestaMs: ahoraMs + 10_000, ahoraMs })).toBe(false);
  });
});

describe("pruebaRed", () => {
  it("solo una respuesta de la base prueba que hay red", () => {
    expect(pruebaRed("https://abc.supabase.co/rest/v1/rpc/fn_asesoras_de_turno", "abc.supabase.co")).toBe(true);
    expect(pruebaRed("https://cayla-retail.vercel.app/vender", "abc.supabase.co")).toBe(false);
    expect(pruebaRed("/_next/static/x.js", "abc.supabase.co")).toBe(false);
    expect(pruebaRed("https://abc.supabase.co/x", null)).toBe(false);
  });
});
