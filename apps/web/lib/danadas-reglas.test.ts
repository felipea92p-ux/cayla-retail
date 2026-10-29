import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  argumentosDeArreglo,
  argumentosDeDevolucion,
  argumentosDeReporte,
  camposGuiaArreglo,
  costoConPlata,
  DESTINOS_ARREGLO,
  leerCostoArreglo,
  MEDIOS_ARREGLO,
  VALORES_DESTINO_ARREGLO,
  VALORES_MEDIO_ARREGLO,
  camposGuiaDevolucion,
  cantidadAjustada,
  desdeInicial,
  etiquetaDeTipo,
  interpretarErrorDeDanada,
  leerDevolvibles,
  leerRespuestaDanada,
  leerTipoDano,
  libreEn,
  MAX_TEXTO_DANADA,
  origenDeDanada,
  PARAMETROS_RPC_ARREGLAR,
  PARAMETROS_RPC_DEVOLVER,
  PARAMETROS_RPC_REPORTAR,
  problemasReporte,
  puedeEnviarReporte,
  quePasaAlArreglar,
  quePasaAlDevolver,
  quePasaAlReportar,
  recordatorioAlReportar,
  respuestaResuelveLaMarca,
  RPC_ARREGLAR_DANADA,
  RPC_DANADAS_DEVOLVIBLES,
  RPC_DEVOLVER_DANADA,
  RPC_REPORTAR_DANADA,
  tallasReportables,
  textoBotonReportar,
  textoDeLoQueTiene,
  textoErrorDeResolucion,
  textoOrigenDanada,
  TEXTO_RED_DANADA,
  TIPOS_DANO,
  tituloExitoArreglo,
  tituloExitoDevolucion,
  tituloExitoReporte,
  type DesdeDanada,
  type EstadoReporte,
  type TallaReportable,
  type TipoDano,
  VALORES_TIPO_DANO,
} from "./danadas-reglas";
import { BOTON_CONFIRMAR_DE_NUEVO } from "./bajada-reglas";
import { sePuedeConfirmar } from "./guia-campos";

// La migración es la fuente: si cambia el nombre o los parámetros de una RPC, la pantalla se entera aquí y no en producción.
const leerMigracion = (archivo: string) => readFileSync(join(__dirname, "..", "..", "..", "supabase", "migrations", archivo), "utf8").replace(/--[^\n]*/g, "");
const MIGRACION_ARREGLO = leerMigracion("20261005140000_danadas_reportar_y_se_arreglo.sql");
// ADR-0564: `reportar_danada` pasó a 7 parámetros (p_tipo al final); su definición vigente vive en la migración del tipo de daño.
const MIGRACION_TIPO = leerMigracion("20261029024000_danadas_tipo_de_dano.sql");
// ADR-0564: `arreglar_prenda_danada` pasó a 5 parámetros (p_destino y p_costo al final); su definición vigente vive en la migración del regreso.
const MIGRACION_REGRESO = leerMigracion("20261029033000_danadas_se_arreglo_o_no_se_pudo.sql");
const MIGRACION = MIGRACION_ARREGLO + MIGRACION_TIPO + MIGRACION_REGRESO;

function firmaDe(nombre: string): string[] {
  const m = new RegExp(`create or replace function retail\\.${nombre}\\(([^)]*)\\)`).exec(nombre === RPC_REPORTAR_DANADA ? MIGRACION_TIPO : MIGRACION_REGRESO);
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
    expect(MIGRACION_ARREGLO).toContain("between 3 and 200");
    expect(MIGRACION_TIPO).toContain("char_length(v_nota) < 3");
    expect(MIGRACION_REGRESO).toContain("char_length(v_nota) < 3");
    expect(MAX_TEXTO_DANADA).toBe(200);
  });

  it("los argumentos llevan los nombres del contrato y el texto sin espacios de más", () => {
    const r = argumentosDeReporte("tru", "v1", "piso", 2, "  Mancha en la manga ", "marca", "mancha");
    expect(r).toEqual({ p_ubicacion_id: "tru", p_variante_id: "v1", p_cantidad: 2, p_desde: "piso", p_motivo: "Mancha en la manga", p_token: "marca", p_tipo: "mancha" });
    expect(Object.keys(r).sort()).toEqual([...PARAMETROS_RPC_REPORTAR].sort());
    const a = argumentosDeArreglo("d1", " Se cosió el botón  ", "m2", "piso", 12.5, "yape");
    expect(a).toEqual({ p_id: "d1", p_nota: "Se cosió el botón", p_token: "m2", p_destino: "piso", p_costo: 12.5, p_medio_pago: "yape" });
    expect(Object.keys(a).sort()).toEqual([...PARAMETROS_RPC_ARREGLAR].sort());
    // Sin costo no se manda (es opcional); sin destino, al almacén como siempre.
    expect(argumentosDeArreglo("d1", "x y z", "m2")).toEqual({ p_id: "d1", p_nota: "x y z", p_token: "m2", p_destino: "almacen" });
    // Un costo en 0 es «no costó»: ni costo ni medio (no hay gasto).
    expect(argumentosDeArreglo("d1", "x y z", "m2", "almacen", 0, "yape")).toEqual({ p_id: "d1", p_nota: "x y z", p_token: "m2", p_destino: "almacen" });
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

describe("el tipo de daño (ADR-0564)", () => {
  it("la lista de la pantalla es EXACTAMENTE la que acepta la base (migración y candado)", () => {
    const enLaBase = (re: RegExp) => [...(re.exec(MIGRACION_TIPO)?.[1] ?? "").matchAll(/'([a-z_]+)'/g)].map((m) => m[1]);
    expect(enLaBase(/tipo_dano in \(([^)]*)\)/)).toEqual([...VALORES_TIPO_DANO]);
    expect(enLaBase(/v_tipo not in \(([^)]*)\)/)).toEqual([...VALORES_TIPO_DANO]);
  });

  it("el nombre que la base escribe cuando no hay nota es el de la pantalla", () => {
    for (const x of TIPOS_DANO.filter((v) => v.valor !== "otro")) expect(MIGRACION_TIPO, x.valor).toContain(`when '${x.valor}' then '${x.etiqueta}'`);
  });

  it("solo se lee un tipo de la lista; lo raro (una fila de antes, una web vieja) es null", () => {
    expect(leerTipoDano("boton_cierre")).toBe("boton_cierre");
    for (const raro of [null, undefined, "", "polilla", "MANCHA", 3]) expect(leerTipoDano(raro)).toBeNull();
    expect(etiquetaDeTipo("boton_cierre")).toBe("Botón o cierre");
  });

  it("la lista dice qué tiene: el tipo y, si hay, la nota; sin tipo, el texto de antes", () => {
    expect(textoDeLoQueTiene("mancha", "Mancha")).toBe("Mancha");
    expect(textoDeLoQueTiene("mancha", "cerca del cuello")).toBe("Mancha · cerca del cuello");
    expect(textoDeLoQueTiene("boton_cierre", "Botón o cierre")).toBe("Botón o cierre");
    expect(textoDeLoQueTiene("otro", "Tela pellizcada")).toBe("Tela pellizcada");
    expect(textoDeLoQueTiene("otro", null)).toBe("Otro");
    expect(textoDeLoQueTiene(null, "Mancha en la manga")).toBe("Mancha en la manga");
    expect(textoDeLoQueTiene(null, null)).toBeNull();
    expect(textoOrigenDanada("reporte", "cerca del cuello", null, "mancha")).toBe("Reportada en la tienda: Mancha · cerca del cuello");
    expect(textoOrigenDanada("reporte", null, null, null)).toBe("Reportada en la tienda");
  });
});

describe("qué falta para reportar", () => {
  const base: EstadoReporte = { talla: talla("a", 2, 1), desde: "piso", cantidad: 1, tipo: "mancha", motivo: "Mancha en la manga" };

  it("completo: nada falta", () => {
    expect(problemasReporte(base)).toEqual([]);
  });

  it("sin talla, sin lugar o sin tipo: lo dice, en el orden de la ventana", () => {
    expect(problemasReporte({ ...base, talla: null, desde: null, tipo: null, motivo: "" }).map((p) => p.campo)).toEqual(["talla", "desde", "tipo"]);
  });

  it("con un tipo de la lista la nota es opcional; solo «Otro» obliga a escribirla (como la base)", () => {
    for (const tipo of VALORES_TIPO_DANO.filter((v) => v !== "otro")) expect(problemasReporte({ ...base, tipo, motivo: "" }), tipo).toEqual([]);
    expect(problemasReporte({ ...base, tipo: "otro", motivo: "" })).toEqual([{ campo: "motivo", texto: "Cuenta qué tiene la prenda." }]);
    expect(problemasReporte({ ...base, tipo: "otro", motivo: "ab" }).map((p) => p.campo)).toEqual(["motivo"]);
    expect(problemasReporte({ ...base, tipo: "otro", motivo: "Tela pellizcada" })).toEqual([]);
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

  it("la nota, si se escribe: 3 letras útiles como mínimo (los espacios no cuentan) y 200 como máximo, como la base", () => {
    expect(problemasReporte({ ...base, motivo: "  ab  " }).map((p) => p.campo)).toEqual(["motivo"]);
    expect(problemasReporte({ ...base, motivo: " abc " })).toEqual([]);
    expect(problemasReporte({ ...base, motivo: "x".repeat(200) })).toEqual([]);
    expect(problemasReporte({ ...base, motivo: "x".repeat(201) }).map((p) => p.campo)).toEqual(["motivo"]);
  });

});

describe("«Se arregló» al piso o al almacén, con el costo (ADR-0564)", () => {
  it("los destinos de la pantalla son EXACTAMENTE los que acepta la base", () => {
    const enLaBase = [...(/v_destino not in \(([^)]*)\)/.exec(MIGRACION_REGRESO)?.[1] ?? "").matchAll(/'([a-z_]+)'/g)].map((m) => m[1]);
    expect(enLaBase).toEqual([...VALORES_DESTINO_ARREGLO]);
    expect(DESTINOS_ARREGLO.map((d) => d.valor)).toEqual(["almacen", "piso"]);
  });

  it("el costo es opcional; si se escribe, de 0 a 99,999.99 con hasta 2 decimales (punto o coma)", () => {
    expect(leerCostoArreglo("")).toBeNull();
    expect(leerCostoArreglo("   ")).toBeNull();
    expect(leerCostoArreglo("12.50")).toBe(12.5);
    expect(leerCostoArreglo("12,5")).toBe(12.5);
    expect(leerCostoArreglo("0")).toBe(0);
    expect(leerCostoArreglo("99999.99")).toBe(99999.99);
    for (const malo of ["-1", "100000", "1.234", "abc", "12.", "1e3", "1 2"]) expect(leerCostoArreglo(malo), malo).toBe("invalido");
    // La función de la base rechaza lo mismo (los hints que la pantalla lee existen).
    expect(MIGRACION_REGRESO).toContain("99999.99");
    for (const h of ["arreglo_destino_invalido", "arreglo_costo_invalido", "arreglo_sede_sin_piso"]) expect(MIGRACION_REGRESO, h).toContain(`'${h}'`);
  });

  it("un costo con plata es un gasto de Finanzas: pide cómo se pagó (los medios de Caja), y sin costo no pide nada", () => {
    const enLaBase = [...(/v_medio not in \(([^)]*)\)/.exec(MIGRACION_REGRESO)?.[1] ?? "").matchAll(/'([a-z_]+)'/g)].map((m) => m[1]);
    expect(enLaBase).toEqual([...VALORES_MEDIO_ARREGLO]);
    expect(MEDIOS_ARREGLO.map((m) => m.valor)).toEqual(["efectivo", "yape", "plin"]);
    for (const h of ["arreglo_pago_invalido", "arreglo_caja_cerrada", "arreglo_gasto_sin_permiso"]) expect(MIGRACION_REGRESO, h).toContain(`'${h}'`);
    expect(MIGRACION_REGRESO).toContain("registrar_gasto(");
    expect(costoConPlata("12.50")).toBe(true);
    for (const no of ["", "0", "0.00", "abc", "-1"]) expect(costoConPlata(no), no).toBe(false);
    const guia = (costo: string, medio: "" | "yape") => camposGuiaArreglo("Se cosió el botón", true, true, costo, medio);
    expect(guia("", "").some((c) => c.id === "medio")).toBe(false);
    expect(sePuedeConfirmar(guia("12.50", ""))).toBe(false);
    expect(sePuedeConfirmar(guia("12.50", "yape"))).toBe(true);
    expect(sePuedeConfirmar(guia("0", ""))).toBe(true);
  });

  it("la guía pasa por el destino como sugerido y el costo mal escrito bloquea (la base lo rechazaría); vacío no", () => {
    const base = (costo: string, confirmado = true) => camposGuiaArreglo("Se cosió el botón", true, confirmado, costo, "yape");
    expect(sePuedeConfirmar(base(""))).toBe(true);
    expect(sePuedeConfirmar(base("12.50"))).toBe(true);
    expect(sePuedeConfirmar(base("abc"))).toBe(false);
    expect(sePuedeConfirmar(base("", false))).toBe(true); // el destino sin confirmar nunca es un candado
    expect(base("", false).find((c) => c.id === "destino")?.sugerido).toBe(true);
  });

  it("dice a dónde vuelve, y al piso aclara que Frescura cuenta desde hoy", () => {
    expect(quePasaAlArreglar("Tienda TRU", "piso")).toBe("Vuelve al piso de Tienda TRU, lista para vender: ya no hace falta colgarla. Frescura cuenta su edad desde hoy.");
    expect(tituloExitoArreglo(1, "piso")).toBe("Volvió al piso");
    expect(tituloExitoArreglo(2, "piso")).toBe("2 prendas volvieron al piso");
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

describe("tras una respuesta incierta: el paso no se traba", () => {
  // El caso del revisor: se reportó la ÚNICA libre del piso, la respuesta se perdió (502 sin código) y la pantalla se releyó.
  // Con las cifras nuevas el piso dice 0: si se validara eso, «Confirmar de nuevo» quedaría apagado y la persona solo podría
  // cerrar, sin saber si se guardó. El panel de la talla usa esta misma regla en todos sus pasos (`FlujoTalla`).
  const enviado: EstadoReporte = { talla: talla("a", 1, 3), desde: "piso", cantidad: 1, tipo: "mancha", motivo: "Mancha en la manga" };
  const releido: EstadoReporte = { ...enviado, talla: talla("a", 0, 3) };

  it("con las cifras releídas, lo elegido ya no pasaría la validación (por eso no se valida con ellas)", () => {
    expect(problemasReporte(releido).map((p) => p.campo)).toEqual(["desde"]);
  });

  it("en duda, solo hace falta quién lo hace (como Reponer), aunque la validación dijera otra cosa", () => {
    expect(puedeEnviarReporte(true, false, true)).toBe(true);
    expect(puedeEnviarReporte(true, true, false)).toBe(false);
  });

  it("sin nada en duda, manda la validación (las mismas reglas que la base)", () => {
    expect(puedeEnviarReporte(false, false, true)).toBe(false);
    expect(puedeEnviarReporte(false, true, true)).toBe(true);
  });

  it("lo que se reenvía son los argumentos con la MISMA marca", () => {
    expect(argumentosDeReporte("tru", "a", "piso", 1, "Mancha en la manga", "marca-1", "mancha")).toEqual({ p_ubicacion_id: "tru", p_variante_id: "a", p_cantidad: 1, p_desde: "piso", p_motivo: "Mancha en la manga", p_token: "marca-1", p_tipo: "mancha" });
  });
});

describe("cuando otra persona la resolvió antes", () => {
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

// «Devolver al proveedor» (ADR-0362, fase 5b, actividad 6a): lo que llegó dañado en una recepción vuelve a su proveedor y queda como deuda.
describe("devolver al proveedor lo que llegó dañado", () => {
  const MIGRACION_5B = readFileSync(
    join(__dirname, "..", "..", "..", "supabase", "migrations", "20261015150000_nos_debe_saldo_a_favor.sql"),
    "utf8",
  ).replace(/--[^\n]*/g, "");

  it("los nombres, los parámetros y los hints son los de la migración", () => {
    const m = new RegExp(`create or replace function retail\\.${RPC_DEVOLVER_DANADA}\\(([^)]*)\\)`).exec(MIGRACION_5B);
    expect(m).not.toBeNull();
    expect(m![1].split(",").map((p) => p.trim().split(/\s+/)[0])).toEqual([...PARAMETROS_RPC_DEVOLVER]);
    expect(MIGRACION_5B).toContain(`create or replace function retail.${RPC_DANADAS_DEVOLVIBLES}(p_ubicacion_id uuid)`);
    for (const hint of ["danada_devolver_sin_modulo", "danada_devolver_ya_resuelta", "danada_devolver_no_es_de_recepcion", "responsable_requerido"]) {
      expect(MIGRACION_5B, hint).toContain(`'${hint}'`);
    }
    // La nota, hasta 200 letras en la base y en la pantalla.
    expect(MIGRACION_5B).toContain(`char_length(v_nota) > ${MAX_TEXTO_DANADA}`);
  });

  it("lee a quién vuelve cada una y descarta lo raro", () => {
    const m = leerDevolvibles([
      { id: "pd-1", proveedor_id: "prov-1", proveedor: "Textiles Andina", envio: "ENV-000302", arreglo: "Sin arreglo" },
      { id: "pd-2", proveedor_id: "prov-1" },
      "basura",
    ]);
    expect([...m.keys()]).toEqual(["pd-1"]);
    expect(m.get("pd-1")).toEqual({ proveedorId: "prov-1", proveedor: "Textiles Andina", envio: "ENV-000302", arreglo: "Sin arreglo" });
    expect(leerDevolvibles(null).size).toBe(0);
  });

  it("de dónde llegó: la recepción se reconoce por su motivo y dice el envío, el proveedor y el arreglo", () => {
    expect(origenDeDanada({ motivoReporte: "Llegó dañada en ENV-000302", cambioId: null })).toBe("recepcion");
    expect(origenDeDanada({ motivoReporte: "Llegó dañada en la caja", cambioId: null })).toBe("reporte");
    const dev = { proveedorId: "prov-1", proveedor: "Textiles Andina", envio: "ENV-000302", arreglo: "Sin arreglo" };
    expect(textoOrigenDanada("recepcion", "Llegó dañada en ENV-000302", dev)).toBe("Llegó dañada en ENV-000302 · Textiles Andina · sin arreglo");
    // Sin a quién devolverla (llegó de más, fuera de la guía), dice lo que anotó la recepción.
    expect(textoOrigenDanada("recepcion", "Llegó dañada en ENV-000302")).toBe("Llegó dañada en ENV-000302");
  });

  it("la guía: la nota es opcional y hasta 200 letras; quién lo hace, obligatorio", () => {
    expect(sePuedeConfirmar(camposGuiaDevolucion("", true))).toBe(true);
    expect(camposGuiaDevolucion("", true)[0]).toMatchObject({ id: "devolucion", requerido: false, hecho: false });
    expect(camposGuiaDevolucion("Tela rota", true)[0]).toMatchObject({ requerido: false, hecho: true });
    expect(sePuedeConfirmar(camposGuiaDevolucion("x".repeat(MAX_TEXTO_DANADA + 1), true))).toBe(false);
    expect(sePuedeConfirmar(camposGuiaDevolucion("", false))).toBe(false);
  });

  it("los argumentos, lo que pasa y el aviso de éxito", () => {
    const a = argumentosDeDevolucion("pd-1", "  Tela rota  ", "tok");
    expect(a).toEqual({ p_id: "pd-1", p_nota: "Tela rota", p_token: "tok" });
    expect(Object.keys(a).sort()).toEqual([...PARAMETROS_RPC_DEVOLVER].sort());
    expect(quePasaAlDevolver("Textiles Andina")).toContain("queda como deuda de Textiles Andina");
    expect(tituloExitoDevolucion(1, "Textiles Andina")).toBe("Devuelta a Textiles Andina");
    expect(tituloExitoDevolucion(3, "Textiles Andina")).toBe("3 prendas devueltas a Textiles Andina");
  });
});
