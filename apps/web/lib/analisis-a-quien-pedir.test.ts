import { describe, expect, it } from "vitest";
import type { PrendaAnalisis, ProveedoresAnalisis } from "./analisis-tipos";
import { diasQueQuedan } from "./analisis-reglas";
import {
  agruparPorProveedor,
  FUENTE_CORTA,
  FUENTE_LARGA,
  modelosPorPedir,
  proveedorDelModelo,
  resumenCabecera,
  resumenDeGrupos,
  textoFuenteDeLaFila,
  textoFuentesDelGrupo,
  textoModelosDelGrupo,
  textoPidelasA,
  textoPidelo,
} from "./analisis-a-quien-pedir";

// Datos inventados para la prueba (no son de producción).
function prenda(parcial: Partial<PrendaAnalisis>): PrendaAnalisis {
  return {
    varianteId: "v1",
    productoId: "p1",
    nombre: "Blusa Prueba",
    color: "",
    colorHex: null,
    talla: "",
    categoria: "Blusas",
    categoriaPrefijo: "BLU",
    categoriaFamilia: null,
    fotoUrl: null,
    precio: 50,
    costo: 20,
    origen: null,
    proveedorId: null,
    piso: 0,
    almacen: 0,
    vendidas30: 0,
    semanas: [0, 0, 0, 0, 0, 0, 0, 0],
    diasSinVender: null,
    salioAlPiso: null,
    llego: null,
    llegaron30: 0,
    vendidasDeLasQueLlegaron30: 0,
    otras: [],
    llega: [],
    ...parcial,
  };
}

/** Un modelo al que le quedan `dias` días (vende 30 en 30 días: 1 por día; 0 = agotado). */
const quedan = (productoId: string, dias: number, parcial: Partial<PrendaAnalisis> = {}) =>
  prenda({ varianteId: `v-${productoId}`, productoId, nombre: `Modelo ${productoId}`, piso: dias, vendidas30: 30, diasDeVentas: 30, ...parcial });

const TEXTIL = "prov-textil";
const HILOS = "prov-hilos";
const CAYLA = "prov-cayla";
const VIEJO = "prov-viejo";
const proveedores: ProveedoresAnalisis = {
  nombres: {
    [TEXTIL]: { nombre: "Textil Andino", activo: true },
    [HILOS]: { nombre: "Hilos del Sur", activo: true },
    [CAYLA]: { nombre: "CAYLA SAC", activo: true },
    [VIEJO]: { nombre: "Confecciones Viejo", activo: false },
  },
  delCatalogo: { p1: TEXTIL, p2: HILOS, p3: CAYLA, p4: VIEJO, p5: "prov-que-no-se-conoce" },
};

describe("proveedorDelModelo: el origen real manda; el catálogo es el respaldo", () => {
  it("sin origen, el proveedor del catálogo, dicho como tal", () => {
    expect(proveedorDelModelo(prenda({ productoId: "p1" }), proveedores)).toEqual({ fuente: "catalogo", id: TEXTIL, nombre: "Textil Andino" });
  });

  it("con una compra, manda el proveedor de la compra aunque el catálogo diga otro", () => {
    const m = prenda({ productoId: "p1", origen: "terceros", proveedorId: HILOS });
    expect(proveedorDelModelo(m, proveedores)).toEqual({ fuente: "compra", id: HILOS, nombre: "Hilos del Sur" });
  });

  it("del Taller es del Taller: el catálogo NO lo manda a terceros ni lo cambia, ni con «CAYLA SAC» ni con otro", () => {
    expect(proveedorDelModelo(prenda({ productoId: "p1", origen: "taller" }), proveedores)).toEqual({ fuente: "taller" });
    expect(proveedorDelModelo(prenda({ productoId: "p3", origen: "taller" }), proveedores)).toEqual({ fuente: "taller" });
  });

  it("el catálogo no decide entre el Taller y terceros: un modelo de «CAYLA SAC» sin origen sigue siendo «del catálogo», nunca «del Taller»", () => {
    const q = proveedorDelModelo(prenda({ productoId: "p3" }), proveedores);
    expect(q).toEqual({ fuente: "catalogo", id: CAYLA, nombre: "CAYLA SAC" });
    expect(textoPidelo(q)).toBe("Pídelo a CAYLA SAC");
  });

  it("origen «terceros» cuyo proveedor no se puede nombrar: sin proveedor, no se adivina con el catálogo", () => {
    expect(proveedorDelModelo(prenda({ productoId: "p1", origen: "terceros", proveedorId: "x-desconocido" }), proveedores)).toEqual({ fuente: "ninguno" });
    expect(proveedorDelModelo(prenda({ productoId: "p1", origen: "terceros", proveedorId: null }), proveedores)).toEqual({ fuente: "ninguno" });
  });

  it("sin origen ni catálogo, o con un catálogo que apunta a alguien que no se conoce: sin proveedor", () => {
    expect(proveedorDelModelo(prenda({ productoId: "otro" }), proveedores)).toEqual({ fuente: "ninguno" });
    expect(proveedorDelModelo(prenda({ productoId: "p5" }), proveedores)).toEqual({ fuente: "ninguno" });
    expect(proveedorDelModelo(prenda({ productoId: "p1" }), { nombres: {}, delCatalogo: {} })).toEqual({ fuente: "ninguno" });
  });

  it("un proveedor archivado se nombra como tal", () => {
    expect(proveedorDelModelo(prenda({ productoId: "p4" }), proveedores)).toEqual({ fuente: "catalogo", id: VIEJO, nombre: "Confecciones Viejo (archivado)" });
  });
});

describe("textoPidelo", () => {
  it("dice a quién; al Taller, «al Taller»; sin proveedor, nada", () => {
    expect(textoPidelo({ fuente: "catalogo", id: "x", nombre: "Textil Andino" })).toBe("Pídelo a Textil Andino");
    expect(textoPidelo({ fuente: "compra", id: "x", nombre: "Hilos del Sur" })).toBe("Pídelo a Hilos del Sur");
    expect(textoPidelo({ fuente: "taller" })).toBe("Pídelo al Taller");
    expect(textoPidelo({ fuente: "ninguno" })).toBeNull();
  });
});

describe("modelosPorPedir: lo que todavía no viene en camino", () => {
  const HOY = "2026-10-16";
  const aTiempo = quedan("a", 3, { llega: [{ de: "compra", cantidad: 4, fecha: "2026-10-20" }] });
  const sinFecha = quedan("b", 3, { llega: [{ de: "taller", cantidad: 4, fecha: null }] });
  // Debía llegar hace un mes y no llegó: vuelve a ser algo por pedir (A3).
  const atrasada = quedan("c", 3, { llega: [{ de: "compra", cantidad: 4, fecha: "2026-09-16" }] });
  const nada = quedan("d", 3);

  it("lo que llega a tiempo (con o sin fecha) queda fuera; lo atrasado y lo que no viene nada, dentro, en el mismo orden", () => {
    expect(modelosPorPedir([aTiempo, sinFecha, atrasada, nada], HOY).map((m) => m.productoId)).toEqual(["c", "d"]);
  });

  it("sin modelos, nada", () => {
    expect(modelosPorPedir([], HOY)).toEqual([]);
  });
});

describe("textoFuenteDeLaFila: el catálogo se dice a la vista", () => {
  it("solo cuando el nombre sale del catálogo; con una compra real o el Taller no dice nada", () => {
    expect(textoFuenteDeLaFila({ fuente: "catalogo", id: "x", nombre: "Textil Andino" })).toBe("proveedor del catálogo");
    expect(textoFuenteDeLaFila({ fuente: "compra", id: "x", nombre: "Hilos del Sur" })).toBeNull();
    expect(textoFuenteDeLaFila({ fuente: "taller" })).toBeNull();
    expect(textoFuenteDeLaFila({ fuente: "ninguno" })).toBeNull();
  });

  it("el tooltip del catálogo no afirma lo que no sabe: no dice que no haya ninguna compra, sino que el sistema no tiene una con esta prenda", () => {
    expect(FUENTE_LARGA.catalogo).not.toContain("todavía no tiene una compra registrada");
    expect(FUENTE_LARGA.catalogo).toContain("no tiene una compra con esta prenda");
  });
});

describe("agruparPorProveedor", () => {
  it("junta por a quién, del más urgente al menos dentro de cada uno, y el de lo más urgente primero", () => {
    const modelos = [
      quedan("p1", 9),
      quedan("p2", 3),
      quedan("p1", 0, { varianteId: "v-p1-b", nombre: "Modelo p1b" }),
      quedan("p3", 5),
      quedan("p2", 12),
    ];
    const grupos = agruparPorProveedor(modelos, proveedores);
    expect(grupos.map((g) => [g.nombre, g.modelos.map((m) => diasQueQuedan(m))])).toEqual([
      ["Textil Andino", [0, 9]],
      ["Hilos del Sur", [3, 12]],
      ["CAYLA SAC", [5]],
    ]);
    expect(grupos[0]).toMatchObject({ clave: `p:${TEXTIL}`, agotados: 1, masUrgente: 0, fuentes: ["catalogo"] });
    expect(grupos[1]).toMatchObject({ agotados: 0, masUrgente: 3 });
  });

  it("«Sin proveedor» va siempre al final aunque tenga lo más urgente; el Taller es un grupo más, ordenado por urgencia", () => {
    const grupos = agruparPorProveedor(
      [quedan("sin-1", 0), quedan("sin-2", 1), quedan("p1", 6), quedan("t1", 2, { origen: "taller" })],
      proveedores,
    );
    expect(grupos.map((g) => g.nombre)).toEqual(["Taller de CAYLA", "Textil Andino", "Sin proveedor"]);
    expect(grupos[2]).toMatchObject({ clave: "ninguno", agotados: 1, fuentes: ["ninguno"] });
  });

  it("a igual urgencia, el que tiene más modelos; después, por nombre", () => {
    const modelos = [quedan("p2", 4), quedan("p1", 4), quedan("p1", 8, { varianteId: "v-p1-b" }), quedan("p3", 4)];
    expect(agruparPorProveedor(modelos, proveedores).map((g) => g.nombre)).toEqual(["Textil Andino", "CAYLA SAC", "Hilos del Sur"]);
  });

  it("un proveedor que sale de una compra para un modelo y del catálogo para otro es UN grupo y dice las dos fuentes", () => {
    const grupos = agruparPorProveedor([quedan("pX", 5, { origen: "terceros", proveedorId: TEXTIL }), quedan("p1", 7)], proveedores);
    expect(grupos).toHaveLength(1);
    expect(grupos[0]).toMatchObject({ nombre: "Textil Andino", fuentes: ["compra", "catalogo"] });
    expect(textoFuentesDelGrupo(grupos[0]!.fuentes)).toBe("de tu última compra y del catálogo");
  });

  it("con 40 modelos y 17 proveedores no se pierde ni se repite ningún modelo, y todo queda en orden", () => {
    const delCatalogo: Record<string, string> = {};
    const nombres: ProveedoresAnalisis["nombres"] = {};
    for (let i = 0; i < 17; i++) nombres[`prov-${i}`] = { nombre: `Proveedor ${String(i).padStart(2, "0")}`, activo: true };
    const modelos: PrendaAnalisis[] = [];
    for (let i = 0; i < 40; i++) {
      // 34 con proveedor (repartidos en los 17) y 6 sin catálogo.
      if (i < 34) delCatalogo[`m${i}`] = `prov-${i % 17}`;
      modelos.push(quedan(`m${i}`, (i * 7) % 15));
    }
    const grupos = agruparPorProveedor(modelos, { nombres, delCatalogo });
    expect(grupos).toHaveLength(18);
    expect(grupos.at(-1)).toMatchObject({ clave: "ninguno" });
    expect(grupos.at(-1)!.modelos).toHaveLength(6);
    const ids = grupos.flatMap((g) => g.modelos.map((m) => m.productoId));
    expect(ids).toHaveLength(40);
    expect(new Set(ids).size).toBe(40);
    // Dentro de cada grupo, de lo más urgente a lo menos; entre grupos con proveedor, por lo más urgente que tiene cada uno.
    for (const g of grupos) {
      const dias = g.modelos.map((m) => diasQueQuedan(m)!);
      expect(dias).toEqual([...dias].sort((a, b) => a - b));
      expect(g.masUrgente).toBe(dias[0]);
    }
    const urgencias = grupos.filter((g) => g.clave !== "ninguno").map((g) => g.masUrgente!);
    expect(urgencias).toEqual([...urgencias].sort((a, b) => a - b));
    // «Máximo 3 a 5 modelos por proveedor» del plan: con este reparto, 2 por proveedor.
    expect(Math.max(...grupos.filter((g) => g.clave !== "ninguno").map((g) => g.modelos.length))).toBe(2);
  });

  it("sin modelos, sin grupos", () => {
    expect(agruparPorProveedor([], proveedores)).toEqual([]);
  });
});

describe("los textos de «A quién pedir»", () => {
  const grupos = agruparPorProveedor([quedan("p1", 0), quedan("p1", 3, { varianteId: "v-b" }), quedan("p2", 8), quedan("zz", 2), quedan("yy", 4)], proveedores);

  it("la cuenta: proveedores y cuántos modelos no tienen", () => {
    expect(resumenDeGrupos(grupos)).toEqual({ proveedores: 2, sinProveedor: 2, modelos: 5 });
    expect(resumenCabecera(resumenDeGrupos(grupos))).toBe("2 proveedores · 5 modelos");
    expect(resumenCabecera({ proveedores: 1, sinProveedor: 0, modelos: 1 })).toBe("1 proveedor · 1 modelo");
    expect(resumenCabecera({ proveedores: 0, sinProveedor: 3, modelos: 3 })).toBe("3 modelos");
  });

  it("el pie de Hoy: «Pídelas a 2 proveedores · 2 sin proveedor»", () => {
    expect(textoPidelasA(resumenDeGrupos(grupos))).toBe("Pídelas a 2 proveedores · 2 sin proveedor");
    expect(textoPidelasA({ proveedores: 1, sinProveedor: 0 })).toBe("Pídelas a 1 proveedor");
    // Si parte de la lista del tooltip ya viene en camino, el pie lo aclara.
    expect(textoPidelasA(resumenDeGrupos(grupos), true)).toBe("Las que aún no vienen: pídelas a 2 proveedores · 2 sin proveedor");
    expect(textoPidelasA({ proveedores: 1, sinProveedor: 0 }, true)).toBe("Las que aún no vienen: pídelas a 1 proveedor");
    expect(textoPidelasA({ proveedores: 0, sinProveedor: 4 }, true)).toBe("Falta elegir el proveedor en el catálogo");
    expect(textoPidelasA({ proveedores: 0, sinProveedor: 0 }, true)).toBeNull();
    expect(textoPidelasA({ proveedores: 0, sinProveedor: 4 })).toBe("Falta elegir el proveedor en el catálogo");
    expect(textoPidelasA({ proveedores: 0, sinProveedor: 0 })).toBeNull();
  });

  it("lo de cada proveedor: cuántos modelos, cuántos agotados, y de dónde se sabe", () => {
    expect(textoModelosDelGrupo(grupos[0]!)).toBe("2 modelos · 1 agotado");
    expect(textoModelosDelGrupo({ modelos: [quedan("a", 5)], agotados: 0 })).toBe("1 modelo");
    expect(textoModelosDelGrupo({ modelos: [quedan("a", 0), quedan("b", 0), quedan("c", 3)], agotados: 2 })).toBe("3 modelos · 2 agotados");
    expect(textoFuentesDelGrupo(["catalogo"])).toBe(FUENTE_CORTA.catalogo);
    expect(textoFuentesDelGrupo(["ninguno"])).toBe("falta elegirlo en el catálogo");
    expect(textoFuentesDelGrupo(["taller"])).toBe("lo hace el Taller de CAYLA");
    expect(textoFuentesDelGrupo([])).toBe("");
  });
});
