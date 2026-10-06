import { describe, expect, it } from "vitest";
import {
  detalleDePrenda,
  guiaDelTraslado,
  leerFormatoGuia,
  rutaDeLaGuia,
  rutaDelPaseDeTraslado,
  textoImprimirGuia,
  urlDelQrDeLaGuia,
  type TrasladoParaGuia,
} from "./traslados-guia-reglas";

// Salió el martes 6 de octubre de 2026 a las 10:40 de Lima (15:40 UTC); llega el miércoles a las 16:00.
const caja = (cambios: Partial<TrasladoParaGuia> = {}): TrasladoParaGuia => ({
  id: "8f1c2d3e-0000-4000-8000-000000000287",
  numero: 287,
  estado: "en_transito",
  ubicacionOrigenNombre: "Tienda TRU",
  ubicacionDestinoNombre: "Tienda LIM",
  creadoEn: "2026-10-06T15:40:00.000Z",
  fechaEstimadaLlegada: "2026-10-07T21:00:00.000Z",
  creadoPorNombre: "Ana Quispe",
  lineas: [
    { varianteId: "v1", referencia: "Blusa Aurora", talla: "M", color: "Rosado", codigo: "BLS-0001-M-RS", cantidadEnviada: 3 },
    { varianteId: "v2", referencia: "Falda Ariana", talla: "S", color: "Beige", codigo: "FLD-0002-S-BG", cantidadEnviada: 1 },
    { varianteId: "v3", referencia: "Pañuelo Lía", talla: null, color: null, codigo: null, cantidadEnviada: 19 },
  ],
  ...cambios,
});

describe("guía impresa: nunca dice cuántas van (ADR-0239 D-130)", () => {
  it("dos cajas con las mismas prendas y otras cantidades dan la MISMA guía", () => {
    const a = guiaDelTraslado(caja());
    const b = guiaDelTraslado(caja({ lineas: caja().lineas.map((l, i) => ({ ...l, cantidadEnviada: 40 + i })) }));
    expect(b).toEqual(a);
  });

  it("ningún campo de la guía es una cantidad de la caja", () => {
    const g = guiaDelTraslado(caja());
    const texto = JSON.stringify(g);
    expect(texto).not.toMatch(/cantidad/i);
    for (const p of g.prendas) expect(Object.keys(p).sort()).toEqual(["codigo", "detalle", "nombre", "varianteId"]);
    // Ni el total (23) ni la cantidad más llamativa (19) aparecen en lo que se imprime.
    const impreso = [g.de, g.a, g.salio, g.llega, g.envia, ...g.prendas.flatMap((p) => [p.nombre, p.detalle, p.codigo])].join(" ");
    expect(impreso).not.toMatch(/\b(23|19)\b/);
  });

  it("solo lleva lo que salió en la caja: lo anotado «de más» al recibir no es algo que buscar", () => {
    const g = guiaDelTraslado(caja({ lineas: [...caja().lineas, { varianteId: "v9", referencia: "Top Nube", talla: "L", color: "Negro", codigo: "TOP-9", cantidadEnviada: null }] }));
    expect(g.prendas.map((p) => p.varianteId)).toEqual(["v1", "v2", "v3"]);
  });
});

describe("guía impresa: lo que dice el papel", () => {
  it("de qué sede a cuál, con fechas fijas en hora de Lima (nunca «hoy» ni «mañana»)", () => {
    const g = guiaDelTraslado(caja());
    expect(g).toMatchObject({ numero: 287, de: "Tienda TRU", a: "Tienda LIM", salio: "6 OCT · 10:40", llega: "7 OCT · 16:00", envia: "Ana Quispe" });
  });

  it("sin hora de llegada dice «Sin hora»; sin nombre de quien envía, no inventa uno", () => {
    const g = guiaDelTraslado(caja({ fechaEstimadaLlegada: null, creadoPorNombre: "—" }));
    expect(g.llega).toBe("Sin hora");
    expect(g.envia).toBeNull();
  });

  it("cada prenda con su talla y su color, en el orden de la caja", () => {
    expect(guiaDelTraslado(caja()).prendas).toEqual([
      { varianteId: "v1", nombre: "Blusa Aurora", detalle: "Talla M · Rosado", codigo: "BLS-0001-M-RS" },
      { varianteId: "v2", nombre: "Falda Ariana", detalle: "Talla S · Beige", codigo: "FLD-0002-S-BG" },
      { varianteId: "v3", nombre: "Pañuelo Lía", detalle: "", codigo: null },
    ]);
  });

  it("detalleDePrenda: lo que haya, sin separadores sueltos", () => {
    expect(detalleDePrenda({ talla: "Única", color: null })).toBe("Talla Única");
    expect(detalleDePrenda({ talla: " ", color: "Negro" })).toBe("Negro");
    expect(detalleDePrenda({ talla: null, color: null })).toBe("");
  });
});

describe("guía impresa: cuándo se imprime", () => {
  it("en camino: se imprime y la caja todavía no llegó", () => {
    expect(guiaDelTraslado(caja())).toMatchObject({ porQueNo: null, yaLlego: false });
  });

  it("anulada: no se imprime, y dice por qué", () => {
    const g = guiaDelTraslado(caja({ estado: "anulada" }));
    expect(g.porQueNo).toBe("El traslado 287 se anuló: las prendas volvieron a Tienda TRU y la caja no viaja.");
    expect(g.yaLlego).toBe(false);
  });

  it.each(["recibido", "recibido_con_diferencia", "cerrado"])("ya llegó (%s): se puede reimprimir, avisando que ya no sirve para contar", (estado) => {
    expect(guiaDelTraslado(caja({ estado }))).toMatchObject({ porQueNo: null, yaLlego: true });
  });
});

describe("guía impresa: el QR y las direcciones", () => {
  it("el QR abre el pase de ESA caja, con la dirección completa", () => {
    expect(urlDelQrDeLaGuia("https://erp.cayla.pe", "abc")).toBe("https://erp.cayla.pe/inventario/traslados/abc");
    expect(urlDelQrDeLaGuia("http://localhost:3010/", "abc")).toBe("http://localhost:3010/inventario/traslados/abc");
  });

  it("la guía vive fuera de la billetera; el pase, dentro", () => {
    expect(rutaDelPaseDeTraslado("abc")).toBe("/inventario/traslados/abc");
    expect(rutaDeLaGuia("abc")).toBe("/inventario/traslados/guia/abc");
  });
});

describe("guía impresa: la hoja", () => {
  it("lo guardado en el aparato se lee sin confiar: solo «a4» cambia la térmica", () => {
    expect(leerFormatoGuia("a4")).toBe("a4");
    expect(leerFormatoGuia("termica")).toBe("termica");
    expect(leerFormatoGuia(null)).toBe("termica");
    expect(leerFormatoGuia("A4 ")).toBe("termica");
  });

  it("el botón dice dónde imprime", () => {
    expect(textoImprimirGuia("termica")).toBe("Imprimir en la térmica");
    expect(textoImprimirGuia("a4")).toBe("Imprimir en A4");
  });
});
