import { describe, expect, it } from "vitest";
import { estadosDe, faltanDe, sePuedeConfirmar, siguienteDe } from "./guia-campos";
import { camposDeApertura, type AlcanceElegido, type EleccionApertura } from "./conteo-inicio-guia";

// Lo que `abrir_conteo` rechaza (supabase/migrations/20260930010100_conteo_rediseno_funciones.sql), escrito aparte y sin mirar
// `camposDeApertura`: la guía no puede decir «ya se puede» donde la base diría que no, ni bloquear donde la base aceptaría.
//   · sede con piso y almacén sin elegir cuál → `sububicacion_requerida`
//   · alcance «categoria» sin categoría → «Elige una categoría cuando el alcance es "categoria"»
//   · nadie que firme → `fn_actor_persona_id(true)` no devuelve a nadie
// Y una regla que es de la PANTALLA, no de la base (todavía no existe un alcance «por prenda»): «Por prenda» sin ninguna prenda
// abriría un conteo de TODO el lugar, que no es lo que la persona pidió.
function laBaseAcepta(e: EleccionApertura): boolean {
  if (e.separaPisoAlmacen && e.lugarId === "") return false;
  if (e.alcance === "categoria" && e.categoriaId === "") return false;
  if (e.alcance === "prendas" && e.prendasElegidas === 0) return false;
  if (!e.responsableListo) return false;
  return true;
}

const ALCANCES: AlcanceElegido[] = ["todo", "categoria", "prendas"];

describe("camposDeApertura — la guía coincide con lo que la base exige", () => {
  it("recorre las 96 combinaciones: «se puede confirmar» es exactamente «la base acepta»", () => {
    let combinaciones = 0;
    for (const separaPisoAlmacen of [true, false])
      for (const lugarId of ["", "piso"])
        for (const alcance of ALCANCES)
          for (const categoriaId of ["", "camisas"])
            for (const prendasElegidas of [0, 2])
              for (const responsableListo of [true, false]) {
                const e = { separaPisoAlmacen, lugarId, alcance, categoriaId, prendasElegidas, responsableListo };
                expect(sePuedeConfirmar(camposDeApertura(e)), JSON.stringify(e)).toBe(laBaseAcepta(e));
                combinaciones++;
              }
    expect(combinaciones).toBe(96);
  });

  it("lo que «falta» es lo que bloquea, ni más ni menos", () => {
    const e: EleccionApertura = { separaPisoAlmacen: true, lugarId: "", alcance: "categoria", categoriaId: "", prendasElegidas: 0, responsableListo: false };
    expect(faltanDe(camposDeApertura(e)).map((c) => c.id)).toEqual(["donde", "que", "quien"]);
    expect(faltanDe(camposDeApertura({ ...e, lugarId: "piso" })).map((c) => c.id)).toEqual(["que", "quien"]);
    expect(faltanDe(camposDeApertura({ ...e, lugarId: "piso", categoriaId: "camisas", responsableListo: true }))).toEqual([]);
  });
});

describe("camposDeApertura — qué sigue", () => {
  const base: EleccionApertura = { separaPisoAlmacen: true, lugarId: "", alcance: "todo", categoriaId: "", prendasElegidas: 0, responsableListo: true };

  it("al abrir la tarjeta sigue «dónde»; «qué» ya viene hecho con su «Todo» por defecto", () => {
    const campos = camposDeApertura(base);
    expect(siguienteDe(campos)?.id).toBe("donde");
    expect(estadosDe(campos)).toEqual({ donde: "ahora", que: "hecho", quien: "hecho" });
  });

  it("al pedir una categoría sin elegirla, «qué» vuelve a faltar y es lo que sigue", () => {
    const campos = camposDeApertura({ ...base, lugarId: "piso", alcance: "categoria" });
    expect(siguienteDe(campos)?.id).toBe("que");
    expect(estadosDe(campos)).toEqual({ donde: "hecho", que: "ahora", quien: "hecho" });
  });

  it("una categoría que quedó elegida no cuenta si se volvió a «Todo»", () => {
    const campos = camposDeApertura({ ...base, lugarId: "piso", alcance: "todo", categoriaId: "camisas" });
    expect(estadosDe(campos).que).toBe("hecho");
    expect(sePuedeConfirmar(campos)).toBe(true);
  });

  it("«Por prenda» sin ninguna prenda falta y es lo que sigue; con una, queda hecho", () => {
    const sin = camposDeApertura({ ...base, lugarId: "piso", alcance: "prendas" });
    expect(siguienteDe(sin)?.id).toBe("que");
    expect(sin.find((c) => c.id === "que")).toMatchObject({ nombre: "Prendas", pendiente: "Elige al menos una prenda." });
    expect(estadosDe(sin)).toEqual({ donde: "hecho", que: "ahora", quien: "hecho" });
    const con = camposDeApertura({ ...base, lugarId: "piso", alcance: "prendas", prendasElegidas: 1 });
    expect(estadosDe(con).que).toBe("hecho");
    expect(sePuedeConfirmar(con)).toBe(true);
  });

  it("lo que quedó elegido de otra opción no cuenta: una categoría no vale para «Por prenda», ni unas prendas para «Una categoría»", () => {
    expect(estadosDe(camposDeApertura({ ...base, lugarId: "piso", alcance: "prendas", categoriaId: "camisas" })).que).toBe("ahora");
    expect(estadosDe(camposDeApertura({ ...base, lugarId: "piso", alcance: "categoria", prendasElegidas: 3 })).que).toBe("ahora");
  });

  it("una categoría pendiente sigue llamándose «Categoría» en el «Falta:»", () => {
    expect(camposDeApertura({ ...base, alcance: "categoria" }).find((c) => c.id === "que")?.nombre).toBe("Categoría");
  });

  it("el Taller no separa piso y almacén: no hay pregunta «dónde» y, con responsable, ya está todo listo", () => {
    const campos = camposDeApertura({ ...base, separaPisoAlmacen: false });
    expect(campos.map((c) => c.id)).toEqual(["que", "quien"]);
    expect(siguienteDe(campos)).toBeNull();
    expect(sePuedeConfirmar(campos)).toBe(true);
  });

  it("sin responsable lo último que falta es «quién cuenta»", () => {
    const campos = camposDeApertura({ ...base, lugarId: "piso", responsableListo: false });
    expect(siguienteDe(campos)?.id).toBe("quien");
    expect(campos.find((c) => c.id === "quien")?.pendiente).toBe("Elige quién cuenta.");
  });
});
