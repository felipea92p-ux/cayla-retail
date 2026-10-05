import { describe, expect, it } from "vitest";
import { alternarMarcasDePrenda, permisosDelDetalle, type EntradaPermisos } from "./existencias-permisos";

const TODO: EntradaPermisos = {
  separaPisoAlmacen: true,
  enSedeActiva: true,
  puedeBajarAlPiso: true,
  veApartados: true,
  puedeAjustar: true,
  veTraslados: true,
  esTienda: true,
  editaCatalogo: true,
};

describe("permisosDelDetalle (tarea #11): el candado de la pantalla dice lo mismo que la base (ADR-0240)", () => {
  it("con todo, en su tienda, se ofrece todo", () => {
    expect(permisosDelDetalle(TODO)).toEqual({
      bajarYRetirar: true,
      apartar: true,
      ajustar: true,
      trasladar: true,
      etiquetasEHistorial: true,
      pedirAOtraSede: true,
      eliminar: true,
    });
  });

  it("sin poder colgar en el piso (otra sede o sin piso y almacén en su tienda) no hay «Colgar en el piso» ni Retirar", () => {
    const p = permisosDelDetalle({ ...TODO, puedeBajarAlPiso: false });
    expect(p.bajarYRetirar).toBe(false);
    expect(p.apartar).toBe(true);
  });

  it("sin «Apartados» no se aparta ni se pide a otra sede", () => {
    const p = permisosDelDetalle({ ...TODO, veApartados: false });
    expect(p.apartar).toBe(false);
    expect(p.pedirAOtraSede).toBe(false);
    expect(p.bajarYRetirar).toBe(true);
  });

  it("mirando OTRA sede no se ofrece nada que escriba ni nada que trabaje sobre la sede activa", () => {
    expect(permisosDelDetalle({ ...TODO, enSedeActiva: false })).toEqual({
      bajarYRetirar: false,
      apartar: false,
      ajustar: false,
      trasladar: false,
      etiquetasEHistorial: false,
      pedirAOtraSede: false,
      eliminar: false,
    });
  });

  it("donde no se separa piso y almacén (Taller) no hay reponer ni apartar, pero sí ajustar y trasladar", () => {
    const p = permisosDelDetalle({ ...TODO, separaPisoAlmacen: false, esTienda: false });
    expect(p.bajarYRetirar).toBe(false);
    expect(p.apartar).toBe(false);
    expect(p.ajustar).toBe(true);
    expect(p.trasladar).toBe(true);
    expect(p.pedirAOtraSede).toBe(false);
  });

  it("Eliminar el producto (ADR-0252, act. 2026-10-03): quien edita el catálogo, en su sede, sin importar los otros módulos ni el Taller", () => {
    // La misma regla que la tarjeta de Catálogo y que la base (`fn_puede_editar_catalogo`): la cuenta de almacén lo ve.
    expect(permisosDelDetalle({ ...TODO, editaCatalogo: false }).eliminar).toBe(false);
    expect(permisosDelDetalle({ ...TODO, editaCatalogo: false }).ajustar).toBe(true);
    const soloCatalogo = { ...TODO, puedeBajarAlPiso: false, veApartados: false, puedeAjustar: false, veTraslados: false };
    expect(permisosDelDetalle(soloCatalogo).eliminar).toBe(true);
    expect(permisosDelDetalle({ ...TODO, separaPisoAlmacen: false, esTienda: false }).eliminar).toBe(true);
    // Mirando otra sede, tampoco: borra el producto en todas, pero firma con el Responsable de la sede activa.
    expect(permisosDelDetalle({ ...TODO, enSedeActiva: false }).eliminar).toBe(false);
  });

  it("cada módulo apaga solo lo suyo", () => {
    expect(permisosDelDetalle({ ...TODO, veTraslados: false }).trasladar).toBe(false);
    expect(permisosDelDetalle({ ...TODO, puedeAjustar: false }).ajustar).toBe(false);
  });
});

describe("alternarMarcasDePrenda (tarea #11): marcar una prenda es marcar sus tallas", () => {
  it("marca todas las tallas de la prenda sin tocar las de otra", () => {
    expect([...alternarMarcasDePrenda(new Set(["otra"]), ["s", "m"])].sort()).toEqual(["m", "otra", "s"]);
  });
  it("si ya estaban todas, las desmarca (y deja las de otra)", () => {
    expect([...alternarMarcasDePrenda(new Set(["s", "m", "otra"]), ["s", "m"])]).toEqual(["otra"]);
  });
  it("si estaba solo una, completa la prenda (no la desmarca)", () => {
    expect([...alternarMarcasDePrenda(new Set(["s"]), ["s", "m"])].sort()).toEqual(["m", "s"]);
  });
  it("una prenda sin tallas visibles no cambia nada", () => {
    expect([...alternarMarcasDePrenda(new Set(["x"]), [])]).toEqual(["x"]);
  });
});
