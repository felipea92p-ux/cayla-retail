import { describe, expect, it } from "vitest";
import { sePuedeConfirmar } from "./guia-campos";
import type { MaterialVista } from "./insumos-reglas";
import { avisosDeEditarTela, camposDeEditarTela, coloresConNombreDesfasado, datosDeLaTelaYaGuardada, hayCambiosEnLaTela, notaDeLosColores, payloadDeEditarTela, problemasDeEditarTela } from "./editar-tela-reglas";
import { MENSAJE_ANCHO } from "./tela-nueva-reglas";

// «Editar tela» (ADR-0554, actividad 3): se corrige con las MISMAS reglas con que se creó, y sin cambios no hay nada que guardar.

const tela = (extra: Partial<MaterialVista> = {}): MaterialVista => ({
  id: "m1",
  codigo: "MM-01",
  nombre: "Milano Melange",
  tipo: "tela",
  tejidoId: null,
  composicion: null,
  unidad: "metro",
  merma: 0,
  compra: "metro",
  ancho: null,
  gramaje: null,
  metrosPorRollo: null,
  version: "2026-10-28T12:00:00.123456+00:00",
  ...extra,
});

describe("lo que la hoja muestra al abrir", () => {
  it("la tela de producción tal cual: sin tejido, sin composición, por metro, sin merma", () => {
    expect(datosDeLaTelaYaGuardada(tela())).toEqual({ nombre: "Milano Melange", tejidoId: "", composicion: "", compra: "metro", ancho: "", gramaje: "", metrosPorRollo: "", merma: "" });
  });
  it("la merma se muestra en porcentaje, con sus decimales (0,05 → «5»; 0,0525 → «5.25»)", () => {
    expect(datosDeLaTelaYaGuardada(tela({ merma: 0.05 })).merma).toBe("5");
    expect(datosDeLaTelaYaGuardada(tela({ merma: 0.0525 })).merma).toBe("5.25");
  });
  it("por kilo trae su ancho y su gramaje; por rollo, los metros", () => {
    expect(datosDeLaTelaYaGuardada(tela({ compra: "kilo", ancho: 160, gramaje: 180 }))).toMatchObject({ compra: "kilo", ancho: "160", gramaje: "180" });
    expect(datosDeLaTelaYaGuardada(tela({ compra: "rollo", metrosPorRollo: 80 }))).toMatchObject({ compra: "rollo", metrosPorRollo: "80" });
  });
});

describe("sin cambios no hay nada que guardar", () => {
  const abierta = datosDeLaTelaYaGuardada(tela({ merma: 0.05, tejidoId: "t1", composicion: "100 % algodón" }));
  it("lo recién abierto no tiene cambios; un espacio de más o «5,00» tampoco", () => {
    expect(hayCambiosEnLaTela(abierta, abierta)).toBe(false);
    expect(hayCambiosEnLaTela(abierta, { ...abierta, nombre: "  Milano Melange ", merma: "5,00" })).toBe(false);
  });
  it("cambiar el nombre, el tejido, la composición, la merma o cómo se compra sí es un cambio", () => {
    for (const cambio of [{ nombre: "Milano" }, { tejidoId: "t2" }, { composicion: "" }, { merma: "6" }, { compra: "kilo" as const, ancho: "160", gramaje: "180" }]) {
      expect(hayCambiosEnLaTela(abierta, { ...abierta, ...cambio }), JSON.stringify(cambio)).toBe(true);
    }
  });
});

describe("las reglas son las de crear la tela", () => {
  const abierta = datosDeLaTelaYaGuardada(tela());
  it("la tela de producción, tal cual, se puede guardar (aunque le falte el tejido: eso se SUGIERE, no bloquea)", () => {
    expect(problemasDeEditarTela(abierta)).toEqual([]);
  });
  it("sin nombre, con la merma fuera de rango o por kilo con un ancho en metros no se guarda", () => {
    expect(problemasDeEditarTela({ ...abierta, nombre: "  " })).toEqual(["Ponle un nombre a la tela."]);
    expect(problemasDeEditarTela({ ...abierta, merma: "70" })).toEqual(["La merma va de 0 % a menos de 50 %."]);
    expect(problemasDeEditarTela({ ...abierta, compra: "kilo", ancho: "1.60", gramaje: "180" })).toEqual([MENSAJE_ANCHO]);
    expect(problemasDeEditarTela({ ...abierta, compra: "rollo" })).toEqual(["Di cuántos metros trae un rollo (lo habitual)."]);
  });
});

describe("lo que se manda a editar_material", () => {
  it("la merma como fracción; el ancho y el gramaje solo por kilo; sin colores", () => {
    const p = payloadDeEditarTela({ nombre: " Milano Melange ", tejidoId: "t1", composicion: " 100 % algodón ", compra: "kilo", ancho: "160", gramaje: "180", metrosPorRollo: "", merma: "5" }, "v1");
    expect(p).toMatchObject({ nombre: "Milano Melange", tejido_id: "t1", composicion: "100 % algodón", unidad_compra: "kilo", ancho_cm: 160, gramaje_gm2: 180, merma_pct: 0.05 });
    expect(p).not.toHaveProperty("colores");
    expect(payloadDeEditarTela({ ...datosDeLaTelaYaGuardada(tela()) }, "v1")).not.toHaveProperty("ancho_cm");
  });
  it("lleva la versión que la hoja leyó al abrirse, tal cual (texto: pasarla por Date le quita los microsegundos y la base la rechazaría)", () => {
    const m = tela();
    expect(payloadDeEditarTela(datosDeLaTelaYaGuardada(m), m.version)).toMatchObject({ version: "2026-10-28T12:00:00.123456+00:00" });
  });
});

describe("colores con el nombre desfasado", () => {
  const vocabulario = { colores: [{ codigo: "ARN", nombre: "Arena", hex: null }, { codigo: "NEG", nombre: "Negro", hex: null }] };
  const m = { nombre: "Milano Melange" };
  it("los que tienen el nombre que la base les escribiría hoy no cuentan", () => {
    expect(coloresConNombreDesfasado(m, [{ nombre: "Milano Melange · Arena", colorCodigo: "ARN" }, { nombre: "Milano Melange · Negro", colorCodigo: "NEG" }], vocabulario)).toBe(0);
  });
  it("renombrar el color en Catálogo deja desfasado al insumo hasta que se guarde su tela", () => {
    const renombrado = { colores: [{ codigo: "ARN", nombre: "Arena clara", hex: null }, { codigo: "NEG", nombre: "Negro", hex: null }] };
    expect(coloresConNombreDesfasado(m, [{ nombre: "Milano Melange · Arena", colorCodigo: "ARN" }, { nombre: "Milano Melange · Negro", colorCodigo: "NEG" }], renombrado)).toBe(1);
  });
  it("un color que ya no está en la lista no se compara (no se sabe cómo se llamaría); uno sin color se llama como la tela", () => {
    expect(coloresConNombreDesfasado(m, [{ nombre: "Lo que sea", colorCodigo: "XXX" }], vocabulario)).toBe(0);
    expect(coloresConNombreDesfasado(m, [{ nombre: "Milano Melange", colorCodigo: null }], vocabulario)).toBe(0);
    expect(coloresConNombreDesfasado(m, [{ nombre: "Milano Melange · Arena", colorCodigo: null }], vocabulario)).toBe(1);
  });
  it("si la tela misma se renombró, todos los colores quedan desfasados", () => {
    expect(coloresConNombreDesfasado({ nombre: "Milano" }, [{ nombre: "Milano Melange · Arena", colorCodigo: "ARN" }, { nombre: "Milano Melange · Negro", colorCodigo: "NEG" }], vocabulario)).toBe(2);
  });
});

describe("lo que la hoja dice de los colores", () => {
  it("«su color» con uno, «sus N colores» con varios, y sin colores solo lo que no cambia", () => {
    expect(notaDeLosColores(1)).toContain("les llegan a su color al guardar");
    expect(notaDeLosColores(1)).not.toMatch(/sus 1/);
    expect(notaDeLosColores(3)).toContain("les llegan a sus 3 colores al guardar");
    expect(notaDeLosColores(0)).toBe("El código de la tela no cambia, y el stock tampoco.");
  });
  it("cambiar el nombre o la merma avisa lo que NO hace; cambiar el tejido o dejarlo igual no avisa nada", () => {
    const abierta = datosDeLaTelaYaGuardada(tela({ merma: 0.05 }));
    expect(avisosDeEditarTela(abierta, abierta)).toEqual([]);
    expect(avisosDeEditarTela(abierta, { ...abierta, tejidoId: "t2" })).toEqual([]);
    expect(avisosDeEditarTela(abierta, { ...abierta, nombre: "Milano" })).toHaveLength(1);
    expect(avisosDeEditarTela(abierta, { ...abierta, nombre: "Milano" })[0]).toContain("nombre nuevo");
    expect(avisosDeEditarTela(abierta, { ...abierta, merma: "8" })[0]).toContain("merma nueva");
    expect(avisosDeEditarTela(abierta, { ...abierta, nombre: "Milano", merma: "8" })).toHaveLength(2);
  });
  it("un espacio de más, «5,00» o un nombre vacío mientras se escribe no avisan nada", () => {
    const abierta = datosDeLaTelaYaGuardada(tela({ merma: 0.05 }));
    expect(avisosDeEditarTela(abierta, { ...abierta, nombre: "  Milano Melange ", merma: "5,00" })).toEqual([]);
    expect(avisosDeEditarTela(abierta, { ...abierta, nombre: "" })).toEqual([]);
  });
});

describe("la guía de «Editar tela»", () => {
  const abierta = datosDeLaTelaYaGuardada(tela());
  it("el tejido y la composición se SUGIEREN pero nunca bloquean; quién lo anota sí es obligatorio", () => {
    const sin = camposDeEditarTela({ ...abierta, responsableListo: false });
    expect(sin.find((c) => c.id === "tejido")).toMatchObject({ requerido: false, sugerido: true, hecho: false });
    expect(sin.find((c) => c.id === "quien")).toMatchObject({ requerido: true, hecho: false });
    expect(sePuedeConfirmar(sin)).toBe(false);
    expect(sePuedeConfirmar(camposDeEditarTela({ ...abierta, responsableListo: true }))).toBe(true);
  });
  it("la guía y la hoja deciden igual: se puede confirmar exactamente cuando no hay problemas y alguien firma", () => {
    for (const cambio of [{}, { nombre: "" }, { merma: "70" }, { compra: "kilo" as const }, { compra: "kilo" as const, ancho: "160", gramaje: "180" }]) {
      const e = { ...abierta, ...cambio };
      for (const firma of [true, false]) {
        expect(sePuedeConfirmar(camposDeEditarTela({ ...e, responsableListo: firma })), `${JSON.stringify(cambio)} firma=${firma}`).toBe(problemasDeEditarTela(e).length === 0 && firma);
      }
    }
  });
});
