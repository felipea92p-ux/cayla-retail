import { readFileSync, readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  ACCIONES_NUEVO,
  ARBOL,
  PERMISOS,
  TIPOS_UBICACION,
  menuPara,
  permisosDe,
  type Nodo,
  type PerfilDelMenu,
  type TipoUbicacion,
} from "./menu";
import { CLAVES_MODULO, MODULOS, MODULOS_DE_HOY, esDelegable, leerModulos, modulosDeHoy, permisosDeModulos, type ClaveModulo } from "./modulos";

// Roles por módulo (ADR-0161 B, migración 20260923030000_roles_por_modulo.sql). Lo que estas pruebas cuidan:
//  1. El catálogo de la web y el de la base son el mismo (claves, orden, «solo líder», «solo líder por ahora»), y lo que
//     la web supone que cada cuenta ve hoy es exactamente la siembra de la migración.
//  2. EL MENÚ NO CAMBIA para las PERSONAS: con los módulos de hoy, `menuPara` da, para el líder y la integrante y en cada
//     ubicación, lo mismo que la regla fija de antes — que es la que prueba `menu-hoy.golden.json`. Las terminales ya no
//     tienen regla fija (sin tipo desde 20260923040000): su menú sale solo de su rol y lo prueba `menu.test.ts`.
//  3. Los permisos que salen de los módulos son los mismos que los fijos de antes, y ninguno nuevo se abre.

const MIGRACION = readFileSync(new URL("../../../supabase/migrations/20260923030000_roles_por_modulo.sql", import.meta.url), "utf8");

// REGLA (Felipe, 2026-09-22 — CLAUDE.md «Módulos y roles»): todo módulo nuevo se da de alta en `retail.modulos` con una
// migración PROPIA, se agrega a `lib/modulos.ts` y su pantalla declara `modulo` en `lib/menu.ts`; y nace SIN ROL: solo lo
// ve el líder hasta que él lo enciende en Colaboradores ▸ Roles y accesos. Por eso el catálogo se arma leyendo TODAS las
// migraciones (no solo la de 20260923030000) y ninguna migración posterior puede asignar módulos a un rol.
const DIR_MIGRACIONES = new URL("../../../supabase/migrations/", import.meta.url);
const ARCHIVOS_MIGRACION = readdirSync(DIR_MIGRACIONES).filter((f) => /^\d{14}_.+\.sql$/.test(f)).sort();
const TODAS = ARCHIVOS_MIGRACION.map((f) => ({ archivo: f, sql: readFileSync(new URL(f, DIR_MIGRACIONES), "utf8") }));
/** Las migraciones que sí pueden sembrar roles: la que creó los roles y la de la decisión B2d. */
const SIEMBRA_DE_ROLES = new Set(["20260923030000_roles_por_modulo.sql", "20260923031000_integrante_hace_lo_que_ve.sql"]);

describe("el catálogo de la web es el de la base", () => {
  // Las altas (`insert into retail.modulos`) y, en el orden de las migraciones, los cambios posteriores de «solo del líder»
  // y «se puede delegar» (`update retail.modulos set [solo_lider = …,] delegable = … where clave in (…)`, 20260923110000 y
  // 20260923111000).
  const porClave = new Map<string, { clave: string; orden: number; soloLider: boolean; delegable: boolean }>();
  for (const { sql } of TODAS) {
    for (const ins of sql.matchAll(/insert into retail\.modulos\b[\s\S]*?\)\s*(?:on conflict[^;]*)?;[ \t]*$/gim)) {
      for (const m of ins[0].matchAll(/\('([a-z_]+)',\s*'[^']+',\s*'[^']+',\s*'[^']+',\s*(\d+),\s*(true|false),\s*(true|false)\)/g)) {
        porClave.set(m[1]!, { clave: m[1]!, orden: Number(m[2]), soloLider: m[3] === "true", delegable: m[4] === "true" });
      }
    }
    for (const up of sql.matchAll(/update retail\.modulos set (?:solo_lider = (true|false),\s*)?delegable = (true|false)\s+where clave in \(([^)]*)\)/gi)) {
      for (const c of up[3]!.matchAll(/'([a-z_]+)'/g)) {
        const fila = porClave.get(c[1]!);
        if (!fila) continue;
        if (up[1]) fila.soloLider = up[1] === "true";
        fila.delegable = up[2] === "true";
      }
    }
  }
  const filas = [...porClave.values()].sort((a, b) => a.orden - b.orden);

  it("las mismas claves que la base (todas las migraciones), en el orden de `retail.modulos.orden`", () => {
    expect(filas.map((f) => f.clave)).toEqual([...CLAVES_MODULO]);
    expect(MODULOS.map((m) => m.clave)).toEqual([...CLAVES_MODULO]);
  });

  it("«siempre solo del líder» y «solo líder por ahora» coinciden", () => {
    for (const f of filas) {
      const m = MODULOS.find((x) => x.clave === f.clave)!;
      expect(!!m.soloLider, f.clave).toBe(f.soloLider);
      expect(esDelegable(m), f.clave).toBe(f.delegable);
    }
  });

  it("hoy ningún módulo es «siempre solo del líder» ni «solo líder por ahora» (Felipe, 2026-09-22: 20260923110000 y 20260923111000)", () => {
    expect(MODULOS.filter((m) => m.soloLider || m.noDelegable).map((m) => m.clave)).toEqual([]);
  });

  const sembrados = (clave: string) => {
    const bloque = MIGRACION.split(`values ('${clave}'`)[1]!.split("end if;")[0]!;
    return [...bloque.matchAll(/unnest\(array\[([^\]]+)\]/g)].flatMap((m) => [...m[1]!.matchAll(/'([a-z_]+)'/g)].map((x) => x[1])).sort();
  };

  it("lo que la web supone que ve cada cuenta hoy es la siembra de la migración", () => {
    expect(MODULOS_DE_HOY.integrante.map((m) => m.clave).sort()).toEqual(sembrados("integrante"));
    expect(MODULOS_DE_HOY.ventas.map((m) => m.clave).sort()).toEqual(sembrados("terminal_ventas"));
    expect(MODULOS_DE_HOY.administrativa.map((m) => m.clave).sort()).toEqual(sembrados("terminal_administrativa"));
  });

  it("la siembra solo usa módulos que se pueden delegar", () => {
    for (const lista of Object.values(MODULOS_DE_HOY)) {
      for (const { clave } of lista) expect(esDelegable(MODULOS.find((m) => m.clave === clave)!), clave).toBe(true);
    }
  });

  it("sin `fn_mis_modulos` (base anterior a los roles), Integrante se lee limitado como era entonces y las terminales completas", () => {
    expect(MODULOS_DE_HOY.integrante.every((m) => !m.completo)).toBe(true);
    expect([...MODULOS_DE_HOY.ventas, ...MODULOS_DE_HOY.administrativa].every((m) => m.completo)).toBe(true);
  });
});

describe("cada pantalla y cada acción del menú pertenece a un módulo", () => {
  const hojas = (nodos: readonly Nodo[]): Nodo[] => nodos.flatMap((n) => ("hijos" in n && n.hijos ? hojas(n.hijos) : [n]));

  it("toda hoja viva salvo Inicio declara su módulo, y existe", () => {
    for (const h of hojas(ARBOL).filter((n) => n.estado === "viva")) {
      if (h.id === "inicio") {
        expect(h.modulo).toBeUndefined();
        continue;
      }
      expect(h.modulo, h.id).toBeDefined();
      expect(CLAVES_MODULO, h.id).toContain(h.modulo);
    }
  });

  it("toda acción de «+ Nuevo» declara su módulo", () => {
    for (const a of ACCIONES_NUEVO) expect(CLAVES_MODULO, a.id).toContain(a.modulo);
  });
});

/* ---------- 2. El menú no cambia ---------- */

type Cuenta = { nombre: string; rol: "lider" | "integrante" };
const CUENTAS_DE_HOY: Cuenta[] = [
  { nombre: "líder", rol: "lider" },
  { nombre: "integrante", rol: "integrante" },
];

const RUTAS = [
  "/", "/vender", "/caja", "/vender/historial", "/cambios", "/devoluciones", "/vender/comprobantes", "/inventario", "/inventario/movimientos",
  "/inventario/traslados", "/inventario/conteo", "/inventario/resumen", "/recibir", "/productos", "/productos/categorias", "/compras",
  "/compras/proveedores", "/produccion", "/produccion/ordenes", "/produccion/recibir",
];

function antes(c: Cuenta, ubicacionTipo: TipoUbicacion): PerfilDelMenu {
  return { permisos: permisosDe(c.rol), ubicacionTipo, contadores: { trasladosPorAtender: 2 } };
}
function ahora(c: Cuenta, ubicacionTipo: TipoUbicacion, modulos = modulosDeHoy(c.rol), terminal = false): PerfilDelMenu {
  return {
    permisos: permisosDeModulos(c.rol, modulos),
    ubicacionTipo,
    terminal,
    modulos: modulos.map((m) => m.clave),
    contadores: { trasladosPorAtender: 2 },
  };
}
const foto = (p: PerfilDelMenu) => {
  const m = menuPara(p);
  return { riel: m.riel, movil: m.movil, nuevo: m.nuevo, grupos: RUTAS.map((r) => m.grupoDe(r)) };
};

describe("con los módulos de hoy, el menú de las personas es idéntico al de antes (líder e integrante, en cada ubicación)", () => {
  for (const c of CUENTAS_DE_HOY) {
    for (const u of TIPOS_UBICACION) {
      it(`${c.nombre} en ${u}`, () => {
        expect(foto(ahora(c, u))).toEqual(foto(antes(c, u)));
      });
    }
  }
});

describe("los permisos que salen de los módulos son los fijos de antes", () => {
  for (const c of CUENTAS_DE_HOY) {
    it(c.nombre, () => {
      expect([...permisosDeModulos(c.rol, modulosDeHoy(c.rol))].sort()).toEqual([...permisosDe(c.rol)].sort());
    });
  }

  it("ningún rol que no sea el líder recibe administrar ni verDinero, vea lo que vea", () => {
    const todo = CLAVES_MODULO.map((clave) => ({ clave, completo: true }));
    expect(permisosDeModulos("integrante", todo)).not.toContain("administrar");
    expect(permisosDeModulos("integrante", todo)).not.toContain("verDinero");
    expect([...permisosDeModulos("lider", [])].sort()).toEqual([...PERMISOS].sort());
  });

  it("limitado como hoy: ve Caja, Existencias y Productos pero no gana sus poderes de escritura", () => {
    const vistos = (["caja", "existencias", "productos", "proveedores", "facturacion"] as const).map((clave) => ({ clave, completo: false }));
    expect(permisosDeModulos("integrante", vistos)).toEqual(["facturar"]);
  });

  it("completo: cada capacidad sale de CUALQUIERA de sus módulos (igual que la base)", () => {
    const con = (...cs: ClaveModulo[]) => permisosDeModulos("integrante", cs.map((clave) => ({ clave, completo: true })));
    expect(con("conteos")).toEqual(["ajustarInventario"]);
    expect(con("traslados")).toEqual(["ajustarInventario"]);
    expect(con("atributos")).toEqual(["editarCatalogo"]);
    expect(con("caja")).toEqual(["gestionarCaja"]);
    expect(con("vender", "historial", "movimientos", "recibir")).toEqual([]);
  });

  it("los módulos abiertos el 2026-09-22 dan su permiso (20260923110000), y ninguno da `verDinero` (el dinero del Taller)", () => {
    const con = (...cs: ClaveModulo[]) => permisosDeModulos("integrante", cs.map((clave) => ({ clave, completo: true })));
    expect(con("facturas_compra")).toEqual(["verDineroCompras"]);
    expect(con("por_pagar")).toEqual(["verDineroCompras"]);
    expect(con("notas_credito")).toEqual(["verDineroCompras"]);
    expect(con("etiquetas")).toEqual(["editarEtiquetas"]);
    expect(con("analisis")).toEqual(["analizar"]);
    expect(con("colaboradores", "roles")).toEqual([]);
    const todo = permisosDeModulos("integrante", CLAVES_MODULO.map((clave) => ({ clave, completo: true })));
    expect(todo).not.toContain("verDinero");
    // Limitado (sin las capacidades de escritura): tampoco ve los montos, igual que la base (`fn_capacidad_por_modulos`).
    expect(permisosDeModulos("integrante", [{ clave: "por_pagar", completo: false }])).toEqual([]);
  });

  it("«Por pagar» solo: Compras sale con una sola pantalla, Por pagar; Etiquetas solo: entra por la fila «Atributos»", () => {
    const soloPagos = ahora({ nombre: "pagos", rol: "integrante" }, "tienda", [{ clave: "por_pagar", completo: true }]);
    const riel = menuPara(soloPagos).riel;
    expect(riel.map((f) => f.etiqueta)).toEqual(["Inicio", "Compras"]);
    expect(riel.find((f) => f.etiqueta === "Compras")).toMatchObject({ href: "/compras/por-pagar" });
    const soloEtiquetas = ahora({ nombre: "etiquetas", rol: "integrante" }, "tienda", [{ clave: "etiquetas", completo: true }]);
    expect(menuPara(soloEtiquetas).riel.find((f) => f.etiqueta === "Catálogo")).toMatchObject({ href: "/productos/atributos" });
  });
});

describe("un rol a medida cambia el menú sin tocar el árbol", () => {
  const almacen = (["existencias", "conteos", "traslados", "movimientos", "recibir"] as const).map((clave) => ({ clave, completo: true }));
  const perfil = ahora({ nombre: "almacén", rol: "integrante" }, "tienda", almacen);

  it("«Almacén» ve Inicio e Inventario (sin Análisis), y nada de Ventas ni Catálogo", () => {
    const riel = menuPara(perfil).riel;
    expect(riel.map((f) => f.etiqueta)).toEqual(["Inicio", "Inventario"]);
    expect(menuPara(perfil).nuevo.map((a) => a.etiqueta)).toEqual(["Recibir mercadería", "Mover mercadería"]);
  });

  it("una terminal de ventas a la que se le enciende Existencias ve Inventario (la terminal es una cuenta más con su rol)", () => {
    const tv = [...MODULOS_DE_HOY.ventas, { clave: "existencias" as const, completo: true }];
    const riel = menuPara(ahora({ nombre: "tv", rol: "integrante" }, "tienda", tv, true)).riel;
    expect(riel.map((f) => f.etiqueta)).toEqual(["Ventas", "Inventario"]);
  });

  it("sin módulos, una persona solo tiene Inicio", () => {
    const riel = menuPara(ahora({ nombre: "nadie", rol: "integrante" }, "tienda", [])).riel;
    expect(riel.map((f) => f.etiqueta)).toEqual(["Inicio"]);
  });
});

describe("sin `fn_mis_modulos` (base anterior a los roles): la terminal lee lo de su tipo viejo, o nada", () => {
  it("con el tipo que devuelve una base vieja, los módulos de ese tipo", () => {
    expect(modulosDeHoy("integrante", { legado: "ventas" })).toEqual(MODULOS_DE_HOY.ventas);
  });
  it("sin tipo reconocible, ninguno (falla cerrado: pierde poder, nunca lo gana)", () => {
    expect(modulosDeHoy("integrante", { legado: null })).toEqual([]);
  });
});

describe("leerModulos", () => {
  it("ignora claves que esta versión de la web no conoce", () => {
    expect(leerModulos([{ clave: "caja", completo: true }, { clave: "modulo_del_futuro", completo: true }])).toEqual([{ clave: "caja", completo: true }]);
  });
});

describe("REGLA: un módulo nuevo nace solo para el líder", () => {
  it("ninguna migración, salvo la siembra de roles, asigna módulos a un rol (rol_modulos)", () => {
    const culpables = TODAS.filter(({ archivo, sql }) => !SIEMBRA_DE_ROLES.has(archivo) && /insert\s+into\s+retail\.rol_modulos/i.test(sql)).map((m) => m.archivo);
    // Si falla: el módulo nuevo no se le da a nadie por migración. Lo enciende el líder en Colaboradores ▸ Roles y accesos.
    expect(culpables).toEqual([]);
  });

  it("toda clave del catálogo tiene su fila en `MODULOS` con grupo, nombre e «incluye»", () => {
    for (const clave of CLAVES_MODULO) {
      const m = MODULOS.find((x) => x.clave === clave);
      expect(m, clave).toBeDefined();
      expect(m!.nombre.length, clave).toBeGreaterThan(0);
      expect(m!.incluye.length, clave).toBeGreaterThan(0);
    }
  });
});
