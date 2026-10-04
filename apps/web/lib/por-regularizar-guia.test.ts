import { describe, expect, it } from "vitest";
import { faltanDe, sePuedeConfirmar } from "./guia-campos";
import { camposGuiaRegularizar, type EleccionRegularizar } from "./por-regularizar-guia";
import { NO_SU_PROPIA_VENTA, TU_PROPIA_VENTA, motivoPropiaVenta, vendidaPorLaCuenta } from "./por-regularizar-reglas";

// Lo que `regularizar_prenda` rechaza (20260923162300 y 20261004204000), escrito aparte y sin mirar la guía:
//   · sin variante real → «La variante … no existe»
//   · sin una de las dos respuestas → `prenda_forma_invalida`
//   · sin nadie que firme → `responsable_requerido`
//   · firma quien vendió, salvo el líder firmando él mismo (cuenta de líder y firma la persona de esa cuenta) → `regularizar_propia_venta`
//   · la cuenta es de quien vendió y no es de líder → `regularizar_propia_venta`
type Escenario = { prendaElegida: boolean; forma: EleccionRegularizar["forma"]; responsableId: string | null; personaSesionId: string | null; esLider: boolean; vendidoPorId: string | null };
function laBaseAcepta(e: Escenario): boolean {
  if (!e.prendaElegida || e.forma === null || e.responsableId === null) return false;
  if (e.vendidoPorId !== null) {
    if (e.vendidoPorId === e.responsableId && !(e.esLider && e.responsableId === e.personaSesionId)) return false;
    if (e.vendidoPorId === e.personaSesionId && !e.esLider) return false;
  }
  return true;
}
const guiaDe = (e: Escenario) =>
  camposGuiaRegularizar({
    prendaElegida: e.prendaElegida,
    forma: e.forma,
    responsableListo: e.responsableId !== null,
    motivoPropia: motivoPropiaVenta({ vendidoPorId: e.vendidoPorId, responsableId: e.responsableId, personaSesionId: e.personaSesionId, esLider: e.esLider }),
  });

describe("camposGuiaRegularizar — la guía coincide con lo que la base exige", () => {
  it("recorre todas las combinaciones: «se puede confirmar» es exactamente «la base acepta»", () => {
    let n = 0;
    for (const prendaElegida of [true, false])
      for (const forma of ["ya_registrada", "llego_nueva", null] as const)
        for (const responsableId of ["micaela", "lucia", "felipe", null])
          for (const personaSesionId of ["micaela", "lucia", "felipe", null])
            for (const esLider of [true, false])
              for (const vendidoPorId of ["micaela", "felipe", null]) {
                const e = { prendaElegida, forma, responsableId, personaSesionId, esLider, vendidoPorId };
                expect(sePuedeConfirmar(guiaDe(e)), JSON.stringify(e)).toBe(laBaseAcepta(e));
                n++;
              }
    expect(n).toBe(2 * 3 * 4 * 4 * 2 * 3);
  });

  it("lo que «falta» es lo que bloquea, en el orden de la pantalla", () => {
    const vacio = { prendaElegida: false, forma: null, responsableId: null, personaSesionId: null, esLider: false, vendidoPorId: "micaela" };
    expect(faltanDe(guiaDe(vacio)).map((c) => c.id)).toEqual(["prenda", "forma", "responsable"]);
    expect(faltanDe(guiaDe({ ...vacio, prendaElegida: true, forma: "llego_nueva", responsableId: "lucia" }))).toEqual([]);
  });

  it("si el elegido es quien vendió, el campo «Quién regulariza» dice por qué, con la misma frase que la base", () => {
    const e = { prendaElegida: true, forma: "ya_registrada" as const, responsableId: "micaela", personaSesionId: null, esLider: false, vendidoPorId: "micaela" };
    const [responsable] = faltanDe(guiaDe(e));
    expect(responsable?.id).toBe("responsable");
    expect(responsable?.pendiente).toBe(NO_SU_PROPIA_VENTA);
  });
});

describe("motivoPropiaVenta — espejo de la regla de la base", () => {
  const base = { vendidoPorId: "micaela", responsableId: "lucia", personaSesionId: null, esLider: false };
  it("quien vendió no la regulariza: ni firmando ni con su cuenta nombrando a otra", () => {
    expect(motivoPropiaVenta({ ...base, responsableId: "micaela" })).toBe(NO_SU_PROPIA_VENTA);
    expect(motivoPropiaVenta({ ...base, personaSesionId: "micaela" })).toBe(TU_PROPIA_VENTA);
  });
  it("otra persona sí; el líder sí, la suya, firmando él mismo; sin vendedora registrada, cualquiera", () => {
    expect(motivoPropiaVenta(base)).toBeNull();
    expect(motivoPropiaVenta({ ...base, responsableId: "micaela", personaSesionId: "micaela", esLider: true })).toBeNull();
    expect(motivoPropiaVenta({ ...base, vendidoPorId: null, responsableId: "micaela" })).toBeNull();
  });
  it("R1 · con la sesión de una líder abierta, elegir en el combo a la asesora que vendió NO le presta la excepción", () => {
    expect(motivoPropiaVenta({ vendidoPorId: "micaela", responsableId: "micaela", personaSesionId: "felipe", esLider: true })).toBe(NO_SU_PROPIA_VENTA);
  });
  it("desde una terminal (sin persona en la sesión), elegir el nombre del líder que vendió tampoco", () => {
    expect(motivoPropiaVenta({ vendidoPorId: "felipe", responsableId: "felipe", personaSesionId: null, esLider: false })).toBe(NO_SU_PROPIA_VENTA);
  });
  it("el líder que vendió puede nombrar a otra persona como responsable desde su cuenta", () => {
    expect(motivoPropiaVenta({ vendidoPorId: "felipe", responsableId: "lucia", personaSesionId: "felipe", esLider: true })).toBeNull();
  });
});

describe("vendidaPorLaCuenta — la fila lo dice antes de abrirla", () => {
  it("solo si la vendió la persona de esta cuenta y la cuenta no es de líder", () => {
    expect(vendidaPorLaCuenta("micaela", "micaela", false)).toBe(true);
    expect(vendidaPorLaCuenta("micaela", "micaela", true)).toBe(false);
    expect(vendidaPorLaCuenta("micaela", "lucia", false)).toBe(false);
    expect(vendidaPorLaCuenta(null, null, false)).toBe(false);
  });
});
