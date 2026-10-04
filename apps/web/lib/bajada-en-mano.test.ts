import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  argumentosEnMano,
  avisoDeEnMano,
  BOTON_EN_MANO_DE_NUEVO,
  colgadasAquiDe,
  hechaEnMano,
  interpretarErrorEnMano,
  leerRespuestaEnMano,
  MAX_NOTA_EN_MANO,
  NOTA_AUTOMATICA,
  notaLimpia,
  ofertaEnMano,
  PARAMETROS_RPC_EN_MANO,
  pasosEnMano,
  respuestaResuelveLaMarcaEnMano,
  RPC_EN_MANO,
  sumarHecha,
  textoDeHecha,
  textoDeOferta,
  textoYaEstabaColgada,
  TOPE_DEL_DIA_EN_MANO,
  type RespuestaEnMano,
} from "./bajada-en-mano";
import { esRpcDeLectura } from "./espera-reglas";

// La asesora está frente al rack con una prenda en la mano y el sistema dice 0 en el almacén (ADR-0328, actividad 9). Estas
// pruebas fijan qué se le ofrece, cómo se llama a la base y qué se le dice, sin navegador ni base.

const SEDE = "Tienda TRU";
const id = (n: number) => `aaaaaaaa-0000-4000-8000-${String(n).padStart(12, "0")}`;
const TOKEN = "3f2b6c1e-8d4a-4b7e-9c21-5a6d7e8f9a0b";
const BLUSA = { referencia: "Blusa lino", talla: "M", color: "Blanco" };

function respuesta(parcial: Partial<RespuestaEnMano> = {}): RespuestaEnMano {
  return {
    bajada_id: id(1),
    ya_registrada: false,
    corregida: true,
    ajuste_movimiento_id: id(2),
    movimiento_id: id(3),
    piso: 1,
    almacen: 0,
    registrada_en: "2026-10-04T15:32:00.000Z",
    ...parcial,
  };
}

// La migración es la fuente de verdad de la firma, de la nota, de los topes y de los rechazos: la pantalla los repite, y esta
// prueba los cruza (la llamada va con `as never`: ni tsc ni `datos:comparar` ven sus parámetros).
const DIR_MIGRACIONES = new URL("../../../supabase/migrations/", import.meta.url);
function ultimaDefinicion(): string {
  let ultima = "";
  for (const archivo of readdirSync(DIR_MIGRACIONES).filter((f) => /^\d{14}_.+\.sql$/.test(f)).sort()) {
    const sql = readFileSync(new URL(archivo, DIR_MIGRACIONES), "utf8");
    const i = sql.search(/create\s+or\s+replace\s+function\s+retail\.bajar_en_mano\s*\(/i);
    if (i >= 0) ultima = sql.slice(i, sql.indexOf("$fn$;", i));
  }
  return ultima;
}
const SQL = ultimaDefinicion();

describe("la firma, la nota y los topes de bajar_en_mano en la migración", () => {
  it("existe y recibe los mismos parámetros que manda la pantalla, en el mismo orden", () => {
    expect(SQL).not.toBe("");
    const params = /bajar_en_mano\s*\(([^)]*)\)/i.exec(SQL)?.[1].split(",").map((p) => p.trim().split(/\s+/)[0]);
    expect(params).toEqual([...PARAMETROS_RPC_EN_MANO]);
    expect(RPC_EN_MANO).toBe("bajar_en_mano");
    const args = argumentosEnMano(id(50), id(1), "Venía en un fardo", TOKEN);
    expect(Object.keys(args)).toEqual([...PARAMETROS_RPC_EN_MANO]);
  });

  it("la nota automática, el largo de la nota y el tope del día son los de la base", () => {
    expect(SQL).toContain(`c_nota constant text := '${NOTA_AUTOMATICA}';`);
    expect(SQL).toContain(`c_max_nota constant integer := ${MAX_NOTA_EN_MANO};`);
    expect(SQL).toContain(`c_tope_del_dia constant integer := ${TOPE_DEL_DIA_EN_MANO};`);
  });

  it("los rechazos que «resuelven la marca» la base de verdad los levanta DESPUÉS de tomarla; módulo y tienda, ANTES", () => {
    const marca = SQL.indexOf("pg_advisory_xact_lock");
    expect(marca).toBeGreaterThan(0);
    for (const hint of ["en_mano_token_reusado", "en_mano_apartada", "en_mano_sin_historia", "en_mano_tope_del_dia", "responsable_requerido"]) {
      expect(SQL.indexOf(`'${hint}'`), hint).toBeGreaterThan(marca);
      expect(respuestaResuelveLaMarcaEnMano({ code: "P0001", hint, message: "x" }), hint).toBe(true);
    }
    for (const hint of ["en_mano_sin_modulo", "en_mano_sin_tienda", "en_mano_sin_token", "en_mano_no_es_prenda"]) {
      expect(SQL.indexOf(`'${hint}'`), hint).toBeLessThan(marca);
      expect(respuestaResuelveLaMarcaEnMano({ code: "P0001", hint, message: "x" }), hint).toBe(false);
    }
  });

  it("el loader global la trata como guardado (espera a la base: nada optimista en el stock)", () => {
    expect(esRpcDeLectura(RPC_EN_MANO)).toBe(false);
  });
});

describe("ofertaEnMano: qué se le ofrece cuando el almacén está en 0", () => {
  it("nada en el piso: corregir y colgar", () => {
    expect(ofertaEnMano({ piso: 0, danado: 0 }, 0)).toEqual({ tipo: "corregir", danadas: 0 });
  });

  it("el sistema ya cuenta colgadas: primero preguntar «¿es una de esas?» (no inventar stock)", () => {
    expect(ofertaEnMano({ piso: 3, danado: 0 }, 0)).toEqual({ tipo: "preguntar", enPiso: 3, danadas: 0 });
  });

  // La segunda blusa igual del mismo fardo: la del piso es la que ella misma colgó hace un minuto.
  it("las que ella corrigió y colgó aquí no cuentan como «ya colgadas»: la segunda igual del fardo vuelve a «corregir»", () => {
    expect(ofertaEnMano({ piso: 1, danado: 0 }, 1)).toEqual({ tipo: "corregir", danadas: 0 });
    expect(ofertaEnMano({ piso: 3, danado: 0 }, 1)).toEqual({ tipo: "preguntar", enPiso: 2, danadas: 0 });
  });

  it("con la pantalla aún sin releer (piso viejo menor que lo colgado aquí) no sale negativo", () => {
    expect(ofertaEnMano({ piso: 0, danado: 0 }, 2)).toEqual({ tipo: "corregir", danadas: 0 });
  });

  it("las dañadas en cuarentena viajan para advertir (nunca negativas; sin dato, 0)", () => {
    expect(ofertaEnMano({ piso: 0, danado: 2 }, 0)).toEqual({ tipo: "corregir", danadas: 2 });
    expect(ofertaEnMano({ piso: 0, danado: -1 }, 0)).toEqual({ tipo: "corregir", danadas: 0 });
  });
});

describe("los textos de la tarjeta y de la ventana", () => {
  it("corregir: dice el hecho y la salida, sin «avisa al líder»", () => {
    const t = textoDeOferta({ tipo: "corregir", danadas: 0 }, BLUSA, SEDE);
    expect(t).toBe("Blusa lino · M · Blanco: el sistema no la tiene en el almacén de Tienda TRU. Si la tienes en la mano, corrígela y cuélgala aquí mismo.");
    expect(t).not.toMatch(/líder/i);
  });

  it("preguntar, en singular y en plural", () => {
    expect(textoDeOferta({ tipo: "preguntar", enPiso: 1, danadas: 0 }, BLUSA, SEDE)).toBe(
      "Blusa lino · M · Blanco: el almacén de Tienda TRU está en 0 y el sistema ya cuenta 1 colgada. ¿La que tienes es una de esas?"
    );
    expect(textoDeOferta({ tipo: "preguntar", enPiso: 4, danadas: 0 }, BLUSA, SEDE)).toContain("ya cuenta 4 colgadas");
  });

  it("con dañadas en cuarentena, la advertencia va al final", () => {
    expect(textoDeOferta({ tipo: "corregir", danadas: 1 }, BLUSA, SEDE)).toMatch(/Ojo: hay 1 dañada en cuarentena; si la tuya es esa, no la cuelgues\.$/);
    expect(textoDeOferta({ tipo: "preguntar", enPiso: 1, danadas: 2 }, BLUSA, SEDE)).toMatch(/hay 2 dañadas en cuarentena/);
  });

  it("«Ya estaba colgada» dice que no se registró nada", () => {
    expect(textoYaEstabaColgada(BLUSA)).toBe("Listo: Blusa lino · M · Blanco ya cuenta en el piso. Cuélgala; no se registró nada.");
  });

  it("los pasos nombran la sede, «Encontré prendas» y la nota automática", () => {
    const [uno, dos, tres] = pasosEnMano(SEDE);
    expect(uno).toBe(`Se suma 1 al almacén de Tienda TRU como «Encontré prendas», con la nota «${NOTA_AUTOMATICA}».`);
    expect(dos).toMatch(/Se baja al piso/);
    expect(tres).toMatch(/Movimientos/);
  });
});

describe("argumentosEnMano y notaLimpia", () => {
  it("la nota sin espacios de más; vacía viaja como null (la automática va igual)", () => {
    expect(notaLimpia("  Venía   en un\n fardo  ")).toBe("Venía en un fardo");
    expect(notaLimpia("   ")).toBeNull();
    expect(notaLimpia(null)).toBeNull();
    expect(argumentosEnMano(id(50), id(1), "", TOKEN)).toEqual({ p_ubicacion_id: id(50), p_variante_id: id(1), p_nota: null, p_token: TOKEN });
  });
});

describe("leerRespuestaEnMano: la forma del jsonb", () => {
  it("acepta la respuesta de la base y se queda solo con sus campos", () => {
    expect(leerRespuestaEnMano({ ...respuesta(), extra: 1 })).toEqual(respuesta());
    expect(leerRespuestaEnMano(respuesta({ corregida: false, ajuste_movimiento_id: null }))).toEqual(respuesta({ corregida: false, ajuste_movimiento_id: null }));
  });

  it("devuelve null si algo no calza (incluida una corrección sin su movimiento, o al revés)", () => {
    expect(leerRespuestaEnMano(null)).toBeNull();
    expect(leerRespuestaEnMano([])).toBeNull();
    expect(leerRespuestaEnMano(respuesta({ bajada_id: "no-es-uuid" }))).toBeNull();
    expect(leerRespuestaEnMano(respuesta({ corregida: true, ajuste_movimiento_id: null }))).toBeNull();
    expect(leerRespuestaEnMano(respuesta({ corregida: false }))).toBeNull();
    expect(leerRespuestaEnMano(respuesta({ piso: -1 }))).toBeNull();
    expect(leerRespuestaEnMano(respuesta({ registrada_en: "ayer" }))).toBeNull();
  });
});

describe("interpretarErrorEnMano: el rechazo, para quien está frente al rack", () => {
  it("sin el veredicto de la base (corte de red o sin código) es incierto: se reenvía con la misma marca", () => {
    const e = interpretarErrorEnMano({ message: "Failed to fetch" }, SEDE);
    expect(e.tipo).toBe("red");
    expect(e.mensaje).toContain(`«${BOTON_EN_MANO_DE_NUEVO}»`);
    expect(interpretarErrorEnMano({ message: "Gateway Timeout" }, SEDE).tipo).toBe("red");
    expect(respuestaResuelveLaMarcaEnMano({ message: "Failed to fetch" })).toBe(false);
  });

  it("un rechazo de la base (P0001) pasa tal cual, con su hint", () => {
    const e = interpretarErrorEnMano({ code: "P0001", hint: "en_mano_tope_del_dia", message: "Hoy ya se corrigieron 5 de Blusa…" }, SEDE);
    expect(e).toEqual({ tipo: "rechazo", mensaje: "Hoy ya se corrigieron 5 de Blusa…", hint: "en_mano_tope_del_dia" });
  });

  it("un choque de candados se dice en palabras de la tienda y resuelve la marca (se deshizo entero)", () => {
    expect(interpretarErrorEnMano({ code: "40P01", message: "deadlock detected" }, SEDE).mensaje).toMatch(/No se guardó nada/);
    expect(respuestaResuelveLaMarcaEnMano({ code: "40P01", message: "deadlock detected" })).toBe(true);
    expect(respuestaResuelveLaMarcaEnMano(null)).toBe(true);
  });
});

describe("después: el aviso y la lista de lo hecho aquí", () => {
  it("corregida, sin corregir y ya registrada", () => {
    expect(avisoDeEnMano(respuesta(), BLUSA, SEDE)).toEqual({ titulo: "Corregida y colgada", detalle: "Blusa lino · M · Blanco · +1 «Encontré prendas» y al piso de Tienda TRU" });
    expect(avisoDeEnMano(respuesta({ corregida: false, ajuste_movimiento_id: null }), BLUSA, SEDE).titulo).toBe("Colgada");
    expect(avisoDeEnMano(respuesta({ ya_registrada: true }), BLUSA, SEDE)).toEqual({ titulo: "Ya estaba registrada", detalle: "Blusa lino · M · Blanco · a las 10:32. No se repitió." });
  });

  it("una misma bajada (un reintento que respondió «ya registrada») se cuenta una vez", () => {
    const h1 = hechaEnMano(respuesta(), id(9), BLUSA);
    const h2 = hechaEnMano(respuesta({ bajada_id: id(4) }), id(9), BLUSA);
    const lista = sumarHecha(sumarHecha(sumarHecha([], h1), h1), h2);
    expect(lista.map((h) => h.bajadaId)).toEqual([id(4), id(1)]);
    expect(colgadasAquiDe(lista, id(9))).toBe(2);
    expect(colgadasAquiDe(lista, id(8))).toBe(0);
  });

  it("cada línea dice la hora (Lima) y si corrigió el almacén", () => {
    expect(textoDeHecha(hechaEnMano(respuesta(), id(9), BLUSA))).toBe("10:32 · +1 en el almacén y al piso");
    expect(textoDeHecha(hechaEnMano(respuesta({ corregida: false, ajuste_movimiento_id: null }), id(9), BLUSA))).toBe("10:32 · al piso (el almacén ya la tenía)");
  });
});
