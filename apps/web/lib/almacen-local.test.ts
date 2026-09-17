import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { borrar, claveLocal, guardar, leer } from "./almacen-local";

// El ticket en espera vive en localStorage por sede, y la cola offline va a vivir en el
// mismo módulo. Lo que estas pruebas fijan: el nombre de la llave (si cambia, cada tienda
// «pierde» sus tickets), que en el servidor no reviente ni devuelva basura, y que un
// storage lleno o bloqueado (modo privado, cuota) degrade a «no se guardó» — nunca a una
// excepción en medio de una venta.

type Falso = { datos: Record<string, string>; fallaAlGuardar?: boolean };

function storageFalso(f: Falso): Storage {
  return {
    getItem: (k) => (k in f.datos ? f.datos[k] : null),
    setItem: (k, v) => {
      if (f.fallaAlGuardar) throw new DOMException("QuotaExceededError");
      f.datos[k] = v;
    },
    removeItem: (k) => {
      delete f.datos[k];
    },
    clear: () => {
      f.datos = {};
    },
    key: () => null,
    get length() {
      return Object.keys(f.datos).length;
    },
  };
}

const ORIGINAL = { window: (globalThis as { window?: unknown }).window, localStorage: (globalThis as { localStorage?: unknown }).localStorage };

function enNavegador(f: Falso) {
  (globalThis as { window?: unknown }).window = globalThis;
  (globalThis as { localStorage?: unknown }).localStorage = storageFalso(f);
}

afterEach(() => {
  (globalThis as { window?: unknown }).window = ORIGINAL.window;
  (globalThis as { localStorage?: unknown }).localStorage = ORIGINAL.localStorage;
});

describe("claveLocal — una llave por sede y por uso", () => {
  it("lleva el namespace de Vender, la sede y el nombre", () => {
    expect(claveLocal("2e84911d-f104-41b0-8e89-daabde90797f", "en-espera")).toBe("cayla:vender:2e84911d-f104-41b0-8e89-daabde90797f:en-espera");
  });
  it("dos sedes no comparten llave", () => {
    expect(claveLocal("a", "en-espera")).not.toBe(claveLocal("b", "en-espera"));
  });
});

describe("en el servidor (sin window)", () => {
  beforeEach(() => {
    delete (globalThis as { window?: unknown }).window;
    delete (globalThis as { localStorage?: unknown }).localStorage;
  });
  it("leer devuelve el valor por defecto y no revienta", () => {
    expect(leer("cayla:vender:x:en-espera", [])).toEqual([]);
  });
  it("guardar dice que no guardó, sin lanzar", () => {
    expect(guardar("cayla:vender:x:en-espera", [1])).toBe(false);
    expect(() => borrar("cayla:vender:x:en-espera")).not.toThrow();
  });
});

describe("en el navegador", () => {
  it("guarda y lee el mismo valor, como JSON", () => {
    const f: Falso = { datos: {} };
    enNavegador(f);
    const ticket = [{ id: "t1", carrito: [{ sku: "BLU-EMMA-BEI-S", cantidad: 2 }], nota: "Lo recoge el sábado" }];
    expect(guardar("cayla:vender:x:en-espera", ticket)).toBe(true);
    expect(leer("cayla:vender:x:en-espera", [])).toEqual(ticket);
  });
  it("una llave que no existe devuelve el valor por defecto", () => {
    enNavegador({ datos: {} });
    expect(leer("cayla:vender:x:en-espera", [])).toEqual([]);
  });
  it("un JSON roto en el storage no rompe la venta: devuelve el valor por defecto", () => {
    enNavegador({ datos: { "cayla:vender:x:en-espera": "{esto no es json" } });
    expect(leer("cayla:vender:x:en-espera", [])).toEqual([]);
  });
  it("con el storage lleno o bloqueado, guardar devuelve false y no lanza", () => {
    enNavegador({ datos: {}, fallaAlGuardar: true });
    expect(guardar("cayla:vender:x:en-espera", [1])).toBe(false);
  });
  it("borrar deja la llave sin valor", () => {
    const f: Falso = { datos: { "cayla:vender:x:en-espera": "[1]" } };
    enNavegador(f);
    borrar("cayla:vender:x:en-espera");
    expect(leer("cayla:vender:x:en-espera", "nada")).toBe("nada");
  });
});
