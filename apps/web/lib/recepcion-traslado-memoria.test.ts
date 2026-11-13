import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { anotarCarga, cargaVistaEn } from "./copia-de-pagina";
import { lineasAlDia, recibidosDespuesDe, recordarRecibido } from "./recepcion-traslado-memoria";
import type { LineaRecepcion } from "./traslados-recepcion-reglas";

// Recibir un traslado al volver con «atrás» (medido en local el 2026-11-11, caja 294 de Trujillo a Lima): Next dibuja la página que guardó su
// router, con lo contado de cuando se leyó, y el siguiente «+» guardaba encima de ese número viejo (`registrar_recepcion_traslado` recibe el
// número entero y gana el último). La pestaña recuerda lo que guardó y, sobre una copia, lo pone encima de lo que trae la página.
//
// Contrato (3 líneas). PROMETE: que sobre una copia la casilla muestra lo que esta pestaña guardó DESPUÉS de dibujar esa carga, y que sobre una
// página nueva manda la página; que la pantalla anota cada guardado y pide la página de nuevo si dibuja una copia. ASUME: una memoria por
// proceso de prueba (cada caso usa su propio traslado). NO PROMETE: el clic en el navegador (se mide a mano, en escritorio y a 375 px).

const linea = (p: Partial<LineaRecepcion> & { varianteId: string }): LineaRecepcion => ({
  referencia: "Blusa Emma",
  talla: "M",
  color: "Beige",
  sku: "",
  codigo: null,
  cantidadEnviada: 2,
  cantidadRecibida: 1,
  ingresado: false,
  ...p,
});

describe("lo que la pestaña recuerda de un traslado que se recibe", () => {
  it("al volver con «atrás», la casilla dice lo que se guardó después de dibujar esa página, no lo que trae la copia", () => {
    const ambito = "traslado:atras";
    anotarCarga(ambito, "c1"); // La página se dibujó: M en 1.
    recordarRecibido("atras", "m", 2); // «Una más»: la base guardó 2.
    // Se va a otra pantalla y vuelve: el router dibuja la misma carga, con M en 1.
    const desde = cargaVistaEn(ambito, "c1");
    const alVolver = lineasAlDia([linea({ varianteId: "m", cantidadRecibida: 1 })], recibidosDespuesDe("atras", desde));
    expect(alVolver[0].cantidadRecibida).toBe(2);
  });

  it("sobre una página nueva (todavía no dibujada) manda la página: trae lo que contó otra persona", () => {
    recordarRecibido("nueva", "m", 2);
    expect(recibidosDespuesDe("nueva", cargaVistaEn("traslado:nueva", "c2"))).toEqual({});
  });

  it("lo guardado ANTES de dibujar esa carga ya venía en ella: manda la página", () => {
    recordarRecibido("antes", "m", 2);
    anotarCarga("traslado:antes", "c3");
    expect(recibidosDespuesDe("antes", cargaVistaEn("traslado:antes", "c3"))).toEqual({});
  });

  it("de varias veces guardada, queda la última", () => {
    anotarCarga("traslado:varias", "c4");
    recordarRecibido("varias", "m", 2);
    recordarRecibido("varias", "m", 3);
    expect(recibidosDespuesDe("varias", cargaVistaEn("traslado:varias", "c4"))).toEqual({ m: 3 });
  });

  it("una prenda que ya entró al stock no cambia, y una que la copia no trae no se inventa", () => {
    const lineas = [linea({ varianteId: "m", cantidadRecibida: 1, ingresado: true }), linea({ varianteId: "l", cantidadRecibida: null })];
    const alDia = lineasAlDia(lineas, { m: 5, x: 9, l: 4 });
    expect(alDia.map((l) => [l.varianteId, l.cantidadRecibida])).toEqual([
      ["m", 1],
      ["l", 4],
    ]);
  });

  it("sin nada más nuevo, devuelve las mismas líneas (la pantalla no se vuelve a dibujar por nada)", () => {
    const lineas = [linea({ varianteId: "m" })];
    expect(lineasAlDia(lineas, {})).toBe(lineas);
  });

  it("lo de un traslado no se mezcla con otro", () => {
    anotarCarga("traslado:otro-a", "c5");
    recordarRecibido("otro-b", "m", 7);
    expect(recibidosDespuesDe("otro-a", cargaVistaEn("traslado:otro-a", "c5"))).toEqual({});
  });
});

describe("la recepción del traslado usa esa memoria", () => {
  const leer = (ruta: string) => readFileSync(new URL(ruta, import.meta.url), "utf8");
  const recepcion = leer("../components/traslados-pases/useRecepcion.ts");
  const alDia = leer("../components/traslados-pases/useTrasladoAlDia.ts");
  const reverso = leer("../components/traslados-pases/ReversoPase.tsx");
  const escenario = leer("../components/traslados-pases/EscenarioPase.tsx");

  it("anota cada prenda que la base confirma (lo contado y la prenda de más)", () => {
    expect(recepcion).toContain("recordarRecibido(t.id, varianteId, valor)");
    expect(recepcion).toContain("recordarRecibido(t.id, varianteId, 1)");
  });

  it("la página manda un identificador nuevo en cada carga y el reverso dibuja el traslado al día", () => {
    expect(escenario).toContain("carga={idDeCarga()}");
    expect(reverso).toContain("useTrasladoAlDia(trasladoDeLaPagina, carga)");
  });

  it("sobre una copia pone encima lo guardado después y pide la página de nuevo, sin loader", () => {
    expect(alDia).toContain("lineasAlDia(t.lineas, recibidosDespuesDe(t.id, cargaVistaEn(ambito, carga)))");
    expect(alDia).toMatch(/anotarCarga\(ambito, carga\)[\s\S]{0,260}navegacionSinEspera\(window\.location\.href\);\s*router\.refresh\(\)/);
  });
});
