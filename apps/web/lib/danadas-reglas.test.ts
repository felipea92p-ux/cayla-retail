import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  argumentosDeArreglo,
  argumentosDeReporte,
  camposGuiaArreglo,
  camposGuiaReporte,
  cantidadAjustada,
  desdeInicial,
  estadoValidado,
  interpretarErrorDeDanada,
  leerRespuestaDanada,
  libreEn,
  MAX_TEXTO_DANADA,
  origenDeDanada,
  PARAMETROS_RPC_ARREGLAR,
  PARAMETROS_RPC_REPORTAR,
  problemasReporte,
  puedeEnviarReporte,
  quePasaAlArreglar,
  quePasaAlReportar,
  recordatorioAlReportar,
  respuestaResuelveLaMarca,
  RPC_ARREGLAR_DANADA,
  RPC_REPORTAR_DANADA,
  tallaInicial,
  tallasReportables,
  textoBotonReportar,
  textoErrorDeResolucion,
  textoOrigenDanada,
  TEXTO_RED_DANADA,
  tituloExitoArreglo,
  tituloExitoReporte,
  type DesdeDanada,
  type EnvioReporte,
  type EstadoReporte,
  type TallaReportable,
} from "./danadas-reglas";
import { BOTON_CONFIRMAR_DE_NUEVO } from "./bajada-reglas";
import { sePuedeConfirmar } from "./guia-campos";

// La migración es la fuente: si cambia el nombre o los parámetros de una RPC, la pantalla se entera aquí y no en producción.
const MIGRACION = readFileSync(
  join(__dirname, "..", "..", "..", "supabase", "migrations", "20261005140000_danadas_reportar_y_se_arreglo.sql"),
  "utf8"
).replace(/--[^\n]*/g, "");

function firmaDe(nombre: string): string[] {
  const m = new RegExp(`create or replace function retail\\.${nombre}\\(([^)]*)\\)`).exec(MIGRACION);
  expect(m, nombre).not.toBeNull();
  return m![1].split(",").map((p) => p.trim().split(/\s+/)[0]);
}

describe("el contrato con la base", () => {
  it("los nombres y los parámetros de las dos RPC son los de la migración", () => {
    expect(firmaDe(RPC_REPORTAR_DANADA)).toEqual([...PARAMETROS_RPC_REPORTAR]);
    expect(firmaDe(RPC_ARREGLAR_DANADA)).toEqual([...PARAMETROS_RPC_ARREGLAR]);
  });

  it("los hints que la pantalla lee existen en las funciones", () => {
    for (const hint of ["danada_sin_alcance", "danada_sin_modulo", "arreglo_ya_resuelta", "arreglo_sede_sin_almacen", "responsable_requerido"]) {
      expect(MIGRACION, hint).toContain(`'${hint}'`);
    }
  });

  it("los mínimos y máximos de texto son los de la base (3 a 200)", () => {
    expect(MIGRACION).toContain("between 3 and 200");
    expect(MIGRACION).toContain("char_length(v_motivo) < 3");
    expect(MIGRACION).toContain("char_length(v_nota) < 3");
    expect(MAX_TEXTO_DANADA).toBe(200);
  });

  it("los argumentos llevan los nombres del contrato y el texto sin espacios de más", () => {
    const r = argumentosDeReporte("tru", "v1", "piso", 2, "  Mancha en la manga ", "marca");
    expect(r).toEqual({ p_ubicacion_id: "tru", p_variante_id: "v1", p_cantidad: 2, p_desde: "piso", p_motivo: "Mancha en la manga", p_token: "marca" });
    expect(Object.keys(r).sort()).toEqual([...PARAMETROS_RPC_REPORTAR].sort());
    const a = argumentosDeArreglo("d1", " Se cosió el botón  ", "m2");
    expect(a).toEqual({ p_id: "d1", p_nota: "Se cosió el botón", p_token: "m2" });
    expect(Object.keys(a).sort()).toEqual([...PARAMETROS_RPC_ARREGLAR].sort());
  });

  it("la respuesta se lee solo si calza con el contrato", () => {
    expect(leerRespuestaDanada({ ya_registrada: false, id: "d1", unidades: 2, movimiento_id: "m" })).toEqual({ ya_registrada: false, id: "d1", unidades: 2 });
    expect(leerRespuestaDanada({ ya_registrada: "no", id: "d1", unidades: 2 })).toBeNull();
    expect(leerRespuestaDanada({ ya_registrada: true, id: "", unidades: 2 })).toBeNull();
    expect(leerRespuestaDanada({ ya_registrada: true, id: "d1", unidades: 0 })).toBeNull();
    expect(leerRespuestaDanada({ ya_registrada: true, id: "d1", unidades: 1.5 })).toBeNull();
    expect(leerRespuestaDanada(null)).toBeNull();
    expect(leerRespuestaDanada("ok")).toBeNull();
  });
});

const talla = (varianteId: string, piso: number, almacen: number, nombre: string | null = varianteId): TallaReportable => ({ varianteId, talla: nombre, piso, almacen });

describe("lo libre de cada talla", () => {
  it("sale de las cifras LIBRES de Existencias; donde no hay piso ni almacén cuenta 0", () => {
    expect(
      tallasReportables([
        { varianteId: "a", talla: "S", pisoDisponible: 2, almacenDisponible: 0 },
        { varianteId: "b", talla: "M", pisoDisponible: null, almacenDisponible: null },
        { varianteId: "c", talla: null, pisoDisponible: -1, almacenDisponible: 3 },
      ])
    ).toEqual([talla("a", 2, 0, "S"), talla("b", 0, 0, "M"), talla("c", 0, 3, null)]);
  });

  it("libreEn: lo de ese lugar, 0 sin talla o sin lugar", () => {
    const t = talla("a", 2, 5);
    expect(libreEn(t, "piso")).toBe(2);
    expect(libreEn(t, "almacen")).toBe(5);
    expect(libreEn(t, null)).toBe(0);
    expect(libreEn(null, "piso")).toBe(0);
  });

  it("la talla entra elegida solo si es la ÚNICA con algo libre", () => {
    expect(tallaInicial([talla("a", 0, 0), talla("b", 1, 0)])).toBe("b");
    expect(tallaInicial([talla("a", 1, 0), talla("b", 0, 2)])).toBeNull();
    expect(tallaInicial([talla("a", 0, 0)])).toBeNull();
    expect(tallaInicial([])).toBeNull();
  });

  it("el lugar entra elegido solo si es el ÚNICO posible (con los dos, lo dice la persona: nada de fábrica)", () => {
    expect(desdeInicial(talla("a", 2, 0))).toBe("piso");
    expect(desdeInicial(talla("a", 0, 3))).toBe("almacen");
    expect(desdeInicial(talla("a", 2, 3))).toBeNull();
    expect(desdeInicial(talla("a", 0, 0))).toBeNull();
    expect(desdeInicial(null)).toBeNull();
  });

  it("la cantidad se acomoda a lo libre: nunca más, nunca menos de 1", () => {
    expect(cantidadAjustada(5, 2)).toBe(2);
    expect(cantidadAjustada(0, 2)).toBe(1);
    expect(cantidadAjustada(1.7, 3)).toBe(1);
    expect(cantidadAjustada(Number.NaN, 3)).toBe(1);
    expect(cantidadAjustada(3, 0)).toBe(1);
  });
});

describe("qué falta para reportar", () => {
  const base: EstadoReporte = { talla: talla("a", 2, 1), desde: "piso", cantidad: 1, motivo: "Mancha en la manga" };

  it("completo: nada falta", () => {
    expect(problemasReporte(base)).toEqual([]);
  });

  it("sin talla, sin lugar o sin motivo: lo dice, en el orden de la ventana", () => {
    expect(problemasReporte({ ...base, talla: null, desde: null, motivo: "" }).map((p) => p.campo)).toEqual(["talla", "desde", "motivo"]);
  });

  it("un lugar sin nada libre de esa talla no sirve", () => {
    const p = problemasReporte({ ...base, talla: talla("a", 0, 3), desde: "piso" });
    expect(p).toEqual([{ campo: "desde", texto: "En el piso no hay ninguna libre de esa talla: elige el otro lugar." }]);
  });

  it("más de lo libre, o menos de 1, no", () => {
    expect(problemasReporte({ ...base, cantidad: 3 })).toEqual([{ campo: "cantidad", texto: "Solo hay 2 libres ahí." }]);
    expect(problemasReporte({ ...base, desde: "almacen", cantidad: 2 })).toEqual([{ campo: "cantidad", texto: "Solo hay 1 libre ahí." }]);
    expect(problemasReporte({ ...base, cantidad: 0 }).map((p) => p.campo)).toEqual(["cantidad"]);
    expect(problemasReporte({ ...base, cantidad: 1.5 }).map((p) => p.campo)).toEqual(["cantidad"]);
  });

  it("el motivo: 3 letras útiles como mínimo (los espacios no cuentan) y 200 como máximo, como la base", () => {
    expect(problemasReporte({ ...base, motivo: "  ab  " }).map((p) => p.campo)).toEqual(["motivo"]);
    expect(problemasReporte({ ...base, motivo: " abc " })).toEqual([]);
    expect(problemasReporte({ ...base, motivo: "x".repeat(200) })).toEqual([]);
    expect(problemasReporte({ ...base, motivo: "x".repeat(201) }).map((p) => p.campo)).toEqual(["motivo"]);
  });

  it("la guía de foco dice lo mismo que la validación, en TODAS las combinaciones (no inventa reglas)", () => {
    const tallas = [null, talla("a", 0, 0), talla("b", 2, 0), talla("c", 0, 3), talla("d", 1, 1)];
    const lugares: (DesdeDanada | null)[] = [null, "piso", "almacen"];
    const cantidades = [0, 1, 2, 3, 4, 1.5];
    const motivos = ["", "ab", "abc", "  Mancha  ", "x".repeat(201)];
    let combinaciones = 0;
    for (const t of tallas)
      for (const desde of lugares)
        for (const cantidad of cantidades)
          for (const motivo of motivos)
            for (const responsable of [true, false]) {
              const e = { talla: t, desde, cantidad, motivo };
              const campos = camposGuiaReporte(e, responsable);
              const problemas = problemasReporte(e);
              expect(sePuedeConfirmar(campos)).toBe(problemas.length === 0 && responsable);
              for (const c of campos.filter((x) => x.id !== "responsable")) {
                expect(c.hecho).toBe(!problemas.some((p) => p.campo === c.id));
                if (!c.hecho) expect(c.pendiente).toBe(problemas.find((p) => p.campo === c.id)!.texto);
              }
              combinaciones++;
            }
    expect(combinaciones).toBe(5 * 3 * 6 * 5 * 2);
  });
});

describe("«Se arregló»", () => {
  it("pide qué se le hizo (3 a 200) y quién lo hace; sin eso no se confirma", () => {
    expect(sePuedeConfirmar(camposGuiaArreglo("Se cosió el botón", true))).toBe(true);
    expect(sePuedeConfirmar(camposGuiaArreglo("ok", true))).toBe(false);
    expect(sePuedeConfirmar(camposGuiaArreglo("   ", true))).toBe(false);
    expect(sePuedeConfirmar(camposGuiaArreglo("x".repeat(201), true))).toBe(false);
    expect(sePuedeConfirmar(camposGuiaArreglo("Se cosió el botón", false))).toBe(false);
    expect(camposGuiaArreglo("x".repeat(201), true)[0].pendiente).toBe("Admite hasta 200 caracteres.");
  });

  it("dice a dónde vuelve y cómo se vende después", () => {
    expect(quePasaAlArreglar("Tienda TRU")).toBe("Vuelve al almacén de Tienda TRU. Para venderla, cuélgala en el piso desde Existencias.");
    expect(quePasaAlArreglar("  ")).toBe("Vuelve al almacén. Para venderla, cuélgala en el piso desde Existencias.");
  });
});

describe("los tres finales de una respuesta", () => {
  it("un corte de red es «no sé»: nunca dice «no se guardó nada» y manda a confirmar de nuevo", () => {
    const f = interpretarErrorDeDanada({ message: "TypeError: Failed to fetch" }, "reportar la prenda dañada");
    expect(f).toEqual({ tipo: "red", mensaje: TEXTO_RED_DANADA });
    expect(f.mensaje).not.toMatch(/no se guardó/i);
    expect(f.mensaje).toContain(BOTON_CONFIRMAR_DE_NUEVO);
    // Sin código de Postgres (un 502 del camino) tampoco hay veredicto.
    expect(interpretarErrorDeDanada({ message: "Bad gateway" }, "x").tipo).toBe("red");
  });

  it("no alcanza: el mensaje de la base (que nombra la prenda y lo apartado) y cuántas libres había", () => {
    const f = interpretarErrorDeDanada(
      { code: "P0001", hint: "danada_sin_alcance", message: "No se reportó nada. Polo: pides 2 y en el piso hay 1 libre.", details: '{"hay": 1, "apartadas": 2}' },
      "reportar la prenda dañada"
    );
    expect(f).toEqual({ tipo: "sin_alcance", mensaje: "No se reportó nada. Polo: pides 2 y en el piso hay 1 libre.", hay: 1 });
    expect(interpretarErrorDeDanada({ code: "P0001", hint: "danada_sin_alcance", message: "x", details: "{roto" }, "y")).toEqual({ tipo: "sin_alcance", mensaje: "x", hay: null });
  });

  it("un choque de candados: no se guardó nada, vuelve a confirmar", () => {
    expect(interpretarErrorDeDanada({ code: "40P01", message: "deadlock detected" }, "x").mensaje).toMatch(/No se guardó nada/);
  });

  it("lo demás: el mensaje de la base (P0001), que ya viene en palabras de tienda", () => {
    expect(interpretarErrorDeDanada({ code: "P0001", hint: "arreglo_solo_lider", message: "Solo un líder decide…" }, "x")).toEqual({ tipo: "otro", mensaje: "Solo un líder decide…" });
  });

  it("en un reenvío, solo sueltan la marca las respuestas que la miraron", () => {
    expect(respuestaResuelveLaMarca(null)).toBe(true);
    expect(respuestaResuelveLaMarca({ code: "P0001", hint: "danada_sin_alcance", message: "x" })).toBe(true);
    expect(respuestaResuelveLaMarca({ code: "P0001", hint: "mover_interno_token_reusado", message: "x" })).toBe(true);
    expect(respuestaResuelveLaMarca({ code: "42501", hint: "responsable_no_presente", message: "x" })).toBe(true);
    expect(respuestaResuelveLaMarca({ code: "40P01", message: "deadlock" })).toBe(true);
    // Antes de mirar la marca: el módulo, la sede, una sesión vencida o la red.
    expect(respuestaResuelveLaMarca({ code: "42501", hint: "danada_sin_modulo", message: "x" })).toBe(false);
    expect(respuestaResuelveLaMarca({ code: "P0001", hint: "danada_sin_tienda", message: "x" })).toBe(false);
    expect(respuestaResuelveLaMarca({ message: "Failed to fetch" })).toBe(false);
    expect(respuestaResuelveLaMarca({ code: "PGRST301", message: "JWT expired" })).toBe(false);
  });
});

describe("tras una respuesta incierta: la ventana no se traba", () => {
  // El caso del revisor: se reportó la ÚNICA libre del piso, la respuesta se perdió (502 sin código) y la pantalla se releyó.
  // Con las cifras nuevas el piso dice 0: si la guía validara eso, «Confirmar de nuevo» quedaría apagado y la persona solo
  // podría cerrar, sin saber si se guardó, y reportar «desde el almacén» una prenda sana con otra marca.
  const enviado: EstadoReporte = { talla: talla("a", 1, 3), desde: "piso", cantidad: 1, motivo: "Mancha en la manga" };
  const releido: EstadoReporte = { ...enviado, talla: talla("a", 0, 3) };
  const enDuda: EnvioReporte = {
    argumentos: argumentosDeReporte("tru", "a", "piso", 1, "Mancha en la manga", "marca-1"),
    estado: enviado,
    detalle: "Blusa · Rojo · a · TRU",
  };

  it("con las cifras releídas, lo elegido ya no pasaría la validación (por eso no se valida con ellas)", () => {
    expect(problemasReporte(releido).map((p) => p.campo)).toEqual(["desde"]);
    expect(sePuedeConfirmar(camposGuiaReporte(releido, true))).toBe(false);
  });

  it("en duda, la ventana valida lo ENVIADO: la guía queda completa y «Confirmar de nuevo» se puede tocar", () => {
    const estado = estadoValidado(releido, enDuda);
    expect(estado).toBe(enviado);
    const guiaCompleta = sePuedeConfirmar(camposGuiaReporte(estado, true));
    expect(guiaCompleta).toBe(true);
    expect(puedeEnviarReporte(true, guiaCompleta, true)).toBe(true);
  });

  it("en duda, solo hace falta quién lo hace (como Reponer), aunque la guía dijera otra cosa", () => {
    expect(puedeEnviarReporte(true, false, true)).toBe(true);
    expect(puedeEnviarReporte(true, true, false)).toBe(false);
  });

  it("sin nada en duda, manda la guía (las mismas reglas que la base) y lo elegido ahora", () => {
    expect(estadoValidado(releido, null)).toBe(releido);
    expect(puedeEnviarReporte(false, false, true)).toBe(false);
    expect(puedeEnviarReporte(false, true, true)).toBe(true);
  });

  it("lo que se reenvía son los argumentos guardados, con la MISMA marca", () => {
    expect(enDuda.argumentos).toEqual({ p_ubicacion_id: "tru", p_variante_id: "a", p_cantidad: 1, p_desde: "piso", p_motivo: "Mancha en la manga", p_token: "marca-1" });
  });
});

describe("cuando otro líder la resolvió antes", () => {
  it("el estado crudo de resolver/liquidar se dice en palabras de tienda y pide releer la lista", () => {
    expect(textoErrorDeResolucion({ code: "P0001", message: "Esta prenda ya se resolvió como se_arreglo" }, "resolver esta prenda dañada")).toEqual({
      mensaje: "Esta prenda ya se resolvió como «Se arregló». La lista se actualizó.",
      yaResuelta: true,
    });
    for (const [crudo, palabras] of [["liquidada", "Liquidada"], ["se_boto", "Se botó"], ["donada", "Donada"], ["devuelta_proveedor", "Devuelta al proveedor"]]) {
      const r = textoErrorDeResolucion({ code: "P0001", message: `Esta prenda ya se resolvió como ${crudo}` }, "x");
      expect(r.mensaje).toContain(`«${palabras}»`);
      expect(r.mensaje).not.toContain("_");
    }
  });

  it("traduce TODOS los desenlaces que la base acepta (si se agrega uno, la prueba avisa)", () => {
    const check = /prendas_danadas_estado_check\s+check \(estado in \(([^)]*)\)\)/.exec(MIGRACION);
    expect(check).not.toBeNull();
    const estados = check![1].split(",").map((e) => e.trim().replace(/'/g, "")).filter((e) => e !== "en_cuarentena");
    expect(estados.length).toBe(5);
    for (const e of estados) {
      expect(textoErrorDeResolucion({ code: "P0001", message: `Esta prenda ya se resolvió como ${e}` }, "x").mensaje, e).not.toContain(e);
    }
  });

  it("cualquier otro rechazo pasa como siempre, sin releer", () => {
    expect(textoErrorDeResolucion({ code: "P0001", message: "Solo un líder de sede puede resolver" }, "x")).toEqual({ mensaje: "Solo un líder de sede puede resolver", yaResuelta: false });
    expect(textoErrorDeResolucion({ code: "P0001", message: "Esta prenda ya se resolvió como «Se arregló». Recarga la pantalla." }, "x").yaResuelta).toBe(false);
  });
});

describe("los textos", () => {
  it("el botón dice cuántas y, tras un corte, pide confirmar lo mismo", () => {
    expect(textoBotonReportar(1, false)).toBe("Reportar dañada");
    expect(textoBotonReportar(3, false)).toBe("Reportar 3 dañadas");
    expect(textoBotonReportar(0, false)).toBe("Reportar dañada");
    expect(textoBotonReportar(3, true)).toBe(BOTON_CONFIRMAR_DE_NUEVO);
  });

  it("al reportar, la ventana pide separarla de verdad y no promete que la caja ya no la cobra", () => {
    // El stock se cuenta por código: con otras iguales en el piso, la caja sigue cobrando ese código.
    for (const desde of [null, "piso", "almacen"] as const) {
      const t = quePasaAlReportar(desde);
      expect(t, String(desde)).toMatch(/aparte con una nota/);
      expect(t, String(desde)).toContain("pasa a Dañadas");
      expect(t, String(desde)).not.toMatch(/caja ya no/i);
    }
    expect(quePasaAlReportar("piso")).toMatch(/^Sácala del perchero/);
    expect(quePasaAlReportar("almacen")).toMatch(/^Sácala de su lugar en el almacén/);
    expect(quePasaAlReportar("almacen")).not.toMatch(/perchero/);
  });

  it("el aviso de éxito recuerda el acto físico, según de dónde salió", () => {
    expect(recordatorioAlReportar("piso")).toBe("Sácala del perchero y guárdala aparte con su nota.");
    expect(recordatorioAlReportar("almacen")).toBe("Guárdala aparte con su nota, lejos de lo que se cuelga en el piso.");
  });

  it("los avisos de éxito, en singular y plural", () => {
    expect(tituloExitoReporte(1)).toBe("Prenda reportada como dañada");
    expect(tituloExitoReporte(2)).toBe("2 prendas reportadas como dañadas");
    expect(tituloExitoArreglo(1)).toBe("Volvió al almacén");
    expect(tituloExitoArreglo(3)).toBe("3 prendas volvieron al almacén");
  });

  it("de dónde llegó cada dañada (exactamente uno, como la base)", () => {
    expect(origenDeDanada({ motivoReporte: "Mancha", cambioId: null })).toBe("reporte");
    expect(origenDeDanada({ motivoReporte: null, cambioId: "c1" })).toBe("cambio");
    expect(origenDeDanada({ motivoReporte: null, cambioId: null })).toBe("devolucion");
    expect(textoOrigenDanada("reporte", "Mancha en la manga")).toBe("Reportada en la tienda: Mancha en la manga");
    expect(textoOrigenDanada("cambio", null)).toBe("Volvió en un cambio");
    expect(textoOrigenDanada("devolucion", null)).toBe("Volvió en una devolución");
  });

  it("en pantalla se dice «cliente», nunca «clienta» (ADR-0288 act. k)", () => {
    const fuente = readFileSync(join(__dirname, "danadas-reglas.ts"), "utf8").replace(/\/\/[^\n]*|\/\*[\s\S]*?\*\//g, "");
    expect(fuente).not.toMatch(/clienta/i);
  });
});
