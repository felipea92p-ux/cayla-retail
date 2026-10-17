import { describe, expect, it } from "vitest";
import type { PrendaAnalisis, ProveedoresAnalisis } from "./analisis-tipos";
import { diasQueQuedan } from "./analisis-reglas";
import {
  agruparPorProveedor,
  CLAVE_SIN_PROVEEDOR,
  FUENTE_CORTA,
  FUENTE_LARGA,
  modelosPorPedir,
  nombreCortoProveedor,
  proveedorDelModelo,
  repartirGrupos,
  resumenCabecera,
  resumenDeGrupos,
  textoFuenteDeLaFila,
  textoFuentesDelGrupo,
  textoModelosDelGrupo,
  textoPidelasA,
  textoPidelo,
  textoPideloCompleto,
  textoSinAQuienPedir,
  textoVieneDe,
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
    // Sin el sufijo legal en la fila; el nombre completo, en su tooltip.
    expect(textoPidelo(q)).toBe("Pídelo a CAYLA");
    expect(textoPideloCompleto(q)).toBe("Pídelo a CAYLA SAC");
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

  it("un proveedor archivado no se recomienda: se nombra como archivado, venga del catálogo o de una compra", () => {
    expect(proveedorDelModelo(prenda({ productoId: "p4" }), proveedores)).toEqual({ fuente: "archivado", id: VIEJO, nombre: "Confecciones Viejo" });
    expect(proveedorDelModelo(prenda({ productoId: "p1", origen: "terceros", proveedorId: VIEJO }), proveedores)).toEqual({ fuente: "archivado", id: VIEJO, nombre: "Confecciones Viejo" });
  });
});

describe("nombreCortoProveedor: sin el sufijo legal", () => {
  it.each([
    ["Textiles Andinos del Perú S.A.C.", "Textiles Andinos del Perú"],
    ["Hilandería Altiplano del Sur Perú SAC", "Hilandería Altiplano del Sur Perú"],
    ["Confecciones Pachacámac E.I.R.L.", "Confecciones Pachacámac"],
    ["Confecciones Pachacámac EIRL", "Confecciones Pachacámac"],
    ["Taller Los Andes S.R.L.", "Taller Los Andes"],
    ["Taller Los Andes SRL", "Taller Los Andes"],
    ["Fibras del Sur S.A.", "Fibras del Sur"],
    ["Fibras del Sur, S.A.C.", "Fibras del Sur"],
    ["Andes S.A. S.A.C.", "Andes"],
    ["hilos del sur sac", "hilos del sur"],
  ])("«%s» → «%s»", (entra, sale) => {
    expect(nombreCortoProveedor(entra)).toBe(sale);
  });

  it("lo que no es un sufijo se queda: la mitad de un nombre, una palabra que solo parece sufijo o un nombre que es el sufijo", () => {
    expect(nombreCortoProveedor("Marroquinería Surco")).toBe("Marroquinería Surco");
    expect(nombreCortoProveedor("Casa Sacra")).toBe("Casa Sacra");
    expect(nombreCortoProveedor("S.A.C.")).toBe("S.A.C.");
    expect(nombreCortoProveedor("SAC")).toBe("SAC");
    expect(nombreCortoProveedor("Tejidos S.A.C. del Norte")).toBe("Tejidos S.A.C. del Norte");
    expect(nombreCortoProveedor("  Hilos Sur SAC  ")).toBe("Hilos Sur");
  });
});

describe("textoPidelo", () => {
  it("dice a quién, sin el sufijo legal; al Taller, «al Taller»; sin proveedor o archivado, nada", () => {
    expect(textoPidelo({ fuente: "catalogo", id: "x", nombre: "Textil Andino" })).toBe("Pídelo a Textil Andino");
    expect(textoPidelo({ fuente: "compra", id: "x", nombre: "Hilos del Sur" })).toBe("Pídelo a Hilos del Sur");
    expect(textoPidelo({ fuente: "catalogo", id: "x", nombre: "Textiles Andinos del Perú S.A.C." })).toBe("Pídelo a Textiles Andinos del Perú");
    expect(textoPidelo({ fuente: "taller" })).toBe("Pídelo al Taller");
    expect(textoPidelo({ fuente: "ninguno" })).toBeNull();
    expect(textoPidelo({ fuente: "archivado", id: "x", nombre: "Tejidos Wari" })).toBeNull();
  });

  it("el nombre completo va aparte, para el tooltip y el aria-label", () => {
    expect(textoPideloCompleto({ fuente: "catalogo", id: "x", nombre: "Textiles Andinos del Perú S.A.C." })).toBe("Pídelo a Textiles Andinos del Perú S.A.C.");
    expect(textoPideloCompleto({ fuente: "taller" })).toBe("Pídelo al Taller");
    expect(textoPideloCompleto({ fuente: "ninguno" })).toBeNull();
    expect(textoPideloCompleto({ fuente: "archivado", id: "x", nombre: "Tejidos Wari" })).toBeNull();
  });

  it("lo que no tiene a quién dice por qué: sin proveedor (falta elegirlo) o con uno archivado (elige otro)", () => {
    expect(textoSinAQuienPedir({ fuente: "ninguno" })).toEqual({ titulo: "Sin proveedor", detalle: "falta elegirlo en el catálogo" });
    expect(textoSinAQuienPedir({ fuente: "archivado", id: "x", nombre: "Tejidos Wari" })).toEqual({ titulo: "Sin proveedor activo", detalle: "su proveedor está archivado: elige otro" });
    expect(textoSinAQuienPedir({ fuente: "taller" })).toBeNull();
    expect(textoSinAQuienPedir({ fuente: "catalogo", id: "x", nombre: "Textil Andino" })).toBeNull();
  });
});

describe("textoVieneDe: lo que YA viene no se pide otra vez, y se dice de quién", () => {
  const HOY = "2026-10-16";
  const textil = { fuente: "catalogo", id: "x", nombre: "Textiles Andinos del Perú S.A.C." } as const;

  it("de una compra, el proveedor de su última compra sin el sufijo; del Taller, el Taller; del almacén o de otra tienda, así", () => {
    const deCompra = { fuente: "compra", id: "x", nombre: "Textiles Andinos del Perú S.A.C." } as const;
    expect(textoVieneDe([{ de: "compra", cantidad: 24, fecha: "2026-10-20" }], deCompra, HOY)).toBe("Viene de Textiles Andinos del Perú");
    expect(textoVieneDe([{ de: "compra", cantidad: 5, fecha: null }], { fuente: "compra", id: "y", nombre: "Hilos del Sur" }, HOY)).toBe("Viene de Hilos del Sur");
    expect(textoVieneDe([{ de: "taller", cantidad: 15, fecha: null }], { fuente: "ninguno" }, HOY)).toBe("Viene del Taller");
    expect(textoVieneDe([{ de: "almacen", cantidad: 3, fecha: HOY }], textil, HOY)).toBe("Viene de tu almacén");
    expect(textoVieneDe([{ de: "tienda", cantidad: 2, fecha: "2026-10-17" }], textil, HOY)).toBe("Viene de otra tienda");
  });

  it("con varios orígenes, el de más unidades; lo atrasado no cuenta como que viene", () => {
    const llega = [
      { de: "compra" as const, cantidad: 4, fecha: "2026-10-20" },
      { de: "almacen" as const, cantidad: 10, fecha: "2026-10-18" },
      { de: "taller" as const, cantidad: 30, fecha: "2026-09-01" },
    ];
    expect(textoVieneDe(llega, textil, HOY)).toBe("Viene de tu almacén");
  });

  it("el proveedor ANOTADO en la ficha del catálogo no se nombra como de quien viene lo que está en camino: la llegada no trae su proveedor", () => {
    // `textil` es del catálogo (con quien se compra «habitualmente»): si la orden en tránsito es de otro, quien persigue la entrega llamaría al equivocado.
    expect(textoVieneDe([{ de: "compra", cantidad: 24, fecha: "2026-10-20" }], textil, HOY)).toBeNull();
    expect(textoVieneDe([{ de: "compra", cantidad: 24, fecha: null }], textil, HOY)).toBeNull();
    // Lo que no depende del proveedor se sigue diciendo, aunque el modelo solo tenga uno anotado en su ficha.
    expect(textoVieneDe([{ de: "taller", cantidad: 6, fecha: "2026-10-20" }], textil, HOY)).toBe("Viene del Taller");
  });

  it("nada si no se sabe de quién (una compra sin proveedor, o con uno archivado) o si no viene nada a tiempo: nunca se inventa uno", () => {
    expect(textoVieneDe([{ de: "compra", cantidad: 24, fecha: "2026-10-20" }], { fuente: "ninguno" }, HOY)).toBeNull();
    expect(textoVieneDe([{ de: "compra", cantidad: 24, fecha: "2026-10-20" }], { fuente: "archivado", id: "v", nombre: "Tejidos Wari" }, HOY)).toBeNull();
    expect(textoVieneDe([{ de: "compra", cantidad: 24, fecha: "2026-10-20" }], { fuente: "taller" }, HOY)).toBeNull();
    expect(textoVieneDe([{ de: "compra", cantidad: 8, fecha: "2026-10-07" }], textil, HOY)).toBeNull();
    expect(textoVieneDe([], textil, HOY)).toBeNull();
    expect(textoVieneDe([{ de: "compra", cantidad: 0, fecha: "2026-10-20" }], textil, HOY)).toBeNull();
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

describe("textoFuenteDeLaFila: de dónde se sabe, siempre a la vista", () => {
  it("«le compraste la última vez» o «anotado en su ficha»; del Taller, sin proveedor o archivado no dice nada (ya lo dice la fila)", () => {
    expect(textoFuenteDeLaFila({ fuente: "catalogo", id: "x", nombre: "Textil Andino" })).toBe("anotado en su ficha");
    expect(textoFuenteDeLaFila({ fuente: "compra", id: "x", nombre: "Hilos del Sur" })).toBe("le compraste la última vez");
    expect(textoFuenteDeLaFila({ fuente: "taller" })).toBeNull();
    expect(textoFuenteDeLaFila({ fuente: "ninguno" })).toBeNull();
    expect(textoFuenteDeLaFila({ fuente: "archivado", id: "x", nombre: "Tejidos Wari" })).toBeNull();
  });

  it("habla como la tienda: nada de «proveedor del catálogo» (se leía como el catálogo de ventas)", () => {
    for (const f of Object.values(FUENTE_CORTA)) expect(f.toLowerCase()).not.toContain("catálogo de");
    expect(FUENTE_CORTA.catalogo).not.toContain("proveedor del catálogo");
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

  it("un modelo cuyo proveedor está ARCHIVADO cae en «Sin proveedor», con su motivo y el nombre del archivado: no se le recomienda «Pídelo a»", () => {
    const grupos = agruparPorProveedor([quedan("p4", 3), quedan("sin-1", 6), quedan("p1", 8)], proveedores);
    expect(grupos.map((g) => g.nombre)).toEqual(["Textil Andino", "Sin proveedor"]);
    expect(grupos[1]).toMatchObject({ clave: CLAVE_SIN_PROVEEDOR, fuentes: ["ninguno", "archivado"], archivados: ["Confecciones Viejo"] });
    expect(grupos[1]!.modelos.map((m) => m.productoId)).toEqual(["p4", "sin-1"]);
    expect(textoFuentesDelGrupo(grupos[1]!.fuentes)).toBe("falta elegirlo en el catálogo · su proveedor está archivado: elige otro");
    // Solo archivado: el motivo es ese.
    expect(textoFuentesDelGrupo(agruparPorProveedor([quedan("p4", 3)], proveedores)[0]!.fuentes)).toBe("su proveedor está archivado: elige otro");
    // Un proveedor archivado no cuenta como proveedor al que pedirle.
    expect(resumenDeGrupos(agruparPorProveedor([quedan("p4", 3)], proveedores))).toEqual({ proveedores: 0, sinProveedor: 1, modelos: 1 });
  });

  it("cada grupo trae el id del proveedor a quien se le pide (para «Pedir a X»); el Taller y «Sin proveedor» no, y uno archivado tampoco", () => {
    const grupos = agruparPorProveedor([quedan("p1", 2), quedan("sin-1", 0), quedan("p4", 3), quedan("t1", 5, { origen: "taller" }), quedan("pX", 7, { origen: "terceros", proveedorId: TEXTIL })], proveedores);
    expect(Object.fromEntries(grupos.map((g) => [g.clave, g.proveedorId]))).toEqual({ [`p:${TEXTIL}`]: TEXTIL, taller: null, [CLAVE_SIN_PROVEEDOR]: null });
  });

  it("a igual urgencia, el que tiene más modelos; después, por nombre", () => {
    const modelos = [quedan("p2", 4), quedan("p1", 4), quedan("p1", 8, { varianteId: "v-p1-b" }), quedan("p3", 4)];
    expect(agruparPorProveedor(modelos, proveedores).map((g) => g.nombre)).toEqual(["Textil Andino", "CAYLA SAC", "Hilos del Sur"]);
  });

  it("un proveedor que sale de una compra para un modelo y del catálogo para otro es UN grupo y dice las dos fuentes", () => {
    const grupos = agruparPorProveedor([quedan("pX", 5, { origen: "terceros", proveedorId: TEXTIL }), quedan("p1", 7)], proveedores);
    expect(grupos).toHaveLength(1);
    expect(grupos[0]).toMatchObject({ nombre: "Textil Andino", fuentes: ["compra", "catalogo"] });
    expect(textoFuentesDelGrupo(grupos[0]!.fuentes)).toBe("le compraste la última vez · anotado en su ficha");
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
  });

  it("la cabecera del modo «Por proveedor» dice de qué habla («Lo que aún no viene») y cada cifra dice lo cierto", () => {
    expect(resumenCabecera({ proveedores: 5, sinProveedor: 0, modelos: 8 })).toBe("Lo que aún no viene: 8 modelos de 5 proveedores");
    expect(resumenCabecera(resumenDeGrupos(grupos))).toBe("Lo que aún no viene: 3 modelos de 2 proveedores y 2 sin proveedor");
    expect(resumenCabecera({ proveedores: 1, sinProveedor: 0, modelos: 1 })).toBe("Lo que aún no viene: 1 modelo de 1 proveedor");
    expect(resumenCabecera({ proveedores: 0, sinProveedor: 3, modelos: 3 })).toBe("Lo que aún no viene: 3 modelos, todos sin proveedor");
  });

  it("el pie de Hoy: «Pídelas a 2 proveedores · 2 sin proveedor»", () => {
    expect(textoPidelasA(resumenDeGrupos(grupos))).toBe("Pídelas a 2 proveedores · 2 sin proveedor");
    expect(textoPidelasA({ proveedores: 1, sinProveedor: 0 })).toBe("Pídelas a 1 proveedor");
    expect(textoPidelasA({ proveedores: 0, sinProveedor: 4 })).toBe("Falta elegir el proveedor en el catálogo");
    expect(textoPidelasA({ proveedores: 0, sinProveedor: 0 })).toBeNull();
  });

  it("lo de cada proveedor: cuántos modelos, cuántos agotados, y de dónde se sabe", () => {
    expect(textoModelosDelGrupo(grupos[0]!)).toBe("2 modelos · 1 agotado");
    expect(textoModelosDelGrupo({ modelos: [quedan("a", 5)], agotados: 0 })).toBe("1 modelo");
    expect(textoModelosDelGrupo({ modelos: [quedan("a", 0), quedan("b", 0), quedan("c", 3)], agotados: 2 })).toBe("3 modelos · 2 agotados");
    expect(textoFuentesDelGrupo(["catalogo"])).toBe("anotado en su ficha");
    expect(textoFuentesDelGrupo(["ninguno"])).toBe("falta elegirlo en el catálogo");
    expect(textoFuentesDelGrupo(["taller"])).toBe("lo hace el Taller de CAYLA");
    expect(textoFuentesDelGrupo([])).toBe("");
  });
});

describe("repartirGrupos: el tope de 4 es de quienes se les pide; «Sin proveedor» con un agotado siempre se ve", () => {
  const g = (clave: string, agotados = 0) => ({ clave, agotados });
  const reales = (n: number) => Array.from({ length: n }, (_, i) => g(`p:${i}`));
  const claves = (xs: readonly { clave: string }[]) => xs.map((x) => x.clave);

  it("con 6 proveedores: 4 a la vista, 2 tras «Ver más»; «Sin proveedor» con un agotado queda fuera de las dos listas y SIEMPRE se ve (fijo)", () => {
    const r = repartirGrupos([...reales(6), g(CLAVE_SIN_PROVEEDOR, 1)]);
    expect(claves(r.visibles)).toEqual(["p:0", "p:1", "p:2", "p:3"]);
    expect(claves(r.resto)).toEqual(["p:4", "p:5"]);
    expect(r.fijo?.clave).toBe(CLAVE_SIN_PROVEEDOR);
  });

  it("sin ningún agotado, «Sin proveedor» sigue la suerte de los demás: plegado al final de lo plegado, o a la vista si no hay nada plegado", () => {
    const con6 = repartirGrupos([...reales(6), g(CLAVE_SIN_PROVEEDOR)]);
    expect(claves(con6.resto)).toEqual(["p:4", "p:5", CLAVE_SIN_PROVEEDOR]);
    expect(con6.fijo).toBeNull();
    const con4 = repartirGrupos([...reales(4), g(CLAVE_SIN_PROVEEDOR)]);
    expect(claves(con4.visibles)).toEqual(["p:0", "p:1", "p:2", "p:3"]);
    expect(con4.resto).toEqual([]);
    expect(con4.fijo?.clave).toBe(CLAVE_SIN_PROVEEDOR);
  });

  it("no cuenta para el tope: 4 proveedores y «Sin proveedor» no producen un «Ver 1 más»", () => {
    const r = repartirGrupos([...reales(4), g(CLAVE_SIN_PROVEEDOR, 2)]);
    expect(r.resto).toEqual([]);
    expect(claves(r.visibles)).toHaveLength(4);
    expect(r.fijo?.agotados).toBe(2);
  });

  it("solo «Sin proveedor», o ninguno: nada se pierde", () => {
    expect(repartirGrupos([g(CLAVE_SIN_PROVEEDOR, 1)])).toEqual({ visibles: [], resto: [], fijo: g(CLAVE_SIN_PROVEEDOR, 1) });
    expect(repartirGrupos([])).toEqual({ visibles: [], resto: [], fijo: null });
    const sinNada = repartirGrupos(reales(3));
    expect(sinNada.fijo).toBeNull();
    expect(claves(sinNada.visibles)).toHaveLength(3);
  });

  it("con las filas reales de agruparPorProveedor no se pierde ni se repite ningún grupo", () => {
    const delCatalogo: Record<string, string> = {};
    const nombres: ProveedoresAnalisis["nombres"] = {};
    for (let i = 0; i < 7; i++) {
      nombres[`prov-${i}`] = { nombre: `Proveedor ${i}`, activo: i !== 6 };
      delCatalogo[`m${i}`] = `prov-${i}`;
    }
    const grupos = agruparPorProveedor([...Array.from({ length: 7 }, (_, i) => quedan(`m${i}`, i + 1)), quedan("suelto", 0)], { nombres, delCatalogo });
    const r = repartirGrupos(grupos);
    const todas = [...r.visibles, ...r.resto, ...(r.fijo ? [r.fijo] : [])].map((x) => x.clave).sort();
    expect(todas).toEqual(grupos.map((x) => x.clave).sort());
    // El proveedor archivado (m6) y el suelto, agotado, comparten el grupo «Sin proveedor», que se ve siempre.
    expect(r.fijo?.modelos.map((m) => m.productoId).sort()).toEqual(["m6", "suelto"]);
    expect(r.visibles).toHaveLength(4);
    expect(r.resto).toHaveLength(2);
  });
});
