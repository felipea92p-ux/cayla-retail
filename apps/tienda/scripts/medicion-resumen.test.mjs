import { describe, expect, it } from "vitest";
import * as lib from "../lib/medicion.ts";
import {
  decisionListaAFicha,
  estado,
  ETIQUETA,
  FICHA,
  formatear,
  leerEnvios,
  LISTAS,
  MINIMO_PARA_DECIDIR,
  percentil,
  resumir,
  SIN_LLEGAR_MS,
  UMBRALES,
  unicos,
} from "./medicion-resumen.mjs";

const T = 1_760_700_000_000;
const envio = (id, t, m, conexion = "4g") => ({ t, envio: id, conexion, ancho: 390, m });
const lcp = (id, v, r = "/catalogo") => ({ n: "LCP", v, r, id, suave: false });
const toque = (respuesta, desde = "/catalogo", hacia = FICHA) => ({ n: "toque", desde, hacia, respuesta, pagina: respuesta + 600, esqueleto: true, repetido: false });

describe("el lector y la tienda hablan de lo mismo", () => {
  it("la etiqueta, las métricas y las páginas son las de lib/medicion.ts", () => {
    expect(ETIQUETA).toBe(lib.ETIQUETA);
    expect(SIN_LLEGAR_MS).toBe(lib.ESPERA_MAXIMA_DEL_TOQUE_MS);
    for (const metrica of lib.METRICAS_DE_ENTRADA) expect(UMBRALES[metrica]).toHaveLength(2);
    for (const ruta of [...LISTAS, FICHA]) expect(lib.RUTAS_MEDIDAS).toContain(ruta);
  });

  it("lee la línea que escribe la ruta", () => {
    const linea = lib.lineaDeRegistro(lib.leerEnvio({ envio: "0a1b2c3d", conexion: "3g", ancho: 412, m: [lcp("v5-1", 2100)] }), T);
    expect(leerEnvios(linea)).toEqual([{ t: T, envio: "0a1b2c3d", conexion: "3g", ancho: 410, m: [lcp("v5-1", 2100)] }]);
  });
});

describe("leer un registro", () => {
  const linea = `${ETIQUETA} ${JSON.stringify(envio("aaaaaaaa", T, [lcp("v5-1", 2000)]))}`;

  it("el de `next start`, con otras líneas en el medio", () => {
    const texto = ["▲ Next.js 16.4.1", linea, "GET /catalogo 200 in 31ms", ""].join("\n");
    expect(leerEnvios(texto).map((e) => e.envio)).toEqual(["aaaaaaaa"]);
  });

  it("el de `vercel logs --json`, con el mensaje dentro de data y el resumen al final", () => {
    const texto = [
      JSON.stringify({ type: "log", data: { level: "info", message: linea, requestPath: "/api/medicion" } }),
      JSON.stringify({ type: "log", data: { level: "info", message: "otra cosa" } }),
      JSON.stringify({ type: "summary", recordsReturned: 2, pagination: { hasMore: false } }),
    ].join("\n");
    expect(leerEnvios(texto).map((e) => e.envio)).toEqual(["aaaaaaaa"]);
  });

  it("salta una línea cortada", () => {
    expect(leerEnvios(`${linea.slice(0, 40)}\n${linea}`)).toHaveLength(1);
  });
});

describe("contar una sola vez", () => {
  it("un envío bajado dos veces cuenta uno; una métrica mandada dos veces se queda con la última", () => {
    const primero = envio("aaaaaaaa", T, [{ n: "CLS", v: 0.05, r: "/inicio", id: "v5-9", suave: false }]);
    const despues = envio("bbbbbbbb", T + 60_000, [{ n: "CLS", v: 0.3, r: "/inicio", id: "v5-9", suave: false }]);
    const { envios, entradas } = unicos([primero, primero, despues]);
    expect(envios).toBe(2);
    expect(entradas.map((e) => e.v)).toEqual([0.3]);
  });
});

describe("el percentil y la vara", () => {
  it("p75 por rango más cercano", () => {
    expect(percentil([], 0.75)).toBeNull();
    expect(percentil([400, 100, 300, 200], 0.75)).toBe(300);
    expect(percentil([5], 0.75)).toBe(5);
  });

  it("bueno, mejorable y malo, con los bordes del lado bueno", () => {
    expect(estado("LCP", 2500)).toBe("bueno");
    expect(estado("LCP", 2501)).toBe("mejorable");
    expect(estado("LCP", 4001)).toBe("malo");
    expect(estado("CLS", 0.1)).toBe("bueno");
    expect(estado("respuesta", 201)).toBe("mejorable");
    expect(estado("respuesta", null)).toBe("—");
  });
});

describe("¿hace falta el esqueleto inmediato de la lista a la ficha?", () => {
  const muchos = (respuesta) => Array.from({ length: MINIMO_PARA_DECIDIR }, () => ({ ...toque(respuesta), conexion: "4g" }));

  it("con pocos toques no decide", () => {
    expect(decisionListaAFicha(muchos(900).slice(1)).veredicto).toMatch(/^Faltan toques/);
  });

  it("decide por el p75 de la respuesta", () => {
    expect(decisionListaAFicha(muchos(150)).veredicto).toMatch(/^No hace falta/);
    expect(decisionListaAFicha(muchos(350)).veredicto).toMatch(/^Conviene/);
    expect(decisionListaAFicha(muchos(800)).veredicto).toMatch(/^Hace falta/);
  });

  it("solo cuenta los toques de una lista a una ficha", () => {
    const otros = [{ ...toque(900, "/catalogo/[id]"), conexion: "4g" }, { ...toque(900, "/catalogo", "/bolsa"), conexion: "4g" }];
    expect(decisionListaAFicha([...otros, { ...toque(100, "/inicio"), conexion: "3g" }])).toMatchObject({ n: 1, p75: 100, porConexion: [{ conexion: "3g", n: 1, p75: 100 }] });
  });

  it("dice cuántas veces la persona volvió a tocar porque no vio nada", () => {
    const toques = [{ ...toque(700), repetido: true, conexion: "4g" }, { ...toque(120), conexion: "4g" }];
    expect(decisionListaAFicha(toques).repetidos).toBe(50);
  });
});

describe("el resumen", () => {
  const envios = [
    envio("aaaaaaaa", T, [lcp("v5-1", 1800), toque(120)]),
    envio("bbbbbbbb", T + 1000, [lcp("v5-2", 3000), toque(640)]),
    envio("cccccccc", T - 10 * 24 * 60 * 60 * 1000, [lcp("v5-3", 9000)]),
  ];

  it("deja fuera lo que es de antes del período", () => {
    const r = resumir(envios, T - 24 * 60 * 60 * 1000);
    expect(r.envios).toBe(2);
    expect(r.entradas).toEqual([{ ruta: "/catalogo", metrica: "LCP", suave: false, n: 2, p75: 3000, estado: "mejorable" }]);
    expect(r.toques).toMatchObject([{ desde: "/catalogo", hacia: FICHA, n: 2, respuesta: 640, estadoRespuesta: "malo", conEsqueleto: 100, sinLlegar: 0 }]);
  });

  it("cuenta los toques cuya página no llegó (anotados con 20 s)", () => {
    const r = resumir([envio("dddddddd", T, [{ ...toque(150), pagina: SIN_LLEGAR_MS }, toque(150)])]);
    expect(r.toques).toMatchObject([{ n: 2, sinLlegar: 1, pagina: SIN_LLEGAR_MS }]);
  });

  it("se lee en la terminal", () => {
    const texto = formatear(resumir(envios, T - 24 * 60 * 60 * 1000));
    expect(texto).toContain("/catalogo → /catalogo/[id]");
    expect(texto).toContain("Faltan toques: 2 de 30");
    expect(formatear(resumir([], 0))).toContain("No hay mediciones");
  });
});
