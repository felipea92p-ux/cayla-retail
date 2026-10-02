import { describe, expect, it } from "vitest";
import { ARBOL, PERMISOS, esGrupo, menuPara, type Nodo } from "./menu";
import { CLAVES_MODULO, NACEN_QUITADOS_AL_LIDER, type ClaveModulo } from "./modulos";
import {
  MODULOS_DE_LA_VISTA_GLOBAL,
  MODULOS_SOLO_DE_LA_VISTA_GLOBAL,
  RUTA_ELEGIR_SEDE,
  modulosEnLaVista,
  rutaDeLaVistaGlobal,
  verDeLaVista,
} from "./vista-global";

// CAYLA Global (ADR-0275). Lo que vigila: que la vista sea para decidir y no para operar —ninguna pantalla de piso,
// caja o almacén entra—, y que la lista de módulos, las rutas de la barrera (`proxy.ts`) y el menú digan lo mismo.

function hojas(nodos: readonly Nodo[]): { id: string; ruta: string; modulo?: ClaveModulo }[] {
  return nodos.flatMap((n) => {
    if (n.estado !== "viva") return [];
    if (esGrupo(n)) return hojas(n.hijos);
    return [{ id: n.id, ruta: n.ruta, modulo: n.modulo }];
  });
}

/** Lo que se hace parado en una sede: cada uno deja un movimiento que tiene que quedar anotado EN una sede. */
const DE_OPERACION: ClaveModulo[] = [
  "vender", "apartados", "caja", "cambios", "devoluciones", "facturacion",
  "bajada_piso", "ajustar_stock", "conteos", "recibir", "notas_credito", "facturas_compra",
];

describe("CAYLA Global es para decidir, no para operar", () => {
  it("ningún módulo de operación de piso, caja o almacén está en la vista", () => {
    const colados = DE_OPERACION.filter((c) => (MODULOS_DE_LA_VISTA_GLOBAL as readonly string[]).includes(c));
    expect(colados).toEqual([]);
  });

  it("todos los módulos de la vista existen en el catálogo", () => {
    for (const c of MODULOS_DE_LA_VISTA_GLOBAL) expect(CLAVES_MODULO).toContain(c);
  });

  it("el tablero solo existe en la vista global, y nace quitado al líder (al nacer, solo lo ve el Admin)", () => {
    expect(MODULOS_SOLO_DE_LA_VISTA_GLOBAL).toEqual(["cayla_global"]);
    expect(NACEN_QUITADOS_AL_LIDER).toContain("cayla_global");
  });
});

describe("la barrera de rutas y el menú dicen lo mismo", () => {
  const todas = hojas(ARBOL);

  it("toda pantalla del menú de un módulo de la vista se puede abrir en ella", () => {
    const cerradas = todas.filter((h) => h.modulo && (MODULOS_DE_LA_VISTA_GLOBAL as readonly string[]).includes(h.modulo) && !rutaDeLaVistaGlobal(h.ruta));
    expect(cerradas).toEqual([]);
  });

  it("ninguna pantalla del menú de otro módulo se abre en la vista (manda a elegir sede)", () => {
    const abiertas = todas.filter((h) => h.modulo && !(MODULOS_DE_LA_VISTA_GLOBAL as readonly string[]).includes(h.modulo) && rutaDeLaVistaGlobal(h.ruta));
    expect(abiertas).toEqual([]);
  });

  it("la ruta cuenta entera: /finanzas/gastos sí, /finanzasx no; el inicio de una sede no; elegir sede sí", () => {
    expect(rutaDeLaVistaGlobal("/finanzas/gastos")).toBe(true);
    expect(rutaDeLaVistaGlobal("/finanzas")).toBe(true);
    expect(rutaDeLaVistaGlobal("/finanzasx")).toBe(false);
    expect(rutaDeLaVistaGlobal("/")).toBe(false);
    expect(rutaDeLaVistaGlobal("/vender")).toBe(false);
    expect(rutaDeLaVistaGlobal("/inventario")).toBe(false);
    expect(rutaDeLaVistaGlobal(RUTA_ELEGIR_SEDE)).toBe(true);
    expect(rutaDeLaVistaGlobal("/global")).toBe(true);
  });

  it("Clientas sí, pero Clientas ▸ Avisos no: manda desde el WhatsApp de UNA tienda (ADR-0288 act. g)", () => {
    expect(rutaDeLaVistaGlobal("/clientas")).toBe(true);
    expect(rutaDeLaVistaGlobal("/clientas/cartel")).toBe(true);
    expect(rutaDeLaVistaGlobal("/clientas/avisos")).toBe(false);
    expect(rutaDeLaVistaGlobal("/clientas/avisosx")).toBe(true);
  });

  it("las rutas de API no son pantallas: la barrera no las toca", () => {
    expect(rutaDeLaVistaGlobal("/api/lucode/reintentar")).toBe(true);
  });
});

describe("lo que la cuenta usa en cada vista", () => {
  const todo = CLAVES_MODULO.map((clave) => ({ clave, completo: true }));

  it("en CAYLA Global, solo los módulos de la vista (los que la cuenta tenga)", () => {
    expect(modulosEnLaVista("global", todo).map((m) => m.clave).sort()).toEqual([...MODULOS_DE_LA_VISTA_GLOBAL].sort());
    expect(modulosEnLaVista("global", [{ clave: "vender", completo: true }, { clave: "clientas", completo: true }])).toEqual([
      { clave: "clientas", completo: true },
    ]);
  });

  it("parado en una sede, todo menos el tablero global", () => {
    const enSede = modulosEnLaVista("sede", todo).map((m) => m.clave);
    expect(enSede).not.toContain("cayla_global");
    expect(enSede).toHaveLength(CLAVES_MODULO.length - 1);
  });

  it("el menú en CAYLA Global empieza por «Salud del negocio» y no trae Punto de venta, Caja ni Inicio", () => {
    const modulos = modulosEnLaVista("global", todo).map((m) => m.clave);
    const menu = menuPara({ ubicacionTipo: "tienda", permisos: PERMISOS, modulos });
    const hrefs = JSON.stringify(menu.riel).match(/"href":"[^"]+"/g)?.map((h) => h.slice(8, -1)) ?? [];
    expect(hrefs[0]).toBe("/global");
    for (const r of ["/", "/vender", "/caja", "/inventario/conteo", "/recibir"]) expect(hrefs).not.toContain(r);
  });

  it("parado en una sede, el menú no trae «Salud del negocio» aunque la cuenta vea CAYLA Global", () => {
    const modulos = modulosEnLaVista("sede", todo).map((m) => m.clave);
    const menu = menuPara({ ubicacionTipo: "tienda", permisos: PERMISOS, modulos });
    expect(JSON.stringify(menu.riel)).not.toContain('"href":"/global"');
  });

  it("sin lista de módulos (la regla fija de antes), «Salud del negocio» no sale", () => {
    const menu = menuPara({ ubicacionTipo: "tienda", permisos: PERMISOS });
    expect(JSON.stringify(menu.riel)).not.toContain('"href":"/global"');
  });
});

describe("Finanzas abre con todas las sedes en CAYLA Global", () => {
  it("sin nada en la URL: «todas» en la vista global; lo de siempre parado en una sede", () => {
    expect(verDeLaVista("global", undefined)).toBe("todas");
    expect(verDeLaVista("sede", undefined)).toBeUndefined();
  });

  it("lo que viene en la URL manda siempre", () => {
    expect(verDeLaVista("global", "empresa")).toBe("empresa");
    expect(verDeLaVista("sede", "todas")).toBe("todas");
  });
});
