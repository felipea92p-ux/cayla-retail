import { afterEach, describe, expect, it, vi } from "vitest";
import { abrirFotoElegida, abrirFotosElegidas } from "./foto-elegida-cliente";

// La puerta con archivos que fallan como en la tienda. El caso del «Chaleco Dad» (2026-11-16) no se puede repetir en un navegador de pruebas:
// Safari no pudo LEER un archivo arrastrado desde un lugar pasajero. Aquí se simula ese archivo: uno cuya lectura falla.

const JPEG = [0xff, 0xd8, 0xff, 0xe0, 0, 0x10, 0x4a, 0x46, 0x49, 0x46, 0, 1, 1, 0, 0, 1];
const HEIC = [0, 0, 0, 0x18, 0x66, 0x74, 0x79, 0x70, 0x68, 0x65, 0x69, 0x63, 0, 0, 0, 0];

/** Un archivo que dice ser lo que quieras y cuya lectura falla, como el que ya no está en el disco. */
function ilegible(nombre: string, tipo: string): File {
  const f = new File([new Uint8Array(JPEG)], nombre, { type: tipo });
  const falla = () => Promise.reject(new DOMException("An error occured reading the Blob argument to createImageBitmap", "NotReadableError"));
  Object.defineProperty(f, "arrayBuffer", { value: falla });
  Object.defineProperty(f, "slice", { value: () => ({ arrayBuffer: falla }) });
  return f;
}

afterEach(() => vi.unstubAllGlobals());

describe("abrirFotoElegida — la foto se abre al elegirla, y lo que falla se dice para la tienda", () => {
  it("el archivo que el navegador no puede leer (el del Chaleco Dad) no entra y dice qué hacer, en español", async () => {
    const r = await abrirFotoElegida(ilegible("chaleco.jpg", "image/jpeg"));
    expect(r).toEqual({ falla: "no-se-lee", texto: "Está en Google Drive o iCloud sin descargar. Ábrela una vez en tu Mac y súbela de nuevo." });
  });

  it("una JPG que el navegador no abre (cortada a la mitad) se dice «dañada»", async () => {
    vi.stubGlobal("createImageBitmap", () => Promise.reject(new DOMException("The source image could not be decoded.", "InvalidStateError")));
    const r = await abrirFotoElegida(new File([new Uint8Array(JPEG)], "a.jpg", { type: "image/jpeg" }));
    expect(r).toMatchObject({ falla: "no-se-abre" });
  });

  it("una HEIC que el navegador no abre (Chrome) da el consejo del iPhone", async () => {
    vi.stubGlobal("createImageBitmap", () => Promise.reject(new DOMException("x", "InvalidStateError")));
    const r = await abrirFotoElegida(new File([new Uint8Array(HEIC)], "IMG_0412.HEIC", { type: "image/heic" }));
    expect(r).toMatchObject({ falla: "otro-formato" });
  });

  it("una HEIC renombrada a .jpg se reconoce por sus bytes, no por su nombre", async () => {
    vi.stubGlobal("createImageBitmap", () => Promise.reject(new DOMException("x", "InvalidStateError")));
    const r = await abrirFotoElegida(new File([new Uint8Array(HEIC)], "foto.jpg", { type: "image/jpeg" }));
    expect(r).toMatchObject({ falla: "otro-formato" });
  });

  it("la que abre queda COPIADA: sigue sirviendo aunque el archivo de origen ya no se pueda leer", async () => {
    const cerrada = vi.fn();
    vi.stubGlobal("createImageBitmap", () => Promise.resolve({ width: 10, height: 10, close: cerrada }));
    const origen = new File([new Uint8Array(JPEG)], "real.jpg", { type: "image/jpeg" });
    const r = await abrirFotoElegida(origen);
    if (!("archivo" in r)) throw new Error("debió abrir");
    // El origen deja de poder leerse (se borró, era de WhatsApp): la copia no depende de él.
    Object.defineProperty(origen, "arrayBuffer", { value: () => Promise.reject(new Error("ya no está")) });
    expect(r.archivo).not.toBe(origen);
    expect(new Uint8Array(await r.archivo.arrayBuffer()).slice(0, 4)).toEqual(new Uint8Array(JPEG.slice(0, 4)));
    expect(r.archivo.type).toBe("image/jpeg");
    expect(cerrada).toHaveBeenCalledOnce();
  });

  it("un PNG que llegó sin tipo entra con el tipo de lo que es", async () => {
    vi.stubGlobal("createImageBitmap", () => Promise.resolve({ width: 1, height: 1, close: () => {} }));
    const png = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0, 0, 0, 0, 0];
    const r = await abrirFotoElegida(new File([new Uint8Array(png)], "sin-tipo", { type: "" }));
    expect(r).toMatchObject({ archivo: expect.objectContaining({ type: "image/png" }) });
  });
});

describe("abrirFotosElegidas — varias a la vez, un solo aviso", () => {
  it("entra la buena, la mala se avisa con su nombre, y cada una queda en su lugar", async () => {
    vi.stubGlobal("createImageBitmap", () => Promise.resolve({ width: 1, height: 1, close: () => {} }));
    const avisos: string[] = [];
    const buena = new File([new Uint8Array(JPEG)], "buena.jpg", { type: "image/jpeg" });
    const r = await abrirFotosElegidas([ilegible("mala.jpg", "image/jpeg"), buena], (titulo, detalle) => avisos.push(`${titulo} | ${detalle}`));
    expect(r.porPosicion[0]).toBeNull();
    expect(r.porPosicion[1]?.name).toBe("buena.jpg");
    expect(r.buenas.map((f) => f.name)).toEqual(["buena.jpg"]);
    expect(avisos).toEqual(["Una foto no se puede usar | mala.jpg: Está en Google Drive o iCloud sin descargar. Ábrela una vez en tu Mac y súbela de nuevo."]);
  });
});
