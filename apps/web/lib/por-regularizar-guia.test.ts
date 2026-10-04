import { describe, expect, it } from "vitest";
import { faltanDe, sePuedeConfirmar } from "./guia-campos";
import { camposGuiaRegularizar, type EleccionRegularizar } from "./por-regularizar-guia";

// Lo que `regularizar_prenda` rechaza (20260923162300), escrito aparte y sin mirar la guía:
//   · sin variante real → «La variante … no existe»
//   · sin una de las dos respuestas → `prenda_forma_invalida`
function laBaseAcepta(e: EleccionRegularizar): boolean {
  return e.prendaElegida && e.forma !== null;
}

describe("camposGuiaRegularizar — la guía coincide con lo que la base exige", () => {
  it("recorre todas las combinaciones: «se puede confirmar» es exactamente «la base acepta»", () => {
    let n = 0;
    for (const prendaElegida of [true, false])
      for (const forma of ["ya_registrada", "llego_nueva", null] as const) {
        const e = { prendaElegida, forma };
        expect(sePuedeConfirmar(camposGuiaRegularizar(e)), JSON.stringify(e)).toBe(laBaseAcepta(e));
        n++;
      }
    expect(n).toBe(6);
  });

  it("lo que «falta» es lo que bloquea, en el orden de la pantalla", () => {
    expect(faltanDe(camposGuiaRegularizar({ prendaElegida: false, forma: null })).map((c) => c.id)).toEqual(["prenda", "forma"]);
    expect(faltanDe(camposGuiaRegularizar({ prendaElegida: true, forma: null })).map((c) => c.id)).toEqual(["forma"]);
  });
});
