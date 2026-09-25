import { describe, expect, it } from "vitest";
import { claveCola, colaValida, conOperacion, esOperacionEncolada, nombreEnCola, nuevaOperacion, porSubir, reconciliar, sinOperacion, subidasEntre, type OperacionEncolada } from "./cola-offline";

// La cola sin conexión genérica (ADR-0207): que un reintento del mismo guardado sea UNA fila, que la firma quede con
// la hora en que se hizo, que lo encolado a mitad de una subida sobreviva, y que lo leído del navegador no ejecute
// una RPC fuera de la lista blanca.

const RPCS = ["recibir_envio", "recibir_lote"] as const;

function op(token: string, extra: Partial<OperacionEncolada> = {}): OperacionEncolada {
  return { token, rpc: "recibir_lote", params: { p_token: token }, firma: null, creadoEn: "2026-09-25T15:00:00.000Z", resumen: "3 unidades", rechazo: null, ...extra };
}

describe("claveCola", () => {
  it("una llave por módulo, fuera del espacio de Vender", () => {
    expect(claveCola("recibir")).toBe("cayla:recibir:cola");
  });
});

describe("nuevaOperacion", () => {
  it("congela la firma con la hora en que se hizo (x-momento), no la de la subida", () => {
    const ahora = new Date("2026-09-25T10:30:00.000Z");
    const o = nuevaOperacion({ token: "t1", rpc: "recibir_lote", params: {}, firma: { responsableId: "p1", ubicacionId: "u1" }, resumen: "x", ahora });
    expect(o.creadoEn).toBe("2026-09-25T10:30:00.000Z");
    expect(o.firma).toEqual({ responsableId: "p1", ubicacionId: "u1", momento: "2026-09-25T10:30:00.000Z" });
    expect(o.rechazo).toBeNull();
  });

  it("sin firma, sigue sin firma", () => {
    expect(nuevaOperacion({ token: "t1", rpc: "recibir_lote", params: {}, firma: null, resumen: "x" }).firma).toBeNull();
  });
});

describe("conOperacion / sinOperacion", () => {
  it("el mismo token reemplaza, nunca duplica", () => {
    const cola = conOperacion(conOperacion([], op("a")), op("a", { resumen: "otra" }));
    expect(cola).toHaveLength(1);
    expect(cola[0].resumen).toBe("otra");
  });

  it("un token nuevo se agrega al final", () => {
    expect(conOperacion([op("a")], op("b")).map((x) => x.token)).toEqual(["a", "b"]);
  });

  it("descartar quita solo esa", () => {
    expect(sinOperacion([op("a"), op("b")], "a").map((x) => x.token)).toEqual(["b"]);
  });
});

describe("porSubir", () => {
  it("una rechazada por la base no se reintenta sola", () => {
    expect(porSubir([op("a"), op("b", { rechazo: "No existe el proveedor" })]).map((x) => x.token)).toEqual(["a"]);
  });
});

describe("reconciliar", () => {
  it("lo que subió sale, lo rechazado queda con su motivo", () => {
    const rechazada = op("b", { rechazo: "Sin permiso" });
    const final = reconciliar([op("a"), op("b")], new Map([["a", null], ["b", rechazada]]));
    expect(final).toEqual([rechazada]);
  });

  it("lo encolado a mitad de la subida sobrevive", () => {
    const final = reconciliar([op("a"), op("nueva")], new Map([["a", null]]));
    expect(final.map((x) => x.token)).toEqual(["nueva"]);
  });

  it("lo que sigue sin red (no resuelto) queda igual", () => {
    expect(reconciliar([op("a")], new Map())).toEqual([op("a")]);
  });
});

describe("nombreEnCola", () => {
  const alta = (token: string, nombre: string, extra: Partial<OperacionEncolada> = {}) =>
    op(token, { rpc: "crear_producto_con_variantes", params: { p_referencia: nombre, p_token: token }, ...extra });

  it("encuentra el mismo nombre sin importar mayúsculas ni tildes", () => {
    expect(nombreEnCola([alta("a", "Blusa Aurora")], "blusa aurora")).toBe(true);
    expect(nombreEnCola([alta("a", "Pantalón Mía")], "Pantalon Mia")).toBe(true);
  });

  it("otro nombre, o uno ya rechazado, no cuenta", () => {
    expect(nombreEnCola([alta("a", "Blusa Aurora")], "Blusa Sofía")).toBe(false);
    expect(nombreEnCola([alta("a", "Blusa Aurora", { rechazo: "Ya existe" })], "Blusa Aurora")).toBe(false);
  });

  it("un nombre vacío nunca choca", () => {
    expect(nombreEnCola([alta("a", "")], "")).toBe(false);
  });
});

describe("subidasEntre", () => {
  it("lo que esperaba y ya no está, subió", () => {
    expect(subidasEntre([op("a"), op("b")], [op("b")]).map((x) => x.token)).toEqual(["a"]);
  });

  it("descartar una rechazada no es una subida", () => {
    expect(subidasEntre([op("a", { rechazo: "Sin permiso" })], [])).toEqual([]);
  });

  it("lo que pasó a rechazada sigue en la cola: no subió", () => {
    expect(subidasEntre([op("a")], [op("a", { rechazo: "Sin permiso" })])).toEqual([]);
  });
});

describe("esOperacionEncolada / colaValida", () => {
  it("acepta una operación bien formada de la lista blanca", () => {
    expect(esOperacionEncolada(op("a"), RPCS)).toBe(true);
  });

  it("lo guardado en el navegador no ejecuta una RPC fuera de la lista blanca", () => {
    expect(esOperacionEncolada(op("a", { rpc: "registrar_movimiento" }), RPCS)).toBe(false);
  });

  it("descarta filas rotas y sin token", () => {
    expect(esOperacionEncolada(op("", {}), RPCS)).toBe(false);
    expect(esOperacionEncolada({ token: "a" }, RPCS)).toBe(false);
    expect(esOperacionEncolada(null, RPCS)).toBe(false);
  });

  it("una cola corrupta se lee como vacía, nunca revienta", () => {
    expect(colaValida("no es una lista", RPCS)).toEqual([]);
    expect(colaValida([op("a"), 42, op("b", { rpc: "otra" })], RPCS).map((x) => x.token)).toEqual(["a"]);
  });
});
