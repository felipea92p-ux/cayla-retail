import { describe, expect, it } from "vitest";
import { problemasReporte } from "./danadas-reglas";
import {
  asiQueda,
  faltanHasta,
  maxCantidad,
  mejorOrigen,
  motivoParaLaBase,
  motivosDeAjuste,
  pasoCompleto,
  pasosDe,
  quedaTrasAjuste,
  resumenDeFlujo,
  textoHecho,
  verboFinal,
  type ContextoFlujo,
  type TipoFlujo,
} from "./existencias-flujos";

const CTX: ContextoFlujo = {
  piso: 2,
  almacen: 5,
  separa: true,
  almacenPorTalla: { v1: 5, v2: 0, v3: 2 },
  destinos: [{ id: "lim", nombre: "Tienda Lima" }],
  origenes: [
    { id: "lim", nombre: "Tienda Lima", cantidad: 3 },
    { id: "aqp", nombre: "Tienda Arequipa", cantidad: 0 },
  ],
  puedePedirParaCliente: true,
  responsableListo: true,
};

describe("pasos de cada acción", () => {
  it("son los de la maqueta, con los ajustes del sistema", () => {
    expect(pasosDe("colgar", {}, CTX)).toEqual(["cantidad", "quien"]);
    expect(pasosDe("colgarVarias", {}, CTX)).toEqual(["varias", "quien"]);
    expect(pasosDe("subir", {}, CTX)).toEqual(["cantidad", "destino", "quien"]);
    expect(pasosDe("subir", {}, { ...CTX, destinos: [] })).toEqual(["cantidad", "quien"]);
    expect(pasosDe("enviar", {}, CTX)).toEqual(["cantidad", "hacia"]);
    expect(pasosDe("pedir", { para: "reponer" }, CTX)).toEqual(["para", "origen", "cantidad", "quien"]);
    expect(pasosDe("pedir", { para: "cliente" }, CTX)).toEqual(["para", "origen", "cliente", "quien"]);
    expect(pasosDe("ajustar", {}, CTX)).toEqual(["lugar", "cambio", "motivo", "quien"]);
    expect(pasosDe("ajustar", {}, { ...CTX, separa: false })).toEqual(["cambio", "motivo", "quien"]);
    expect(pasosDe("danada", {}, CTX)).toEqual(["lugar", "cantidad", "quetiene", "quien"]);
  });
});

describe("¿Cuántas? nunca pasa de lo que hay donde se saca", () => {
  const tope = (tipo: TipoFlujo, d = {}) => maxCantidad(tipo, d, CTX);
  it("colgar y enviar salen del almacén; subir, del piso; pedir, de la otra sede; dañada, del lugar", () => {
    expect(tope("colgar")).toBe(5);
    expect(tope("enviar")).toBe(5);
    expect(tope("subir")).toBe(2);
    expect(tope("pedir", { origenId: "lim" })).toBe(3);
    expect(tope("danada", { lugar: "almacen" })).toBe(5);
    expect(tope("danada", { lugar: "piso" })).toBe(2);
  });
  it("un número mayor deja el paso incompleto", () => {
    expect(pasoCompleto("cantidad", "colgar", { n: 5 }, CTX)).toBe(true);
    expect(pasoCompleto("cantidad", "colgar", { n: 6 }, CTX)).toBe(false);
    expect(pasoCompleto("cantidad", "colgar", { n: 0 }, CTX)).toBe(false);
  });
});

describe("cuándo un paso está completo", () => {
  it("varias: algo puesto y nada más de lo que hay en el almacén de cada talla", () => {
    expect(pasoCompleto("varias", "colgarVarias", { cant: { v1: 2 } }, CTX)).toBe(true);
    expect(pasoCompleto("varias", "colgarVarias", { cant: { v1: 2, v3: 3 } }, CTX)).toBe(false);
    expect(pasoCompleto("varias", "colgarVarias", { cant: {} }, CTX)).toBe(false);
  });
  it("destino: se queda, o para enviar con sede", () => {
    expect(pasoCompleto("destino", "subir", { destino: "queda" }, CTX)).toBe(true);
    expect(pasoCompleto("destino", "subir", { destino: "enviar" }, CTX)).toBe(false);
    expect(pasoCompleto("destino", "subir", { destino: "enviar", sedeId: "lim" }, CTX)).toBe(true);
  });
  it("origen: una sede que tenga", () => {
    expect(pasoCompleto("origen", "pedir", { origenId: "lim" }, CTX)).toBe(true);
    expect(pasoCompleto("origen", "pedir", { origenId: "aqp" }, CTX)).toBe(false);
  });
  it("cliente: nombres, apellidos y un celular de 9 dígitos que empieza en 9", () => {
    expect(pasoCompleto("cliente", "pedir", { nombres: "Ana", apellidos: "Ruiz", celular: "987654321" }, CTX)).toBe(true);
    expect(pasoCompleto("cliente", "pedir", { nombres: "Ana", apellidos: "Ruiz", celular: "887654321" }, CTX)).toBe(false);
    expect(pasoCompleto("cliente", "pedir", { nombres: "Ana", celular: "987654321" }, CTX)).toBe(false);
  });
  it("para: pedir para un cliente solo si se puede", () => {
    expect(pasoCompleto("para", "pedir", { para: "cliente" }, { ...CTX, puedePedirParaCliente: false })).toBe(false);
    expect(pasoCompleto("para", "pedir", { para: "reponer" }, CTX)).toBe(true);
  });
  it("cambio: quitar no deja negativo el lugar; sumar no tiene tope", () => {
    expect(pasoCompleto("cambio", "ajustar", { lugar: "piso", signo: "quitar", n: 2 }, CTX)).toBe(true);
    expect(pasoCompleto("cambio", "ajustar", { lugar: "piso", signo: "quitar", n: 3 }, CTX)).toBe(false);
    expect(pasoCompleto("cambio", "ajustar", { lugar: "piso", signo: "sumar", n: 30 }, CTX)).toBe(true);
  });
  it("motivo: «Se dañó» nunca completa (lleva a reportar), y Encontré u Otro piden nota", () => {
    const d = { lugar: "almacen" as const, signo: "sumar" as const };
    expect(pasoCompleto("motivo", "ajustar", { ...d, motivo: "encontre" }, CTX)).toBe(false);
    expect(pasoCompleto("motivo", "ajustar", { ...d, motivo: "encontre", nota: "en la repisa" }, CTX)).toBe(true);
    expect(pasoCompleto("motivo", "ajustar", { lugar: "piso", signo: "quitar", motivo: "se_dano" }, CTX)).toBe(false);
    expect(pasoCompleto("motivo", "ajustar", { lugar: "piso", signo: "quitar", motivo: "no_aparece" }, CTX)).toBe(true);
  });
  it("quién: el responsable elegido", () => {
    expect(pasoCompleto("quien", "colgar", {}, { ...CTX, responsableListo: false })).toBe(false);
  });
});

describe("Encontré solo en el almacén donde se separa piso y almacén", () => {
  it("en el piso de una tienda no se ofrece; en el Taller sí", () => {
    expect(motivosDeAjuste("sumar", "piso", true).map((m) => m.clave)).not.toContain("encontre");
    expect(motivosDeAjuste("sumar", "almacen", true).map((m) => m.clave)).toContain("encontre");
    expect(motivosDeAjuste("sumar", undefined, false).map((m) => m.clave)).toContain("encontre");
  });
  it("un motivo que ya no se ofrece (cambió el lugar) deja el paso incompleto", () => {
    expect(pasoCompleto("motivo", "ajustar", { lugar: "piso", signo: "sumar", motivo: "encontre", nota: "en la repisa" }, CTX)).toBe(false);
  });
});

describe("los motivos viajan como los cuatro de la base", () => {
  it("cada uno a su motivo y su nota", () => {
    expect(motivoParaLaBase("encontre", " repisa ")).toEqual({ motivo: "reposicion", nota: "repisa" });
    expect(motivoParaLaBase("no_aparece", "")).toEqual({ motivo: "merma", nota: "" });
    expect(motivoParaLaBase("conte_mas", "")).toEqual({ motivo: "conteo_fisico", nota: "" });
    expect(motivoParaLaBase("error_cobro", "")).toEqual({ motivo: "otro", nota: "Error al cobrar" });
    expect(motivoParaLaBase("uso_interno", "vitrina")).toEqual({ motivo: "otro", nota: "Uso interno: vitrina" });
  });
});

describe("Falta, el botón final y el resumen", () => {
  it("Falta lista solo lo incompleto hasta el paso de ahora", () => {
    expect(faltanHasta("pedir", 1, { para: "reponer" }, CTX)).toEqual(["origen"]);
    expect(faltanHasta("pedir", 0, { para: "reponer" }, CTX)).toEqual([]);
  });
  it("el verbo dice qué y cuánto", () => {
    expect(verboFinal("colgar", { n: 3 })).toBe("Colgar 3");
    expect(verboFinal("colgarVarias", { cant: { v1: 2, v3: 1 } })).toBe("Colgar 3 unidades");
    expect(verboFinal("subir", { n: 2, destino: "enviar" })).toBe("Subir 2 para enviar");
    expect(verboFinal("subir", { n: 1, destino: "queda" })).toBe("Subir 1 a almacén");
    expect(verboFinal("enviar", { n: 1 }, "Tienda Lima")).toBe("Armar el traslado a Tienda Lima");
    expect(verboFinal("pedir", { para: "cliente" })).toBe("Pedir y apartar");
  });
  it("el resumen y lo que queda tras ajustar", () => {
    expect(resumenDeFlujo("colgar", { n: 2 }, CTX)).toEqual([
      ["Al piso", "2 unidades"],
      ["Queda en almacén", "3"],
    ]);
    expect(quedaTrasAjuste({ lugar: "piso", signo: "quitar", n: 1 }, CTX)).toBe(1);
    expect(quedaTrasAjuste({ lugar: "almacen", signo: "sumar", n: 2 }, CTX)).toBe(7);
    expect(textoHecho("colgar", { n: 1 })).toBe("Colgado · 1 unidad al piso");
  });
});

describe("a qué tienda pedir", () => {
  const sedes = [
    { id: "lim", nombre: "Tienda Lima" },
    { id: "aqp", nombre: "Tienda Arequipa" },
  ];
  it("la que más tiene, entre las tiendas a las que se puede pedir", () => {
    expect(mejorOrigen([{ sede: "Lima", ubicacionId: "lim", cantidad: 1 }, { sede: "Arequipa", ubicacionId: "aqp", cantidad: 3 }], sedes)?.id).toBe("aqp");
  });
  it("el Taller no cuenta, y sin nadie que tenga es null", () => {
    expect(mejorOrigen([{ sede: "Taller", ubicacionId: "taller", cantidad: 9 }], sedes)).toBeNull();
    expect(mejorOrigen(undefined, sedes)).toBeNull();
  });
});

describe("Reportar dañada pregunta a su validación de siempre (no inventa reglas)", () => {
  it("cada paso está completo si y solo si problemasReporte no tiene problema en su campo, en todas las combinaciones", () => {
    let n = 0;
    for (const [piso, almacen] of [[0, 0], [2, 0], [0, 3], [1, 1]])
      for (const lugar of [undefined, "piso", "almacen"] as const)
        for (const cantidad of [0, 1, 2, 3])
          for (const nota of ["", "ab", "Mancha", "x".repeat(201)]) {
            const c = { ...CTX, piso, almacen };
            const d = { lugar, n: cantidad, nota };
            const problemas = problemasReporte({ talla: { varianteId: "", talla: null, piso, almacen }, desde: lugar ?? null, cantidad, motivo: nota }).map((p) => p.campo);
            expect(pasoCompleto("lugar", "danada", d, c)).toBe(!problemas.includes("desde"));
            expect(pasoCompleto("cantidad", "danada", d, c)).toBe(!problemas.includes("cantidad"));
            expect(pasoCompleto("quetiene", "danada", d, c)).toBe(!problemas.includes("motivo"));
            n++;
          }
    expect(n).toBe(4 * 3 * 4 * 4);
  });
});

describe("asiQueda: el paso Colgar / Subir dice cómo queda cada lado", () => {
  it("colgar saca del almacén y suma al piso", () => {
    expect(asiQueda("colgar", 2, { piso: 0, almacen: 3 })).toEqual({ de: { lugar: "almacen", antes: 3, despues: 1 }, a: { lugar: "piso", antes: 0, despues: 2 } });
  });
  it("subir hace lo contrario", () => {
    expect(asiQueda("subir", 1, { piso: 2, almacen: 0 })).toEqual({ de: { lugar: "piso", antes: 2, despues: 1 }, a: { lugar: "almacen", antes: 0, despues: 1 } });
  });
  it("en otros pasos no hay viaje que dibujar", () => {
    expect(asiQueda("enviar", 1, { piso: 1, almacen: 1 })).toBeNull();
  });
});
