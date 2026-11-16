import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  avisoDelAyudante,
  ayudanteImprimeBoletas,
  COMANDO_INSTALAR,
  documentoDeBoleta,
  documentoParaAyudante,
  estadoDelAyudante,
  HOLGURA_MM,
  LARGO_MAX_MM,
  LARGO_MIN_MM,
  largoDeLaBoleta,
  PREFIJO_DOCUMENTO,
  resultadoDeBoleta,
  resultadoDeImpresion,
  URL_AYUDANTE,
  VERSION_CON_BOLETAS,
} from "./mac-etiquetas";

const SERVIDOR = readFileSync(join(__dirname, "../public/mac-etiquetas/servidor.sh"), "utf8");
const INSTALAR = readFileSync(join(__dirname, "../public/mac-etiquetas/instalar.sh"), "utf8");

describe("documentoParaAyudante", () => {
  const doc = documentoParaAyudante({
    estilos: ['<link rel="stylesheet" href="/_next/static/css/a.css">', "<style>.x{color:red}</style>", '<script src="/malo.js"></script>'],
    base: "https://cayla-retail.vercel.app/",
    clases: "__variable_a __variable_b",
    hoja: '<div id="etiquetas-precio-print" data-modo="girada"><div class="etq-hoja">…</div></div>',
  });

  it("empieza EXACTO con el prefijo que el ayudante exige (si no, contesta 400)", () => {
    expect(doc.startsWith(PREFIJO_DOCUMENTO)).toBe(true);
    // El mismo prefijo, con su largo, vive en servidor.sh: `head -c 27` y `tail -c +28`.
    expect(SERVIDOR).toContain(`PREFIJO='${PREFIJO_DOCUMENTO}'`);
    expect(PREFIJO_DOCUMENTO.length).toBe(27);
    expect(SERVIDOR).toContain('head -c 27 "$TMP/recibido.html"');
    expect(SERVIDOR).toContain('tail -c +28 "$TMP/recibido.html"');
  });

  it("lleva la base de la app, las hojas de estilo y las clases de las fuentes en el body", () => {
    expect(doc).toContain('<base href="https://cayla-retail.vercel.app/">');
    expect(doc).toContain('href="/_next/static/css/a.css"');
    expect(doc).toContain("<style>.x{color:red}</style>");
    expect(doc).toContain('<body class="__variable_a __variable_b">');
    expect(doc).toContain('data-modo="girada"');
    expect(doc.endsWith("</body></html>")).toBe(true);
  });

  it("no copia scripts de la pantalla", () => {
    expect(doc).not.toMatch(/<script/i);
  });

  it("escapa comillas en los atributos", () => {
    const raro = documentoParaAyudante({ estilos: [], base: 'https://a"b/', clases: 'x" onload="y', hoja: "" });
    expect(raro).toContain('<base href="https://a&quot;b/">');
    expect(raro).toContain('class="x&quot; onload=&quot;y"');
  });
});

describe("estadoDelAyudante", () => {
  it("sin respuesta o con basura: no está instalado", () => {
    expect(estadoDelAyudante(null)).toBe("sin-ayudante");
    expect(estadoDelAyudante("hola")).toBe("sin-ayudante");
    expect(estadoDelAyudante({ ok: false })).toBe("sin-ayudante");
  });
  it("lee lo que le falta a la Mac", () => {
    expect(estadoDelAyudante({ ok: true, chrome: true, impresora: true })).toBe("listo");
    expect(estadoDelAyudante({ ok: true, chrome: false, impresora: true })).toBe("sin-chrome");
    expect(estadoDelAyudante({ ok: true, chrome: true, impresora: false })).toBe("sin-impresora");
  });
  it("solo «listo» y «comprobando» callan; el resto dice qué hacer", () => {
    expect(avisoDelAyudante("listo")).toBeNull();
    expect(avisoDelAyudante("comprobando")).toBeNull();
    for (const e of ["sin-ayudante", "sin-impresora", "sin-chrome"] as const) expect(avisoDelAyudante(e)?.titulo).toBeTruthy();
  });
  it("lo que se ve es una línea que dice que SÍ se puede imprimir, sin jerga (Formidable 2026-10-09)", () => {
    for (const e of ["sin-ayudante", "sin-impresora", "sin-chrome"] as const) {
      const r = avisoDelAyudante(e)!.resumen;
      expect(r).toMatch(/^Puedes imprimir igual\./);
      expect(r).not.toMatch(/Terminal|curl|instalar\.sh|red local/);
      expect(r.length).toBeLessThanOrEqual(110);
    }
  });
});

describe("resultadoDeImpresion", () => {
  it("éxito con la cantidad", () => {
    expect(resultadoDeImpresion(200, { ok: true, trabajo: "Brother_QL-13" }, 1)).toEqual({ ok: true, texto: "Etiqueta enviada a la Brother" });
    expect(resultadoDeImpresion(200, { ok: true }, 5)).toEqual({ ok: true, texto: "5 etiquetas enviadas a la Brother" });
  });
  it("los rótulos hablan de rótulos", () => {
    expect(resultadoDeImpresion(200, { ok: true }, 1, "rotulo")).toEqual({ ok: true, texto: "Rótulo enviado a la Brother" });
    expect(resultadoDeImpresion(200, { ok: true }, 3, "rotulo")).toEqual({ ok: true, texto: "3 rótulos enviados a la Brother" });
    expect(resultadoDeImpresion(500, { ok: false, error: "x" }, 3, "rotulo")).toMatchObject({ texto: "Los rótulos no se imprimieron" });
  });
  it("sin conexión con el ayudante", () => {
    expect(resultadoDeImpresion(null, null, 3).ok).toBe(false);
  });
  it("repite el motivo del ayudante", () => {
    const r = resultadoDeImpresion(500, { ok: false, error: "la Mac no tiene la Brother agregada" }, 1);
    expect(r).toMatchObject({ ok: false, detalle: "El ayudante dijo: la Mac no tiene la Brother agregada." });
  });
});

describe("el ayudante y la web dicen lo mismo", () => {
  it("puerto, dominio y origen permitido", () => {
    const puerto = new URL(URL_AYUDANTE).port;
    expect(INSTALAR).toContain(`PUERTO=${puerto}`);
    expect(COMANDO_INSTALAR).toContain("https://cayla-retail.vercel.app/mac-etiquetas/instalar.sh");
    expect(SERVIDOR).toContain("https://cayla-retail.vercel.app");
    // El ERP también vive en su dominio propio: sin él, el ayudante no le contesta y todo sale por el cuadro.
    expect(SERVIDOR).toContain("https://retail.cayla.pe");
  });
  it("la medida que manda a la Brother es la del corte (ADR-0180)", () => {
    expect(SERVIDOR).toContain("Custom.62x40.1mm");
  });
  it("la versión que imprime boletas y los topes del largo", () => {
    expect(SERVIDOR).toContain(`VERSION=${VERSION_CON_BOLETAS}`);
    expect(SERVIDOR).toContain(`-lt ${LARGO_MIN_MM} ]`);
    expect(SERVIDOR).toContain(`-gt ${LARGO_MAX_MM} ]`);
    expect(SERVIDOR).toContain('MEDIA="Custom.80x${LARGO_TICKET}mm"');
  });
});

describe("ayudanteImprimeBoletas", () => {
  it("solo con la versión 3, Chrome y la ticketera", () => {
    expect(ayudanteImprimeBoletas({ ok: true, version: 3, chrome: true, impresora: false, ticketera: true })).toBe(true);
    expect(ayudanteImprimeBoletas({ ok: true, version: 4, chrome: true, ticketera: true })).toBe(true);
  });
  it("un ayudante viejo, sin ticketera, sin Chrome o sin respuesta sigue con el cuadro", () => {
    expect(ayudanteImprimeBoletas({ ok: true, version: 2, chrome: true, impresora: true })).toBe(false);
    expect(ayudanteImprimeBoletas({ ok: true, chrome: true, impresora: true })).toBe(false);
    expect(ayudanteImprimeBoletas({ ok: true, version: 3, chrome: true, ticketera: false })).toBe(false);
    expect(ayudanteImprimeBoletas({ ok: true, version: 3, chrome: false, ticketera: true })).toBe(false);
    expect(ayudanteImprimeBoletas({ ok: false, version: 3, ticketera: true })).toBe(false);
    expect(ayudanteImprimeBoletas(null)).toBe(false);
    expect(ayudanteImprimeBoletas("ok")).toBe(false);
  });
});

describe("largoDeLaBoleta", () => {
  it("pasa los píxeles a milímetros, redondea hacia arriba y suma la holgura", () => {
    // 96 px = 25,4 mm → 26 + holgura
    expect(largoDeLaBoleta(96)).toBe(26 + HOLGURA_MM < LARGO_MIN_MM ? LARGO_MIN_MM : 26 + HOLGURA_MM);
    // 567 px ≈ 150,0 mm
    expect(largoDeLaBoleta(567)).toBe(151 + HOLGURA_MM);
  });
  it("nunca menos ni más de lo que acepta el ayudante", () => {
    expect(largoDeLaBoleta(10)).toBe(LARGO_MIN_MM);
    expect(largoDeLaBoleta(0)).toBe(LARGO_MIN_MM);
    expect(largoDeLaBoleta(Number.NaN)).toBe(LARGO_MIN_MM);
    expect(largoDeLaBoleta(1_000_000)).toBe(LARGO_MAX_MM);
  });
});

describe("documentoDeBoleta", () => {
  it("lleva la página exacta y empieza con el prefijo que exige el ayudante", () => {
    const doc = documentoDeBoleta({ estilos: ["<style>a{}</style>"], base: "https://x/", clases: "c", boleta: '<div id="comprobante-print">B</div>', largo: 154 });
    expect(doc.startsWith(PREFIJO_DOCUMENTO)).toBe(true);
    expect(doc).toContain("@page{size:80mm 154mm;margin:0}");
    expect(doc).toContain('<div id="comprobante-print">B</div>');
  });
});

describe("resultadoDeBoleta", () => {
  it("calla si salió y explica si no", () => {
    expect(resultadoDeBoleta(200, { ok: true })).toBeNull();
    expect(resultadoDeBoleta(null, null)?.detalle).toMatch(/Recarga/);
    expect(resultadoDeBoleta(500, { ok: false, error: "la Mac no tiene la ticketera agregada" })?.detalle).toBe("El ayudante dijo: la Mac no tiene la ticketera agregada.");
    expect(resultadoDeBoleta(400, {})?.detalle).toBe("El ayudante dijo: respuesta 400.");
  });
});
