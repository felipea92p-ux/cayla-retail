import { describe, expect, it } from "vitest";
import { MODULOS, MODULOS_DE_HOY } from "./modulos";
import {
  alternarGrupo,
  alternarModulo,
  avisoDelRol,
  cambiosDelBorrador,
  familiaDeRol,
  menuConCambios,
  modulosFiltrados,
  controlDe,
  cuentasAsignables,
  etiquetasDelMenu,
  hayCambios,
  menuDelRol,
  modulosPorGrupo,
  motivoParaNoArchivar,
  nombreDeCopia,
  pideUbicacion,
  rolesAsignables,
  veModulo,
  type RolVista,
} from "./roles-reglas";

const modulo = (clave: string) => MODULOS.find((m) => m.clave === clave)!;
const rol = (extra: Partial<RolVista> = {}): RolVista => ({
  id: "r",
  clave: null,
  nombre: "Almacén",
  descripcion: null,
  esSistema: false,
  fijo: false,
  limitadoComoHoy: false,
  archivado: false,
  modulos: [],
  ...extra,
});
const LIDER = rol({ id: "l", clave: "lider", nombre: "Líder de equipo", esSistema: true, fijo: true });
const INTEGRANTE = rol({ id: "i", clave: "integrante", nombre: "Integrante", esSistema: true, limitadoComoHoy: true, modulos: MODULOS_DE_HOY.integrante.map((m) => m.clave) });

describe("controles del editor", () => {
  it("el Líder ve todo, con interruptores que no se mueven", () => {
    for (const m of MODULOS) {
      expect(veModulo(LIDER, m.clave)).toBe(true);
      expect(controlDe(LIDER, m)).toEqual({ tipo: "interruptor", editable: false });
    }
  });

  it("Colaboradores y Roles salen con candado «Solo líder»; lo aún no delegable, «Solo líder por ahora»", () => {
    expect(controlDe(INTEGRANTE, modulo("roles"))).toEqual({ tipo: "candado", texto: "Solo líder" });
    expect(controlDe(INTEGRANTE, modulo("colaboradores"))).toEqual({ tipo: "candado", texto: "Solo líder" });
    expect(controlDe(INTEGRANTE, modulo("analisis"))).toEqual({ tipo: "candado", texto: "Solo líder por ahora" });
    expect(controlDe(INTEGRANTE, modulo("caja"))).toEqual({ tipo: "interruptor", editable: true });
  });

  it("un rol archivado no se edita", () => {
    expect(controlDe(rol({ archivado: true }), modulo("caja"))).toEqual({ tipo: "interruptor", editable: false });
  });

  it("alternar enciende y apaga, en el orden del catálogo, y nunca deja entrar lo que no se delega", () => {
    expect(alternarModulo(["movimientos"], "vender")).toEqual(["vender", "movimientos"]);
    expect(alternarModulo(["vender", "movimientos"], "vender")).toEqual(["movimientos"]);
    expect(alternarModulo([], "roles")).toEqual([]);
    expect(alternarModulo([], "por_pagar")).toEqual([]);
  });

  it("hay cambios solo si el conjunto difiere", () => {
    expect(hayCambios(["caja", "vender"], ["vender", "caja"])).toBe(false);
    expect(hayCambios(["caja"], ["caja", "vender"])).toBe(true);
  });

  it("los módulos se agrupan como en el spike", () => {
    expect(modulosPorGrupo().map((g) => g.grupo)).toEqual(["Ventas", "Inventario", "Catálogo", "Compras", "Producción", "Gestión"]);
  });
});

describe("«Así queda su menú»", () => {
  it("Integrante: el menú de hoy de un integrante en una tienda", () => {
    expect(etiquetasDelMenu(menuDelRol(INTEGRANTE))).toEqual([
      { etiqueta: "Inicio", hijas: [] },
      { etiqueta: "Catálogo", hijas: ["Productos", "Categorías", "Atributos"] },
      { etiqueta: "Ventas", hijas: ["Punto de Venta", "Apartados", "Caja", "Historial", "Posventa"] },
      { etiqueta: "Inventario", hijas: ["Existencias", "Movimientos", "Traslados", "Conteo", "Recibir mercadería"] },
    ]);
  });

  it("Producción sale solo parado en el Taller", () => {
    expect(etiquetasDelMenu(menuDelRol(INTEGRANTE, "taller")).map((f) => f.etiqueta)).toContain("Producción");
    expect(etiquetasDelMenu(menuDelRol(INTEGRANTE, "tienda")).map((f) => f.etiqueta)).not.toContain("Producción");
  });

  it("encender Facturación suma su pantalla a Ventas", () => {
    const conFacturacion = { ...INTEGRANTE, modulos: [...INTEGRANTE.modulos, "facturacion" as const] };
    const ventas = (r: RolVista) => etiquetasDelMenu(menuDelRol(r)).find((f) => f.etiqueta === "Ventas")?.hijas ?? [];
    expect(ventas(conFacturacion)).toHaveLength(ventas(INTEGRANTE).length + 1);
  });

  it("el Líder ve también Compras", () => {
    expect(etiquetasDelMenu(menuDelRol(LIDER)).map((f) => f.etiqueta)).toContain("Compras");
  });
});

describe("archivar, duplicar y asignar", () => {
  it("Líder e Integrante no se archivan; un rol con cuentas tampoco", () => {
    expect(motivoParaNoArchivar(LIDER, 0)).not.toBeNull();
    expect(motivoParaNoArchivar(INTEGRANTE, 0)).not.toBeNull();
    expect(motivoParaNoArchivar(rol(), 2)).toContain("2 cuentas");
    expect(motivoParaNoArchivar(rol(), 0)).toBeNull();
  });

  it("el nombre de la copia no choca con un rol vigente", () => {
    expect(nombreDeCopia("Almacén", ["Almacén"])).toBe("Copia de Almacén");
    expect(nombreDeCopia("Almacén", ["Almacén", "copia de almacén"])).toBe("Copia de Almacén (2)");
  });

  it("el Líder se ofrece a una persona, nunca a una terminal; un rol archivado, a nadie", () => {
    const archivado = rol({ id: "a", archivado: true });
    expect(rolesAsignables([LIDER, INTEGRANTE, archivado], { tipo: "persona" }).map((r) => r.id)).toEqual(["l", "i"]);
    expect(rolesAsignables([LIDER, INTEGRANTE, archivado], { tipo: "terminal" }).map((r) => r.id)).toEqual(["i"]);
  });

  it("entre líderes se cambia el rol, pero nadie se cambia el suyo", () => {
    const cuentas = [
      { tipo: "persona" as const, id: "yo", nombre: "Felipe", ubicacion: null, rolId: "l", esLider: true, estado: "activo" },
      { tipo: "persona" as const, id: "1", nombre: "Otra líder", ubicacion: null, rolId: "l", esLider: true, estado: "activo" },
      { tipo: "persona" as const, id: "2", nombre: "Ana", ubicacion: "Tienda Trujillo", rolId: "i", esLider: false, estado: "activo" },
      { tipo: "terminal" as const, id: "3", nombre: "Terminal Ventas TRU", ubicacion: "Tienda Trujillo", rolId: "tv", esLider: false, estado: "activo" },
    ];
    expect(cuentasAsignables(cuentas, INTEGRANTE, "yo").map((c) => c.id)).toEqual(["1", "3"]);
    expect(cuentasAsignables(cuentas, LIDER, "yo").map((c) => c.id)).toEqual(["2"]);
  });

  it("al bajar a un líder sin sede hay que elegírsela", () => {
    expect(pideUbicacion({ esLider: true, ubicacion: null }, INTEGRANTE)).toBe(true);
    expect(pideUbicacion({ esLider: true, ubicacion: "Tienda Arequipa" }, INTEGRANTE)).toBe(false);
    expect(pideUbicacion({ esLider: true, ubicacion: null }, LIDER)).toBe(false);
    expect(pideUbicacion({ esLider: false, ubicacion: null }, INTEGRANTE)).toBe(false);
  });
});

describe("editor rediseñado (spike colaboradores-ux 2026-09-22)", () => {
  it("agrupa los roles en sistema, terminal y a medida", () => {
    expect(familiaDeRol(LIDER)).toBe("sistema");
    expect(familiaDeRol(INTEGRANTE)).toBe("sistema");
    expect(familiaDeRol(rol({ clave: "terminal_ventas", esSistema: true }))).toBe("terminal");
    expect(familiaDeRol(rol())).toBe("a_medida");
  });
  it("avisa «Solo Inicio» y «Sin uso», nunca del Líder ni de un archivado", () => {
    expect(avisoDelRol(rol(), 16)).toBe("solo_inicio");
    expect(avisoDelRol(rol(), 0)).toBe("sin_uso");
    expect(avisoDelRol(rol({ modulos: ["vender"] }), 3)).toBeNull();
    expect(avisoDelRol(LIDER, 0)).toBeNull();
    expect(avisoDelRol(rol({ archivado: true }), 0)).toBeNull();
  });
  it("separa lo que el borrador suma de lo que quita", () => {
    expect(cambiosDelBorrador(["vender", "caja"], ["caja", "clientas"])).toEqual({ suma: ["clientas"], quita: ["vender"] });
  });
  it("«Encender todo» de un grupo no mete lo que no se delega ni toca otros grupos", () => {
    const r = alternarGrupo(["existencias"], "Compras", true);
    expect(r).toContain("recibir");
    expect(r).toContain("existencias");
    expect(r).not.toContain("facturas_compra");
    expect(alternarGrupo(r, "Compras", false)).toEqual(["existencias"]);
  });
  it("el buscador encuentra por lo que incluye, sin tildes", () => {
    const g = modulosFiltrados("reimprimir");
    expect(g.flatMap((x) => x.modulos.map((m) => m.clave))).toEqual(["historial"]);
    expect(modulosFiltrados("categorias").flatMap((x) => x.modulos.map((m) => m.clave))).toContain("atributos");
    expect(modulosFiltrados("")).toEqual(modulosPorGrupo());
  });
  it("la vista previa marca lo que se suma y lo que se quita", () => {
    const guardado = rol({ modulos: ["vender"] });
    const menu = menuConCambios(guardado, ["existencias"]);
    const cambios = menu.flatMap((f) => [[f.etiqueta, f.cambio], ...f.hijas.map((h) => [`${f.etiqueta}/${h.etiqueta}`, h.cambio])]);
    expect(cambios.some(([, c]) => c === "suma")).toBe(true);
    expect(cambios.some(([, c]) => c === "quita")).toBe(true);
    expect(menuConCambios(guardado, ["vender"]).every((f) => f.cambio === "igual" && f.hijas.every((h) => h.cambio === "igual"))).toBe(true);
  });
});
