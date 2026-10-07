import { describe, it, expect } from "vitest";
import { atajosDeMovimiento, atajosDeOperacion, hrefBajarAlPiso, hrefEtiquetas, type AccesosAtajos } from "./movimientos-atajos";
import type { Movimiento } from "./movimientos-reglas";

// Los atajos de Movimientos (ADR-0241): llevan a la pantalla que ya hace el trabajo, solo si quien mira ve ese módulo.

function movimiento(parcial: Partial<Movimiento>): Movimiento {
  return {
    id: "m1",
    creadoEn: "2026-09-26T14:03:22+00:00",
    fecha: "2026-09-26",
    hora: "09:03",
    tipo: "entrada",
    categoria: "entrada",
    motivo: "recepcion",
    cantidad: 3,
    delta: 3,
    esSistema: false,
    nota: null,
    varianteId: "v1",
    sku: "BLU-M",
    referencia: "Blusa Carlita",
    talla: "M",
    color: "Gris",
    ubicacionId: "u",
    ubicacion: "Tienda TRU",
    ubicacionDestinoId: null,
    ubicacionDestino: null,
    sububicacion: { id: "sa", nombre: "Almacén", tipo: "almacen_tienda" },
    sububicacionDestino: null,
    usuarioId: "p1",
    usuario: "Rosa",
    venta: null,
    lote: null,
    compra: null,
    transferencia: null,
    conteo: null,
    devolucion: null,
    cambio: null,
    ...parcial,
  };
}

const TODO: AccesosAtajos = { modulos: ["cambios", "devoluciones", "conteos", "existencias", "apartados"], puedeAjustar: true };
const claves = (m: Movimiento, a: AccesosAtajos = TODO, apt?: Parameters<typeof atajosDeMovimiento>[2]) => atajosDeMovimiento(m, a, apt).map((x) => x.clave);

describe("atajosDeMovimiento", () => {
  const venta = movimiento({
    tipo: "salida",
    categoria: "salida",
    motivo: "venta",
    delta: -1,
    cantidad: 1,
    sububicacion: { id: "sp", nombre: "Piso de venta", tipo: "piso_venta" },
    venta: { id: "ve", nota: null, comprobante: { tipo: "boleta", numero: "B004-000031", estado: "aceptado" } as NonNullable<NonNullable<Movimiento["venta"]>["comprobante"]> },
  });

  it("una venta con boleta lleva a Cambio y Devolución con la boleta buscada, y no ofrece corregir", () => {
    const a = atajosDeMovimiento(venta, TODO);
    expect(a.map((x) => x.clave)).toEqual(["cambio", "devolucion", "existencias"]);
    expect(a[0].href).toBe("/cambios?q=B004-000031");
    expect(a[1].href).toBe("/devoluciones?q=B004-000031");
  });

  it("una venta sin comprobante no ofrece Cambio (no habría con qué buscarla)", () => {
    expect(claves({ ...venta, venta: { id: "ve", nota: null, comprobante: null } })).toEqual(["existencias"]);
  });

  it("lo que llegó al almacén se baja al piso y se etiqueta; y se puede contar o corregir", () => {
    const a = atajosDeMovimiento(movimiento({}), TODO);
    expect(a.map((x) => x.clave)).toEqual(["bajar", "etiquetas", "contar", "ajustar", "existencias"]);
    expect(a[0]).toMatchObject({ href: "/inventario/bajar?lineas=v1:1", principal: true });
    expect(a[1].href).toBe("/etiquetas-de-precio?variantes=v1");
    expect(a[2].href).toBe("/inventario/conteo?variantes=v1");
    expect(a[3].href).toBeUndefined();
    expect(a[4].href).toBe("/inventario?variante=v1");
  });

  it("lo que llegó directo al piso no se ofrece bajar", () => {
    expect(claves(movimiento({ sububicacion: { id: "sp", nombre: "Piso de venta", tipo: "piso_venta" } }))).not.toContain("bajar");
  });

  it("un traslado recibido cuenta como llegada; uno enviado no", () => {
    const llega = movimiento({ tipo: "traslado", categoria: "transferencia", motivo: "transferencia", delta: 6, sububicacion: null, sububicacionDestino: { id: "sa", nombre: "Almacén", tipo: "almacen_tienda" } });
    expect(claves(llega)).toContain("bajar");
    expect(claves({ ...llega, delta: -6 })).not.toContain("bajar");
  });

  it("una devolución suma pero no se baja ni se etiqueta", () => {
    expect(claves(movimiento({ motivo: "devolucion" }))).toEqual(["contar", "ajustar", "existencias"]);
  });

  it("sin el módulo, el atajo no aparece; sin permiso de ajustar, tampoco «Corregir»", () => {
    expect(claves(movimiento({}), { modulos: [], puedeAjustar: false })).toEqual(["etiquetas"]);
    expect(claves(venta, { modulos: ["devoluciones"], puedeAjustar: true })).toEqual(["devolucion"]);
  });

  it("un apartado lleva al apartado exacto, y sin apartado leído no ofrece nada propio", () => {
    const apartado = movimiento({ tipo: "apartado", categoria: "apartado", motivo: "apartado", delta: 0, cantidad: 1 });
    const a = atajosDeMovimiento(apartado, TODO, { separacionId: "s1", codigo: "APT-TRU-0014", clienta: "María P.", estado: "abierta", venceEl: "2026-09-30" });
    expect(a[0]).toMatchObject({ clave: "apartado", texto: "Abrir APT-TRU-0014", href: "/vender/apartados?abrir=s1", detalle: "cobrar el saldo, recordar o liberar" });
    expect(a.map((x) => x.clave)).toEqual(["apartado", "existencias"]);
    expect(claves(apartado, TODO, null)).toEqual(["existencias"]);
  });
});

describe("atajosDeOperacion", () => {
  it("una recepción de varias tallas se baja y se etiqueta entera", () => {
    const filas = [movimiento({}), movimiento({ id: "m2", varianteId: "v2" }), movimiento({ id: "m3", varianteId: "v3", sububicacion: { id: "sp", nombre: "Piso", tipo: "piso_venta" } })];
    const a = atajosDeOperacion(filas, TODO);
    expect(a.map((x) => x.texto)).toEqual(["Bajar estas 2 al piso", "Imprimir 3 etiquetas"]);
    expect(a[0].href).toBe("/inventario/bajar?lineas=v1:1,v2:1");
    expect(a[1].href).toBe("/etiquetas-de-precio?variantes=v1,v2,v3");
  });

  it("una venta de varias prendas no tiene atajos de operación", () => {
    const v = movimiento({ tipo: "salida", categoria: "salida", motivo: "venta", delta: -1 });
    expect(atajosDeOperacion([v, { ...v, id: "m2", varianteId: "v2" }], TODO)).toEqual([]);
  });
});

describe("enlaces", () => {
  it("sin prendas o con demasiadas no arma enlace", () => {
    expect(hrefEtiquetas([])).toBeNull();
    expect(hrefBajarAlPiso(Array.from({ length: 101 }, (_, i) => `v${i}`))).toBeNull();
    expect(hrefEtiquetas(["a", "a", "b"])).toBe("/etiquetas-de-precio?variantes=a,b");
  });
});
