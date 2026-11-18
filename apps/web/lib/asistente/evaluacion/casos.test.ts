// La parte sin red de la evaluación fija de «Pregúntale a CAYLA» (ADR-0536): lo que se puede saber sin llamar a la IA. La parte con red
// (lo que la IA responde de verdad) se corre a mano con `pnpm --filter web asistente:evaluar`.
//
// Vigila dos cosas: que cada respuesta esperada exista (una guía, una regla aprobada, un módulo) —si alguien renombra una guía, la
// evaluación no puede quedar midiendo contra un id muerto— y que la búsqueda local deje la guía esperada entre las que ve la IA: si no
// está entre esas 5, la IA no puede elegirla, por buena que sea.

import { describe, expect, it } from "vitest";
import casos from "./casos.json";
import { GUIAS } from "../../guias/registro";
import { hojasDe, menuPara, permisosDe } from "../../menu";
import { CLAVES_MODULO } from "../../modulos";
import { pantallasDelAsistente } from "../pantallas";
import { preseleccionar } from "../preseleccion";
import { reglasAprobadas } from "../reglas-de-tienda";
import { GUIAS_PARA_LA_IA } from "../respuesta";

type Caso = { cuenta: string; ruta: string; pregunta: string; acepta: string[] };
const CASOS = casos.casos as Caso[];
const CUENTAS = ["admin", "admin-taller", "terminal-ventas"];

// Lo que el asistente le ofrece al líder con todos los módulos, parado en una tienda o en el Taller: el mismo armado que hace `/api/asistente`.
const menuDelLider = (ubicacionTipo: "tienda" | "taller") =>
  pantallasDelAsistente({
    delMenu: menuPara({ permisos: permisosDe("lider"), ubicacionTipo, terminal: false, modulos: [...CLAVES_MODULO] })
      .riel.flatMap(hojasDe)
      .map((h) => h.href),
    modulos: [...CLAVES_MODULO],
  });

describe("la evaluación fija", () => {
  it("son 50 casos, con cuentas de prueba que existen", () => {
    expect(CASOS).toHaveLength(50);
    for (const c of CASOS) expect(CUENTAS).toContain(c.cuenta);
  });

  it("cada respuesta aceptada existe: la guía, la regla aprobada o el módulo", () => {
    const guias = new Set(GUIAS.map((g) => g.id));
    const reglas = new Set(reglasAprobadas().map((r) => r.id));
    const modulos = new Set<string>(CLAVES_MODULO);
    for (const c of CASOS) {
      expect(c.acepta.length, c.pregunta).toBeGreaterThan(0);
      for (const a of c.acepta) {
        const [tipo, id] = a.split(":");
        if (tipo === "guia") expect(guias.has(id!), `${c.pregunta} → ${a}`).toBe(true);
        else if (tipo === "regla") expect(reglas.has(id!), `${c.pregunta} → ${a}`).toBe(true);
        else if (tipo === "sin_acceso") expect(id === undefined || modulos.has(id), `${c.pregunta} → ${a}`).toBe(true);
        else expect(["no_existe", "fuera_de_tema"], `${c.pregunta} → ${a}`).toContain(tipo);
      }
    }
  });

  // Un caso por pregunta (~4 ms cada una; la primera, ~50, saca las raíces de las guías): juntas en un solo caso sumaban ~0,5 s, y con la suite
  // entera en paralelo pasaban los 5 s de límite (2026-11-18). Así además el fallo nombra la pregunta perdida.
  const deGuia = CASOS.filter((c) => c.cuenta.startsWith("admin") && c.acepta.some((a) => a.startsWith("guia:")));
  it("hay preguntas del líder que esperan una guía (si no, los casos de abajo no mirarían nada)", () => expect(deGuia.length).toBeGreaterThan(0));
  it.each(deGuia.map((c) => [c.pregunta, c] as const))("la búsqueda local deja la guía esperada entre las que ve la IA (líder): «%s»", (_pregunta, c) => {
    const menu = menuDelLider(c.cuenta === "admin-taller" ? "taller" : "tienda");
    const vistas = preseleccionar({ pregunta: c.pregunta, guias: GUIAS, rutasDelMenu: menu, rutaActual: c.ruta, cuantas: GUIAS_PARA_LA_IA }).map((s) => s.guia.id);
    expect(c.acepta.some((a) => a.startsWith("guia:") && vistas.includes(a.slice(5))), `«${c.pregunta}» acepta ${c.acepta.join(", ")}; la IA ve ${vistas.join(", ")}`).toBe(true);
  });
});
