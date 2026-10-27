import { describe, expect, it } from "vitest";
import {
  avisosDeEnvio,
  codigosPorCompra,
  coincideEnvio,
  cuandoSalio,
  detalleDeEnvio,
  diasDeLaRonda,
  diasSinAbrir,
  enlaceDeWhatsapp,
  enviosDeLaRonda,
  leerEnvioSalido,
  leerMisEnvios,
  lineaDeTiempo,
  mensajeParaLaTienda,
  notaDeEnvio,
  prendasQueFaltaron,
  resumenDelEnvioSalido,
  resumenDeEnvios,
  rondasConEnvios,
  textoDeRondaDelEnvio,
  type EnvioMio,
} from "./mis-envios-reglas";

const HOY = "2026-10-26";

function envio(p: Partial<EnvioMio> = {}): EnvioMio {
  return {
    id: "e1",
    numero: "ENV-000118",
    estado: "en_camino",
    destinoId: "t1",
    destino: "Tienda Trujillo",
    fardos: 1,
    // 09:48 en Lima = 14:48 UTC
    salioEn: "2026-10-26T14:48:00+00:00",
    abiertoEn: null,
    cerradoEn: null,
    cerradoPor: null,
    anuladoEn: null,
    motivoAnulacion: null,
    prendas: 10,
    contadas: 0,
    rondaId: "r2",
    ronda: "RC-000612",
    rondaAbiertaEn: "2026-10-26T13:30:00+00:00",
    rondaCerradaEn: null,
    papelIds: ["p1"],
    lineas: [{ nombre: "Casaca Corta", cantidad: 10 }],
    ...p,
  };
}

describe("leerMisEnvios", () => {
  it("lee un envío completo", () => {
    const [e] = leerMisEnvios([
      {
        id: "e1",
        numero: "ENV-000118",
        estado: "cerrado",
        destino_id: "t1",
        destino: "Tienda Lima",
        bultos: 2,
        despachado_en: "2026-10-24T21:20:00+00:00",
        cerrado_en: "2026-10-25T15:05:00+00:00",
        cerrado_por: "Rosa Pérez",
        unidades: 24,
        contadas: 22,
        ronda_id: "r1",
        ronda: "RC-000611",
        ronda_cerrada_en: "2026-10-24T23:00:00+00:00",
        papel_ids: ["p9"],
        lineas: [{ nombre: "Jean Recto", cantidad: 14 }],
      },
    ]);
    expect(e).toMatchObject({ numero: "ENV-000118", estado: "cerrado", fardos: 2, prendas: 24, contadas: 22, ronda: "RC-000611", cerradoPor: "Rosa Pérez", papelIds: ["p9"] });
    expect(e.lineas).toEqual([{ nombre: "Jean Recto", cantidad: 14 }]);
  });
  it("descarta lo ilegible y no se cae con basura", () => {
    expect(leerMisEnvios(null)).toEqual([]);
    expect(leerMisEnvios({})).toEqual([]);
    expect(leerMisEnvios([null, 3, { id: "x" }, { id: "x", numero: "ENV-1", estado: "raro", despachado_en: "2026-10-26T10:00:00Z" }])).toEqual([]);
  });
  it("sin fardos dice 1 y sin tienda dice «la tienda»", () => {
    const [e] = leerMisEnvios([{ id: "e", numero: "ENV-000001", estado: "en_camino", despachado_en: "2026-10-26T10:00:00Z", bultos: null }]);
    expect(e.fardos).toBe(1);
    expect(e.destino).toBe("la tienda");
    expect(e.lineas).toEqual([]);
  });
});

describe("leerEnvioSalido", () => {
  it("lee lo que devuelve Mandar a la tienda", () => {
    expect(leerEnvioSalido({ despacho_id: "x", numero: "ENV-000118", sede: "Tienda Lima", unidades: 6, bultos: 2, avisos: [] })).toEqual({
      numero: "ENV-000118",
      destino: "Tienda Lima",
      prendas: 6,
      fardos: 2,
    });
  });
  it("lo que dice bajo el código", () => {
    expect(resumenDelEnvioSalido({ prendas: 8, fardos: 1 })).toBe("8 prendas · 1 fardo");
    expect(resumenDelEnvioSalido({ prendas: 1, fardos: 2 })).toBe("1 prenda · 2 fardos");
  });
  it("sin código no hay envío que mostrar", () => {
    expect(leerEnvioSalido(null)).toBeNull();
    expect(leerEnvioSalido({ sede: "Tienda Lima" })).toBeNull();
    expect(leerEnvioSalido({ numero: "ENV-000001" })).toEqual({ numero: "ENV-000001", destino: "la tienda", prendas: 0, fardos: 1 });
  });
});

describe("cómo quedó un envío", () => {
  it("las prendas que faltaron solo se cuentan ya recibido", () => {
    expect(prendasQueFaltaron(envio({ estado: "cerrado", prendas: 12, contadas: 10 }))).toBe(2);
    expect(prendasQueFaltaron(envio({ estado: "cerrado", prendas: 12, contadas: 12 }))).toBe(0);
    expect(prendasQueFaltaron(envio({ estado: "cerrado", prendas: 12, contadas: 14 }))).toBe(0);
    expect(prendasQueFaltaron(envio({ estado: "abierto", prendas: 12, contadas: 5 }))).toBe(0);
  });
  it("avisa los días sin abrir solo en camino y pasado el plazo", () => {
    expect(diasSinAbrir(envio({ salioEn: "2026-10-26T14:48:00+00:00" }), HOY)).toBeNull();
    expect(diasSinAbrir(envio({ salioEn: "2026-10-25T14:48:00+00:00" }), HOY)).toBeNull();
    expect(diasSinAbrir(envio({ salioEn: "2026-10-24T14:48:00+00:00" }), HOY)).toBe(2);
    expect(diasSinAbrir(envio({ salioEn: "2026-10-17T14:48:00+00:00" }), HOY)).toBe(9);
    expect(diasSinAbrir(envio({ estado: "abierto", salioEn: "2026-10-17T14:48:00+00:00" }), HOY)).toBeNull();
    expect(diasSinAbrir(envio({ estado: "cerrado", salioEn: "2026-10-17T14:48:00+00:00" }), HOY)).toBeNull();
  });
  it("dice cuándo salió en hora de Lima", () => {
    expect(cuandoSalio(envio(), HOY)).toBe("Hoy 09:48");
    expect(cuandoSalio(envio({ salioEn: "2026-10-25T21:20:00+00:00" }), HOY)).toBe("Ayer 16:20");
    expect(cuandoSalio(envio({ salioEn: "2026-10-24T21:20:00+00:00" }), HOY)).toBe("24/10 16:20");
    // 01:00 UTC del 27 es 20:00 del 26 en Lima: sigue siendo «hoy».
    expect(cuandoSalio(envio({ salioEn: "2026-10-27T01:00:00+00:00" }), HOY)).toBe("Hoy 20:00");
  });
  it("el detalle de la fila", () => {
    expect(detalleDeEnvio(envio({ prendas: 1 }), HOY)).toBe("Hoy 09:48 · 1 prenda · 1 fardo");
    expect(detalleDeEnvio(envio({ fardos: 2 }), HOY, true)).toBe("Hoy 09:48 · 10 prendas · 2 fardos · RC-000612");
  });
  it("la nota de la fila: lo que faltó o los días", () => {
    expect(notaDeEnvio(envio({ estado: "cerrado", prendas: 12, contadas: 10 }), HOY)).toBe("faltaron 2");
    expect(notaDeEnvio(envio({ salioEn: "2026-10-17T14:48:00+00:00" }), HOY)).toBe("hace 9 días");
    expect(notaDeEnvio(envio(), HOY)).toBeNull();
  });
  it("la línea de tiempo según el estado", () => {
    expect(lineaDeTiempo(envio(), HOY).map((p) => p.estado)).toEqual(["hecho", "ahora", "falta"]);
    expect(lineaDeTiempo(envio({ estado: "abierto" }), HOY)[1].texto).toBe("La tienda lo está contando");
    const recibido = lineaDeTiempo(envio({ estado: "cerrado", cerradoEn: "2026-10-25T15:05:00+00:00", cerradoPor: "Rosa" }), HOY);
    expect(recibido.map((p) => p.estado)).toEqual(["hecho", "hecho", "hecho"]);
    expect(recibido[2].texto).toBe("Recibido · Ayer 10:05 por Rosa");
    expect(lineaDeTiempo(envio({ estado: "anulado", motivoAnulacion: "Era otra tienda" }), HOY)[1].texto).toBe("Se anuló: Era otra tienda");
  });
  it("los avisos: días sin abrir y prendas que faltaron", () => {
    expect(avisosDeEnvio(envio(), HOY)).toEqual([]);
    const a = avisosDeEnvio(envio({ salioEn: "2026-10-17T14:48:00+00:00" }), HOY);
    expect(a).toHaveLength(1);
    expect(a[0].titulo).toBe("Salió hace 9 días y la tienda no lo abrió");
    expect(a[0].texto).toContain("ENV-000118");
    const b = avisosDeEnvio(envio({ estado: "cerrado", prendas: 12, contadas: 10 }), HOY);
    expect(b[0]).toEqual({ titulo: "La tienda contó 10 de 12", texto: "Faltaron 2: Compras lo revisa con el proveedor." });
  });
  it("de qué ronda es", () => {
    expect(textoDeRondaDelEnvio(envio())).toBe("RC-000612 · abierta");
    expect(textoDeRondaDelEnvio(envio({ rondaCerradaEn: "2026-10-26T20:00:00Z" }))).toBe("RC-000612 · cerrada");
    expect(textoDeRondaDelEnvio(envio({ ronda: null, rondaId: null }))).toBe("Antes de las rondas");
  });
});

describe("compartir el código", () => {
  it("arma el mensaje y el enlace de WhatsApp", () => {
    const m = mensajeParaLaTienda(envio({ fardos: 2 }));
    expect(m).toBe("Hola, te mandé el envío ENV-000118 a Tienda Trujillo: 10 prendas en 2 fardos. Búscalo en Recibir con ese código.");
    const url = enlaceDeWhatsapp(m);
    expect(url.startsWith("https://wa.me/?text=")).toBe(true);
    expect(decodeURIComponent(url.split("text=")[1])).toBe(m);
  });
});

describe("buscar y filtrar", () => {
  const e = envio();
  it("un número suelto encuentra el código, y también la tienda y la ronda, sin tildes ni mayúsculas", () => {
    expect(coincideEnvio(e, "todos", "118")).toBe(true);
    expect(coincideEnvio(e, "todos", "env-000118")).toBe(true);
    expect(coincideEnvio(e, "todos", "TRUJILLO")).toBe(true);
    expect(coincideEnvio(e, "todos", "rc-000612")).toBe(true);
    expect(coincideEnvio(e, "todos", "119")).toBe(false);
    expect(coincideEnvio(envio({ destino: "Tienda Áncash" }), "todos", "ancash")).toBe(true);
    expect(coincideEnvio(e, "todos", "   ")).toBe(true);
  });
  it("los filtros de estado", () => {
    expect(coincideEnvio(envio({ estado: "en_camino" }), "sin_recibir", "")).toBe(true);
    expect(coincideEnvio(envio({ estado: "abierto" }), "sin_recibir", "")).toBe(true);
    expect(coincideEnvio(envio({ estado: "cerrado" }), "sin_recibir", "")).toBe(false);
    expect(coincideEnvio(envio({ estado: "cerrado" }), "recibidos", "")).toBe(true);
    expect(coincideEnvio(envio({ estado: "anulado" }), "recibidos", "")).toBe(false);
    expect(coincideEnvio(envio({ estado: "anulado" }), "todos", "")).toBe(true);
  });
});

describe("el resumen de una ronda", () => {
  it("sin envíos", () => {
    expect(resumenDeEnvios([], HOY)).toEqual({ texto: "Sin envíos", chip: null });
    expect(resumenDeEnvios([envio({ estado: "anulado" })], HOY).chip).toBeNull();
  });
  it("todo recibido, con diferencias y sin recibir (ámbar si hay uno atrasado)", () => {
    const ok = envio({ estado: "cerrado", prendas: 8, contadas: 8 });
    expect(resumenDeEnvios([ok], HOY)).toEqual({ texto: "1 envío · 8 prendas", chip: { texto: "Todo recibido", tono: "verde" } });
    const dif = envio({ id: "e2", estado: "cerrado", prendas: 12, contadas: 10 });
    expect(resumenDeEnvios([ok, dif], HOY)).toEqual({ texto: "2 envíos · 20 prendas", chip: { texto: "1 con diferencias", tono: "ambar" } });
    const camino = envio({ id: "e3" });
    expect(resumenDeEnvios([ok, dif, camino], HOY).chip).toEqual({ texto: "1 sin recibir", tono: "pizarra" });
    const atrasado = envio({ id: "e4", salioEn: "2026-10-17T14:48:00+00:00" });
    expect(resumenDeEnvios([ok, atrasado], HOY).chip).toEqual({ texto: "1 sin recibir", tono: "ambar" });
  });
  it("los anulados no cuentan", () => {
    expect(resumenDeEnvios([envio({ estado: "cerrado", prendas: 4, contadas: 4 }), envio({ id: "x", estado: "anulado", prendas: 99 })], HOY).texto).toBe("1 envío · 4 prendas");
  });
});

describe("por ronda", () => {
  const abierta = envio({ id: "a", rondaId: "r3", ronda: "RC-000613" });
  const r2a = envio({ id: "b", rondaId: "r2", ronda: "RC-000612", rondaCerradaEn: "2026-10-24T23:00:00+00:00", salioEn: "2026-10-24T14:00:00+00:00" });
  const r2b = envio({ id: "c", rondaId: "r2", ronda: "RC-000612", rondaCerradaEn: "2026-10-24T23:00:00+00:00", salioEn: "2026-10-24T20:00:00+00:00" });
  const r1 = envio({ id: "d", rondaId: "r1", ronda: "RC-000611", rondaCerradaEn: "2026-10-19T23:00:00+00:00", salioEn: "2026-10-19T20:00:00+00:00" });
  const viejo = envio({ id: "f", rondaId: null, ronda: null, rondaAbiertaEn: null, rondaCerradaEn: null, salioEn: "2026-09-01T20:00:00+00:00" });
  const todos = [abierta, r2a, r2b, r1, viejo];
  it("los de la ronda abierta", () => {
    expect(enviosDeLaRonda(todos, "r3").map((e) => e.id)).toEqual(["a"]);
    expect(enviosDeLaRonda(todos, null)).toEqual([]);
  });
  it("las anteriores, la más nueva primero, y los de antes de las rondas al final", () => {
    const g = rondasConEnvios(todos, "r3");
    expect(g.map((x) => x.texto)).toEqual(["RC-000612", "RC-000611", "Antes de las rondas"]);
    expect(g[0].envios.map((e) => e.id)).toEqual(["c", "b"]);
  });
  it("sin ronda abierta, todos son anteriores", () => {
    expect(rondasConEnvios([abierta], null).map((x) => x.texto)).toEqual(["RC-000613"]);
  });
  it("los días de la ronda", () => {
    expect(diasDeLaRonda("2026-10-22T14:00:00+00:00", "2026-10-24T23:00:00+00:00")).toBe("22/10 al 24/10");
    expect(diasDeLaRonda("2026-10-22T14:00:00+00:00", "2026-10-22T23:00:00+00:00")).toBe("22/10");
    expect(diasDeLaRonda(null, null)).toBe("");
  });
});

describe("los códigos de cada compra", () => {
  it("junta los envíos de una compra y no cuenta los anulados", () => {
    const m = codigosPorCompra([
      envio({ numero: "ENV-000119", papelIds: ["p1", "p2"] }),
      envio({ id: "e2", numero: "ENV-000118", papelIds: ["p1"] }),
      envio({ id: "e3", numero: "ENV-000120", estado: "anulado", papelIds: ["p1"] }),
    ]);
    expect(m.get("p1")).toEqual(["ENV-000118", "ENV-000119"]);
    expect(m.get("p2")).toEqual(["ENV-000119"]);
  });
});
