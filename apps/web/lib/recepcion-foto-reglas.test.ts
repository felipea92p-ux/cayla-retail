import { describe, expect, it } from "vitest";
import { estadoDeLaFoto, fotoParaCrear, pideSinFondo, vistaDeLaFoto, type FotoDelModelo } from "./recepcion-foto-reglas";

const base: FotoDelModelo<string, string> = { archivo: "foto.jpg", vista: "blob:real", sinFondo: false };
const conIA: FotoDelModelo<string, string> = { ...base, sinFondo: true, ia: { png: "png", vista: "blob:ia" } };

describe("la foto de un modelo al contar", () => {
  it("se ve la sin fondo solo si se eligió y ya llegó", () => {
    expect(vistaDeLaFoto(null)).toBeNull();
    expect(vistaDeLaFoto(base)).toBe("blob:real");
    expect(vistaDeLaFoto({ ...base, sinFondo: true })).toBe("blob:real");
    expect(vistaDeLaFoto(conIA)).toBe("blob:ia");
    // «Mantener la original»: apagar no borra la sin fondo, solo deja de mostrarla.
    expect(vistaDeLaFoto({ ...conIA, sinFondo: false })).toBe("blob:real");
  });

  it("la franja dice qué está en camino; lo que llega del celular manda", () => {
    expect(estadoDeLaFoto(false, null)).toBeNull();
    expect(estadoDeLaFoto(true, null)).toBe("cargando");
    expect(estadoDeLaFoto(true, { sinFondo: true, quitandoFondo: true })).toBe("cargando");
    expect(estadoDeLaFoto(false, { sinFondo: true, quitandoFondo: true })).toBe("quitando-fondo");
    // Apagado a mitad: el pedido sigue (ya se pagó), pero se ve la original y no se dice que se está quitando.
    expect(estadoDeLaFoto(false, { sinFondo: false, quitandoFondo: true })).toBeNull();
  });

  it("pide la sin fondo una sola vez, y solo si la cuenta puede", () => {
    expect(pideSinFondo(null, true)).toBe(false);
    expect(pideSinFondo({ ...base, sinFondo: true }, false)).toBe(false);
    expect(pideSinFondo({ ...base, sinFondo: true }, true)).toBe(true);
    expect(pideSinFondo({ ...base, sinFondo: true, quitandoFondo: true }, true)).toBe(false);
    expect(pideSinFondo(conIA, true)).toBe(false);
    expect(pideSinFondo(base, true)).toBe(false);
  });

  it("a «Crear la prenda» pasa la foto y, si existe, su sin fondo con lo elegido", () => {
    expect(fotoParaCrear(null)).toEqual([]);
    expect(fotoParaCrear(base)).toEqual([{ archivo: "foto.jpg" }]);
    expect(fotoParaCrear(conIA)).toEqual([{ archivo: "foto.jpg", ia: { png: "png", usar: true } }]);
    expect(fotoParaCrear({ ...conIA, sinFondo: false })).toEqual([{ archivo: "foto.jpg", ia: { png: "png", usar: false } }]);
  });
});
