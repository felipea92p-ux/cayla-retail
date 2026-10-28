import { describe, expect, it } from "vitest";
import {
  BUCKET_DE_INSIGNIAS,
  LADO_IMAGEN_INSIGNIA,
  MAX_BYTES_IMAGEN_INSIGNIA,
  dibujoResuelto,
  esRutaDeImagenDeInsignia,
  imagenEsDeLaInsignia,
  rutaDeImagenDeInsignia,
  urlDeImagenDeInsignia,
} from "@cayla-retail/shared/insignia-imagen";
import {
  ACEPTA_IMAGEN_DE_INSIGNIA,
  INTENTOS_DE_COMPRESION_INSIGNIA,
  MAX_BYTES_DE_ENTRADA_INSIGNIA,
  avisoDeProporcionInsignia,
  medidasEnElCuadrado,
  objecionImagenDeInsignia,
} from "./imagen-de-insignia-reglas";

const E = "11111111-2222-4333-8444-555555555555";
const A = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";

describe("el archivo elegido para el ícono de una insignia", () => {
  it("acepta PNG, JPG y WebP razonables", () => {
    for (const type of ["image/png", "image/jpeg", "image/webp"]) expect(objecionImagenDeInsignia({ type, size: 2_000_000 })).toBeNull();
  });

  it("rechaza lo que no es imagen, el SVG (puede traer código y no se adapta al tema), lo vacío y lo enorme, con una frase de tienda", () => {
    expect(objecionImagenDeInsignia({ type: "application/pdf", size: 10 })).toMatch(/PNG, JPG o WebP/);
    expect(objecionImagenDeInsignia({ type: "image/svg+xml", size: 10 })).toMatch(/PNG, JPG o WebP/);
    expect(objecionImagenDeInsignia({ type: "image/webp", size: 0 })).toMatch(/vacío/);
    expect(objecionImagenDeInsignia({ type: "image/jpeg", size: MAX_BYTES_DE_ENTRADA_INSIGNIA + 1 })).toMatch(/15 MB/);
  });

  it("el selector de archivos no ofrece SVG", () => {
    expect(ACEPTA_IMAGEN_DE_INSIGNIA.split(",")).toEqual(["image/jpeg", "image/png", "image/webp"]);
  });
});

describe("medidasEnElCuadrado: entera, centrada, sin deformar y sin agrandar", () => {
  it("una imagen grande y cuadrada baja al lado del cuadrado", () => {
    expect(medidasEnElCuadrado(1024, 1024)).toEqual({ ancho: LADO_IMAGEN_INSIGNIA, alto: LADO_IMAGEN_INSIGNIA, x: 0, y: 0 });
  });

  it("una apaisada cabe entera y queda centrada con margen arriba y abajo (nada se recorta)", () => {
    expect(medidasEnElCuadrado(1024, 512)).toEqual({ ancho: 256, alto: 128, x: 0, y: 64 });
  });

  it("una alta cabe entera y queda centrada con margen a los lados", () => {
    expect(medidasEnElCuadrado(512, 1024)).toEqual({ ancho: 128, alto: 256, x: 64, y: 0 });
  });

  it("una imagen chica no se agranda (se vería borrosa)", () => {
    expect(medidasEnElCuadrado(64, 64)).toEqual({ ancho: 64, alto: 64, x: 96, y: 96 });
  });

  it("nunca da una medida de cero, ni con una tira finísima", () => {
    const m = medidasEnElCuadrado(10_000, 1);
    expect(m.ancho).toBe(256);
    expect(m.alto).toBeGreaterThanOrEqual(1);
  });

  it("respeta un cuadrado más chico (los intentos de compresión bajan el lado)", () => {
    expect(medidasEnElCuadrado(1024, 1024, 128)).toEqual({ ancho: 128, alto: 128, x: 0, y: 0 });
  });
});

describe("los intentos de compresión", () => {
  it("van del mejor al más liviano: la calidad no sube y la escala tampoco", () => {
    const intentos = INTENTOS_DE_COMPRESION_INSIGNIA;
    expect(intentos[0]).toEqual([0.9, 1]);
    for (let i = 1; i < intentos.length; i++) expect(intentos[i][1]).toBeLessThanOrEqual(intentos[i - 1][1]);
    expect(Math.min(...intentos.map((x) => x[1]))).toBeGreaterThan(0);
  });

  it("el tope de salida es el del almacén (100 KB)", () => {
    expect(MAX_BYTES_IMAGEN_INSIGNIA).toBe(100 * 1024);
  });
});

describe("el aviso de proporción nunca bloquea", () => {
  it("una cuadrada o casi cuadrada no avisa; una muy apaisada o muy alta sí", () => {
    expect(avisoDeProporcionInsignia(500, 500)).toBeNull();
    expect(avisoDeProporcionInsignia(500, 420)).toBeNull();
    expect(avisoDeProporcionInsignia(1000, 400)).toMatch(/No es cuadrada/);
    expect(avisoDeProporcionInsignia(400, 1000)).toMatch(/No es cuadrada/);
  });
});

describe("la ruta de la imagen en el almacén (la única forma que la base y la tienda dejan pasar)", () => {
  const RUTA = rutaDeImagenDeInsignia(E, A);

  it("es insignias/<insignia>/<archivo>.webp, en minúsculas", () => {
    expect(RUTA).toBe(`insignias/${E}/${A}.webp`);
    expect(rutaDeImagenDeInsignia(E.toUpperCase(), A.toUpperCase())).toBe(RUTA);
    expect(esRutaDeImagenDeInsignia(RUTA)).toBe(true);
  });

  it("rechaza direcciones completas, subidas de carpeta, otros almacenes, otras extensiones y lo que no es texto", () => {
    for (const mala of [
      `https://abc.supabase.co/${RUTA}`,
      `insignias/../${A}.webp`,
      `insignias/${E}/../${A}.webp`,
      `campanas/${E}/${A}.webp`,
      `insignias/${E}/${A}.png`,
      `/insignias/${E}/${A}.webp`,
      `insignias/${E}/${A}.webp?x=1`,
      "",
      null,
      undefined,
      7,
      {},
    ]) {
      expect(esRutaDeImagenDeInsignia(mala)).toBe(false);
    }
  });

  it("una insignia solo apunta a la carpeta de ella misma", () => {
    expect(imagenEsDeLaInsignia(RUTA, E)).toBe(true);
    expect(imagenEsDeLaInsignia(RUTA, E.toUpperCase())).toBe(true);
    expect(imagenEsDeLaInsignia(RUTA, A)).toBe(false);
    expect(imagenEsDeLaInsignia("insignias/../x.webp", E)).toBe(false);
    expect(imagenEsDeLaInsignia(null, E)).toBe(false);
  });

  it("la dirección pública cuelga del almacén de insignias, o es null si no se sabe el origen o la ruta no sirve", () => {
    expect(urlDeImagenDeInsignia("https://abc.supabase.co", RUTA)).toBe(`https://abc.supabase.co/storage/v1/object/public/${BUCKET_DE_INSIGNIAS}/${RUTA}`);
    expect(urlDeImagenDeInsignia(undefined, RUTA)).toBeNull();
    expect(urlDeImagenDeInsignia("https://abc.supabase.co", "insignias/../x.webp")).toBeNull();
  });
});

describe("qué se dibuja de una insignia: imagen propia, luego el dibujo elegido, luego el del nombre", () => {
  const RUTA = rutaDeImagenDeInsignia(E, A);

  it("la imagen propia manda sobre el dibujo elegido y sobre el nombre", () => {
    expect(dibujoResuelto({ nombre: "Halloween", icono: "gato", imagen: RUTA })).toEqual({ tipo: "imagen", ruta: RUTA, silueta: false });
    expect(dibujoResuelto({ nombre: "Halloween", imagen: RUTA, silueta: true })).toEqual({ tipo: "imagen", ruta: RUTA, silueta: true });
    // Una silueta sin imagen válida no dibuja nada propio: cae al dibujo.
    expect(dibujoResuelto({ nombre: "Halloween", silueta: true })).toEqual({ tipo: "dibujo", clave: "halloween" });
  });

  it("sin imagen válida, el dibujo elegido; sin dibujo elegido, el del nombre", () => {
    expect(dibujoResuelto({ nombre: "Halloween", icono: "gato", imagen: "insignias/../x.webp" })).toEqual({ tipo: "dibujo", clave: "gato" });
    expect(dibujoResuelto({ nombre: "Halloween", imagen: null })).toEqual({ tipo: "dibujo", clave: "halloween" });
    expect(dibujoResuelto({ nombre: "Algo sin familia" })).toEqual({ tipo: "dibujo", clave: "generico" });
  });
});
