import { describe, expect, it } from "vitest";
import { encuadrar, LIENZO_FOTO, MARGEN_PRENDA } from "./foto-encuadre";
import {
  ALTO_MAX_RECORTE,
  aplicarAlfa,
  cajaVisible,
  cifrasRecortes,
  conRecorte,
  destinoDeLaMascara,
  errorDeRecorte,
  esFondoBlanco,
  leerRecortes,
  motivoDelRecorte,
  porRecortar,
  porRevisar,
  recorteDeRespuesta,
  rutaDelRecorte,
  tamanoDelRecorte,
  textoDelMotivo,
} from "./recorte-probador-reglas";

const BASE = "https://x.supabase.co/storage/v1/object/public/retail-productos-fotos/";

describe("destinoDeLaMascara: la prenda cae donde quedó al subir la foto", () => {
  const original = { ancho: 2000, alto: 2400 };
  const caja = { x: 400, y: 300, ancho: 1000, alto: 1500 };

  it("sin fondo: la caja de la prenda llega justo al encuadre con margen", () => {
    const d = destinoDeLaMascara(original, caja, true);
    const esperado = encuadrar(caja, LIENZO_FOTO, MARGEN_PRENDA);
    const escala = d.ancho / original.ancho;
    expect(d.x + caja.x * escala).toBeCloseTo(esperado.x, 6);
    expect(d.y + caja.y * escala).toBeCloseTo(esperado.y, 6);
    expect(caja.ancho * escala).toBeCloseTo(esperado.ancho, 6);
    expect(caja.alto * escala).toBeCloseTo(esperado.alto, 6);
    // La máscara entera es más grande que el lienzo: lo de afuera no se ve.
    expect(d.x).toBeLessThan(0);
    expect(d.ancho).toBeGreaterThan(LIENZO_FOTO.ancho);
  });

  it("con fondo: el original entero, encuadrado sin margen", () => {
    expect(destinoDeLaMascara(original, caja, false)).toEqual(encuadrar(original, LIENZO_FOTO, 0));
    expect(destinoDeLaMascara(original, caja, false)).toEqual({ x: 0, y: 30, ancho: 1200, alto: 1440 });
  });
});

/** Una foto de `n` píxeles: los primeros `fondo` son fondo (alfa 0) del tono `tono`; el resto, prenda negra (alfa 255). */
function foto(n: number, fondo: number, tono: number) {
  const rgba = new Uint8ClampedArray(n * 4);
  const alfa = new Uint8ClampedArray(n);
  for (let i = 0; i < n; i++) {
    const esFondo = i < fondo;
    rgba.set(esFondo ? [tono, tono, tono, 255] : [0, 0, 0, 255], i * 4);
    alfa[i] = esFondo ? 0 : 255;
  }
  return { rgba, alfa };
}

describe("esFondoBlanco: se subió «Sin fondo» o «Con fondo»", () => {
  it("el blanco puro de una foto sin fondo (con el ruido del JPEG)", () => {
    const { rgba, alfa } = foto(100, 60, 253);
    expect(esFondoBlanco(rgba, alfa)).toBe(true);
  });

  it("una pared clara no es el blanco del lienzo", () => {
    const { rgba, alfa } = foto(100, 60, 232);
    expect(esFondoBlanco(rgba, alfa)).toBe(false);
  });

  it("unos pocos píxeles oscuros en el fondo no cambian la respuesta, muchos sí", () => {
    const { rgba, alfa } = foto(100, 100, 255);
    rgba.set([10, 10, 10, 255], 0);
    expect(esFondoBlanco(rgba, alfa)).toBe(true);
    for (let i = 0; i < 10; i++) rgba.set([10, 10, 10, 255], i * 4);
    expect(esFondoBlanco(rgba, alfa)).toBe(false);
  });

  it("sin nada de fondo no se puede decir", () => {
    const { rgba, alfa } = foto(10, 0, 255);
    expect(esFondoBlanco(rgba, alfa)).toBe(false);
  });
});

describe("aplicarAlfa: la transparencia, sin el halo blanco del borde", () => {
  it("despeja el color de la prenda en un borde mezclado con blanco", () => {
    // Un borde negro con alfa 128, pintado sobre blanco: (128/255)·0 + (1 − 128/255)·255 = 127.
    const rgba = new Uint8ClampedArray([127, 127, 127, 255]);
    aplicarAlfa(rgba, [128], true);
    expect(Array.from(rgba)).toEqual([0, 0, 0, 128]);
  });

  it("no toca la tela entera ni el fondo; solo les pone su alfa", () => {
    const rgba = new Uint8ClampedArray([40, 60, 80, 255, 255, 255, 255, 255]);
    aplicarAlfa(rgba, [255, 0], true);
    expect(Array.from(rgba)).toEqual([40, 60, 80, 255, 255, 255, 255, 0]);
  });

  it("con su fondo (no era blanco) solo pone el alfa", () => {
    const rgba = new Uint8ClampedArray([128, 128, 128, 255]);
    aplicarAlfa(rgba, [128], false);
    expect(Array.from(rgba)).toEqual([128, 128, 128, 128]);
  });
});

describe("el tamaño y la caja del PNG", () => {
  it("la caja de lo visible deja afuera el aire transparente", () => {
    // 4×3, visible solo el píxel (2,1).
    const rgba = new Uint8ClampedArray(4 * 3 * 4);
    rgba[(1 * 4 + 2) * 4 + 3] = 255;
    expect(cajaVisible(rgba, 4, 3)).toEqual({ x: 2, y: 1, ancho: 1, alto: 1 });
    expect(cajaVisible(new Uint8ClampedArray(16), 2, 2)).toBeNull();
  });

  it("se achica a 1000 px de alto y nunca se agranda", () => {
    expect(tamanoDelRecorte({ ancho: 840, alto: 1260 })).toEqual({ ancho: 667, alto: ALTO_MAX_RECORTE });
    expect(tamanoDelRecorte({ ancho: 300, alto: 400 })).toEqual({ ancho: 300, alto: 400 });
  });
});

describe("motivoDelRecorte: lo dudoso se revisa antes de usarlo", () => {
  it("limpio: listo para el probador", () => {
    expect(motivoDelRecorte({ huecos: 0, fondoBlanco: true, conOriginal: true })).toBeNull();
  });
  it("un fondo que no es blanco pesa más que los huecos, y los huecos más que la falta del original", () => {
    expect(motivoDelRecorte({ huecos: 0.02, fondoBlanco: false, conOriginal: false })).toBe("con_fondo");
    expect(motivoDelRecorte({ huecos: 0.02, fondoBlanco: true, conOriginal: false })).toBe("huecos");
    expect(motivoDelRecorte({ huecos: 0.001, fondoBlanco: true, conOriginal: false })).toBe("sin_original");
  });
  it("cada motivo se dice en palabras de la tienda", () => {
    for (const m of ["huecos", "con_fondo", "sin_original"] as const) expect(textoDelMotivo(m)).toBeTruthy();
    expect(textoDelMotivo(null)).toBeNull();
  });
});

describe("rutaDelRecorte: el mismo id de la foto, en recortes/, con el sello de la subida", () => {
  it("fotos/<id>.jpg → recortes/<id>-<sello>.png", () => {
    expect(rutaDelRecorte("fotos/0a717a54-38c1.jpg", "9f2c41aa")).toBe("recortes/0a717a54-38c1-9f2c41aa.png");
  });
  it("dos subidas de la misma foto no chocan (el almacén no deja pisar)", () => {
    expect(rutaDelRecorte("fotos/abc.jpg", "1")).not.toBe(rutaDelRecorte("fotos/abc.jpg", "2"));
  });
  it("una foto de antes del ADR-0228, en la raíz del bucket", () => {
    expect(rutaDelRecorte("3b8e7e1e-ChatGPT_Image.png", "s")).toBe("recortes/3b8e7e1e-ChatGPT_Image-s.png");
  });
});

describe("leerRecortes y sus cuentas", () => {
  const data = {
    fotos: [
      { foto: "fotos/a.jpg", url: `${BASE}fotos/a.jpg`, original: `${BASE}originales/a.jpg`, producto_id: "p1", codigo: "TOP-0001", nombre: "Top Uno", color: "NEG", color_nombre: "Negro", vendidas: 7, recorte: null },
      { foto: "fotos/b.jpg", url: `${BASE}fotos/b.jpg`, original: null, producto_id: "p1", codigo: "TOP-0001", nombre: "Top Uno", color: null, color_nombre: null, vendidas: 7, recorte: { url: `${BASE}recortes/b.png`, proporcion: 0.8, estado: "por_revisar", motivo: "huecos" } },
      { foto: "fotos/c.jpg", url: `${BASE}fotos/c.jpg`, original: null, producto_id: "p2", codigo: null, nombre: "Falda Dos", color: null, color_nombre: null, vendidas: "x", recorte: { url: `${BASE}recortes/c.png`, proporcion: "0.5", estado: "listo", motivo: null } },
      { foto: "fotos/d.jpg", url: `${BASE}fotos/d.jpg`, original: null, producto_id: "p3", nombre: "Polo Tres", recorte: { url: `${BASE}recortes/d.png`, proporcion: 1, estado: "descartado", motivo: "otro" } },
      { foto: "", url: "x", producto_id: "p4", nombre: "Mal" },
      "basura",
    ],
  };
  const fotos = leerRecortes(data);

  it("salta lo mal formado sin tumbar la pantalla", () => {
    expect(fotos.map((f) => f.foto)).toEqual(["fotos/a.jpg", "fotos/b.jpg", "fotos/c.jpg", "fotos/d.jpg"]);
    expect(leerRecortes(null)).toEqual([]);
    expect(leerRecortes({ fotos: "no" })).toEqual([]);
  });

  it("lee el recorte y deja afuera un motivo que no existe", () => {
    expect(fotos[1].recorte).toEqual({ url: `${BASE}recortes/b.png`, proporcion: 0.8, estado: "por_revisar", motivo: "huecos" });
    expect(fotos[2].recorte?.proporcion).toBe(0.5);
    expect(fotos[2].vendidas).toBe(0);
    expect(fotos[3].recorte?.motivo).toBeNull();
  });

  it("cuenta cada estado y dice qué falta recortar y revisar", () => {
    expect(cifrasRecortes(fotos)).toEqual({ fotos: 4, listos: 1, porRevisar: 1, descartados: 1, sinRecorte: 1 });
    expect(porRecortar(fotos).map((f) => f.foto)).toEqual(["fotos/a.jpg"]);
    expect(porRevisar(fotos).map((f) => f.foto)).toEqual(["fotos/b.jpg"]);
  });

  it("pone el recorte nuevo en su foto sin tocar las demás", () => {
    const r = { url: `${BASE}recortes/a.png`, proporcion: 0.7, estado: "listo" as const, motivo: null };
    const nuevas = conRecorte(fotos, "fotos/a.jpg", r);
    expect(nuevas[0].recorte).toEqual(r);
    expect(nuevas[1]).toBe(fotos[1]);
  });

  it("arma la URL del recorte desde la de su foto", () => {
    expect(recorteDeRespuesta({ recorte: "recortes/a.png", proporcion: 0.7, estado: "listo", motivo: null }, `${BASE}fotos/a.jpg`)).toEqual({
      url: `${BASE}recortes/a.png`,
      proporcion: 0.7,
      estado: "listo",
      motivo: null,
    });
    expect(recorteDeRespuesta({ recorte: "recortes/a.png", proporcion: 0.7, estado: "listo" }, "https://otro.sitio/a.jpg")).toBeNull();
    expect(recorteDeRespuesta(null, `${BASE}fotos/a.jpg`)).toBeNull();
  });
});

describe("errorDeRecorte", () => {
  it("traduce los errores de la base y deja pasar los demás", () => {
    expect(errorDeRecorte("recorte_sin_permiso")).toMatch(/Vitrina/);
    expect(errorDeRecorte("ERROR: recorte_archivo_no_existe")).toMatch(/almacén/);
    expect(errorDeRecorte("recorte_no_existe")).toMatch(/todavía no tiene recorte/);
    expect(errorDeRecorte("otra cosa")).toBeNull();
  });
});
