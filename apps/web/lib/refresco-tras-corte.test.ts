import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  MS_TECLEO,
  anotarEscrituraSinRespuesta,
  decidirRefresco,
  escrituraPendiente,
  msHastaOtroSondeo,
  olvidarEscritura,
  rutaConColaPropia,
  suscribirEscritura,
} from "./refresco-tras-corte";

const base = { pendienteEn: "/produccion/insumos", ruta: "/produccion/insumos", visible: true, msDesdeUltimaTecla: null };

describe("decidirRefresco (ADR-0411): la pantalla se vuelve a leer tras un guardado sin respuesta", () => {
  it("sin nada anotado, nada", () => {
    expect(decidirRefresco({ ...base, pendienteEn: null })).toEqual({ paso: "nada" });
  });

  it("el caso de Ingresar insumo: anotado en la misma pantalla, visible y sin teclear → preguntar a la base y refrescar", () => {
    expect(decidirRefresco(base)).toEqual({ paso: "sondear" });
  });

  it("si la persona ya se fue a otra pantalla, se olvida: la nueva se leyó al llegar", () => {
    expect(decidirRefresco({ ...base, ruta: "/produccion" })).toEqual({ paso: "olvidar" });
  });

  it("nunca en una pantalla con cola sin conexión propia: Vender, Recibir, Nuevo producto", () => {
    for (const ruta of ["/vender", "/recibir", "/productos/nuevo", "/vender/"]) {
      expect(decidirRefresco({ ...base, pendienteEn: ruta, ruta })).toEqual({ paso: "olvidar" });
    }
  });

  it("las demás pantallas de Ventas sí se refrescan (Apartados: el abono es dinero y no tiene cola)", () => {
    for (const ruta of ["/vender/apartados", "/vender/historial", "/caja"]) {
      expect(decidirRefresco({ ...base, pendienteEn: ruta, ruta })).toEqual({ paso: "sondear" });
    }
  });

  it("con la pestaña oculta, duerme hasta volver", () => {
    expect(decidirRefresco({ ...base, visible: false })).toEqual({ paso: "dormir" });
  });

  it("mientras la persona teclea, espera lo que falta para la pausa; no espera a que salga del campo", () => {
    expect(decidirRefresco({ ...base, msDesdeUltimaTecla: 0 })).toEqual({ paso: "esperar", ms: MS_TECLEO });
    expect(decidirRefresco({ ...base, msDesdeUltimaTecla: 1_000 })).toEqual({ paso: "esperar", ms: MS_TECLEO - 1_000 });
    expect(decidirRefresco({ ...base, msDesdeUltimaTecla: MS_TECLEO })).toEqual({ paso: "sondear" });
    expect(decidirRefresco({ ...base, msDesdeUltimaTecla: 60_000 })).toEqual({ paso: "sondear" });
  });

  it("un reloj que va para atrás (tecla «del futuro») no deja el refresco esperando para siempre", () => {
    expect(decidirRefresco({ ...base, msDesdeUltimaTecla: -5_000 })).toEqual({ paso: "sondear" });
  });

  it("el orden importa: irse gana a todo, y la pestaña oculta gana al tecleo", () => {
    expect(decidirRefresco({ ...base, ruta: "/caja", visible: false, msDesdeUltimaTecla: 0 })).toEqual({ paso: "olvidar" });
    expect(decidirRefresco({ ...base, visible: false, msDesdeUltimaTecla: 0 })).toEqual({ paso: "dormir" });
  });
});

describe("msHastaOtroSondeo: sin red, se pregunta cada vez más espaciado y nunca en bucle", () => {
  it("5 s, 10 s, 20 s, 40 s y después un minuto", () => {
    expect([0, 1, 2, 3, 4, 5, 50].map(msHastaOtroSondeo)).toEqual([5_000, 10_000, 20_000, 40_000, 60_000, 60_000, 60_000]);
  });
  it("crece o se queda, nunca baja", () => {
    for (let i = 0; i < 20; i++) expect(msHastaOtroSondeo(i + 1)).toBeGreaterThanOrEqual(msHastaOtroSondeo(i));
  });
  it("un número raro no rompe la cuenta", () => {
    expect(msHastaOtroSondeo(-3)).toBe(5_000);
    expect(msHastaOtroSondeo(1.7)).toBe(10_000);
  });
});

describe("rutaConColaPropia: la misma lista que el service worker (PANTALLAS_SIN_CONEXION)", () => {
  it("solo la ruta exacta de la pantalla con cola", () => {
    expect(rutaConColaPropia("/vender")).toBe(true);
    expect(rutaConColaPropia("/recibir")).toBe(true);
    expect(rutaConColaPropia("/productos/nuevo")).toBe(true);
    expect(rutaConColaPropia("/vender/apartados")).toBe(false);
    expect(rutaConColaPropia("/produccion/insumos")).toBe(false);
  });
});

describe("la anotación compartida", () => {
  afterEach(() => {
    const a = escrituraPendiente();
    if (a) olvidarEscritura(a.n);
  });

  it("anotar avisa a quien escucha y deja la ruta a la vista", () => {
    const oyente = vi.fn();
    const quitar = suscribirEscritura(oyente);
    anotarEscrituraSinRespuesta("/produccion/insumos");
    expect(oyente).toHaveBeenCalledTimes(1);
    expect(escrituraPendiente()?.ruta).toBe("/produccion/insumos");
    quitar();
    anotarEscrituraSinRespuesta("/produccion/insumos");
    expect(oyente).toHaveBeenCalledTimes(1);
  });

  it("olvidar una anotación no borra la que llegó después (otro guardado sin respuesta mientras se preguntaba a la base)", () => {
    anotarEscrituraSinRespuesta("/caja");
    const primera = escrituraPendiente()!.n;
    anotarEscrituraSinRespuesta("/caja");
    olvidarEscritura(primera);
    expect(escrituraPendiente()).not.toBeNull();
    olvidarEscritura(escrituraPendiente()!.n);
    expect(escrituraPendiente()).toBeNull();
  });
});

describe("está conectado donde todo pasa (no pantalla por pantalla)", () => {
  const leer = (ruta: string) => readFileSync(join(__dirname, "..", ruta), "utf8");

  it("el interceptor de `fetch` del loader anota el guardado que se quedó sin respuesta", () => {
    const espera = leer("components/ui/Espera.tsx");
    expect(espera).toMatch(/if \(tipo === "guardado"\) anotarEscrituraSinRespuesta\(window\.location\.pathname\)/);
  });

  it("el layout de la app monta el refresco una sola vez", () => {
    expect(leer("app/(app)/layout.tsx").match(/<RefrescoTrasCorte \/>/g)).toHaveLength(1);
  });

  it("el refresco no enciende el loader ni deja la pantalla `inert` bajo quien escribe", () => {
    const comp = leer("components/RefrescoTrasCorte.tsx");
    expect(comp).toMatch(/navegacionSinEspera\(window\.location\.href\);\s*router\.refresh\(\);/);
    // Y nunca refresca sin antes preguntarle a la base: sin red, Next pediría la página entera y la hoja se perdería.
    const pregunta = comp.indexOf("await sondearLaBase()");
    expect(pregunta).toBeGreaterThan(-1);
    expect(pregunta).toBeLessThan(comp.indexOf("router.refresh();"));
  });
});
