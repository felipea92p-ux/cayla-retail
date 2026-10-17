import { existsSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { ProveedoresAnalisis } from "./analisis-tipos";
import { dondeComprarDe, hrefComprar, hrefComprarLasQueFaltan, hrefComprarTodas, hrefElegirProveedor, hrefEnviar, hrefLiquidar, hrefPedirAProveedor, hrefReponerPiso, lineasParaPedir } from "./analisis-acciones";

// Datos inventados para la prueba.
const todo = { produccion: true, compras: true, ordenes: true, traslados: true, etiquetas: true, existencias: true };

// A quién se le pide cada modelo: dos proveedores activos, uno archivado y modelos con su proveedor en el catálogo.
const PROVEEDORES: ProveedoresAnalisis = {
  nombres: { x: { nombre: "Textil Andino S.A.C.", activo: true }, y: { nombre: "Confecciones Sur", activo: true }, viejo: { nombre: "Telas Viejas", activo: false } },
  delCatalogo: { cat1: "x", cat2: "x", cat3: "y", arch: "viejo" },
};
const DONDE = { destinoId: "tru", proveedores: PROVEEDORES };
const SIN_LEER = { destinoId: "tru", proveedores: null };
const orden = (qs: string) => `/compras/ordenes/nueva?${qs}&desde=analisis`;

describe("a dónde lleva cada botón (ADR-0245: abre el flujo que ya existe)", () => {
  it("Comprar: del Taller, una orden de Producción con el modelo; de terceros, una ORDEN DE COMPRA con su proveedor, la tienda y el modelo, sin cantidades (A9, D8)", () => {
    expect(hrefComprar({ origen: "taller", productoId: "p 1", proveedorId: null }, todo, DONDE)).toBe("/produccion/ordenes?nueva=p%201");
    // El proveedor de una compra REAL manda.
    expect(hrefComprar({ origen: "terceros", productoId: "p1", proveedorId: "y" }, todo, DONDE)).toBe(orden("prov=y&destino=tru&modelos=p1"));
    // Sin origen, el proveedor anotado en la ficha del modelo (el mismo que dice «Pídelo a …»).
    expect(hrefComprar({ origen: null, productoId: "cat1", proveedorId: null }, todo, DONDE)).toBe(orden("prov=x&destino=tru&modelos=cat1"));
    // Sin nada, la orden va sin proveedor: lo elige quien compra.
    expect(hrefComprar({ origen: null, productoId: "p1", proveedorId: null }, todo, DONDE)).toBe(orden("destino=tru&modelos=p1"));
    // Un proveedor archivado no se recomienda, ni uno que no se puede nombrar: el campo va vacío.
    expect(hrefComprar({ origen: null, productoId: "arch", proveedorId: null }, todo, DONDE)).toBe(orden("destino=tru&modelos=arch"));
    expect(hrefComprar({ origen: "terceros", productoId: "p1", proveedorId: "desconocido" }, todo, DONDE)).toBe(orden("destino=tru&modelos=p1"));
    // Los ids viajan codificados.
    expect(hrefComprar({ origen: null, productoId: "p 1", proveedorId: null }, todo, DONDE)).toBe(orden("destino=tru&modelos=p%201"));
  });
  it("Comprar sin los proveedores leídos: el de la última compra, como antes de A8; la tienda siempre va", () => {
    expect(hrefComprar({ origen: "terceros", productoId: "p1", proveedorId: "y" }, todo, SIN_LEER)).toBe(orden("prov=y&destino=tru&modelos=p1"));
    expect(hrefComprar({ origen: null, productoId: "cat1", proveedorId: null }, todo, SIN_LEER)).toBe(orden("destino=tru&modelos=cat1"));
  });
  it("módulos: el destino lo decide el módulo que de verdad se abre — Órdenes de compra, o Registrar factura si solo ve Facturas; sin ninguno, no hay botón", () => {
    const terceros = { origen: "terceros" as const, productoId: "p1", proveedorId: "y" };
    // Con Órdenes, la orden aunque NO vea Facturas ni el dinero de Compras (el módulo no los pide).
    expect(hrefComprar(terceros, { ...todo, compras: false }, DONDE)).toBe(orden("prov=y&destino=tru&modelos=p1"));
    // Con Facturas y sin Órdenes, «Registrar factura» como hoy: con el proveedor de una compra real, y nada más (el de la ficha no es una factura).
    expect(hrefComprar(terceros, { ...todo, ordenes: false }, DONDE)).toBe("/compras/nueva?prov=y");
    expect(hrefComprar({ origen: null, productoId: "cat1", proveedorId: null }, { ...todo, ordenes: false }, DONDE)).toBe("/compras/nueva");
    // Sin ninguno de los dos, nada.
    expect(hrefComprar(terceros, { ...todo, ordenes: false, compras: false }, DONDE)).toBeNull();
    // El Taller depende solo de Producción: ni Órdenes ni Facturas la reemplazan (D9, la regla de hoy).
    const taller = { origen: "taller" as const, productoId: "p1", proveedorId: null };
    expect(hrefComprar(taller, { ...todo, produccion: false }, DONDE)).toBeNull();
    expect(hrefComprar(taller, { ...todo, ordenes: false, compras: false }, DONDE)).toBe("/produccion/ordenes?nueva=p1");
  });
  it("Comprar todas: un solo destino o ninguno; de terceros, UNA orden con todos los modelos del MISMO proveedor", () => {
    const t1 = { origen: "taller" as const, productoId: "a", proveedorId: null };
    const t2 = { origen: "taller" as const, productoId: "b", proveedorId: null };
    const c1 = { origen: "terceros" as const, productoId: "c1", proveedorId: "x" };
    const c2 = { origen: null, productoId: "cat1", proveedorId: null }; // su proveedor está en el catálogo: x
    const c3 = { origen: null, productoId: "cat3", proveedorId: null }; // y
    expect(hrefComprarTodas([t1, t2], todo, DONDE)).toBe("/produccion/ordenes");
    expect(hrefComprarTodas([t1], todo, DONDE)).toBe("/produccion/ordenes?nueva=a");
    expect(hrefComprarTodas([t1, c1], todo, DONDE)).toBeNull();
    // Mismo proveedor (uno de una compra, otro del catálogo): una orden con los dos modelos, en el orden de la lista.
    expect(hrefComprarTodas([c1, c2], todo, DONDE)).toBe(orden("prov=x&destino=tru&modelos=c1,cat1"));
    // Proveedores distintos: no se abren N órdenes; cada proveedor tiene su «Pedir a X».
    expect(hrefComprarTodas([c1, c3], todo, DONDE)).toBeNull();
    // Uno con proveedor y otro sin: tampoco se mezclan.
    expect(hrefComprarTodas([c1, { origen: null, productoId: "p9", proveedorId: null }], todo, DONDE)).toBeNull();
    // Todos sin proveedor: una orden sin proveedor, para elegirlo.
    expect(hrefComprarTodas([{ origen: null, productoId: "p8", proveedorId: null }, { origen: null, productoId: "p9", proveedorId: null }], todo, DONDE)).toBe(orden("destino=tru&modelos=p8,p9"));
    // Un modelo dos veces no se repite en la orden.
    expect(hrefComprarTodas([c1, c1], todo, DONDE)).toBe(orden("prov=x&destino=tru&modelos=c1"));
    // Más modelos de los que caben en una orden (100 líneas): sin botón, no una orden a medias.
    const muchos = Array.from({ length: 101 }, (_, i) => ({ origen: "terceros" as const, productoId: `m${i}`, proveedorId: "x" }));
    expect(hrefComprarTodas(muchos, todo, DONDE)).toBeNull();
    expect(hrefComprarTodas(muchos.slice(0, 100), todo, DONDE)).toContain("modelos=m0,m1,");
    // Sin Órdenes y con Facturas, como hoy: un solo destino de factura, o ninguno.
    const facturas = { ...todo, ordenes: false };
    expect(hrefComprarTodas([c1, { ...c1, productoId: "c9" }], facturas, DONDE)).toBe("/compras/nueva?prov=x");
    expect(hrefComprarTodas([c1, { origen: "terceros", productoId: "c8", proveedorId: "y" }], facturas, DONDE)).toBeNull();
    expect(hrefComprarTodas([], todo, DONDE)).toBeNull();
  });
  it("Comprar todas sobre «Todos»: el destino mira solo lo que falta pedir; lo que ya viene en camino no cuenta", () => {
    const HOY = "2026-10-16";
    const viene = { origen: "terceros" as const, productoId: "c", proveedorId: "x", llega: [{ de: "compra" as const, cantidad: 4, fecha: "2026-10-20" }] };
    const falta = { origen: "taller" as const, productoId: "a", proveedorId: null, llega: [] };
    const atrasada = { origen: "taller" as const, productoId: "b", proveedorId: null, llega: [{ de: "taller" as const, cantidad: 4, fecha: "2026-09-20" }] };
    // Mezclados serían dos destinos y no saldría botón; solo lo que falta lleva a producir ese modelo.
    expect(hrefComprarTodas([viene, falta], todo, DONDE)).toBeNull();
    expect(hrefComprarLasQueFaltan([viene, falta], HOY, todo, DONDE)).toBe("/produccion/ordenes?nueva=a");
    // Una llegada atrasada no cuenta como que viene: sigue por pedir.
    expect(hrefComprarLasQueFaltan([viene, falta, atrasada], HOY, todo, DONDE)).toBe("/produccion/ordenes");
    // Si todo ya viene, no hay nada que comprar.
    expect(hrefComprarLasQueFaltan([viene], HOY, todo, DONDE)).toBeNull();
    expect(hrefComprarLasQueFaltan([], HOY, todo, DONDE)).toBeNull();
    // De terceros: la orden lleva solo lo que falta pedir, no lo que ya viene.
    const otro = { origen: "terceros" as const, productoId: "d", proveedorId: "x", llega: [] };
    expect(hrefComprarLasQueFaltan([viene, otro], HOY, todo, DONDE)).toBe(orden("prov=x&destino=tru&modelos=d"));
  });
  it("Pedir a X: una orden con ese proveedor y SUS modelos; solo con Órdenes de compra (con Facturas sola, mentiría: una factura es una compra ya hecha)", () => {
    const modelos = [{ productoId: "m1" }, { productoId: "m2" }, { productoId: "m1" }];
    expect(hrefPedirAProveedor(modelos, "x", todo, DONDE)).toBe(orden("prov=x&destino=tru&modelos=m1,m2"));
    expect(hrefPedirAProveedor(modelos, "x", { ordenes: false }, DONDE)).toBeNull();
    expect(hrefPedirAProveedor([], "x", todo, DONDE)).toBeNull();
    expect(hrefPedirAProveedor(Array.from({ length: 101 }, (_, i) => ({ productoId: `m${i}` })), "x", todo, DONDE)).toBeNull();
  });
  it("dondeComprarDe: la tienda que se analiza y los proveedores leídos", () => {
    expect(dondeComprarDe({ sede: { id: "aqp", codigo: "AQP", nombre: "Tienda AQP", ciudad: "Arequipa" }, proveedores: PROVEEDORES })).toEqual({ destinoId: "aqp", proveedores: PROVEEDORES });
    expect(dondeComprarDe({ sede: { id: "aqp", codigo: "AQP", nombre: "Tienda AQP", ciudad: "Arequipa" }, proveedores: null }).proveedores).toBeNull();
  });
  it("Elegir proveedor: un modelo, su ficha en Catálogo; varios, la lista de Productos; sin permiso o sin modelos, nada", () => {
    expect(hrefElegirProveedor([{ productoId: "p 1" }], { catalogo: true })).toBe("/productos/p%201/editar");
    expect(hrefElegirProveedor([{ productoId: "a" }, { productoId: "b" }], { catalogo: true })).toBe("/productos");
    expect(hrefElegirProveedor([{ productoId: "a" }], { catalogo: false })).toBeNull();
    expect(hrefElegirProveedor([], { catalogo: true })).toBeNull();
    // Las dos rutas existen: un enlace que cae en un 404 (como el de Inicio de almacén, 2026-09-30) no ayuda a elegir nada.
    for (const ruta of ["productos/[id]/editar/page.tsx", "productos/page.tsx"]) expect(existsSync(new URL(`../app/(app)/${ruta}`, import.meta.url)), ruta).toBe(true);
  });
  it("Enviar: una de cada una de las que el destino vendió y están en el almacén, con el destino ya elegido", () => {
    const otras = (aqp: number) => [{ sedeId: "aqp", stock: 0, vendidas30: aqp }];
    const href = hrefEnviar(
      [
        { varianteId: "v1", piso: 2, almacen: 1, otras: otras(3) },
        { varianteId: "v2", piso: 0, almacen: 0, otras: otras(3) },
        // Allá no se vendió esta talla: no viaja (antes iba «una de cada talla»).
        { varianteId: "v3", piso: 0, almacen: 4, otras: otras(0) },
        // Allá se vendió pero aquí está en el piso: el traslado la descartaría en silencio, así que no se pide.
        { varianteId: "v4", piso: 5, almacen: 0, otras: otras(2) },
      ],
      { id: "aqp" },
      todo,
    );
    expect(href).toContain("/inventario/traslados/nuevo?lineas=");
    expect(href).toContain("destino=aqp");
    expect(decodeURIComponent(href!)).toContain("v1:1");
    for (const fuera of ["v2", "v3", "v4"]) expect(decodeURIComponent(href!)).not.toContain(fuera);
    expect(hrefEnviar([{ varianteId: "v1", piso: 1, almacen: 0, otras: otras(3) }], { id: "aqp" }, todo)).toBeNull();
    expect(hrefEnviar([{ varianteId: "v1", piso: 0, almacen: 2, otras: otras(3) }], { id: "aqp" }, { traslados: false })).toBeNull();
  });
  it("Liquidar abre las etiquetas de esas prendas; Reponer baja solo lo que tiene almacén", () => {
    expect(hrefLiquidar([{ varianteId: "v1" }], todo)).toContain("/etiquetas-de-precio?variantes=");
    expect(hrefLiquidar([], todo)).toBeNull();
    expect(hrefReponerPiso([{ varianteId: "v1", almacen: 0 }], todo)).toBeNull();
    expect(hrefReponerPiso([{ varianteId: "v1", almacen: 2 }], todo)).toContain("/inventario/bajar?lineas=");
  });
  it("Pedir propone una de cada una de lo que esa tienda tiene", () => {
    const l = lineasParaPedir([{ varianteId: "v1", nombre: "Body Sonali", color: "Terracota", talla: "M", otras: [{ sedeId: "aqp", stock: 5, vendidas30: 0 }] }], "aqp");
    expect(l).toEqual([{ varianteId: "v1", etiqueta: "Body Sonali · Terracota · M", disponibleEnOrigen: 5, cantidad: 1 }]);
    expect(lineasParaPedir([{ varianteId: "v1", nombre: "x", color: "y", talla: "z", otras: [] }], "aqp")).toEqual([]);
  });
});
