import { describe, expect, it } from "vitest";
import {
  ajustarRangoEnvio,
  contarFiltros,
  diaDeEnvio,
  estadoDeFila,
  fechaDeEnvioParaTabla,
  filtrarFilas,
  periodoDeRangoEnvio,
  proveedoresDeFila,
  proveedoresDeLaLista,
  rangoDePeriodoEnvio,
  SIN_FILTROS,
  textoFechasEnvio,
} from "./recepcion-envio-filtros";
import type { FilaPorRecibir } from "./recepcion-envio-busqueda";
import type { EnvioPorAbrir, OrdenDirecta } from "./recepcion-envio-reglas";

const HOY = "2026-10-27";
const base: EnvioPorAbrir = {
  id: "e1",
  numero: "ENV-000251",
  numeroGuia: null,
  estado: "en_camino",
  despachadoEn: "2026-10-20T15:00:00+00:00",
  unidades: 10,
  lineas: 1,
  ordenes: [],
  proveedores: ["Textiles Andina"],
  creadoPorMi: false,
};
const envio = (id: string, o: Partial<EnvioPorAbrir> = {}): FilaPorRecibir => ({ tipo: "envio", envio: { ...base, id, ...o } });
const orden = (ordenId: string, o: Partial<OrdenDirecta> = {}): FilaPorRecibir => ({
  tipo: "orden",
  orden: { ordenId, numero: "OC-001311", proveedor: "Confecciones del Sur", unidadesPorEnviar: 6, creadaPorMi: false, ...o },
});
const ids = (filas: FilaPorRecibir[]) => filas.map((f) => (f.tipo === "envio" ? f.envio.id : f.orden.ordenId));

const filas = [
  envio("abierto", { estado: "abierto", despachadoEn: "2026-10-03T15:00:00+00:00" }),
  envio("camino", { despachadoEn: "2026-10-20T15:00:00+00:00" }),
  envio("camino-multi", { despachadoEn: "2026-10-26T15:00:00+00:00", proveedores: ["Textiles Andina", "Hilos del Norte"] }),
  envio("mio", { creadoPorMi: true, proveedores: ["Hilos del Norte"] }),
  orden("directa"),
  orden("directa-mia", { creadaPorMi: true }),
];

describe("estado de una fila", () => {
  it("abierto, en camino, sin guía y «no los puedo recibir yo» (lo de quien hizo la orden, sea envío u orden)", () => {
    expect(filas.map(estadoDeFila)).toEqual(["abierto", "en_camino", "en_camino", "ajeno", "sin_guia", "ajeno"]);
  });
});

describe("filtrar la tabla", () => {
  it("sin filtros deja pasar todo", () => {
    expect(ids(filtrarFilas(filas, SIN_FILTROS))).toEqual(ids(filas));
    expect(contarFiltros(SIN_FILTROS)).toBe(0);
  });

  it("estado: basta uno de los marcados", () => {
    expect(ids(filtrarFilas(filas, { ...SIN_FILTROS, estados: ["en_camino"] }))).toEqual(["camino", "camino-multi"]);
    expect(ids(filtrarFilas(filas, { ...SIN_FILTROS, estados: ["abierto", "sin_guia"] }))).toEqual(["abierto", "directa"]);
    expect(ids(filtrarFilas(filas, { ...SIN_FILTROS, estados: ["ajeno"] }))).toEqual(["mio", "directa-mia"]);
  });

  it("proveedor: un envío con varios proveedores sale con cualquiera de ellos; la orden sin guía, con el suyo", () => {
    expect(ids(filtrarFilas(filas, { ...SIN_FILTROS, proveedor: "Hilos del Norte" }))).toEqual(["camino-multi", "mio"]);
    expect(ids(filtrarFilas(filas, { ...SIN_FILTROS, proveedor: "Confecciones del Sur" }))).toEqual(["directa", "directa-mia"]);
  });

  it("proveedor: un envío que llegó sin aviso se halla por el proveedor que se le puso al abrirlo", () => {
    const sinAviso = envio("sin-aviso", { proveedores: [] });
    const de = (id: string) => (id === "sin-aviso" ? "Entel Perú" : null);
    expect(ids(filtrarFilas([sinAviso, ...filas], { ...SIN_FILTROS, proveedor: "Entel Perú" }, de))).toEqual(["sin-aviso"]);
    expect(proveedoresDeFila(sinAviso, "Entel Perú")).toEqual(["Entel Perú"]);
  });

  it("fecha: por el día de Lima en que salió el envío, con los dos extremos incluidos; la orden sin guía no tiene fecha y no entra", () => {
    expect(ids(filtrarFilas(filas, { ...SIN_FILTROS, desde: "2026-10-20", hasta: "2026-10-26" }))).toEqual(["camino", "camino-multi", "mio"]);
    expect(ids(filtrarFilas(filas, { ...SIN_FILTROS, hasta: "2026-10-10" }))).toEqual(["abierto"]);
    expect(ids(filtrarFilas(filas, { ...SIN_FILTROS, desde: "2026-10-26" }))).toEqual(["camino-multi"]);
  });

  it("fecha: un envío de las 20:00 de Lima del día 13 cuenta como del 13, no del 14 que ya vive UTC", () => {
    const tarde = [envio("tarde", { despachadoEn: "2026-10-14T01:00:00+00:00" })];
    expect(ids(filtrarFilas(tarde, { ...SIN_FILTROS, desde: "2026-10-13", hasta: "2026-10-13" }))).toEqual(["tarde"]);
    expect(ids(filtrarFilas(tarde, { ...SIN_FILTROS, desde: "2026-10-14" }))).toEqual([]);
  });

  it("fecha: un envío sin fecha no cae en ningún rango", () => {
    expect(ids(filtrarFilas([envio("sin", { despachadoEn: null })], { ...SIN_FILTROS, desde: "2020-01-01" }))).toEqual([]);
  });

  it("los filtros se suman: tienen que cumplirse todos", () => {
    const f = { estados: ["en_camino" as const], proveedor: "Hilos del Norte", desde: "2026-10-25", hasta: "" };
    expect(ids(filtrarFilas(filas, f))).toEqual(["camino-multi"]);
    expect(contarFiltros(f)).toBe(3);
    expect(contarFiltros({ ...SIN_FILTROS, desde: "2026-10-01", hasta: "2026-10-31" })).toBe(1);
  });
});

describe("las opciones del proveedor", () => {
  it("sin repetir, alfabéticas sin importar tildes ni mayúsculas, con el proveedor de lo que llegó sin aviso", () => {
    const sinAviso = envio("sa", { proveedores: [] });
    const lista = proveedoresDeLaLista([...filas, sinAviso, orden("o2", { proveedor: "áncora SAC" })], (id) => (id === "sa" ? "Entel Perú" : null));
    expect(lista).toEqual(["áncora SAC", "Confecciones del Sur", "Entel Perú", "Hilos del Norte", "Textiles Andina"]);
  });
});

describe("la fecha de envío", () => {
  it("es el día de Lima del instante; una orden sin guía no tiene", () => {
    expect(diaDeEnvio(envio("x", { despachadoEn: "2026-10-14T01:00:00+00:00" }))).toBe("2026-10-13");
    expect(diaDeEnvio(orden("o"))).toBeNull();
  });

  it("la celda dice dd/mm este año y dd/mm/aaaa otro año, con la hora de Lima", () => {
    expect(fechaDeEnvioParaTabla("2026-10-14T01:00:00+00:00", HOY)).toEqual({ dia: "13/10", hora: "20:00", completa: "13/10/2026 a las 20:00" });
    expect(fechaDeEnvioParaTabla("2025-12-30T15:30:00+00:00", HOY)).toEqual({ dia: "30/12/2025", hora: "10:30", completa: "30/12/2025 a las 10:30" });
    expect(fechaDeEnvioParaTabla(null, HOY)).toBeNull();
    expect(fechaDeEnvioParaTabla("no es una fecha", HOY)).toBeNull();
  });

  it("los períodos de un toque y cómo se reconocen", () => {
    expect(rangoDePeriodoEnvio("hoy", HOY)).toEqual({ desde: HOY, hasta: HOY });
    expect(rangoDePeriodoEnvio("ayer", HOY)).toEqual({ desde: "2026-10-26", hasta: "2026-10-26" });
    expect(rangoDePeriodoEnvio("7-dias", HOY)).toEqual({ desde: "2026-10-20", hasta: HOY });
    expect(rangoDePeriodoEnvio("30-dias", HOY)).toEqual({ desde: "2026-09-27", hasta: HOY });
    expect(rangoDePeriodoEnvio("mas-de-7", HOY)).toEqual({ desde: "", hasta: "2026-10-19" });
    for (const clave of ["hoy", "ayer", "7-dias", "30-dias", "mas-de-7"] as const) {
      const r = rangoDePeriodoEnvio(clave, HOY);
      expect(periodoDeRangoEnvio(r.desde, r.hasta, HOY)).toBe(clave);
    }
    expect(periodoDeRangoEnvio("2026-10-01", "2026-10-05", HOY)).toBeNull();
    expect(periodoDeRangoEnvio("", "", HOY)).toBeNull();
  });

  it("«hace más de una semana» deja fuera al envío de hace exactamente 7 días y deja pasar el de hace 8", () => {
    const r = rangoDePeriodoEnvio("mas-de-7", HOY);
    const de = (dia: string) => [envio("x", { despachadoEn: `${dia}T15:00:00+00:00` })];
    expect(ids(filtrarFilas(de("2026-10-20"), { ...SIN_FILTROS, ...r }))).toEqual([]);
    expect(ids(filtrarFilas(de("2026-10-19"), { ...SIN_FILTROS, ...r }))).toEqual(["x"]);
  });

  it("«Ayer» deja solo los envíos del día anterior (en hora de Lima)", () => {
    const r = rangoDePeriodoEnvio("ayer", HOY);
    const de = (id: string, instante: string) => envio(id, { despachadoEn: instante });
    // 02:00Z del 27 son las 21:00 del 26 en Lima: es de ayer; 05:30Z del 27 son las 00:30 del 27: es de hoy.
    const lista = [de("ayer", "2026-10-27T02:00:00+00:00"), de("hoy", "2026-10-27T05:30:00+00:00"), de("anteayer", "2026-10-25T20:00:00+00:00")];
    expect(ids(filtrarFilas(lista, { ...SIN_FILTROS, ...r }))).toEqual(["ayer"]);
  });

  it("el texto de la píldora: el período por su nombre o el rango", () => {
    expect(textoFechasEnvio("2026-10-26", "2026-10-26", HOY)).toBe("Ayer");
    expect(textoFechasEnvio("2026-10-20", HOY, HOY)).toBe("Últimos 7 días");
    expect(textoFechasEnvio("", "2026-10-19", HOY)).toBe("Hace más de una semana");
    expect(textoFechasEnvio("2026-10-01", "2026-10-05", HOY)).toBe("01/10 – 05/10");
    expect(textoFechasEnvio("2026-10-01", "", HOY)).toBe("Desde 01/10");
    expect(textoFechasEnvio("", "2025-12-31", HOY)).toBe("Hasta 31/12/2025");
  });

  it("un rango a mano nunca queda invertido: el otro extremo acompaña al que se tocó", () => {
    expect(ajustarRangoEnvio("2026-10-10", "2026-10-05", "desde")).toEqual({ desde: "2026-10-10", hasta: "2026-10-10" });
    expect(ajustarRangoEnvio("2026-10-10", "2026-10-05", "hasta")).toEqual({ desde: "2026-10-05", hasta: "2026-10-05" });
    expect(ajustarRangoEnvio("2026-10-01", "", "desde")).toEqual({ desde: "2026-10-01", hasta: "" });
  });
});
