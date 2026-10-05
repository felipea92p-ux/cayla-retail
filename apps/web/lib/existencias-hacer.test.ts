import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { accionesHacer, type EntradaHacer } from "./existencias-hacer";

const TODO: EntradaHacer = { puedeColgar: true, enSuSede: true, veRecibir: true, veConteos: true, veTraslados: true, vende: true, veApartados: true };
const NADA: EntradaHacer = { puedeColgar: false, enSuSede: false, veRecibir: false, veConteos: false, veTraslados: false, vende: false, veApartados: false };
const claves = (e: EntradaHacer) => accionesHacer(e).map((a) => a.clave);

describe("«Hacer…» de Existencias en el celular", () => {
  it("una persona que ve todo trae las cinco acciones, en el orden de la fila de la cabecera", () => {
    expect(claves(TODO)).toEqual(["colgar", "recibir", "contar", "trasladar", "apartados"]);
  });

  it("sin nada que hacer la lista queda vacía: el botón «Hacer…» no se dibuja y «Escanear» ocupa todo el ancho", () => {
    expect(accionesHacer(NADA)).toEqual([]);
  });

  it("cada acción depende de lo suyo y de nada más", () => {
    expect(claves({ ...NADA, puedeColgar: true })).toEqual(["colgar"]);
    expect(claves({ ...NADA, veTraslados: true })).toEqual(["trasladar"]);
    // Recibir, Contar y Apartados trabajan siempre sobre la sede propia: mirando otra sede (un líder) no aparecen.
    expect(claves({ ...TODO, enSuSede: false })).toEqual(["colgar", "trasladar"]);
    // Apartados nace en la caja: el Taller no aparta.
    expect(claves({ ...TODO, vende: false })).toEqual(["colgar", "recibir", "contar", "trasladar"]);
  });

  it("todas llevan etiqueta, una línea de por qué y una ruta propia, sin repetir", () => {
    const todas = accionesHacer(TODO);
    for (const a of todas) {
      expect(a.etiqueta.length).toBeGreaterThan(2);
      expect(a.detalle.length).toBeGreaterThan(10);
      expect(a.href.startsWith("/")).toBe(true);
    }
    expect(new Set(todas.map((a) => a.href)).size).toBe(todas.length);
  });

  it("habla de «clientes» y nunca de «clientas»", () => {
    expect(accionesHacer(TODO).map((a) => a.detalle).join(" ")).not.toMatch(/clienta/i);
  });

  // Dos lugares dicen lo mismo (la fila de la cabecera y esta hoja): si se agrega un acceso a uno y no al otro, la persona del celular
  // no puede hacer algo que la de la computadora sí. La fila vive en la página; aquí se comprueba que cada ruta esté en las dos.
  it("la fila de la cabecera de la página trae cada ruta de esta lista", () => {
    const pagina = readFileSync(new URL("../app/(app)/inventario/page.tsx", import.meta.url), "utf8");
    const rutas = accionesHacer(TODO).map((a) => a.href.split("?")[0]);
    const enFila: Record<string, string> = { "/inventario/traslados/nuevo": "RUTA_NUEVO_TRASLADO" };
    for (const ruta of rutas) {
      const marca = enFila[ruta] ?? `"${ruta}"`;
      expect(pagina, `la ruta ${ruta} no está en la fila de la cabecera de inventario/page.tsx`).toContain(marca);
    }
  });
});
