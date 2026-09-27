import { describe, expect, it } from "vitest";
import {
  agruparSinTemporada,
  calendarioPorAnio,
  cuantasHeredan,
  faltaAnioSiguiente,
  instanteLima,
  nombreTemporada,
  opcionesTemporada,
  partesLima,
  SIN_PROPIA,
  textoFinDeEstacion,
  textoInstanteLima,
  type EventoCalendario,
  type Temporada,
  type TemporadaEfectiva,
} from "./temporada-reglas";

// La lista sembrada por 20260928100000 (ADR-0246), en su orden.
const LISTA: Temporada[] = [
  { clave: "primavera_verano", nombre: "Primavera-Verano", orden: 10, es_clasico: false, estacion_desde: "primavera", estacion_hasta: "otono", mitad: "PV" },
  { clave: "primavera", nombre: "Primavera", orden: 20, es_clasico: false, estacion_desde: "primavera", estacion_hasta: "verano", mitad: "PV" },
  { clave: "verano", nombre: "Verano", orden: 30, es_clasico: false, estacion_desde: "verano", estacion_hasta: "otono", mitad: "PV" },
  { clave: "invierno", nombre: "Invierno", orden: 60, es_clasico: false, estacion_desde: "invierno", estacion_hasta: "primavera", mitad: "OI" },
  { clave: "clasico", nombre: "Clásico · todo el año", orden: 70, es_clasico: true, estacion_desde: null, estacion_hasta: null, mitad: null },
  { clave: "clasico_invierno", nombre: "Clásico · invierno", orden: 90, es_clasico: true, estacion_desde: "invierno", estacion_hasta: "primavera", mitad: "OI" },
];

describe("opcionesTemporada — que nadie tenga que adivinar qué significa dejarla vacía", () => {
  it("con categoría que tiene temporada, la primera opción dice que hereda y de quién", () => {
    const [primera] = opcionesTemporada(LISTA, { nombre: "Verano", de: "categoría" });
    expect(primera).toEqual({ valor: SIN_PROPIA, texto: "Igual que su categoría (Verano)" });
  });
  it("sin nada que heredar, la primera opción dice «Sin temporada»", () => {
    expect(opcionesTemporada(LISTA)[0].texto).toBe("Sin temporada");
  });
  it("en la excepción por color, hereda de la prenda", () => {
    expect(opcionesTemporada(LISTA, { nombre: "Invierno", de: "prenda" })[0].texto).toBe("Igual que su prenda (Invierno)");
  });
  it("el resto va en el orden de la lista, con los clásicos agrupados aparte", () => {
    const resto = opcionesTemporada(LISTA).slice(1);
    expect(resto.map((o) => o.valor)).toEqual(["primavera_verano", "primavera", "verano", "invierno", "clasico", "clasico_invierno"]);
    expect(resto.map((o) => o.grupo)).toEqual(["De temporada", "De temporada", "De temporada", "De temporada", "Clásicos", "Clásicos"]);
  });
});

describe("nombreTemporada", () => {
  it("traduce la clave al nombre, y vacío es null", () => {
    expect(nombreTemporada(LISTA, "clasico")).toBe("Clásico · todo el año");
    expect(nombreTemporada(LISTA, null)).toBeNull();
    expect(nombreTemporada(LISTA, "")).toBeNull();
  });
});

describe("textoFinDeEstacion", () => {
  const t = (clave: string) => LISTA.find((x) => x.clave === clave)!;
  it("la moda termina al empezar su estación de fin; los clásicos de todo el año no terminan", () => {
    expect(textoFinDeEstacion(t("verano"))).toBe("Termina al empezar el otoño");
    expect(textoFinDeEstacion(t("invierno"))).toBe("Termina al empezar la primavera");
    expect(textoFinDeEstacion(t("clasico"))).toBe("Todo el año: no pasa a temporada pasada");
  });
  it("el artículo va con la estación: «el verano», «la primavera»", () => {
    expect(textoFinDeEstacion(t("primavera"))).toBe("Termina al empezar el verano");
    expect(textoFinDeEstacion({ es_clasico: false, estacion_hasta: "invierno" })).toBe("Termina al empezar el invierno");
  });
  it("un clásico de invierno no pasa a temporada pasada: fuera de su estación se sugiere guardarlo", () => {
    expect(textoFinDeEstacion(t("clasico_invierno"))).toBe("Fuera de su estación se sugiere guardarlo (termina al empezar la primavera)");
  });
});

describe("instanteLima — sin la zona, la estación empezaría 5 horas antes", () => {
  it("escribe la hora de Perú con su zona", () => {
    expect(instanteLima("2026-12-21", "15:50")).toBe("2026-12-21T15:50:00-05:00");
    expect(new Date(instanteLima("2026-12-21", "15:50")!).toISOString()).toBe("2026-12-21T20:50:00.000Z");
  });
  it("acepta una hora de un dígito", () => {
    expect(instanteLima("2027-05-25", "9:05")).toBe("2027-05-25T09:05:00-05:00");
  });
  it("rechaza fechas que no existen y horas imposibles, en vez de guardar otra", () => {
    expect(instanteLima("2027-06-31", "10:00")).toBeNull();
    expect(instanteLima("2027-02-29", "10:00")).toBeNull();
    expect(instanteLima("2027-06-21", "24:00")).toBeNull();
    expect(instanteLima("21/06/2027", "10:00")).toBeNull();
    expect(instanteLima("2027-06-21", "")).toBeNull();
  });
  it("una hora tarde en la noche no se pasa al día siguiente", () => {
    expect(instanteLima("2027-06-21", "23:30")).toBe("2027-06-21T23:30:00-05:00");
  });
});

describe("partesLima y textoInstanteLima — ida y vuelta con lo que guarda la base", () => {
  it("un instante guardado en UTC vuelve a su fecha y hora de Perú", () => {
    expect(partesLima("2026-09-23T00:05:00+00:00")).toEqual({ fecha: "2026-09-22", hora: "19:05" });
    expect(textoInstanteLima("2026-12-21T20:50:00+00:00")).toBe("21 dic 2026, 15:50");
  });
  it("instanteLima(partesLima(x)) es el mismo instante", () => {
    const x = "2027-09-23T06:02:00+00:00";
    const { fecha, hora } = partesLima(x);
    expect(new Date(instanteLima(fecha, hora)!).getTime()).toBe(new Date(x).getTime());
  });
});

const ev = (anio: number, estacion: EventoCalendario["estacion"], inicio: string): EventoCalendario => ({
  anio, estacion, inicio, hasta: null, fuente: "usno", editable: false, en_curso: false,
});

describe("calendarioPorAnio y faltaAnioSiguiente", () => {
  it("agrupa por año y ordena por inicio", () => {
    const g = calendarioPorAnio([ev(2027, "otono", "2027-03-20T20:25:00Z"), ev(2026, "verano", "2026-12-21T20:50:00Z"), ev(2026, "primavera", "2026-09-23T00:05:00Z")]);
    expect(g.map((x) => [x.anio, x.eventos.map((e) => e.estacion)])).toEqual([[2026, ["primavera", "verano"]], [2027, ["otono"]]]);
  });
  it("avisa cuando el año siguiente no tiene sus 4 estaciones", () => {
    const cuatro = (["otono", "invierno", "primavera", "verano"] as const).map((e, i) => ev(2027, e, `2027-0${i + 3}-20T00:00:00Z`));
    expect(faltaAnioSiguiente(cuatro, 2026)).toBe(false);
    expect(faltaAnioSiguiente(cuatro.slice(0, 3), 2026)).toBe(true);
    expect(faltaAnioSiguiente(cuatro, 2027)).toBe(true);
  });
});

const fila = (p: string, color: string | null, temporada: string | null, origen: TemporadaEfectiva["origen"], estado = "activo"): TemporadaEfectiva =>
  ({ producto_id: p, color_codigo: color, estado, temporada, origen });

describe("agruparSinTemporada — la lista para completar", () => {
  it("agrupa por prenda solo los colores sin temporada; deja fuera las descontinuadas", () => {
    const g = agruparSinTemporada([
      fila("A", "NEG", null, null),
      fila("A", "BLA", "verano", "color"),
      fila("A", "ROJ", null, null),
      fila("B", null, null, null),
      fila("C", "NEG", null, null, "descontinuado"),
      fila("D", "NEG", "invierno", "categoria"),
    ]);
    expect(g).toEqual([{ producto_id: "A", colores: ["NEG", "ROJ"] }, { producto_id: "B", colores: [null] }]);
  });
});

describe("cuantasHeredan — la cifra que se ve antes de cambiarle la temporada a una categoría", () => {
  it("cuenta las prendas activas de la categoría que no tienen la suya (heredan o están sin temporada)", () => {
    const filas = [
      fila("A", "NEG", "verano", "categoria"),
      fila("A", "BLA", "invierno", "color"),
      fila("B", null, "otono", "producto"),
      fila("C", "NEG", null, null),
      fila("D", "NEG", "verano", "categoria", "descontinuado"),
      fila("E", "NEG", "verano", "categoria"),
    ];
    expect(cuantasHeredan(filas, new Set(["A", "B", "C", "D"]))).toBe(2);
  });
});
