import { describe, it, expect } from "vitest";
import {
  leerUrlMuestra,
  medidasReducidas,
  objecionMuestraElegida,
  ordenarPrendas,
  prefijoMuestra,
  rutaMuestra,
  textoPrendas,
  type PrendaDeMuestra,
} from "./muestra-atributo-reglas";

const BASE = "https://vovjyyiafkxteijimpuy.supabase.co";
const URL_TEJIDO = `${BASE}/storage/v1/object/public/retail-colores-muestras/tejidos/3f2a-9b.jpg`;

describe("leerUrlMuestra — solo se guarda una foto subida desde la pantalla", () => {
  it("acepta la URL del bucket en la carpeta de su tipo", () => {
    expect(leerUrlMuestra(URL_TEJIDO, "tejido", BASE)).toEqual({ valor: URL_TEJIDO });
  });

  it("quitar la foto es mandar null o vacío", () => {
    expect(leerUrlMuestra(null, "tejido", BASE)).toEqual({ valor: null });
    expect(leerUrlMuestra("", "patron", BASE)).toEqual({ valor: null });
  });

  it("rechaza la foto de un tejido guardada como patrón (otra carpeta)", () => {
    expect(leerUrlMuestra(URL_TEJIDO, "patron", BASE)).toHaveProperty("error");
  });

  it("rechaza una imagen de otro sitio", () => {
    expect(leerUrlMuestra("https://example.com/tela.jpg", "tejido", BASE)).toHaveProperty("error");
  });

  it("rechaza subcarpetas o «..» dentro de la carpeta", () => {
    expect(leerUrlMuestra(`${prefijoMuestra("tejido", BASE)}../patrones/x.jpg`, "tejido", BASE)).toHaveProperty("error");
    expect(leerUrlMuestra(`${prefijoMuestra("tejido", BASE)}otra/x.jpg`, "tejido", BASE)).toHaveProperty("error");
  });

  it("sin Supabase configurado no acepta ninguna foto, pero sí quitarla", () => {
    expect(leerUrlMuestra(URL_TEJIDO, "tejido", undefined)).toHaveProperty("error");
    expect(leerUrlMuestra(null, "tejido", undefined)).toEqual({ valor: null });
  });

  it("un número u objeto no es una URL", () => {
    expect(leerUrlMuestra(42, "tejido", BASE)).toHaveProperty("error");
  });

  it("la barra final de la base no cambia nada", () => {
    expect(leerUrlMuestra(URL_TEJIDO, "tejido", `${BASE}/`)).toEqual({ valor: URL_TEJIDO });
  });

  it("lo que produce rutaMuestra siempre pasa el candado", () => {
    const url = `${BASE}/storage/v1/object/public/retail-colores-muestras/${rutaMuestra("patron", crypto.randomUUID())}`;
    expect(leerUrlMuestra(url, "patron", BASE)).toEqual({ valor: url });
  });
});

describe("objecionMuestraElegida", () => {
  it("acepta la foto del celular, incluida la HEIC del iPhone", () => {
    expect(objecionMuestraElegida({ type: "image/jpeg", size: 8_000_000 })).toBeNull();
    expect(objecionMuestraElegida({ type: "image/heic", size: 3_000_000 })).toBeNull();
  });

  it("rechaza un PDF, un archivo vacío y uno de más de 25 MB", () => {
    expect(objecionMuestraElegida({ type: "application/pdf", size: 10 })).toMatch(/JPG/);
    expect(objecionMuestraElegida({ type: "image/png", size: 0 })).toMatch(/vacío/);
    expect(objecionMuestraElegida({ type: "image/png", size: 26 * 1024 * 1024 })).toMatch(/25 MB/);
  });
});

describe("medidasReducidas", () => {
  it("baja el lado largo a 1600 y conserva la proporción", () => {
    expect(medidasReducidas(4032, 3024)).toEqual({ ancho: 1600, alto: 1200 });
    expect(medidasReducidas(3024, 4032)).toEqual({ ancho: 1200, alto: 1600 });
  });

  it("nunca agranda una foto chica", () => {
    expect(medidasReducidas(800, 600)).toEqual({ ancho: 800, alto: 600 });
  });
});

describe("textoPrendas", () => {
  it.each([
    [0, "Ninguna prenda"],
    [1, "1 prenda"],
    [12, "12 prendas"],
  ])("%i → %s", (n, texto) => expect(textoPrendas(n)).toBe(texto));
});

describe("ordenarPrendas", () => {
  const p = (referencia: string, activa: boolean): PrendaDeMuestra => ({ id: referencia, referencia, codigo: null, categoria: null, activa, fotoUrl: null });

  it("las activas primero, y por nombre dentro de cada grupo", () => {
    const orden = ordenarPrendas([p("Vestido Luna", false), p("Blusa Aurora", true), p("Abrigo Sol", false), p("Casaca Río", true)]);
    expect(orden.map((x) => x.referencia)).toEqual(["Blusa Aurora", "Casaca Río", "Abrigo Sol", "Vestido Luna"]);
  });
});
