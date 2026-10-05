import { describe, expect, it } from "vitest";
import {
  DIAS_ALCANCE_FALTA,
  K_DIAS_PRENDA,
  claveGrupo,
  curvaDelMotor,
  fraseDeQuienHabla,
  fraseDeFalta,
  gruposDeDemanda,
  leerDemanda,
  ritmoDeLaRed,
  ritmoDePrenda,
  ritmosDePrendas,
  seVendioRapidoYFalta,
  sugerenciaDelMotor,
  type LecturaDemanda,
  type PrendaDemanda,
  type SedeDemanda,
} from "./demanda-reglas";

const prenda = (o: Partial<PrendaDemanda> & { varianteId: string }): PrendaDemanda => ({
  productoId: "p-" + o.varianteId,
  categoriaId: "polos",
  tallaId: "M",
  talla: "M",
  colorCodigo: "TIERRA",
  familiaColor: "tierra",
  vendidas: 0,
  diasExpuesta: 0,
  pisoHoy: 0,
  almacenHoy: 0,
  ...o,
});

const lectura = (variantes: PrendaDemanda[], grupos: LecturaDemanda["grupos"] = [], dias = 28): LecturaDemanda => ({
  hoy: "2026-11-01",
  desde: "2026-10-04",
  hasta: "2026-10-31",
  dias,
  cuadradoEn: "2026-10-03T15:00:00Z",
  variantes,
  grupos,
});

describe("las constantes", () => {
  it("el grupo vale dos semanas colgada y la falta se mide a 14 días, como el motor del piso", () => {
    expect(K_DIAS_PRENDA).toBe(14);
    expect(DIAS_ALCANCE_FALTA).toBe(14);
  });
});

describe("ritmoDePrenda: la prenda se apoya en su grupo", () => {
  // Grupo: 3 prendas, 20 vendidas en 100 días-prenda → 0,2 por prenda colgada y por día.
  const l = lectura([
    prenda({ varianteId: "a", vendidas: 1, diasExpuesta: 2 }),
    prenda({ varianteId: "b", vendidas: 14, diasExpuesta: 70 }),
    prenda({ varianteId: "c", vendidas: 5, diasExpuesta: 28 }),
  ]);
  const g = gruposDeDemanda(l).get(claveGrupo("polos", "M", "tierra"));

  it("el grupo suma ventas y días-prenda", () => {
    expect(g?.ventas).toBe(20);
    expect(g?.diasPrenda).toBe(100);
    expect(g?.ritmoPorPrenda).toBeCloseTo(0.2);
  });
  it("con 2 días colgada manda el grupo: 1 venta en 2 días no es «media por día»", () => {
    const r = ritmoDePrenda(l.variantes[0], g);
    expect(r.pesoPropio).toBeCloseTo(2 / 16);
    expect(r.ritmoDia).toBeCloseTo((1 + 14 * 0.2) / 16); // 0,2375 y no 0,5
  });
  it("con 70 días colgada manda la prenda", () => {
    const r = ritmoDePrenda(l.variantes[1], g);
    expect(r.pesoPropio).toBeCloseTo(70 / 84);
    expect(r.ritmoDia).toBeCloseTo((14 + 14 * 0.2) / 84);
  });
  it("un día sin estar colgada no es un día sin demanda: no entra al denominador", () => {
    // Misma venta, una prenda agotada media ventana: su ritmo sube, no baja.
    const corta = ritmoDePrenda(prenda({ varianteId: "x", vendidas: 4, diasExpuesta: 14 }), g);
    const larga = ritmoDePrenda(prenda({ varianteId: "y", vendidas: 4, diasExpuesta: 28 }), g);
    expect(corta.ritmoDia!).toBeGreaterThan(larga.ritmoDia!);
  });
  it("sin grupo con días, la prenda va sola; sin nada, null (no se inventa)", () => {
    expect(ritmoDePrenda(prenda({ varianteId: "s", vendidas: 3, diasExpuesta: 10 }), undefined).ritmoDia).toBeCloseTo(0.3);
    expect(ritmoDePrenda(prenda({ varianteId: "n" }), undefined).ritmoDia).toBeNull();
  });
  it("una prenda que nunca vendió en un grupo que vende hereda algo del grupo, no cero", () => {
    const r = ritmoDePrenda(prenda({ varianteId: "z", vendidas: 0, diasExpuesta: 7 }), g);
    expect(r.ritmoDia).toBeCloseTo((14 * 0.2) / 21);
  });
});

describe("gruposDeDemanda", () => {
  it("las «sin registrar» suman en su grupo y el ritmo por día usa los días con alguna prenda colgada", () => {
    const l = lectura(
      [prenda({ varianteId: "a", vendidas: 2, diasExpuesta: 10, pisoHoy: 1, almacenHoy: 2 })],
      [{ categoriaId: "polos", tallaId: "M", familiaColor: "tierra", anotadas: 3, diasAlgunaExpuesta: 10 }]
    );
    const g = gruposDeDemanda(l).get(claveGrupo("polos", "M", "tierra"))!;
    expect(g.ventas).toBe(5);
    expect(g.anotadas).toBe(3);
    expect(g.ritmoDia).toBeCloseTo(0.5);
    expect(g.disponible).toBe(3);
    expect(g.exposicionEstimada).toBe(false);
  });
  it("AQP: vendió «sin registrar» sin stock cargado → ritmo sobre la ventana entera, marcado como estimado", () => {
    const l = lectura([], [{ categoriaId: "polos", tallaId: "M", familiaColor: "tierra", anotadas: 14, diasAlgunaExpuesta: 0 }]);
    const g = gruposDeDemanda(l).get(claveGrupo("polos", "M", "tierra"))!;
    expect(g.ritmoDia).toBeCloseTo(0.5);
    expect(g.exposicionEstimada).toBe(true);
    expect(g.ritmoPorPrenda).toBeNull();
  });
  it("las prendas de otro color o talla no se mezclan", () => {
    const l = lectura([prenda({ varianteId: "a", vendidas: 2, diasExpuesta: 10 }), prenda({ varianteId: "b", tallaId: "L", talla: "L", vendidas: 9, diasExpuesta: 10 })]);
    expect(gruposDeDemanda(l).size).toBe(2);
  });
});

describe("la red: solo hablan las tiendas listas (ADR-0346)", () => {
  const lTru = lectura([prenda({ varianteId: "a", vendidas: 14, diasExpuesta: 28, pisoHoy: 1 })]);
  const lAqp = lectura([prenda({ varianteId: "a", vendidas: 28, diasExpuesta: 28, pisoHoy: 0 })]);
  const sedes: SedeDemanda[] = [
    { ubicacionId: "tru", nombre: "Tienda TRU", puedeHablar: true, lectura: lTru },
    { ubicacionId: "aqp", nombre: "Tienda AQP", puedeHablar: false, lectura: lAqp },
  ];
  it("AQP no suma aunque venda más: todavía no puede hablar", () => {
    expect(ritmoDeLaRed(sedes).get("a")).toBeCloseTo(0.5);
  });
  it("con las dos listas, suman", () => {
    expect(ritmoDeLaRed(sedes.map((s) => ({ ...s, puedeHablar: true }))).get("a")).toBeCloseTo(1.5);
  });
  it("ninguna lista → nada", () => {
    expect(ritmoDeLaRed(sedes.map((s) => ({ ...s, puedeHablar: false }))).size).toBe(0);
  });
});

describe("sugerenciaDelMotor", () => {
  it("lo que se venderá en los días menos lo que hay, nunca negativo", () => {
    expect(sugerenciaDelMotor(0.5, 4, 30)).toBe(11);
    expect(sugerenciaDelMotor(0.5, 40, 30)).toBe(0);
  });
  it("sin ritmo no sugiere (null, no cero)", () => {
    expect(sugerenciaDelMotor(undefined, 0, 30)).toBeNull();
    expect(sugerenciaDelMotor(0, 0, 30)).toBeNull();
  });
});

describe("seVendioRapidoYFalta", () => {
  const sede = (nombre: string, variantes: PrendaDemanda[], puedeHablar = true): SedeDemanda => ({ ubicacionId: nombre, nombre, puedeHablar, lectura: lectura(variantes) });
  it("marca el grupo que no alcanza 14 días y lo explica", () => {
    const f = seVendioRapidoYFalta([sede("Tienda TRU", [prenda({ varianteId: "a", vendidas: 28, diasExpuesta: 28, pisoHoy: 1, almacenHoy: 2 })])]);
    expect(f).toHaveLength(1);
    expect(f[0].alcanceDias).toBeCloseTo(3);
    expect(fraseDeFalta(f[0])).toBe("Se venden 1 por día; lo que hay alcanza 3 días.");
  });
  it("no marca lo que alcanza, ni lo de una tienda callada, ni otra categoría", () => {
    const sobra = prenda({ varianteId: "a", vendidas: 7, diasExpuesta: 28, almacenHoy: 20 });
    expect(seVendioRapidoYFalta([sede("TRU", [sobra])])).toEqual([]);
    const falta = prenda({ varianteId: "b", vendidas: 28, diasExpuesta: 28 });
    expect(seVendioRapidoYFalta([sede("AQP", [falta], false)])).toEqual([]);
    expect(seVendioRapidoYFalta([sede("TRU", [falta])], "faldas")).toEqual([]);
  });
  it("suma las tiendas y ordena de más urgente a menos", () => {
    const f = seVendioRapidoYFalta([
      sede("TRU", [prenda({ varianteId: "a", vendidas: 14, diasExpuesta: 28, almacenHoy: 5 }), prenda({ varianteId: "l", tallaId: "L", talla: "L", vendidas: 28, diasExpuesta: 28 })]),
      sede("AQP", [prenda({ varianteId: "a2", vendidas: 14, diasExpuesta: 28 })]),
    ]);
    expect(f.map((x) => x.talla)).toEqual(["L", "M"]);
    expect(f[1].sedes).toEqual(["TRU", "AQP"]);
    expect(f[1].ritmoDia).toBeCloseTo(1);
    expect(fraseDeFalta(f[0])).toBe("Se venden 1 por día; ya no queda ninguna.");
  });
});

describe("leerDemanda", () => {
  it("lee la respuesta de la base", () => {
    const l = leerDemanda({
      hoy: "2026-11-01", desde: "2026-10-04", hasta: "2026-10-31", dias: 28, cuadrado_en: null,
      variantes: [{ variante_id: "a", producto_id: "p", categoria_id: "c", talla_id: "t", talla: "M", color_codigo: "X", familia_color: "tierra", vendidas: 3, dias_expuesta: 10, piso_hoy: 1, almacen_hoy: 0 }],
      grupos: [{ categoria_id: "c", talla_id: "t", familia_color: "tierra", anotadas: 2, dias_alguna_expuesta: 10 }],
    })!;
    expect(l.dias).toBe(28);
    expect(l.variantes[0]).toMatchObject({ varianteId: "a", vendidas: 3, diasExpuesta: 10, talla: "M" });
    expect(ritmosDePrendas(l).get("a")?.ritmoDia).toBeCloseTo((3 + 14 * 0.5) / 24);
  });
  it("NULL de la base (no opera la sede) o forma rara → null; filas sin id se descartan", () => {
    expect(leerDemanda(null)).toBeNull();
    expect(leerDemanda({ hoy: "x" })).toBeNull();
    const l = leerDemanda({ hoy: "2026-11-01", desde: "2026-10-04", hasta: "2026-10-31", dias: 0, variantes: [{ producto_id: "p" }, "nada"], grupos: "nada" })!;
    expect(l.variantes).toEqual([]);
    expect(l.grupos).toEqual([]);
  });
});

describe("curvaDelMotor (Producción, al lado de la curva de siempre)", () => {
  const l = lectura([prenda({ varianteId: "a", vendidas: 14, diasExpuesta: 28 }), prenda({ varianteId: "b", tallaId: "L", talla: "L", vendidas: 0, diasExpuesta: 0 })]);
  it("con una tienda lista, sugiere sobre el mismo disponible que la curva de siempre", () => {
    const c = curvaDelMotor([{ varianteId: "a" }, { varianteId: "b" }], [{ ubicacionId: "t", nombre: "Tienda TRU", puedeHablar: true, lectura: l }], (id) => (id === "a" ? 5 : 0), 30);
    expect(c.hablan).toEqual(["Tienda TRU"]);
    expect(c.porVariante.get("a")).toBe(10); // 0,5 × 30 − 5
    expect(c.porVariante.get("b")).toBeNull(); // sin ventas ni días colgada: no se inventa
    expect(c.total).toBe(10);
    expect(fraseDeQuienHabla(c.hablan)).toBe("Con datos de Tienda TRU.");
  });
  it("sin tiendas listas, no sugiere nada", () => {
    const c = curvaDelMotor([{ varianteId: "a" }], [{ ubicacionId: "t", nombre: "Tienda TRU", puedeHablar: false, lectura: l }], () => 0, 30);
    expect(c.hablan).toEqual([]);
    expect(c.porVariante.get("a")).toBeNull();
    expect(c.total).toBe(0);
    expect(fraseDeQuienHabla(["A", "B", "C"])).toBe("Con datos de A, B y C.");
  });
});
