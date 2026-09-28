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
  esLider: true,
};

describe("permisosDelDetalle (tarea #11): el candado de la pantalla dice lo mismo que la base (ADR-0240)", () => {
  it("con todo, en su tienda, se ofrece todo", () => {
    expect(permisosDelDetalle(TODO)).toEqual({
      reponerYRetirar: true,
      apartar: true,
      ajustar: true,
      trasladar: true,
      etiquetasEHistorial: true,
      pedirAOtraSede: true,
      explicarSinModuloBajada: false,
      eliminar: true,
    });
  });

  it("sin «Bajada al piso» no hay Reponer ni Retirar, y la talla por colgar lo explica", () => {
    const p = permisosDelDetalle({ ...TODO, puedeBajarAlPiso: false });
    expect(p.reponerYRetirar).toBe(false);
    expect(p.explicarSinModuloBajada).toBe(true);
    expect(p.apartar).toBe(true);
  });

  it("sin «Apartados» no se aparta ni se pide a otra sede", () => {
    const p = permisosDelDetalle({ ...TODO, veApartados: false });
    expect(p.apartar).toBe(false);
    expect(p.pedirAOtraSede).toBe(false);
    expect(p.reponerYRetirar).toBe(true);
  });

  it("mirando OTRA sede no se ofrece nada que escriba ni nada que trabaje sobre la sede activa", () => {
    expect(permisosDelDetalle({ ...TODO, enSedeActiva: false })).toEqual({
      reponerYRetirar: false,
      apartar: false,
      ajustar: false,
      trasladar: false,
      etiquetasEHistorial: false,
      pedirAOtraSede: false,
      explicarSinModuloBajada: false,
      eliminar: false,
    });
  });

  it("donde no se separa piso y almacén (Taller) no hay reponer ni apartar, pero sí ajustar y trasladar", () => {
    const p = permisosDelDetalle({ ...TODO, separaPisoAlmacen: false, esTienda: false });
    expect(p.reponerYRetirar).toBe(false);
    expect(p.apartar).toBe(false);
    expect(p.explicarSinModuloBajada).toBe(false);
    expect(p.ajustar).toBe(true);
    expect(p.trasladar).toBe(true);
    expect(p.pedirAOtraSede).toBe(false);
  });

  it("Eliminar el producto (ADR-0252): solo un Líder (o Admin), en su sede, y sin importar los módulos ni el Taller", () => {
    expect(permisosDelDetalle({ ...TODO, esLider: false }).eliminar).toBe(false);
    expect(permisosDelDetalle({ ...TODO, esLider: false }).ajustar).toBe(true);
    const lider = { ...TODO, puedeBajarAlPiso: false, veApartados: false, puedeAjustar: false, veTraslados: false };
    expect(permisosDelDetalle(lider).eliminar).toBe(true);
    expect(permisosDelDetalle({ ...TODO, separaPisoAlmacen: false, esTienda: false }).eliminar).toBe(true);
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
