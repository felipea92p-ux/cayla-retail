import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { avisoDelAyudante, COMANDO_INSTALAR, documentoParaAyudante, estadoDelAyudante, PREFIJO_DOCUMENTO, resultadoDeImpresion, URL_AYUDANTE } from "./mac-etiquetas";

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
  });
  it("la medida que manda a la Brother es la del corte (ADR-0180)", () => {
    expect(SERVIDOR).toContain("Custom.62x40.1mm");
  });
});
