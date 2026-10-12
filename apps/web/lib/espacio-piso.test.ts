import { describe, expect, it } from "vitest";
import { armarHistoria, leerFotos, semanasSinFoto, type FotoEspacio } from "./espacio-piso";
import type { CategoriaMix, GrupoMix } from "./plan-piso-grupos";

const GRUPOS: GrupoMix[] = [
  { clave: "polos_tops_blusas", nombre: "Polos, tops y blusas", rol: "destino", enRiel: true, orden: 10 },
  { clave: "jeans", nombre: "Jeans", rol: "destino", enRiel: true, orden: 20 },
  { clave: "accesorios_de_impulso", nombre: "Accesorios de impulso y caja", rol: "conveniencia", enRiel: false, orden: 70 },
];
const cat = (categoriaId: string, grupoClave: string | null): CategoriaMix => ({ categoriaId, categoria: categoriaId, prefijo: null, familia: null, grupoClave, confirmada: true, confirmadaEn: null, version: 1 });
const CATEGORIAS = [cat("c-pol", "polos_tops_blusas"), cat("c-jea", "jeans"), cat("c-acc", "accesorios_de_impulso"), cat("c-sin", null)];
const foto = (fecha: string, categoriaId: string, prendas: number, modelos = Math.min(prendas, 1), pisoCuadrado = true): FotoEspacio => ({ fecha, categoriaId, prendas, modelos, pisoCuadrado });
const fila = (fecha: string, categoria_id: string, prendas: number, modelos: number, piso_cuadrado: boolean) => ({ fecha, categoria_id, prendas, modelos, piso_cuadrado });

describe("leer las fotos que manda la base, sin confiar en su forma", () => {
  it("una foto válida se lee tal cual; una lista vacía es una lectura válida (todavía no hay fotos)", () => {
    expect(leerFotos([fila("2026-10-05", "c-pol", 24, 3, false)])).toEqual([{ fecha: "2026-10-05", categoriaId: "c-pol", prendas: 24, modelos: 3, pisoCuadrado: false }]);
    expect(leerFotos([])).toEqual([]);
  });

  it("lo que no tiene la forma esperada invalida TODA la lectura: nunca una historia a medias", () => {
    expect(leerFotos(null)).toBeNull();
    expect(leerFotos({})).toBeNull();
    expect(leerFotos([null])).toBeNull();
    expect(leerFotos([fila("5/10/2026", "c-pol", 1, 1, true)])).toBeNull(); // fecha mal escrita
    expect(leerFotos([fila("2026-10-05", "c-pol", -1, 0, true)])).toBeNull(); // prendas negativas
    expect(leerFotos([fila("2026-10-05", "c-pol", 1.5, 1, true)])).toBeNull(); // media prenda
    expect(leerFotos([fila("2026-10-05", "c-pol", 2, 3, true)])).toBeNull(); // más modelos que prendas
    expect(leerFotos([fila("2026-10-05", "", 2, 1, true)])).toBeNull(); // sin categoría
    expect(leerFotos([{ ...fila("2026-10-05", "c-pol", 2, 1, true), piso_cuadrado: "si" }])).toBeNull();
  });
});

describe("semanas sin foto", () => {
  it("una foto cada lunes no deja huecos; cada dos lunes, una semana sin foto; tolera un día de corrimiento", () => {
    expect(semanasSinFoto(["2026-10-05", "2026-10-12", "2026-10-19"])).toBe(0);
    expect(semanasSinFoto(["2026-10-05", "2026-10-19"])).toBe(1);
    expect(semanasSinFoto(["2026-10-05", "2026-11-02"])).toBe(3);
    expect(semanasSinFoto(["2026-10-05", "2026-10-13"])).toBe(0); // 8 días: el cron corrió un día tarde, no se perdió una semana
  });

  it("con una sola foto, o ninguna, no hay con qué comparar: 0", () => {
    expect(semanasSinFoto(["2026-10-05"])).toBe(0);
    expect(semanasSinFoto([])).toBe(0);
  });
});

describe("armar la historia de una sede", () => {
  const FOTOS = [
    foto("2026-10-05", "c-pol", 24, 3, false), foto("2026-10-05", "c-jea", 0, 0, false), foto("2026-10-05", "c-acc", 10, 4, false), foto("2026-10-05", "c-sin", 3, 1, false),
    foto("2026-10-12", "c-pol", 30, 4), foto("2026-10-12", "c-jea", 6, 1), foto("2026-10-12", "c-acc", 12, 5),
  ];

  it("una fila por día, de la más reciente a la más antigua, con las prendas por grupo del riel", () => {
    const h = armarHistoria(FOTOS, CATEGORIAS, GRUPOS, "2026-10-14");
    expect(h.filas.map((f) => f.fecha)).toEqual(["2026-10-12", "2026-10-05"]);
    expect(h.filas[0]!.porGrupo).toEqual({ polos_tops_blusas: 30, jeans: 6 });
    expect(h.filas[0]!.totalRiel).toBe(36);
  });

  it("un grupo sin nada ese día es 0 (ese día SÍ se fotografió); lo de fuera del riel y lo sin grupo van aparte y no suman al riel", () => {
    const h = armarHistoria(FOTOS, CATEGORIAS, GRUPOS, "2026-10-14");
    const lunes5 = h.filas[1]!;
    expect(lunes5.porGrupo.jeans).toBe(0);
    expect(lunes5.totalRiel).toBe(24);
    expect(lunes5.fueraDelRiel).toBe(10);
    expect(lunes5.sinGrupo).toBe(3);
    expect(lunes5.modelos).toBe(3 + 0 + 4 + 1);
  });

  it("una foto es «cuadrada» solo si la sede ya había cuadrado su piso; se cuenta cuántas salen sin cuadrar (esas no sirven para medir)", () => {
    const h = armarHistoria(FOTOS, CATEGORIAS, GRUPOS, "2026-10-14");
    expect(h.filas.map((f) => f.cuadrada)).toEqual([true, false]);
    expect(h.sinCuadrar).toBe(1);
  });

  it("dice cuánto hace de la última foto y cuántas semanas se perdieron en el medio", () => {
    const h = armarHistoria(FOTOS, CATEGORIAS, GRUPOS, "2026-10-14");
    expect(h.ultimaFoto).toBe("2026-10-12");
    expect(h.diasDesdeLaUltima).toBe(2);
    expect(h.semanasSinFoto).toBe(0);
    const conHueco = armarHistoria([...FOTOS, foto("2026-11-02", "c-pol", 5)], CATEGORIAS, GRUPOS, "2026-11-04");
    expect(conHueco.semanasSinFoto).toBe(2);
  });

  it("sin fotos todavía no hay última foto ni días: se dice «sin fotos», no un 0", () => {
    const h = armarHistoria([], CATEGORIAS, GRUPOS, "2026-10-14");
    expect(h).toEqual({ filas: [], ultimaFoto: null, diasDesdeLaUltima: null, semanasSinFoto: 0, sinCuadrar: 0 });
  });

  it("una categoría cuyo grupo ya no existe cuenta como «sin grupo» (no se esconde)", () => {
    const h = armarHistoria([foto("2026-10-12", "c-pol", 8)], [cat("c-pol", "grupo_borrado")], GRUPOS, "2026-10-14");
    expect(h.filas[0]!.sinGrupo).toBe(8);
    expect(h.filas[0]!.totalRiel).toBe(0);
  });

  it("los días desde la última foto no son negativos aunque la foto sea de «mañana» (un reloj distinto)", () => {
    expect(armarHistoria([foto("2026-10-15", "c-pol", 1)], CATEGORIAS, GRUPOS, "2026-10-14").diasDesdeLaUltima).toBe(0);
  });
});
