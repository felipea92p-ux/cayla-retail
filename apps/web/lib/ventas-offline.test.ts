import { describe, it, expect, beforeEach } from "vitest";
import {
  obtenerCola,
  encolarVenta,
  quitarDeCola,
  stockComprometido,
  conStockComprometidoDescontado,
  pasaElUmbralDeSobra,
  type VentaEncolada,
} from "./ventas-offline";

// El resto de `lib/*.test.ts` corre en Node puro (sin jsdom), así que no hay un `window` ni
// un `localStorage` reales acá — se simula el mínimo necesario, un mapa en memoria, en vez de
// agregar el entorno DOM completo solo para tres funciones que ya reciben todo lo demás por
// argumento.
function localStorageEnMemoria(): Storage {
  const datos = new Map<string, string>();
  return {
    getItem: (clave) => datos.get(clave) ?? null,
    setItem: (clave, valor) => void datos.set(clave, valor),
    removeItem: (clave) => void datos.delete(clave),
    clear: () => datos.clear(),
    key: () => null,
    get length() {
      return datos.size;
    },
  };
}

beforeEach(() => {
  Object.defineProperty(globalThis, "localStorage", {
    value: localStorageEnMemoria(),
    writable: true,
    configurable: true,
  });
});

function venta(p: Partial<VentaEncolada> = {}): VentaEncolada {
  return {
    token: "t1",
    cajaId: "caja-1",
    sedeCodigo: "TRU",
    metodoPago: "efectivo",
    items: [{ varianteId: "v1", cantidad: 1, monto: 50 }],
    creadoEn: "2026-09-11T10:00:00.000Z",
    ...p,
  };
}

describe("la cola, por caja", () => {
  it("encolar y leer devuelve la misma venta", () => {
    encolarVenta(venta());
    expect(obtenerCola("caja-1")).toHaveLength(1);
    expect(obtenerCola("caja-1")[0].token).toBe("t1");
  });

  it("una caja no ve la cola de otra", () => {
    encolarVenta(venta({ token: "t1", cajaId: "caja-1" }));
    encolarVenta(venta({ token: "t2", cajaId: "caja-2" }));
    expect(obtenerCola("caja-1")).toHaveLength(1);
    expect(obtenerCola("caja-2")).toHaveLength(1);
  });

  it("encolar dos veces el mismo token reemplaza, no duplica", () => {
    encolarVenta(venta({ token: "t1", metodoPago: "efectivo" }));
    encolarVenta(venta({ token: "t1", metodoPago: "yape" }));
    const cola = obtenerCola("caja-1");
    expect(cola).toHaveLength(1);
    expect(cola[0].metodoPago).toBe("yape");
  });

  it("quitar de la cola por token no toca las demás ventas", () => {
    encolarVenta(venta({ token: "t1" }));
    encolarVenta(venta({ token: "t2" }));
    quitarDeCola("t1");
    const cola = obtenerCola("caja-1");
    expect(cola).toHaveLength(1);
    expect(cola[0].token).toBe("t2");
  });
});

describe("el overlay de stock comprometido", () => {
  it("suma la cantidad de todas las ventas encoladas de la misma variante", () => {
    const cola = [
      venta({ token: "t1", items: [{ varianteId: "v1", cantidad: 1, monto: 50 }] }),
      venta({ token: "t2", items: [{ varianteId: "v1", cantidad: 2, monto: 50 }] }),
    ];
    expect(stockComprometido(cola).get("v1")).toBe(3);
  });

  it("descuenta del stockAqui que llega por props, sin tocar variantes sin cola", () => {
    const variantes = [
      { varianteId: "v1", stockAqui: 5 },
      { varianteId: "v2", stockAqui: 3 },
    ];
    const cola = [venta({ items: [{ varianteId: "v1", cantidad: 2, monto: 50 }] })];
    const resultado = conStockComprometidoDescontado(variantes, cola);
    expect(resultado.find((v) => v.varianteId === "v1")?.stockAqui).toBe(3);
    expect(resultado.find((v) => v.varianteId === "v2")?.stockAqui).toBe(3);
  });

  it("nunca deja el stock en pantalla por debajo de cero", () => {
    const variantes = [{ varianteId: "v1", stockAqui: 1 }];
    // Dos ventas offline de la misma última unidad no deberían poder pasar (eso lo evita
    // el umbral), pero el overlay igual debe blindarse solo si algo raro lo dejó pasar.
    const cola = [venta({ items: [{ varianteId: "v1", cantidad: 3, monto: 50 }] })];
    expect(conStockComprometidoDescontado(variantes, cola)[0].stockAqui).toBe(0);
  });

  it("con la cola vacía, devuelve el mismo arreglo sin copiar cada fila", () => {
    const variantes = [{ varianteId: "v1", stockAqui: 5 }];
    expect(conStockComprometidoDescontado(variantes, [])).toBe(variantes);
  });
});

describe("el umbral de sobra (ADR-0013 §C)", () => {
  it("vender la última unidad no deja nada de sobra: bloquea", () => {
    expect(pasaElUmbralDeSobra(1, 1)).toBe(false);
  });

  it("vender y dejar 1 de sobra: pasa", () => {
    expect(pasaElUmbralDeSobra(2, 1)).toBe(true);
  });

  it("vender más de lo que hay: bloquea (no debería llegar hasta acá, pero no confía)", () => {
    expect(pasaElUmbralDeSobra(1, 2)).toBe(false);
  });
});
