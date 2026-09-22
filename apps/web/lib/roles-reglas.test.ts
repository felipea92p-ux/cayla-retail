import { describe, expect, it } from "vitest";
import { MODULOS, MODULOS_DE_HOY } from "./modulos";
import {
  alternarModulo,
  controlDe,
  cuentasAsignables,
  etiquetasDelMenu,
  hayCambios,
  menuDelRol,
  modulosPorGrupo,
  motivoParaNoArchivar,
  nombreDeCopia,
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
      { etiqueta: "Ventas", hijas: ["Punto de Venta", "Caja", "Historial", "Cambios", "Devoluciones"] },
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

  it("no se ofrece el Líder ni un rol archivado; a un líder no se le cambia el rol", () => {
    const archivado = rol({ id: "a", archivado: true });
    expect(rolesAsignables([LIDER, INTEGRANTE, archivado]).map((r) => r.id)).toEqual(["i"]);
    expect(
      cuentasAsignables([
        { tipo: "persona", id: "1", nombre: "Felipe", ubicacion: null, rolId: "l", esLider: true, estado: "activo" },
        { tipo: "terminal", id: "2", nombre: "Terminal Ventas TRU", ubicacion: "Tienda Trujillo", rolId: "tv", esLider: false, estado: "activo" },
      ]).map((c) => c.id),
    ).toEqual(["2"]);
  });
});
