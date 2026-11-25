import { describe, expect, it } from "vitest";
import { puntosDeAvance } from "./puntos-avance";
import { pasosDelModelo, type ModeloParaPasos } from "./recepcion-pasos-reglas";

const base: ModeloParaPasos = { hayConteo: false, contadas: 0, enStock: 0, esNuevo: false, enCatalogo: true, tarjeta: "espera", repartidas: 0 };
const estados = (m: Partial<ModeloParaPasos>) => pasosDelModelo({ ...base, ...m })?.map((p) => `${p.clave}:${p.estado}`) ?? null;

describe("pasosDelModelo — lo que le queda a un modelo para salir a la venta (ADR-0699)", () => {
  it("una reposición tiene tres pasos; sin contar, el primero está abierto", () => {
    expect(estados({})).toEqual(["cuantas:abierto", "tallas:pendiente", "llevar:pendiente"]);
  });

  it("una prenda nueva suma «Crear», y es lo que toca apenas se cuenta", () => {
    const nueva = { esNuevo: true, enCatalogo: false };
    expect(estados(nueva)).toEqual(["cuantas:abierto", "crear:pendiente", "tallas:pendiente", "llevar:pendiente"]);
    expect(estados({ ...nueva, hayConteo: true, contadas: 5, tarjeta: "nueva" })).toEqual(["cuantas:hecho", "crear:abierto", "tallas:pendiente", "llevar:pendiente"]);
  });

  it("creada, siguen las tallas; repartidas, llevar; en el stock, todo hecho", () => {
    const creada = { esNuevo: true, enCatalogo: true, hayConteo: true, contadas: 5 };
    expect(estados({ ...creada, tarjeta: "repartir" })).toEqual(["cuantas:hecho", "crear:hecho", "tallas:abierto", "llevar:pendiente"]);
    expect(estados({ ...creada, tarjeta: "lista", repartidas: 5 })).toEqual(["cuantas:hecho", "crear:hecho", "tallas:hecho", "llevar:abierto"]);
    expect(estados({ ...creada, tarjeta: "en-stock", enStock: 5 })).toEqual(["cuantas:hecho", "crear:hecho", "tallas:hecho", "llevar:hecho"]);
  });

  it("nunca hay dos pasos abiertos, y lo de antes del abierto está hecho", () => {
    const tarjetas = ["espera", "nueva", "despues", "repartir", "a-medias", "de-mas", "lista", "en-stock"] as const;
    for (const tarjeta of tarjetas)
      for (const esNuevo of [true, false])
        for (const enCatalogo of [true, false])
          for (const hayConteo of [true, false]) {
            const pasos = pasosDelModelo({ ...base, tarjeta, esNuevo, enCatalogo, hayConteo, contadas: hayConteo ? 4 : 0 }) ?? [];
            const abiertos = pasos.filter((p) => p.estado === "abierto");
            expect(abiertos.length).toBeLessThanOrEqual(1);
            const i = pasos.findIndex((p) => p.estado === "abierto");
            if (i > 0) expect(pasos.slice(0, i).every((p) => p.estado === "hecho")).toBe(true);
          }
  });

  it("un modelo que no llegó no muestra pasos", () => {
    expect(pasosDelModelo({ ...base, hayConteo: true, contadas: 0 })).toBeNull();
  });

  it("los números van seguidos aunque falte «Crear», y la pieza de los puntos los entiende", () => {
    const pasos = pasosDelModelo({ ...base, hayConteo: true, contadas: 3, tarjeta: "repartir" })!;
    expect(pasos.map((p) => p.numero)).toEqual([1, 2, 3]);
    const { puntos } = puntosDeAvance(pasos);
    expect(puntos.map((p) => p.tipo)).toEqual(["hecho", "aqui", "sigue"]);
  });

  it("«Llevar» nunca se abre desde la tira: se lleva con su botón, que pide costo y quién", () => {
    const pasos = pasosDelModelo({ ...base, hayConteo: true, contadas: 3, tarjeta: "lista", repartidas: 3 })!;
    expect(pasos.find((p) => p.clave === "llevar")?.abrible).toBe(false);
  });
});
