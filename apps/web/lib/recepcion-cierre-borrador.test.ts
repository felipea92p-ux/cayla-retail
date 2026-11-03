import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  borrarBorradorDelCierre,
  conCostosDecididos,
  conLoDecidido,
  costosCambiados,
  costosDeCombinacionCambiados,
  decisionCambiada,
  estabaEnCerrar,
  FOTO_VACIA,
  guardarBorradorDelCierre,
  hayAlgoDecidido,
  leerBorradorDelCierre,
  recordarEnCerrar,
  type FotoDelCierre,
} from "./recepcion-cierre-borrador";
import { DECISION_VACIA, type DecisionCierre } from "./recepcion-conteo-reglas";

const CLAVE = "cayla:recibir-cierre:e1";

function almacen() {
  const datos = new Map<string, string>();
  return {
    datos,
    getItem: (k: string) => datos.get(k) ?? null,
    setItem: (k: string, v: string) => void datos.set(k, v),
    removeItem: (k: string) => void datos.delete(k),
  };
}

let local: ReturnType<typeof almacen>;
let sesion: ReturnType<typeof almacen>;

beforeEach(() => {
  local = almacen();
  sesion = almacen();
  vi.stubGlobal("window", { localStorage: local, sessionStorage: sesion });
});
afterEach(() => vi.unstubAllGlobals());

const inicial: DecisionCierre = { ...DECISION_VACIA, costo: "30.00" };
const conCausa: FotoDelCierre = { ...FOTO_VACIA, decisiones: { "item:l1": { faltanteCausa: "no_vino" } } };

describe("lo que se guarda: solo lo que la persona cambió", () => {
  it("una decisión guarda los campos que cambiaron, nunca la confirmación del costo", () => {
    expect(decisionCambiada(inicial, inicial)).toEqual({});
    expect(decisionCambiada(inicial, { ...inicial, faltanteCausa: "no_vino" })).toEqual({ faltanteCausa: "no_vino" });
    expect(decisionCambiada(inicial, { ...inicial, costo: "35.00", confirmaCosto: true })).toEqual({ costo: "35.00" });
  });

  it("si la base trae otro costo mañana, manda la base: lo que no se tocó no se guarda", () => {
    const decidido = decisionCambiada(inicial, { ...inicial, faltanteCausa: "no_vino" });
    expect(conLoDecidido({ ...DECISION_VACIA, costo: "45.00" }, decidido)).toEqual({ ...DECISION_VACIA, costo: "45.00", faltanteCausa: "no_vino" });
  });

  it("sin nada decidido en la línea, queda lo que trae", () => {
    expect(conLoDecidido(inicial, undefined)).toBe(inicial);
  });

  it("el costo propio de una prenda: solo el distinto, y se pone encima de lo que trae", () => {
    const iniciales = { "item:l1": { p1: "30.00", p2: "31.00" } };
    const ahora = { "item:l1": { p1: "30.00", p2: "33.00" }, "item:l2": { p3: "12.00" } };
    expect(costosCambiados(iniciales, ahora)).toEqual({ "item:l1": { p2: "33.00" }, "item:l2": { p3: "12.00" } });
    expect(costosCambiados(iniciales, iniciales)).toEqual({});
    expect(conCostosDecididos(iniciales, { "item:l1": { p2: "33.00" } })).toEqual({ "item:l1": { p1: "30.00", p2: "33.00" } });
  });

  it("el costo por combinación se recuerda entero, y no se recuerda si es el que venía", () => {
    expect(costosDeCombinacionCambiados({ v1: 30 }, { v1: 30 })).toBeNull();
    expect(costosDeCombinacionCambiados({ v1: 30 }, { v1: 35 })).toEqual({ v1: 35 });
    expect(costosDeCombinacionCambiados({ v1: 30 }, {})).toEqual({});
  });

  it("dice si hay algo decidido", () => {
    expect(hayAlgoDecidido(FOTO_VACIA)).toBe(false);
    expect(hayAlgoDecidido({ ...FOTO_VACIA, decisiones: { "item:l1": {} } })).toBe(false);
    expect(hayAlgoDecidido(conCausa)).toBe(true);
    expect(hayAlgoDecidido({ ...FOTO_VACIA, nota: "Llegó en dos bolsas" })).toBe(true);
    expect(hayAlgoDecidido({ ...FOTO_VACIA, guia: "T001-1" })).toBe(true);
    expect(hayAlgoDecidido({ ...FOTO_VACIA, cambiosPrecio: { v1: { valor: 99, valeEn: "sede" } } })).toBe(true);
    expect(hayAlgoDecidido({ ...FOTO_VACIA, duenoId: "e1" })).toBe(true);
  });
});

describe("guardar y volver a leer", () => {
  it("lo guardado vuelve igual", () => {
    const foto: FotoDelCierre = {
      decisiones: { "item:l1": { faltanteCausa: "no_vino", costo: "35.00" }, "item:l2": { sobranteCausa: "otro", nota: "Una muestra" } },
      costosPrenda: { "item:l1": { p1: "40.00" } },
      cambiosCosto: { v1: 41.5 },
      cambiosPrecio: { v1: { valor: 99.9, valeEn: "todas" } },
      nota: "Llegó en dos bolsas",
      guia: "T001-000342",
      proveedorId: "p1",
      duenoId: "e1",
    };
    expect(guardarBorradorDelCierre("e1", 0, foto)).toBe(true);
    expect(leerBorradorDelCierre("e1", 0)).toEqual(foto);
  });

  it("cada envío tiene el suyo", () => {
    guardarBorradorDelCierre("e1", 0, conCausa);
    expect(leerBorradorDelCierre("e2", 0)).toBeNull();
  });

  it("sin nada decidido no se guarda, y volver a dejarlo como venía borra lo que había", () => {
    guardarBorradorDelCierre("e1", 0, conCausa);
    expect(local.datos.has(CLAVE)).toBe(true);
    guardarBorradorDelCierre("e1", 0, FOTO_VACIA);
    expect(local.datos.has(CLAVE)).toBe(false);
  });

  it("se puede borrar al cerrar", () => {
    guardarBorradorDelCierre("e1", 0, conCausa);
    borrarBorradorDelCierre("e1");
    expect(leerBorradorDelCierre("e1", 0)).toBeNull();
  });

  it("lo de otra vuelta no vale: se cerró o se reabrió en otro aparato", () => {
    guardarBorradorDelCierre("e1", 0, conCausa);
    expect(leerBorradorDelCierre("e1", 2)).toBeNull();
    expect(local.datos.has(CLAVE)).toBe(false);
  });

  it("uno olvidado se deja de ofrecer a las dos semanas", () => {
    const ahora = Date.parse("2026-11-03T12:00:00Z");
    guardarBorradorDelCierre("e1", 0, conCausa, ahora);
    expect(leerBorradorDelCierre("e1", 0, ahora + 13 * 86_400_000)).toEqual(conCausa);
    expect(leerBorradorDelCierre("e1", 0, ahora + 15 * 86_400_000)).toBeNull();
    expect(local.datos.has(CLAVE)).toBe(false);
  });
});

describe("lo leído se valida: uno viejo o a medias no rompe la pantalla", () => {
  const guardadoCrudo = (foto: unknown, extra: Record<string, unknown> = {}) => local.setItem(CLAVE, JSON.stringify({ v: 1, generacion: 0, guardadoEn: Date.now(), foto, ...extra }));

  it("JSON roto, otra versión o sin foto: nada", () => {
    local.setItem(CLAVE, "{roto");
    expect(leerBorradorDelCierre("e1", 0)).toBeNull();
    guardadoCrudo(conCausa, { v: 99 });
    expect(leerBorradorDelCierre("e1", 0)).toBeNull();
    guardadoCrudo(null);
    expect(leerBorradorDelCierre("e1", 0)).toBeNull();
    guardadoCrudo(FOTO_VACIA);
    expect(leerBorradorDelCierre("e1", 0)).toBeNull();
  });

  it("lo que no se entiende se deja afuera, y lo demás se conserva", () => {
    guardadoCrudo({
      decisiones: { "item:l1": { faltanteCausa: "no_vino", costo: 35, nota: 7 }, "item:l2": "basura" },
      costosPrenda: { "item:l1": { p1: "40.00", p2: 9 }, "item:l2": 3 },
      cambiosCosto: { v1: -3, v2: 12, v3: "x" },
      cambiosPrecio: { v1: { valor: 10, valeEn: "marte" }, v2: { valor: 20, valeEn: "sede" }, v3: 8 },
      nota: 12,
      guia: 8,
      proveedorId: null,
    });
    expect(leerBorradorDelCierre("e1", 0)).toEqual({
      decisiones: { "item:l1": { faltanteCausa: "no_vino" } },
      costosPrenda: { "item:l1": { p1: "40.00" } },
      cambiosCosto: { v2: 12 },
      cambiosPrecio: { v2: { valor: 20, valeEn: "sede" } },
      nota: "",
      guia: null,
      proveedorId: "",
      duenoId: "",
    });
  });
});

describe("nunca rompe la pantalla si el navegador no deja", () => {
  it("con el almacén bloqueado, leer no encuentra nada y guardar dice que no guardó", () => {
    const bloqueado = {
      getItem: () => {
        throw new Error("bloqueado");
      },
      setItem: () => {
        throw new Error("lleno");
      },
      removeItem: () => {
        throw new Error("bloqueado");
      },
    };
    vi.stubGlobal("window", { localStorage: bloqueado, sessionStorage: bloqueado });
    expect(leerBorradorDelCierre("e1", 0)).toBeNull();
    expect(guardarBorradorDelCierre("e1", 0, conCausa)).toBe(false);
    expect(() => borrarBorradorDelCierre("e1")).not.toThrow();
    expect(estabaEnCerrar("e1")).toBe(false);
    expect(() => recordarEnCerrar("e1", true)).not.toThrow();
  });

  it("en el servidor no hay nada", () => {
    vi.unstubAllGlobals();
    expect(leerBorradorDelCierre("e1", 0)).toBeNull();
    expect(estabaEnCerrar("e1")).toBe(false);
  });
});

describe("volver a Cerrar al recargar: por pestaña", () => {
  it("recuerda y olvida", () => {
    expect(estabaEnCerrar("e1")).toBe(false);
    recordarEnCerrar("e1", true);
    expect(estabaEnCerrar("e1")).toBe(true);
    expect(estabaEnCerrar("e2")).toBe(false);
    recordarEnCerrar("e1", false);
    expect(estabaEnCerrar("e1")).toBe(false);
  });
});
