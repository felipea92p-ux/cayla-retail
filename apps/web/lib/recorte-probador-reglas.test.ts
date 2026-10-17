import { describe, expect, it } from "vitest";
import {
  ALFA_SOLIDA,
  ALTO_MAX_RECORTE,
  cajaVisible,
  cifrasRecortes,
  conRecorte,
  errorDeRecorte,
  leerRecortes,
  limpiarAlfa,
  motivoDelRecorte,
  paraDeshacerElDescarte,
  porRecortar,
  porRevisar,
  recorteDeRespuesta,
  rutaDelRecorte,
  tamanoDelRecorte,
  textoDelMotivo,
  tieneFondoTransparente,
} from "./recorte-probador-reglas";

const BASE = "https://x.supabase.co/storage/v1/object/public/retail-productos-fotos/";

/** Una imagen de `ancho × alto`: `f(x, y)` devuelve [r, g, b, a] de cada píxel. */
function imagen(ancho: number, alto: number, f: (x: number, y: number) => [number, number, number, number]) {
  const rgba = new Uint8ClampedArray(ancho * alto * 4);
  for (let y = 0; y < alto; y++) for (let x = 0; x < ancho; x++) rgba.set(f(x, y), (y * ancho + x) * 4);
  return rgba;
}
const alfaEn = (rgba: Uint8ClampedArray, ancho: number, x: number, y: number) => rgba[(y * ancho + x) * 4 + 3];

describe("tieneFondoTransparente: ¿la IA entregó el fondo transparente?", () => {
  it("una prenda sobre fondo transparente sí", () => {
    expect(tieneFondoTransparente(imagen(10, 10, (x) => (x < 3 ? [0, 0, 0, 0] : [200, 200, 200, 255])))).toBe(true);
  });
  it("un JPG o un PNG sin transparencia, no: queda «sin recorte»", () => {
    expect(tieneFondoTransparente(imagen(10, 10, () => [255, 255, 255, 255]))).toBe(false);
  });
  it("un par de píxeles sueltos no bastan (el ruido de un PNG con fondo)", () => {
    const rgba = imagen(100, 100, () => [255, 255, 255, 255]);
    rgba[3] = 0;
    rgba[7] = 0;
    expect(tieneFondoTransparente(rgba)).toBe(false);
  });
  it("una imagen vacía, no", () => {
    expect(tieneFondoTransparente(new Uint8ClampedArray(0))).toBe(false);
  });
});

describe("limpiarAlfa: lo que entrega la IA, sin manchas", () => {
  // 40×40: la prenda ocupa x 10..29, y 10..29. Afuera, fondo transparente.
  const ANCHO = 40;
  const prenda = (x: number, y: number) => x >= 10 && x < 30 && y >= 10 && y < 30;

  it("la neblina casi invisible del fondo pasa a transparente del todo", () => {
    const rgba = imagen(ANCHO, ANCHO, (x, y) => (prenda(x, y) ? [250, 250, 250, 255] : [255, 255, 255, 2]));
    limpiarAlfa(rgba, ANCHO, ANCHO);
    expect(alfaEn(rgba, ANCHO, 2, 2)).toBe(0);
    expect(alfaEn(rgba, ANCHO, 35, 20)).toBe(0);
  });

  it("la tela casi opaca (253) queda opaca del todo; no queda lavada", () => {
    const rgba = imagen(ANCHO, ANCHO, (x, y) => (prenda(x, y) ? [250, 250, 250, 253] : [0, 0, 0, 0]));
    limpiarAlfa(rgba, ANCHO, ANCHO);
    expect(alfaEn(rgba, ANCHO, 20, 20)).toBe(255);
  });

  it("el borde suave en medio se respeta", () => {
    const rgba = imagen(ANCHO, ANCHO, (x, y) => (prenda(x, y) ? (x === 10 ? [250, 250, 250, 120] : [250, 250, 250, 255]) : [0, 0, 0, 0]));
    limpiarAlfa(rgba, ANCHO, ANCHO);
    expect(alfaEn(rgba, ANCHO, 10, 20)).toBe(120);
    expect(120).toBeLessThan(ALFA_SOLIDA);
  });

  it("una mota suelta lejos de la prenda se borra", () => {
    const rgba = imagen(ANCHO, ANCHO, (x, y) => (prenda(x, y) ? [250, 250, 250, 255] : x === 36 && y === 3 ? [255, 255, 255, 200] : [0, 0, 0, 0]));
    limpiarAlfa(rgba, ANCHO, ANCHO);
    expect(alfaEn(rgba, ANCHO, 36, 3)).toBe(0);
    expect(alfaEn(rgba, ANCHO, 20, 20)).toBe(255);
  });

  it("un conjunto de dos piezas separadas se conserva entero", () => {
    const dos = (x: number, y: number) => (x >= 2 && x < 18 && y >= 10 && y < 30) || (x >= 22 && x < 38 && y >= 10 && y < 30);
    const rgba = imagen(ANCHO, ANCHO, (x, y) => (dos(x, y) ? [20, 20, 20, 255] : [0, 0, 0, 0]));
    limpiarAlfa(rgba, ANCHO, ANCHO);
    expect(alfaEn(rgba, ANCHO, 10, 20)).toBe(255);
    expect(alfaEn(rgba, ANCHO, 30, 20)).toBe(255);
  });

  it("no cambia el color de nadie y deja el hueco de diseño (un ojal) como está", () => {
    // Un ojal: alfa 255 con el color de la tela de atrás, en medio de la prenda.
    const rgba = imagen(ANCHO, ANCHO, (x, y) => (prenda(x, y) ? [245, 244, 240, 253] : [0, 0, 0, 0]));
    const antes = Array.from(rgba).filter((_, i) => i % 4 !== 3);
    limpiarAlfa(rgba, ANCHO, ANCHO);
    expect(Array.from(rgba).filter((_, i) => i % 4 !== 3)).toEqual(antes);
    expect(alfaEn(rgba, ANCHO, 20, 15)).toBe(255);
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
    expect(motivoDelRecorte(0)).toBeNull();
    expect(motivoDelRecorte(null)).toBeNull();
  });
  it("un hueco cerrado en medio de la tela pide revisión", () => {
    expect(motivoDelRecorte(0.02)).toBe("huecos");
  });
  it("cada motivo se dice en palabras de la tienda, también los de antes del ADR-0442", () => {
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

describe("paraDeshacerElDescarte: el recorte vuelve tal como estaba", () => {
  const url = "https://abc.supabase.co/storage/v1/object/public/retail-productos-fotos/recortes/f1-a1b2c3.png";

  it("uno por revisar vuelve a por revisar; uno listo, a listo", () => {
    expect(paraDeshacerElDescarte("fotos/f1.jpg", { url, proporcion: 0.62, estado: "por_revisar", motivo: "huecos" })).toEqual({ p_foto: "fotos/f1.jpg", p_estado: "por_revisar" });
    expect(paraDeshacerElDescarte("fotos/f1.jpg", { url, proporcion: 0.62, estado: "listo", motivo: null })).toEqual({ p_foto: "fotos/f1.jpg", p_estado: "listo" });
  });

  it("uno que ya estaba descartado no tiene nada que deshacer", () => {
    expect(paraDeshacerElDescarte("fotos/f1.jpg", { url, proporcion: 1, estado: "descartado", motivo: null })).toBeNull();
  });

  it("si alguien ya decidió, el error se lee en palabras de la pantalla", () => {
    expect(errorDeRecorte("ERROR: recorte_ya_cambio")).toMatch(/alguien ya decidió/);
  });
});
