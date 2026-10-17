import { describe, expect, it } from "vitest";
import {
  avisoAlGuardar,
  buscarGuardado,
  cuandoSeGuardo,
  diaIso,
  etiquetaDelLook,
  hrefDelGuardado,
  interpretarMisLooks,
  leerRespuestaGuardar,
  lookDelGuardado,
  mismasPiezas,
  notaDelGuardado,
  piezasParaGuardar,
  textoDeLasQueFaltan,
  type LookGuardado,
} from "./looks-guardados";
import { indizar, LOOK_VACIO, presentes, type ColorDelProbador, type PrendaDelProbador, type Zona } from "./probador";

const id = (n: number) => `cccccccc-0000-4000-8000-${String(n).padStart(12, "0")}`;
const color = (codigo: string): ColorDelProbador => ({
  codigo,
  nombre: codigo,
  hex: null,
  precio: 50,
  precioFinal: 50,
  desde: false,
  pct: null,
  hay: true,
  nota: null,
  solo: null,
  foto: { url: `https://x/${codigo}.png`, proporcion: 1, optimizar: false, propia: true, de: null },
});
const prenda = (n: number, zona: Zona, colores: string[]): PrendaDelProbador => ({
  id: id(n),
  codigo: `P-${n}`,
  nombre: `Prenda ${n}`,
  categoria: null,
  zona,
  metida: false,
  largo: 60,
  colores: colores.map(color),
});
const TOP = prenda(1, "arriba", ["NEG", "RPA"]);
const PANTALON = prenda(2, "abajo", ["GRI"]);
const VESTIDO = prenda(3, "vestido", ["ROS"]);
const CARTERA = prenda(4, "bolso", ["NEG"]);
const PRENDAS = [TOP, PANTALON, VESTIDO, CARTERA];

const guardado = (n: number, piezas: [number, string][], extra: Partial<LookGuardado> = {}): LookGuardado => ({
  id: id(100 + n),
  nombre: `Look ${n}`,
  guardadoEn: "2026-10-16T20:00:00Z",
  piezas: piezas.map(([p, c], i) => ({ posicion: i + 1, productoId: id(p), color: c, seVe: true })),
  ...extra,
});

describe("interpretarMisLooks: lo que dice la base", () => {
  it("lee los looks con sus prendas en su orden y salta lo mal formado", () => {
    const looks = interpretarMisLooks({
      looks: [
        {
          id: id(100),
          nombre: "Look de sábado",
          guardado_en: "2026-10-16T20:00:00Z",
          piezas: [
            { posicion: 2, producto_id: id(2), color: "GRI", se_ve: true },
            { posicion: 1, producto_id: id(1), color: "NEG", se_ve: true },
            { posicion: 3, producto_id: "x", color: "NEG" },
          ],
        },
        { id: "no", nombre: "Malo", guardado_en: "x", piezas: [] },
        { id: id(101), nombre: "Sin prendas", guardado_en: "2026-10-16T20:00:00Z", piezas: [] },
      ],
    });
    expect(looks).toEqual([
      {
        id: id(100),
        nombre: "Look de sábado",
        guardadoEn: "2026-10-16T20:00:00Z",
        piezas: [
          { posicion: 1, productoId: id(1), color: "NEG", seVe: true },
          { posicion: 2, productoId: id(2), color: "GRI", seVe: true },
        ],
      },
    ]);
    expect(interpretarMisLooks(null)).toBeNull();
    expect(interpretarMisLooks({ looks: "x" })).toBeNull();
  });
});

describe("¿ya está guardado?", () => {
  it("las mismas prendas en los mismos colores, en cualquier orden", () => {
    const g = guardado(1, [
      [1, "NEG"],
      [2, "GRI"],
    ]);
    expect(mismasPiezas([{ id: id(2), color: "GRI" }, { id: id(1), color: "neg" }], g.piezas)).toBe(true);
    expect(mismasPiezas([{ id: id(1), color: "RPA" }, { id: id(2), color: "GRI" }], g.piezas)).toBe(false);
    expect(mismasPiezas([{ id: id(1), color: "NEG" }], g.piezas)).toBe(false);
    expect(buscarGuardado([{ id: id(1), color: "NEG" }, { id: id(2), color: "GRI" }], [guardado(2, [[3, "ROS"], [4, "NEG"]]), g])?.id).toBe(g.id);
    expect(buscarGuardado([{ id: id(1), color: "RPA" }, { id: id(2), color: "GRI" }], [g])).toBeNull();
  });
});

describe("un look guardado puesto en el probador", () => {
  it("cada prenda en su lugar; las que ya no están, aparte", () => {
    const g = guardado(1, [
      [1, "RPA"],
      [2, "GRI"],
      [4, "NEG"],
      [9, "NEG"],
    ]);
    const { look, faltan } = lookDelGuardado(g, PRENDAS);
    expect(presentes(look)).toEqual(["arriba", "abajo", "bolso"]);
    expect(look.arriba).toEqual({ id: id(1), color: "RPA" });
    expect(faltan.map((p) => p.productoId)).toEqual([id(9)]);
  });
  it("una que dejó de verse en la web, o un color que ya no tiene, también falta", () => {
    const g = guardado(1, [
      [1, "VIN"],
      [2, "GRI"],
    ]);
    g.piezas[1].seVe = false;
    expect(lookDelGuardado(g, PRENDAS).faltan.map((p) => p.color)).toEqual(["VIN", "GRI"]);
  });
  it("con las reglas de poner: un vestido saca lo de arriba y abajo", () => {
    expect(presentes(lookDelGuardado(guardado(1, [[1, "NEG"], [2, "GRI"], [3, "ROS"]]), PRENDAS).look)).toEqual(["vestido"]);
  });
  it("las prendas para guardarlo, en el orden de las zonas", () => {
    expect(piezasParaGuardar({ ...LOOK_VACIO, bolso: { id: id(4), color: "NEG" }, arriba: { id: id(1), color: "NEG" } })).toEqual([
      { producto_id: id(1), color: "NEG" },
      { producto_id: id(4), color: "NEG" },
    ]);
  });
});

describe("lo que dice la pantalla", () => {
  it("cuándo se guardó, en el día de Lima", () => {
    expect(cuandoSeGuardo("2026-10-16T20:00:00Z", "2026-10-16")).toBe("Guardado hoy");
    // Las 2 de la mañana en UTC del 17 son todavía el 16 en Lima.
    expect(cuandoSeGuardo("2026-10-17T02:00:00Z", "2026-10-16")).toBe("Guardado hoy");
    expect(cuandoSeGuardo("2026-10-15T20:00:00Z", "2026-10-16")).toBe("Guardado ayer");
    expect(cuandoSeGuardo("2026-10-14T20:00:00Z", "2026-10-16")).toBe("Guardado el 14 de octubre");
    expect(cuandoSeGuardo("nada", "2026-10-16")).toBe("Guardado");
  });
  it("la respuesta de guardar: el look si se guardó; sin cuenta es sin sesión; lo raro, sin respuesta", () => {
    expect(leerRespuestaGuardar({ estado: "guardado", id: id(5), nombre: "Look de sábado", nuevo: true })).toEqual({ estado: "guardado", id: id(5), nombre: "Look de sábado" });
    expect(leerRespuestaGuardar({ estado: "tope", tope: 30 })).toEqual({ estado: "tope", id: null, nombre: null });
    expect(leerRespuestaGuardar({ estado: "sin_cuenta" }).estado).toBe("sin_sesion");
    expect(leerRespuestaGuardar({ estado: "guardado" }).estado).toBe("sin_respuesta");
    expect(leerRespuestaGuardar("x").estado).toBe("sin_respuesta");
  });
  it("cada estado tiene su frase", () => {
    expect(avisoAlGuardar("guardado")).toBe("Guardado en tus favoritos");
    expect(avisoAlGuardar("tope")).toMatch(/30 looks/);
    expect(avisoAlGuardar("invalido")).toMatch(/al menos dos/);
  });
});

describe("la página del look guardado", () => {
  it("su dirección lleva la tienda elegida", () => {
    expect(hrefDelGuardado(id(100))).toBe(`/looks/guardado/${id(100)}`);
    expect(hrefDelGuardado(id(100), "trujillo")).toBe(`/looks/guardado/${id(100)}?sede=trujillo`);
  });
  it("hoy en Lima, como lo compara cuándo se guardó", () => {
    expect(diaIso({ anio: 2026, mes: 3, dia: 7 })).toBe("2026-03-07");
    expect(cuandoSeGuardo("2026-03-07T15:00:00Z", diaIso({ anio: 2026, mes: 3, dia: 7 }))).toBe("Guardado hoy");
  });
  it("la figura se lee en el orden de sus números", () => {
    const { look } = lookDelGuardado(guardado(1, [[4, "NEG"], [1, "RPA"], [2, "GRI"]]), PRENDAS);
    expect(etiquetaDelLook(look, indizar(PRENDAS))).toBe("Tu look: 1, Prenda 1 en rpa; 2, Prenda 2 en gri; 3, Prenda 4 en neg");
  });
  it("lo que falta y la nota del final", () => {
    expect(textoDeLasQueFaltan(0)).toBeNull();
    expect(textoDeLasQueFaltan(1)).toMatch(/^Una prenda/);
    expect(textoDeLasQueFaltan(2)).toMatch(/^2 prendas .* ya no están/);
    expect(notaDelGuardado("Trujillo")).toMatch(/lo que queda en Trujillo se ven al día/);
    expect(notaDelGuardado(null)).toMatch(/en las tiendas/);
  });
});
