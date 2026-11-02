import { describe, expect, it } from "vitest";
import {
  alternarOpcion,
  anchoDeMontos,
  contarOpciones,
  diasEntre,
  fechaDiaMes,
  fechaRelativa,
  filtrarFilas,
  fraseDeLoQueVes,
  hayFiltrosPuestos,
  ordenarFilas,
  partesDeFiltros,
  pasaFiltros,
  sumaDe,
  textosDeOrden,
  tituloSinResultados,
  unirConO,
  type ColumnaDatos,
  type PiezaFrase,
} from "./tabla-viva-reglas";

// Las órdenes de la maqueta (docs/maquetas/tabla-superpoderes-2026-10/), con datos inventados.
type Orden = { oc: number; prov: string; est: "En camino" | "Llegó" | "A medias" | "Borrador"; llega: string; total: number | null };
const ORDENES: Orden[] = [
  { oc: 142, prov: "Hilados del Sur", est: "En camino", llega: "2026-11-04", total: 4280 },
  { oc: 141, prov: "Botones Lumbre", est: "Llegó", llega: "2026-10-29", total: 980 },
  { oc: 140, prov: "Telas Mistral", est: "En camino", llega: "2026-11-02", total: 3854 },
  { oc: 139, prov: "Ávíos Quillay", est: "A medias", llega: "2026-10-30", total: 1641 },
  { oc: 138, prov: "Telas Mistral", est: "En camino", llega: "2026-11-06", total: 5266 },
  { oc: 137, prov: "Telas Mistral", est: "Borrador", llega: "2026-11-15", total: null },
];
const COLS: ColumnaDatos<Orden>[] = [
  { clave: "oc", titulo: "Orden", tipo: "numero", valor: (o) => o.oc },
  { clave: "prov", titulo: "Proveedor", tipo: "texto", valor: (o) => o.prov, frase: (v) => `de ${unirConO(v)}` },
  { clave: "est", titulo: "Estado", tipo: "opcion", valor: (o) => o.est, frase: (v) => unirConO(v.map((x) => x.toLowerCase())) },
  { clave: "llega", titulo: "Llega", tipo: "fecha", valor: (o) => o.llega },
  {
    clave: "total",
    titulo: "Total",
    tipo: "monto",
    valor: (o) => o.total,
    opcion: (o) => (o.total === null ? null : o.total < 1000 ? "Menos de S/ 1,000" : o.total <= 3000 ? "De S/ 1,000 a S/ 3,000" : "Más de S/ 3,000"),
    ordenOpciones: ["Menos de S/ 1,000", "De S/ 1,000 a S/ 3,000", "Más de S/ 3,000"],
  },
];
const ORDEN_F = { uno: "orden", varios: "órdenes", genero: "f" } as const;
const plano = (p: PiezaFrase[]) => p.map((x) => x.texto).join("");

describe("filtrar por las opciones de una columna", () => {
  it("sin filtros pasan todas, y una columna sin opciones marcadas no filtra", () => {
    expect(filtrarFilas(ORDENES, COLS, {})).toHaveLength(6);
    expect(filtrarFilas(ORDENES, COLS, { prov: [] })).toHaveLength(6);
    expect(hayFiltrosPuestos({ prov: [] })).toBe(false);
  });
  it("dentro de una columna las opciones se suman (o); entre columnas se exigen todas (y)", () => {
    expect(filtrarFilas(ORDENES, COLS, { prov: ["Telas Mistral", "Botones Lumbre"] }).map((o) => o.oc)).toEqual([141, 140, 138, 137]);
    expect(filtrarFilas(ORDENES, COLS, { prov: ["Telas Mistral"], est: ["En camino"] }).map((o) => o.oc)).toEqual([140, 138]);
  });
  it("una fila sin opción en la columna (sin total) no pasa un filtro de esa columna", () => {
    expect(filtrarFilas(ORDENES, COLS, { total: ["Más de S/ 3,000"] }).map((o) => o.oc)).toEqual([142, 140, 138]);
    expect(pasaFiltros(ORDENES[5], COLS, { total: ["Más de S/ 3,000"] })).toBe(false);
  });
  it("alternar marca y desmarca sin tocar las demás columnas", () => {
    const a = alternarOpcion({ est: ["Llegó"] }, "prov", "Telas Mistral");
    expect(a).toEqual({ est: ["Llegó"], prov: ["Telas Mistral"] });
    expect(alternarOpcion(a, "prov", "Telas Mistral")).toEqual({ est: ["Llegó"], prov: [] });
  });
});

describe("contar las filas de cada opción", () => {
  it("cuenta con los OTROS filtros puestos, no con el de su columna: dice cuántas tendría si la marcas", () => {
    const prov = COLS[1];
    const conEstado = contarOpciones(ORDENES, prov, COLS, { est: ["En camino"], prov: ["Telas Mistral"] });
    expect(conEstado.find((o) => o.valor === "Telas Mistral")).toEqual({ valor: "Telas Mistral", n: 2, elegida: true });
    expect(conEstado.find((o) => o.valor === "Hilados del Sur")).toEqual({ valor: "Hilados del Sur", n: 1, elegida: false });
    // Botones Lumbre llegó: con «En camino» puesto deja 0, pero no desaparece (se ve apagada).
    expect(conEstado.find((o) => o.valor === "Botones Lumbre")?.n).toBe(0);
  });
  it("las opciones van en orden alfabético del español (la tilde no las manda al final), o en el orden que declara la columna", () => {
    expect(contarOpciones(ORDENES, COLS[1], COLS, {}).map((o) => o.valor)).toEqual(["Ávíos Quillay", "Botones Lumbre", "Hilados del Sur", "Telas Mistral"]);
    expect(contarOpciones(ORDENES, COLS[4], COLS, {}).map((o) => [o.valor, o.n])).toEqual([
      ["Menos de S/ 1,000", 1],
      ["De S/ 1,000 a S/ 3,000", 1],
      ["Más de S/ 3,000", 3],
    ]);
  });
  it("lo marcado nunca se esconde, aunque ya no exista en las filas", () => {
    expect(contarOpciones(ORDENES, COLS[2], COLS, { est: ["Anulada"] }).find((o) => o.valor === "Anulada")).toEqual({ valor: "Anulada", n: 0, elegida: true });
  });
});

describe("ordenar", () => {
  it("texto en español, sin que la tilde ni la mayúscula lo desordenen", () => {
    expect(ordenarFilas(ORDENES, COLS[1], "asc").map((o) => o.prov)).toEqual(["Ávíos Quillay", "Botones Lumbre", "Hilados del Sur", "Telas Mistral", "Telas Mistral", "Telas Mistral"]);
  });
  it("números de verdad (no como texto: 980 antes que 1641) y lo que no tiene dato al final, hacia donde se ordene", () => {
    expect(ordenarFilas(ORDENES, COLS[4], "asc").map((o) => o.total)).toEqual([980, 1641, 3854, 4280, 5266, null]);
    expect(ordenarFilas(ORDENES, COLS[4], "desc").map((o) => o.total)).toEqual([5266, 4280, 3854, 1641, 980, null]);
  });
  it("fechas ISO, y un empate conserva el orden en que llegaron (estable)", () => {
    expect(ordenarFilas(ORDENES, COLS[3], "asc").map((o) => o.oc)).toEqual([141, 139, 140, 142, 138, 137]);
    expect(ordenarFilas(ORDENES, COLS[1], "desc").map((o) => o.oc)).toEqual([140, 138, 137, 142, 141, 139]);
  });
  it("sin columna, una copia en el orden de llegada (nunca la misma lista: no se ordena en su lugar)", () => {
    const copia = ordenarFilas(ORDENES, undefined, "asc");
    expect(copia).toEqual(ORDENES);
    expect(copia).not.toBe(ORDENES);
  });
  it("cada tipo dice sus dos sentidos", () => {
    expect(textosDeOrden("texto")).toEqual({ asc: "A → Z", desc: "Z → A" });
    expect(textosDeOrden("monto").desc).toBe("Mayor primero");
    expect(textosDeOrden("fecha").asc).toBe("Más antigua primero");
  });
});

describe("la frase de lo que ves", () => {
  const frase = (filtros: Record<string, string[]>, extra: Partial<Parameters<typeof fraseDeLoQueVes>[0]> = {}) => {
    const vis = filtrarFilas(ORDENES, COLS, filtros);
    return fraseDeLoQueVes({ visibles: vis.length, total: ORDENES.length, sustantivo: ORDEN_F, partes: partesDeFiltros(COLS, filtros, vis.length), ...extra });
  };
  it("la de la maqueta: «Ves 2 de 14 órdenes: de Telas Mistral, en camino. Suman S/ 9,120.»", () => {
    const p = fraseDeLoQueVes({ visibles: 2, total: 14, sustantivo: ORDEN_F, partes: ["de Telas Mistral", "en camino"], suma: "S/ 9,120" });
    expect(plano(p)).toBe("Ves 2 de 14 órdenes: de Telas Mistral, en camino. Suman S/ 9,120.");
    expect(p.filter((x) => x.fuerte).map((x) => x.texto)).toEqual(["2 de 14 órdenes", "S/ 9,120"]);
  });
  it("las partes salen de los filtros, en el orden de las columnas", () => {
    expect(plano(frase({ est: ["En camino"], prov: ["Telas Mistral"] }))).toBe("Ves 2 de 6 órdenes: de Telas Mistral, en camino.");
    expect(plano(frase({ total: ["Más de S/ 3,000"] }))).toBe("Ves 3 de 6 órdenes: total: Más de S/ 3,000.");
  });
  it("sin filtros, todas; con una sola fila, en singular", () => {
    expect(plano(frase({}, { suma: "S/ 16,021" }))).toBe("Ves las 6 órdenes. Suman S/ 16,021.");
    expect(plano(fraseDeLoQueVes({ visibles: 1, total: 1, sustantivo: ORDEN_F, partes: [], suma: "S/ 980" }))).toBe("Ves 1 orden. Suma S/ 980.");
    expect(plano(fraseDeLoQueVes({ visibles: 14, total: 14, sustantivo: { uno: "modelo", varios: "modelos", genero: "m" }, partes: [], cola: "que entraron en los últimos 7 días" }))).toBe(
      "Ves los 14 modelos que entraron en los últimos 7 días.",
    );
  });
  it("cuando no queda nada: dice qué se pidió, sin sumar ni la cola (concordaría mal)", () => {
    const p = fraseDeLoQueVes({ visibles: 0, total: 6, sustantivo: ORDEN_F, partes: ["de Telas Mistral", "llegó"], suma: "S/ 0", cola: "que pediste" });
    expect(plano(p)).toBe("Ninguna orden de Telas Mistral, llegó.");
    expect(plano(fraseDeLoQueVes({ visibles: 0, total: 3, sustantivo: { uno: "modelo", varios: "modelos", genero: "m" }, partes: ["nuevo"] }))).toBe("Ningún modelo nuevo.");
  });
  it("con 0 filas las partes concuerdan en singular", () => {
    const col: ColumnaDatos<{ nuevo: boolean }> = { clave: "c", titulo: "Clase", tipo: "opcion", valor: (m) => (m.nuevo ? "Nuevo" : "Reingreso"), frase: (_v, n) => (n === 1 ? "nuevo" : "nuevos") };
    expect(partesDeFiltros([col], { c: ["Nuevo"] }, 0)).toEqual(["nuevo"]);
    expect(partesDeFiltros([col], { c: ["Nuevo"] }, 5)).toEqual(["nuevos"]);
  });
  it("«o» entre las opciones y el título del vacío según el género", () => {
    expect(unirConO(["Blusas"])).toBe("Blusas");
    expect(unirConO(["Blusas", "Casacas", "Jeans"])).toBe("Blusas, Casacas o Jeans");
    expect(tituloSinResultados(ORDEN_F)).toBe("Ninguna orden cumple con lo que pusiste");
    expect(tituloSinResultados({ uno: "modelo", varios: "modelos", genero: "m" })).toBe("Ningún modelo cumple con lo que pusiste");
  });
});

describe("el total de lo que ves", () => {
  it("suma solo lo que tiene dato", () => {
    expect(sumaDe(filtrarFilas(ORDENES, COLS, { prov: ["Telas Mistral"] }), (o) => o.total)).toBe(9120);
    expect(sumaDe([], (o: Orden) => o.total)).toBe(0);
  });
});

describe("la fecha que dice cuánto falta", () => {
  const HOY = "2026-10-31";
  it("días de calendario, con o sin hora, y a través de un cambio de mes", () => {
    expect(diasEntre("2026-11-04", HOY)).toBe(4);
    expect(diasEntre("2026-10-29T23:59:00-05:00", HOY)).toBe(-2);
    expect(diasEntre("2027-01-01", "2026-12-31")).toBe(1);
  });
  it("hoy, mañana, en N días, ayer, hace N días; lo que ya pasó lo dice", () => {
    expect(fechaRelativa(HOY, HOY)).toEqual({ texto: "hoy", pasada: false });
    expect(fechaRelativa("2026-11-01", HOY)).toEqual({ texto: "mañana", pasada: false });
    expect(fechaRelativa("2026-11-04", HOY)).toEqual({ texto: "en 4 días", pasada: false });
    expect(fechaRelativa("2026-10-30", HOY)).toEqual({ texto: "ayer", pasada: true });
    expect(fechaRelativa("2026-10-29", HOY)).toEqual({ texto: "hace 2 días", pasada: true });
  });
  it("la fecha corta: el año solo si no es el de hoy, y setiembre como se dice en Perú", () => {
    expect(fechaDiaMes("2026-11-04", HOY)).toBe("4 nov");
    expect(fechaDiaMes("2025-09-12", HOY)).toBe("12 set 2025");
  });
});

describe("el ancho de la caja de los montos", () => {
  it("mide el más largo en cifras: los signos pesan menos que una cifra, y redondea hacia arriba al medio", () => {
    // «S/ 12,480.00»: 7 cifras + S (0,9) + / (0,45) + espacio (0,4) + coma y punto (0,3 cada uno) = 9,35 → 9,5.
    expect(anchoDeMontos(["S/\u00a0980.00", "S/\u00a012,480.00", "S/\u00a0428.00"])).toBe(9.5);
    expect(anchoDeMontos(["119", "3"])).toBe(3);
    expect(anchoDeMontos([])).toBe(0);
  });
});


