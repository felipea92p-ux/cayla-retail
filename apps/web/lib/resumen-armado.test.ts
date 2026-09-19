import { describe, expect, it } from "vitest";
import { AHORA, TRUJILLO, fila, taller } from "./resumen-fixtures";
import { armarResumen, rangosDelResumen } from "./resumen-armado";
import { FILAS_POR_PAGINA } from "./resumen-filtros";

const base = { ubicacion: TRUJILLO, ahora: AHORA, conteos: { exactitud: null, ultimoCerradoEn: null }, sububicaciones: { pisoId: "s-piso", almacenId: "s-alm" } };

describe("armado de la pantalla", () => {
  it("por defecto: últimos 30 días comparados con los 30 anteriores", () => {
    const r = rangosDelResumen({}, AHORA);
    expect(r.periodo).toMatchObject({ preset: "30d", desde: "2026-08-20", hasta: "2026-09-18", dias: 30 });
    expect(r.modo).toBe("anterior");
    expect(r.comparacion).toEqual({ desde: "2026-07-21", hasta: "2026-08-19" });
  });

  it("el período cambia lo histórico pero NUNCA el stock que se usa para decidir", () => {
    const filas = [fila({ piso: 2, almacen: 5, ventas: 123, enRed: [taller()] })];
    const treinta = armarResumen({ ...base, filas, params: { preset: "30d" } });
    const noventa = armarResumen({ ...base, filas, params: { preset: "90d" } });
    const agosto = armarResumen({ ...base, filas, params: { preset: "personalizado", desde: "2026-08-01", hasta: "2026-08-31" } });
    for (const r of [treinta, noventa, agosto]) {
      expect(r.tabla.filas[0].fila.piso).toBe(2);
      expect(r.tabla.filas[0].fila.utilizable).toBe(7);
      expect(r.resumen.unidades.utilizables).toBe(7);
    }
    expect(agosto.periodo.desde).toBe("2026-08-01");
    expect(agosto.periodo.hasta).toBe("2026-08-31");
  });

  it("sin comparación no hay período previo", () => {
    const r = armarResumen({ ...base, filas: [fila()], params: { comparar: "ninguna" } });
    expect(r.comparacion).toEqual({ modo: "ninguna", rango: null });
    expect(r.resumen.ventas.previo).toBeNull();
  });

  it("mismo período del año anterior", () => {
    const r = armarResumen({ ...base, filas: [fila()], params: { preset: "7d", comparar: "anio" } });
    expect(r.comparacion.rango).toEqual({ desde: "2025-09-12", hasta: "2025-09-18" });
  });

  it("las tarjetas siguen al alcance (búsqueda, categoría) y la tabla además a la vista", () => {
    const filas = [
      fila({ referencia: "Blusa Camila", categoriaId: "c-blusas", categoria: "Blusas", talla: "L", piso: 0, almacen: 0, ventas: 60 }),
      fila({ referencia: "Falda Isabella", categoriaId: "c-faldas", categoria: "Faldas", ventas: 30, piso: 20, almacen: 10 }),
    ];
    const todo = armarResumen({ ...base, filas, params: {} });
    expect(todo.resumen.agotadasConDemanda).toBe(1);
    expect(todo.tabla.total).toBe(2);

    const faldas = armarResumen({ ...base, filas, params: { cat: "c-faldas" } });
    expect(faldas.resumen.agotadasConDemanda).toBe(0);
    expect(faldas.tabla).toMatchObject({ total: 1, totalAlcance: 1, totalSede: 2 });
    expect(faldas.categorias).toHaveLength(2); // el selector no se encoge al elegir una categoría

    // Tocar la tarjeta «agotadas» recorta la TABLA, pero las tarjetas siguen contando lo de siempre.
    const soloAgotadas = armarResumen({ ...base, filas, params: { est: "agotada_demanda" } });
    expect(soloAgotadas.tabla.total).toBe(1);
    expect(soloAgotadas.resumen.totalVariantes).toBe(2);
  });

  it("solo viaja una página de filas, aunque la sede tenga miles de variantes", () => {
    const filas = Array.from({ length: 2500 }, (_, i) => fila({ referencia: `Prenda ${String(i).padStart(4, "0")}`, ventas: i % 40 }));
    const r = armarResumen({ ...base, filas, params: {} });
    expect(r.tabla.filas).toHaveLength(FILAS_POR_PAGINA);
    expect(r.tabla.total).toBe(2500);
    expect(r.tabla.paginas).toBe(Math.ceil(2500 / FILAS_POR_PAGINA));
    const ultima = armarResumen({ ...base, filas, params: { pag: "9999" } });
    expect(ultima.tabla.pagina).toBe(ultima.tabla.paginas);
    expect(ultima.tabla.filas.length).toBeGreaterThan(0);
  });

  it("una URL inventada nunca rompe la pantalla", () => {
    const r = armarResumen({ ...base, filas: [fila()], params: { preset: "xx", comparar: "yy", cob: "zz", est: "hackeo", pag: "-3", desde: "no", hasta: "no" } });
    expect(r.periodo.preset).toBe("30d");
    expect(r.comparacion.modo).toBe("anterior");
    expect(r.vista.estado).toBe("todos");
    expect(r.tabla.pagina).toBe(1);
  });

  it("una sede sin nada: estado vacío honesto, sin números inventados", () => {
    const r = armarResumen({ ...base, filas: [], params: {} });
    expect(r.tabla).toMatchObject({ total: 0, totalSede: 0, filas: [] });
    expect(r.resumen).toMatchObject({ totalVariantes: 0, agotadasConDemanda: 0, coberturaCritica: 0 });
    expect(r.resumen.capital.verificado).toBe(true); // sin stock no hay nada que valorizar mal
  });
});
