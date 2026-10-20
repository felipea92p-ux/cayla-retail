import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  DATOS_POR_TIPO,
  LINEA_BAJA,
  MAX_CIERRE,
  MAX_MENSAJE,
  componerMensaje,
  cuerpoDelMensaje,
  leerTextosDeAvisos,
  mensajeDeEjemplo,
  problemaDelCierre,
  problemaDelMensaje,
  trozosConNegrita,
} from "./club-avisos-mensajes";
import { TIPOS_AVISO, marcadoresSinCompletar } from "./club-avisos-reglas";

const MIGRACION = readFileSync(join(__dirname, "../../../supabase/migrations/20261020144000_club_avisos_mensajes_editables.sql"), "utf8");
const CIERRE = "🛍️ Recuerda que en *tienda.cayla.pe* puedes ver tus puntos, tus avisos y todo lo nuevo de CAYLA, cuando quieras.";

describe("armar y separar el mensaje (como fn_club_aviso_componer)", () => {
  it("cuerpo, línea en blanco, cierre, línea en blanco y la BAJA al final", () => {
    expect(componerMensaje("  Hola {nombre}\n", CIERRE)).toBe(`Hola {nombre}\n\n${CIERRE}\n\n${LINEA_BAJA}`);
  });

  it("sin cierre, el cuerpo va directo a la BAJA", () => {
    expect(componerMensaje("Hola {nombre}", "   ")).toBe(`Hola {nombre}\n\n${LINEA_BAJA}`);
  });

  it("la BAJA tiene los 50 caracteres que exige la base al final", () => {
    expect(LINEA_BAJA).toHaveLength(50);
    expect(MIGRACION).toContain(`'${LINEA_BAJA}'`);
  });

  it("separar devuelve lo mismo que se armó, con o sin cierre", () => {
    const cuerpo = "🎂 ¡Feliz mes, {nombre}!\nTe regalamos *{regalo} puntos*.";
    expect(cuerpoDelMensaje(componerMensaje(cuerpo, CIERRE), CIERRE)).toBe(cuerpo);
    expect(cuerpoDelMensaje(componerMensaje(cuerpo, ""), "")).toBe(cuerpo);
  });

  it("un texto viejo (sin cierre) solo pierde la BAJA", () => {
    const viejo = `Hola {nombre}, llegaron prendas nuevas a {tienda}. ${LINEA_BAJA}`;
    expect(cuerpoDelMensaje(viejo, CIERRE)).toBe("Hola {nombre}, llegaron prendas nuevas a {tienda}.");
  });
});

describe("qué no se puede guardar (como fn_club_aviso_problema)", () => {
  it("vacío, sin {nombre}, un dato ajeno o la BAJA a mano", () => {
    expect(problemaDelMensaje("novedades", "  ")).toBe("El mensaje está vacío.");
    expect(problemaDelMensaje("rebaja", "Hola")).toBe("Falta {nombre}: el mensaje saluda a cada persona por su nombre.");
    expect(problemaDelMensaje("novedades", "Hola {nombre} {pct}")).toBe("Este aviso no sabe completar {pct}.");
    expect(problemaDelMensaje("puntos", "Hola {nombre}, responde BAJA")).toBe("La línea de la BAJA va sola al final: no la escribas en el mensaje.");
    expect(problemaDelMensaje("rebaja", "Hola {nombre} {prenda} {pct} {tienda}")).toBeNull();
  });

  it("el tope de largo es el de la base", () => {
    expect(MIGRACION).toContain(`char_length(v_cuerpo) > ${MAX_MENSAJE}`);
    expect(MIGRACION).toContain(`char_length(v_cierre) > ${MAX_CIERRE}`);
    expect(problemaDelMensaje("novedades", `{nombre}${"a".repeat(MAX_MENSAJE)}`)).toMatch(/muy largo/);
  });

  it("los datos de cada aviso son los mismos que acepta la base", () => {
    for (const tipo of TIPOS_AVISO) {
      const lista = DATOS_POR_TIPO[tipo].map((d) => `'{${d}}'`).join(", ");
      expect(MIGRACION, tipo).toContain(`when '${tipo}'`);
      expect(MIGRACION, tipo).toContain(`array[${lista}]`);
    }
  });

  it("el cierre va sin datos y sin BAJA, y puede quedar vacío", () => {
    expect(problemaDelCierre("")).toBeNull();
    expect(problemaDelCierre(CIERRE)).toBeNull();
    expect(problemaDelCierre("Hola {nombre}")).toMatch(/no lleva datos/);
    expect(problemaDelCierre("responde baja")).toMatch(/BAJA/);
  });
});

describe("los mensajes sugeridos de la migración", () => {
  const sugeridos = [...MIGRACION.matchAll(/\('(cumpleanos|puntos|novedades|rebaja)', E'([^']+)'\)/g)].map((m) => ({
    tipo: m[1] as (typeof TIPOS_AVISO)[number],
    cuerpo: m[2].replace(/\\n/g, "\n"),
  }));

  it("son los cuatro, pasan su propia regla y mencionan la tienda web en el cierre", () => {
    expect(sugeridos.map((s) => s.tipo).sort()).toEqual([...TIPOS_AVISO].sort());
    for (const s of sugeridos) expect(problemaDelMensaje(s.tipo, s.cuerpo), s.tipo).toBeNull();
    expect(MIGRACION).toContain(CIERRE);
    expect(problemaDelCierre(CIERRE)).toBeNull();
  });

  it("con los datos de ejemplo, ningún sugerido deja un «{dato}» sin completar", () => {
    for (const s of sugeridos) expect(marcadoresSinCompletar(mensajeDeEjemplo(s.tipo, s.cuerpo, CIERRE, "CAYLA Trujillo")), s.tipo).toEqual([]);
  });
});

describe("la vista previa", () => {
  it("completa los datos del aviso y deja tal cual uno que no sabe completar", () => {
    expect(mensajeDeEjemplo("puntos", "Hola {nombre}, *{puntos} puntos* en {tienda}", "", "CAYLA Trujillo")).toBe(
      `Hola Rosa, *340 puntos* en CAYLA Trujillo\n\n${LINEA_BAJA}`,
    );
    expect(mensajeDeEjemplo("novedades", "Hola {nombre} {pct}", "", "X")).toContain("{pct}");
  });

  it("los asteriscos se vuelven negrita, como en WhatsApp", () => {
    expect(trozosConNegrita("Tienes *340 puntos* hoy")).toEqual([
      { texto: "Tienes ", negrita: false },
      { texto: "340 puntos", negrita: true },
      { texto: " hoy", negrita: false },
    ]);
    expect(trozosConNegrita("sin negrita *ni cierre")).toEqual([{ texto: "sin negrita *ni cierre", negrita: false }]);
  });
});

describe("leer lo que devuelve fn_club_avisos_textos", () => {
  it("separa cada cuerpo del cierre y la BAJA; el «-» de la base es sin cierre", () => {
    const leido = leerTextosDeAvisos({
      puede_editar: true,
      cierre: CIERRE,
      mensajes: [
        { tipo: "novedades", texto: componerMensaje("Hola {nombre}", CIERRE) },
        { tipo: "aniversario", texto: "viejo" },
      ],
    });
    expect(leido.puedeEditar).toBe(true);
    expect(leido.cuerpos.novedades).toBe("Hola {nombre}");
    expect(leido.cuerpos.rebaja).toBe("");
    expect(leerTextosDeAvisos({ cierre: "-" }).cierre).toBe("");
    expect(leerTextosDeAvisos(null)).toEqual({ puedeEditar: false, cierre: "", cuerpos: { cumpleanos: "", puntos: "", novedades: "", rebaja: "" } });
  });
});
