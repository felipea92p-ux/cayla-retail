import { describe, expect, it } from "vitest";
// Las familias, las funciones de botón y la «deuda» viven en `unificar/` (la misma definición que usa el censo de `/unificar`): la
// prueba las importa en vez de copiarlas.
import { problemasDe, deudaDe } from "../unificar/deuda.mjs";
import { DECISIONES, FAMILIAS, FUNCIONES, funcionDe, ICONO_A_FUNCION } from "../unificar/familias.mjs";

// REGLA (ADR-0358, Felipe 2026-10-06): una función, una pieza. Cuando Felipe elige con `/unificar` cómo se ve una familia (las
// pestañas, el botón «Cancelar», la insignia de estado), esa pieza es la única de ahí en adelante, en todos los módulos y en las
// pantallas que vengan. Esta prueba es la parte que no depende de que alguien se acuerde: un archivo NUEVO que vuelve a dibujar
// a mano una familia decidida falla aquí, y la deuda de antes (los que todavía no se migran) solo puede bajar. Misma idea que
// `lib/tema-colores.test.ts` y `lib/sugerir.test.ts`.

describe("las familias de /unificar", () => {
  it("cada familia tiene un id único, su grupo, su nombre y qué hace", () => {
    const ids = FAMILIAS.map((f) => f.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const f of FAMILIAS) {
      expect(f.grupo, f.id).toBeTruthy();
      expect(f.nombre, f.id).toBeTruthy();
      expect(f.funcion, f.id).toBeTruthy();
    }
  });

  it("cada función de botón es una familia `accion.<id>`, y todo icono que la reconoce apunta a una función que existe", () => {
    const ids = new Set(FAMILIAS.map((f) => f.id));
    for (const f of FUNCIONES) expect(ids.has(`accion.${f.id}`), f.id).toBe(true);
    const funciones = new Set(FUNCIONES.map((f) => f.id));
    for (const [icono, fn] of Object.entries(ICONO_A_FUNCION)) expect(funciones.has(fn), `${icono} → ${fn}`).toBe(true);
  });
});

describe("qué hace un botón se reconoce por lo que dice (sin tildes ni mayúsculas)", () => {
  const casos: [string, string | null, string?][] = [
    ["Cancelar", "cancelar"],
    ["← Traslados", "volver"],
    ["Volver al inicio", "volver"],
    ["Cerrar", "cerrar"],
    ["×", "cerrar"],
    ["Guardar cambios", "guardar"],
    ["Confirmar venta", "guardar"],
    ["+ Nuevo producto", "nuevo"],
    ["Registrar gasto", "nuevo"],
    ["Quitar filtros", "limpiar"],
    ["Quitar", "eliminar"],
    ["Anular comprobante", "eliminar"],
    ["Ver más", "siguiente"],
    ["Ver detalle", "ver"],
    ["Exportar CSV", "exportar"],
    ["Más acciones", "menu"],
    // Acciones del negocio que empiezan como una función de interfaz, pero no lo son:
    ["Cerrar caja", null],
    ["Cerrar el mes", null],
    ["Cobrar S/ 120", null],
    // Un botón de solo icono, sin nombre: se reconoce por el dibujo.
    ["", "cerrar", "x"],
    ["", "menu", "ellipsis"],
    ["", null, "sparkles"],
  ];
  it.each(casos)("«%s» → %s", (texto, esperada, icono) => {
    expect(funcionDe(texto, icono ?? null)).toBe(esperada);
  });
});

describe("decisiones de Felipe: una función, una pieza", () => {
  const decididas = Object.keys(DECISIONES);

  it("cada decisión nombra una familia que existe y tiene su pieza, su ADR, su registro y sus firmas", () => {
    for (const id of decididas) expect(problemasDe(id), id).toEqual([]);
  });

  it.each(decididas.length ? decididas : ["(ninguna todavía)"])("«%s»: nadie nuevo la dibuja a mano y la deuda solo baja", (id) => {
    if (!DECISIONES[id]) return; // sin decisiones, no hay nada que vigilar todavía
    const hoy = deudaDe(id).map((d) => d.archivo);
    const declarada = [...DECISIONES[id].deuda].sort();
    const nuevos = hoy.filter((a) => !declarada.includes(a));
    const limpios = declarada.filter((a) => !hoy.includes(a));
    const mensaje = [
      nuevos.length ? `Dibujan «${id}» a mano y no están en la deuda (usa ${DECISIONES[id].pieza}, o marca la línea con «// unificar-fijo: <por qué>»): ${nuevos.join(", ")}` : "",
      limpios.length ? `Ya no la dibujan a mano: sácalos de la deuda de «${id}» en unificar/familias.mjs: ${limpios.join(", ")}` : "",
    ]
      .filter(Boolean)
      .join("\n");
    expect(hoy, mensaje).toEqual(declarada);
  });
});
