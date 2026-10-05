import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  argumentosDeRetiro,
  AVISO_QUEDA_SIN_COLGAR,
  interpretarErrorDeRetiro,
  leerRespuestaDeRetiro,
  PARAMETROS_RPC_RETIRO,
  respuestaResuelveLaMarcaDeRetiro,
  RPC_RETIRO,
  textoBotonSubir,
  textoMarcaSinResolverDeRetiro,
  textoDelBloqueSubir,
  TEXTOS_BLOQUE_SUBIR,
  tituloDeExitoRetiro,
} from "./retiro-reglas";
import { BOTON_CONFIRMAR_DE_NUEVO } from "./bajada-reglas";
import { RETIRO_NO_ES_BAJA } from "./inventario-reglas";
import { lineasDeMover, sePuedeSubirTalla, tallasParaReponer, textoFilaSinAlcance } from "./reponer-prenda-reglas";

// La migración es la fuente: si cambia el nombre o los parámetros de la RPC, la pantalla se entera aquí y no en producción.
const MIGRACION = readFileSync(join(__dirname, "..", "..", "..", "supabase", "migrations", "20261001150000_retirar_del_piso.sql"), "utf8").replace(/--[^\n]*/g, "");

describe("el contrato con la base", () => {
  it("el nombre y los parámetros de la RPC son los de la migración", () => {
    const m = /create or replace function retail\.(\w+)\(([^)]*)\)/.exec(MIGRACION);
    expect(m?.[1]).toBe(RPC_RETIRO);
    const nombres = m![2].split(",").map((p) => p.trim().split(/\s+/)[0]);
    expect(nombres).toEqual([...PARAMETROS_RPC_RETIRO]);
  });

  it("los hints que la pantalla lee existen en la función", () => {
    for (const hint of ["retiro_sin_alcance", "responsable_requerido", "retiro_tienda_sin_piso", "bajada_sin_modulo"]) {
      expect(MIGRACION, hint).toContain(`'${hint}'`);
    }
    // El resto de los «después de la marca» los levanta `mover_interno` o `fn_actor_persona_id`, no esta función.
    expect(respuestaResuelveLaMarcaDeRetiro({ code: "P0001", hint: "mover_interno_token_reusado", message: "x" })).toBe(true);
  });

  it("los argumentos salen de las líneas, sin ceros, y una nota en blanco es «sin nota»", () => {
    const a = argumentosDeRetiro("tru", [{ varianteId: "b", cantidad: 2 }, { varianteId: "a", cantidad: 1 }], "   ", "marca");
    expect(a).toEqual({ p_ubicacion_id: "tru", p_items: [{ variante_id: "a", cantidad: 1 }, { variante_id: "b", cantidad: 2 }], p_nota: null, p_token: "marca" });
    expect(argumentosDeRetiro("tru", [{ varianteId: "a", cantidad: 1 }], "  fin de temporada ", "m").p_nota).toBe("fin de temporada");
    expect(Object.keys(a).sort()).toEqual([...PARAMETROS_RPC_RETIRO].sort());
  });

  it("la respuesta se lee solo si calza con el contrato", () => {
    expect(leerRespuestaDeRetiro({ ya_registrada: false, lineas: 2, unidades: 3 })).toEqual({ ya_registrada: false, lineas: 2, unidades: 3 });
    expect(leerRespuestaDeRetiro({ ya_registrada: "no", lineas: 2, unidades: 3 })).toBeNull();
    expect(leerRespuestaDeRetiro({ ya_registrada: true, lineas: -1, unidades: 3 })).toBeNull();
    expect(leerRespuestaDeRetiro(null)).toBeNull();
    expect(leerRespuestaDeRetiro("ok")).toBeNull();
  });
});

describe("interpretarErrorDeRetiro: los tres finales posibles", () => {
  it("un corte de red es «no sé»: no dice «no se guardó nada» y manda a confirmar de nuevo", () => {
    const f = interpretarErrorDeRetiro({ message: "TypeError: Failed to fetch" }, "Tienda TRU");
    expect(f.tipo).toBe("red");
    expect(f.mensaje).toContain(BOTON_CONFIRMAR_DE_NUEVO);
    expect(f.mensaje).not.toMatch(/no se guardó nada/i);
  });

  it("«no alcanza» trae el mensaje de la base y las tallas que no, para marcar cada fila", () => {
    const detalle = JSON.stringify([{ variante_id: "v-m", prenda: "Blusa · M", pide: 5, hay: 3, apartadas: 0, motivo: "sin_alcance" }]);
    const f = interpretarErrorDeRetiro({ code: "P0001", hint: "retiro_sin_alcance", message: "No se subió nada. Blusa · M: pides 5 y en el piso hay 3.", details: detalle }, "Tienda TRU");
    expect(f).toEqual({
      tipo: "sin_alcance",
      mensaje: "No se subió nada. Blusa · M: pides 5 y en el piso hay 3.",
      lineas: [{ varianteId: "v-m", hay: 3, motivo: "sin_alcance" }],
    });
  });

  it("un detalle roto no lanza: el rechazo se muestra sin marcar filas", () => {
    const f = interpretarErrorDeRetiro({ code: "P0001", hint: "retiro_sin_alcance", message: "No se subió nada.", details: "{no es json" }, "x");
    expect(f.tipo === "sin_alcance" && f.lineas).toEqual([]);
  });

  it("un choque de candados (40P01) dice que no se subió nada y que vuelva a confirmar", () => {
    const f = interpretarErrorDeRetiro({ code: "40P01", message: "deadlock" }, "x");
    expect(f).toMatchObject({ tipo: "otro" });
    expect(f.mensaje).toMatch(/No se subió nada/);
  });

  it("en un reenvío, solo un rechazo POSTERIOR a mirar la marca la resuelve: el módulo apagado o el corte de red no", () => {
    expect(respuestaResuelveLaMarcaDeRetiro(null)).toBe(true);
    expect(respuestaResuelveLaMarcaDeRetiro({ code: "P0001", hint: "retiro_sin_alcance", message: "x" })).toBe(true);
    expect(respuestaResuelveLaMarcaDeRetiro({ code: "40P01", message: "x" })).toBe(true);
    expect(respuestaResuelveLaMarcaDeRetiro({ code: "P0001", hint: "bajada_sin_modulo", message: "x" })).toBe(false);
    expect(respuestaResuelveLaMarcaDeRetiro({ message: "Failed to fetch" })).toBe(false);
  });
});

describe("las tallas que se pueden subir y las líneas que viajan", () => {
  // S: piso 4, almacén 0 · M: piso 0, almacén 3 · L: piso 2, almacén 1
  const tallas = tallasParaReponer([
    { varianteId: "s", talla: "S", pisoDisponible: 4, almacenDisponible: 0 },
    { varianteId: "m", talla: "M", pisoDisponible: 0, almacenDisponible: 3 },
    { varianteId: "l", talla: "L", pisoDisponible: 2, almacenDisponible: 1 },
  ]);

  it("se sube lo que hay LIBRE en el piso; la M, que solo tiene en el almacén, no", () => {
    expect(tallas.map(sePuedeSubirTalla)).toEqual([true, false, true]);
  });

  it("las líneas se recortan al piso (no al almacén) y la S y la L viajan JUNTAS", () => {
    expect(lineasDeMover(tallas, { s: 9, l: 1, m: 2 }, "subir")).toEqual([
      { varianteId: "s", cantidad: 4 },
      { varianteId: "l", cantidad: 1 },
    ]);
    expect(lineasDeMover(tallas, {}, "subir")).toEqual([]);
  });

  it("la fila dice «en el piso» cuando falta piso", () => {
    expect(textoFilaSinAlcance(1, "sin_alcance", "piso")).toBe("Solo queda 1 libre en el piso.");
    expect(textoFilaSinAlcance(3, "sin_alcance", "piso")).toBe("Solo quedan 3 libres en el piso.");
    expect(textoFilaSinAlcance(0, "sin_alcance", "piso")).toBe("Ya no queda nada libre en el piso.");
    expect(textoFilaSinAlcance(2, "sin_alcance")).toBe("Solo quedan 2 libres en el almacén.");
  });
});

describe("los textos", () => {
  it("el botón dice cuánto sube; tras un corte de red pide confirmar lo mismo de nuevo", () => {
    expect(textoBotonSubir(0, false)).toBe("Subir a almacén");
    expect(textoBotonSubir(1, false)).toBe("Subir 1 prenda");
    expect(textoBotonSubir(4, false)).toBe("Subir 4 prendas");
    expect(textoBotonSubir(4, true)).toBe(BOTON_CONFIRMAR_DE_NUEVO);
  });

  it("un reenvío en duda dice la hora del primer envío y que no se repite", () => {
    const t = textoMarcaSinResolverDeRetiro("10:32");
    expect(t).toContain("10:32");
    expect(t).toContain(`«${BOTON_CONFIRMAR_DE_NUEVO}»`);
    expect(t).toMatch(/no se repite/);
  });

  it("el aviso de éxito va en singular y plural", () => {
    expect(tituloDeExitoRetiro(1)).toBe("1 prenda subida al almacén");
    expect(tituloDeExitoRetiro(3)).toBe("3 prendas subidas al almacén");
  });

  it("el bloque de abajo avisa si lo que se sube dejaría la talla pidiendo colgar, y si no, recuerda que subir no es dar de baja", () => {
    // El requisito de cada talla lo trae la decisión del motor del piso (`planPiso`): aquí, talla central (1).
    const tallas = tallasParaReponer([
      { varianteId: "poco", talla: "S", pisoDisponible: 3, almacenDisponible: 0, planPiso: { requisito: 1 } }, // subir las 3 → 0: «Por colgar»
      { varianteId: "mucho", talla: "M", pisoDisponible: 40, almacenDisponible: 0, planPiso: { requisito: 1 } }, // subir 1 → 39: nada
      { varianteId: "extrema", talla: "XL", pisoDisponible: 2, almacenDisponible: 0, planPiso: { requisito: 0 } }, // no pide nada
    ]);
    expect(textoDelBloqueSubir(tallas, { poco: 3 })).toBe(AVISO_QUEDA_SIN_COLGAR);
    expect(textoDelBloqueSubir(tallas, { mucho: 1 })).toBe(RETIRO_NO_ES_BAJA);
    expect(textoDelBloqueSubir(tallas, { extrema: 2 })).toBe(RETIRO_NO_ES_BAJA);
    expect(textoDelBloqueSubir(tallas, {})).toBe(RETIRO_NO_ES_BAJA);
    // La ventana reserva el alto del más largo: los dos textos posibles están en la lista.
    expect(TEXTOS_BLOQUE_SUBIR).toEqual([RETIRO_NO_ES_BAJA, AVISO_QUEDA_SIN_COLGAR]);
  });
});
