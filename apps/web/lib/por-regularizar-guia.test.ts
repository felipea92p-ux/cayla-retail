import { describe, expect, it } from "vitest";
import { faltanDe, sePuedeConfirmar } from "./guia-campos";
import { camposGuiaRegularizar, type EleccionRegularizar } from "./por-regularizar-guia";
import { NO_SU_PROPIA_VENTA, motivoPropiaVenta } from "./por-regularizar-reglas";

// Lo que `regularizar_prenda` rechaza (20260923162300 y 20261004204000), escrito aparte y sin mirar la guía:
//   · sin variante real → «La variante … no existe»
//   · sin una de las dos respuestas → `prenda_forma_invalida`
//   · sin nadie que firme → `responsable_requerido`
//   · firma (o es la cuenta de) quien vendió y la cuenta no es de líder → `regularizar_propia_venta`
type Escenario = { prendaElegida: boolean; forma: EleccionRegularizar["forma"]; responsableId: string | null; personaSesionId: string | null; esLider: boolean; vendidoPorId: string | null };
function laBaseAcepta(e: Escenario): boolean {
  if (!e.prendaElegida || e.forma === null || e.responsableId === null) return false;
  if (!e.esLider && e.vendidoPorId !== null && (e.vendidoPorId === e.responsableId || e.vendidoPorId === e.personaSesionId)) return false;
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
        for (const responsableId of ["micaela", "lucia", null])
          for (const personaSesionId of ["micaela", "lucia", null])
            for (const esLider of [true, false])
              for (const vendidoPorId of ["micaela", null]) {
                const e = { prendaElegida, forma, responsableId, personaSesionId, esLider, vendidoPorId };
                expect(sePuedeConfirmar(guiaDe(e)), JSON.stringify(e)).toBe(laBaseAcepta(e));
                n++;
              }
    expect(n).toBe(216);
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
    expect(motivoPropiaVenta({ ...base, personaSesionId: "micaela" })).toBe(NO_SU_PROPIA_VENTA);
  });
  it("otra persona sí; el líder sí, la suya; sin vendedora registrada, cualquiera", () => {
    expect(motivoPropiaVenta(base)).toBeNull();
    expect(motivoPropiaVenta({ ...base, responsableId: "micaela", personaSesionId: "micaela", esLider: true })).toBeNull();
    expect(motivoPropiaVenta({ ...base, vendidoPorId: null, responsableId: "micaela" })).toBeNull();
  });
});
