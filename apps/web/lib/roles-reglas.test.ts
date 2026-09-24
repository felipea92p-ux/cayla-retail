import { describe, expect, it } from "vitest";
import { MODULOS, MODULOS_DE_HOY, esDelegable } from "./modulos";
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
  esMiRolSinSerLider,
  etiquetasDelMenu,
  fueraDeLoMio,
  motivoPorLoMio,
  puedeAsignarRol,
  hayCambios,
  menuDelRol,
  modulosPorGrupo,
  motivoParaNoArchivar,
  motivoParaNoEncender,
  motivoParaNoGuardar,
  nombreDeCopia,
  pideUbicacion,
  rolesAsignables,
  rolSoloParaPersonas,
  veModulo,
  type RolVista,
  conGuardadosLocales,
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
  version: 1,
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

  it("hoy todo módulo sale con interruptor (Felipe, 2026-09-22: se abrieron los 7 que tenían candado); el candado sigue para uno que nazca así", () => {
    for (const clave of ["roles", "colaboradores", "analisis", "etiquetas", "facturas_compra", "por_pagar", "notas_credito", "caja"] as const) {
      expect(controlDe(INTEGRANTE, modulo(clave)), clave).toEqual({ tipo: "interruptor", editable: true });
    }
    expect(controlDe(INTEGRANTE, { ...modulo("caja"), soloLider: true })).toEqual({ tipo: "candado", texto: "Solo líder" });
    expect(controlDe(INTEGRANTE, { ...modulo("caja"), noDelegable: true })).toEqual({ tipo: "candado", texto: "Solo líder por ahora" });
  });

  it("un rol archivado no se edita", () => {
    expect(controlDe(rol({ archivado: true }), modulo("caja"))).toEqual({ tipo: "interruptor", editable: false });
  });

  it("alternar enciende y apaga, en el orden del catálogo, y nunca deja entrar lo que no se delega", () => {
    expect(alternarModulo(["movimientos"], "vender")).toEqual(["vender", "movimientos"]);
    expect(alternarModulo(["vender", "movimientos"], "vender")).toEqual(["movimientos"]);
    // Desde 20260923130000/20260923131000 se delegan: entran como cualquier otro.
    expect(alternarModulo([], "roles")).toEqual(["roles"]);
    expect(alternarModulo(["vender"], "por_pagar")).toEqual(["vender", "por_pagar"]);
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
      { etiqueta: "Ventas", hijas: ["Punto de Venta", "Caja", "Historial", "Posventa"] }, // Apartados: módulo propio sin rol (ADR-0196)
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
    // Quien administra roles SIN ser líder (20260923131000): no toca a los líderes ni da el rol Líder.
    expect(cuentasAsignables(cuentas, INTEGRANTE, "yo", false).map((c) => c.id)).toEqual(["3"]);
    expect(cuentasAsignables(cuentas, LIDER, "yo", false)).toEqual([]);
    expect(rolesAsignables([LIDER, INTEGRANTE], { tipo: "persona" }, false).map((r) => r.id)).toEqual(["i"]);
  });

  it("al bajar a un líder sin sede hay que elegírsela", () => {
    expect(pideUbicacion({ esLider: true, ubicacion: null }, INTEGRANTE)).toBe(true);
    expect(pideUbicacion({ esLider: true, ubicacion: "Tienda Arequipa" }, INTEGRANTE)).toBe(false);
    expect(pideUbicacion({ esLider: true, ubicacion: null }, LIDER)).toBe(false);
    expect(pideUbicacion({ esLider: false, ubicacion: null }, INTEGRANTE)).toBe(false);
  });
});

// ADR-0161 P6 (Felipe, 2026-09-22; en la base, `fn_exigir_rol_de_terminal`, 20260923140000): Colaboradores y Roles y accesos
// solo se dan a PERSONAS. Un aparato compartido de mostrador no da ni quita accesos.
describe("P6 · Colaboradores y Roles y accesos, solo para personas", () => {
  const GESTOR = rol({ id: "g", nombre: "Gestor", modulos: ["colaboradores", "existencias"] });
  const ALMACEN = rol({ id: "a", nombre: "Almacén", modulos: ["existencias"] });
  const TERMINAL = { tipo: "terminal" as const, id: "t1", nombre: "Caja Trujillo", ubicacion: "Tienda Trujillo", rolId: "a", esLider: false, estado: "activo" };
  const PERSONA = { tipo: "persona" as const, id: "p1", nombre: "Micaela Ríos", ubicacion: "Tienda Trujillo", rolId: "a", esLider: false, estado: "activo" };

  it("un rol con Colaboradores o Roles y accesos es solo para personas; el Líder no cuenta aquí", () => {
    expect(rolSoloParaPersonas(GESTOR)).toBe(true);
    expect(rolSoloParaPersonas(rol({ modulos: ["roles"] }))).toBe(true);
    expect(rolSoloParaPersonas(ALMACEN)).toBe(false);
    expect(rolSoloParaPersonas(LIDER)).toBe(false);
  });

  it("a una terminal no se le ofrece un rol así; a una persona, sí", () => {
    expect(rolesAsignables([GESTOR, ALMACEN], { tipo: "terminal" }).map((r) => r.id)).toEqual(["a"]);
    expect(rolesAsignables([GESTOR, ALMACEN], { tipo: "persona" }).map((r) => r.id)).toEqual(["g", "a"]);
  });

  it("al asignar un rol así, las terminales no salen en la lista de cuentas", () => {
    expect(cuentasAsignables([TERMINAL, PERSONA], GESTOR, null).map((c) => c.id)).toEqual(["p1"]);
    expect(cuentasAsignables([TERMINAL, PERSONA], rol({ id: "x", modulos: ["vender"] }), null).map((c) => c.id)).toEqual(["t1", "p1"]);
  });

  it("encenderlos en un rol que tienen terminales se avisa con sus nombres; apagar, o encender otro módulo, no", () => {
    const motivo = motivoParaNoEncender("colaboradores", ALMACEN.modulos, [TERMINAL, PERSONA]);
    expect(motivo).toContain("Colaboradores");
    expect(motivo).toContain("solo se da a personas");
    expect(motivo).toContain("Caja Trujillo");
    expect(motivoParaNoEncender("roles", ALMACEN.modulos, [TERMINAL])).toContain("Roles y accesos");
    expect(motivoParaNoEncender("colaboradores", ["colaboradores"], [TERMINAL])).toBeNull(); // ya estaba: es apagarlo
    expect(motivoParaNoEncender("facturacion", ALMACEN.modulos, [TERMINAL])).toBeNull();
    expect(motivoParaNoEncender("colaboradores", ALMACEN.modulos, [PERSONA])).toBeNull();
  });

  it("al guardar (módulo a módulo, «Encender todo» o la matriz) se frena el primero que no se puede encender", () => {
    expect(motivoParaNoGuardar(ALMACEN.modulos, [...ALMACEN.modulos, "vender", "colaboradores"], [TERMINAL])).toContain("Colaboradores");
    expect(motivoParaNoGuardar(ALMACEN.modulos, [...ALMACEN.modulos, "vender"], [TERMINAL])).toBeNull();
    expect(motivoParaNoGuardar(["colaboradores"], [], [TERMINAL])).toBeNull(); // apagar, siempre
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
  it("«Encender todo» enciende el grupo entero (solo lo que se delega) sin tocar otros grupos", () => {
    const r = alternarGrupo(["existencias"], "Compras", true);
    const compras = MODULOS.filter((m) => m.grupo === "Compras" && esDelegable(m)).map((m) => m.clave);
    expect(compras.length).toBeGreaterThan(0);
    for (const c of compras) expect(r).toContain(c);
    expect(r).toContain("existencias");
    expect(r.filter((c) => !compras.includes(c))).toEqual(["existencias"]);
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

describe("ADR-0178: el escalón Admin y «solo das lo que tienes»", () => {
  const VENDER = rol({ id: "v", nombre: "Vendedora", modulos: ["vender", "caja"] });
  const GESTOR = rol({ id: "g", nombre: "Gestor", modulos: ["roles", "vender"] });
  const yo = { misModulos: GESTOR.modulos, miRolId: "g" };
  const lider = { misModulos: null, miRolId: null };

  it("fueraDeLoMio: lo que uno no ve; un líder (null) lo ve todo", () => {
    expect(fueraDeLoMio(["vender", "caja"], ["roles", "vender"])).toEqual(["caja"]);
    expect(fueraDeLoMio(["vender", "caja"], null)).toEqual([]);
  });

  it("el propio rol no se edita sin ser líder; el de otro, sí", () => {
    expect(esMiRolSinSerLider(GESTOR, yo)).toBe(true);
    expect(esMiRolSinSerLider(GESTOR, { ...yo, misModulos: null })).toBe(false);
    expect(controlDe(GESTOR, modulo("vender"), yo, true)).toEqual({ tipo: "interruptor", editable: false });
    expect(motivoPorLoMio(GESTOR, GESTOR.modulos, ["roles"], yo)).toMatch(/propio rol/);
  });

  it("lo que uno no tiene sale con candado si está apagado, y se puede apagar si está encendido", () => {
    expect(controlDe(VENDER, modulo("caja"), yo, false)).toEqual({ tipo: "candado", texto: "No lo tienes" });
    expect(controlDe(VENDER, modulo("caja"), yo, true)).toEqual({ tipo: "interruptor", editable: true });
    expect(controlDe(VENDER, modulo("caja"), lider, false)).toEqual({ tipo: "interruptor", editable: true });
    expect(motivoPorLoMio(VENDER, ["vender"], ["vender", "caja"], yo)).toMatch(/Caja/);
    expect(motivoPorLoMio(VENDER, ["vender", "caja"], ["vender"], yo)).toBeNull(); // apagar, siempre
    expect(motivoPorLoMio(VENDER, ["vender"], ["vender", "caja"], lider)).toBeNull();
  });

  it("solo un Admin da el rol Líder; un rol a medida, quien ve todos sus módulos", () => {
    expect(puedeAsignarRol(LIDER, true, null)).toBe(true);
    expect(puedeAsignarRol(LIDER, false, null)).toBe(false); // líder que no es admin
    expect(puedeAsignarRol(VENDER, false, null)).toBe(true);
    expect(puedeAsignarRol(VENDER, false, GESTOR.modulos)).toBe(false);
    expect(rolesAsignables([LIDER, VENDER, GESTOR], { tipo: "persona" }, false, GESTOR.modulos).map((r) => r.id)).toEqual(["g"]);
  });

  it("sin ser Admin no se ofrece a un líder como cuenta, y un rol fuera de lo mío no va a nadie", () => {
    const cuentas = [
      { tipo: "persona" as const, id: "p1", nombre: "Ana", ubicacion: "TRU", rolId: "i", esLider: false, estado: "activo" },
      { tipo: "persona" as const, id: "p2", nombre: "Líder", ubicacion: null, rolId: "l", esLider: true, estado: "activo" },
    ];
    expect(cuentasAsignables(cuentas, VENDER, null, false, null).map((c) => c.id)).toEqual(["p1"]);
    expect(cuentasAsignables(cuentas, VENDER, null, true, null).map((c) => c.id)).toEqual(["p1", "p2"]);
    expect(cuentasAsignables(cuentas, VENDER, null, false, GESTOR.modulos)).toEqual([]);
  });

  it("a quien no está por debajo («solo alcanzas…», 20260923174500) no se le ofrece cambiar el rol", () => {
    const cuentas = [
      { tipo: "persona" as const, id: "p1", nombre: "Ana", ubicacion: "TRU", rolId: "i", esLider: false, estado: "activo" },
      { tipo: "persona" as const, id: "p3", nombre: "Par", ubicacion: "TRU", rolId: "g", esLider: false, estado: "activo" },
    ];
    expect(cuentasAsignables(cuentas, VENDER, null, false, null, ["p3"]).map((c) => c.id)).toEqual(["p1"]);
  });
});

describe("lo recién guardado manda hasta que el servidor lo alcance (ADR-0193)", () => {
  it("con una versión local más nueva, el rol usa sus módulos y su versión", () => {
    const [r] = conGuardadosLocales([rol({ id: "a", modulos: ["vender"], version: 3 })], { a: { version: 5, modulos: ["vender", "caja"] } });
    expect(r.version).toBe(5);
    expect(r.modulos).toEqual(["vender", "caja"]);
  });

  it("cuando el servidor trae la misma versión o una mayor, lo local deja de contar", () => {
    const servidor = rol({ id: "a", modulos: ["existencias"], version: 7 });
    expect(conGuardadosLocales([servidor], { a: { version: 5, modulos: ["vender"] } })[0]).toBe(servidor);
    expect(conGuardadosLocales([servidor], { a: { version: 7, modulos: ["vender"] } })[0]).toBe(servidor);
  });
});
