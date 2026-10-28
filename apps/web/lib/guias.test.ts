import { existsSync, readFileSync, readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";
// La definición única del escáner (la usan esta prueba, `guias:huella` y la skill `/guia`).
import { anclaExiste, anclasDelCodigo, diferenciaDeHuella, guiasDeLosArchivos, huellaDePantalla } from "../guias/escaner.mjs";
import { GUIAS, PANTALLAS, PENDIENTES_HOY } from "./guias/registro";
import type { AccionGuia, Guia } from "./guias/tipos";

// REGLA (Felipe, 2026-10-07 — CLAUDE.md «Guías interactivas», ADR-0389): cada pantalla tiene una guía interactiva que la
// recorre con el velo oscuro, y la guía tiene que estar SIEMPRE al día con la pantalla. Esta prueba es la parte que no depende
// de que alguien se acuerde:
//   · toda `page.tsx` declara su guía (o por qué no aplica); una pantalla nueva no nace «pendiente»;
//   · cada paso apunta a un `data-guia` que existe, y ningún `data-guia` queda sin paso que lo use;
//   · la HUELLA de controles de cada pantalla con guía coincide con el código: si nace, se va o se renombra un botón, un campo
//     o una pestaña, esto falla hasta que alguien revisa la guía y acepta la huella (`pnpm --filter web guias:huella <id>`).

const E = { anclaExiste, anclasDelCodigo, diferenciaDeHuella, guiasDeLosArchivos, huellaDePantalla };

const RAIZ_PANTALLAS = new URL("../app/(app)/", import.meta.url);
const DIR_HUELLAS = new URL("./guias/huellas/", import.meta.url);

function rutasDePantallas(): string[] {
  return readdirSync(RAIZ_PANTALLAS, { recursive: true })
    .map((f) => String(f).replace(/\\/g, "/"))
    .filter((f) => f === "page.tsx" || f.endsWith("/page.tsx"))
    .map((f) => (f === "page.tsx" ? "/" : `/${f.slice(0, -"/page.tsx".length)}`))
    .sort();
}

/** Todas las anclas que usa una guía: las de sus pasos, sus condiciones y las acciones del piloto. */
function anclasDeGuia(g: Guia): string[] {
  const deAccion = (a: AccionGuia) => (a.tipo === "escape" ? [] : [a.ancla, ...(a.tipo === "escribir" && typeof a.texto !== "string" ? [a.texto.palabraDe] : [])]);
  return [
    ...g.pasos.flatMap((p) => [
      ...(p.ancla ? [p.ancla] : []),
      ...(p.requiere ?? []),
      ...(p.excluye ?? []),
      ...(p.preparar ?? []).flatMap(deAccion),
      ...(p.demostrar ?? []).flatMap(deAccion),
    ]),
    ...(g.alSalir ?? []).flatMap(deAccion),
  ];
}

describe("guías interactivas — cada pantalla declara su guía", () => {
  const rutas = rutasDePantallas();

  it("encuentra las pantallas (no mira una carpeta vacía)", () => {
    expect(rutas.length).toBeGreaterThan(50);
    expect(rutas).toContain("/vender");
  });

  it("toda pantalla está en el registro: una nueva trae su guía o dice por qué no aplica", () => {
    const sinDeclarar = rutas.filter((r) => !(r in PANTALLAS));
    expect(
      sinDeclarar,
      `Pantalla nueva sin guía interactiva: ${sinDeclarar.join(", ")}. Hazle su guía (skill /guia, lib/guias/pantallas/) y decláralas «aplicada» en lib/guias/registro.ts, o «no-aplica» con su motivo. No la anotes «pendiente»: eso es la deuda de antes de la regla.`,
    ).toEqual([]);
  });

  it("no queda en el registro una pantalla que ya no existe", () => {
    const huerfanas = Object.keys(PANTALLAS).filter((r) => !rutas.includes(r));
    expect(huerfanas, `Rutas del registro sin su page.tsx: ${huerfanas.join(", ")}`).toEqual([]);
  });

  it("la deuda se cuenta exacta y solo baja (PENDIENTES_HOY)", () => {
    const pendientes = Object.values(PANTALLAS).filter((p) => p.estado === "pendiente").length;
    expect(pendientes, "Si terminaste una guía, baja PENDIENTES_HOY en lib/guias/registro.ts. Si subió, una pantalla nueva nació sin guía.").toBe(PENDIENTES_HOY);
  });

  it("«no-aplica» dice por qué, en palabras del negocio", () => {
    for (const [ruta, p] of Object.entries(PANTALLAS)) if (p.estado === "no-aplica") expect(p.motivo.length, `${ruta}: motivo muy corto`).toBeGreaterThanOrEqual(30);
  });

  it("«aplicada» apunta a una guía que existe y es de esa misma ruta", () => {
    for (const [ruta, p] of Object.entries(PANTALLAS)) {
      if (p.estado !== "aplicada") continue;
      const g = GUIAS.find((x) => x.id === p.guia);
      expect(g, `${ruta}: no existe la guía «${p.guia}»`).toBeDefined();
      expect(g?.ruta, `${ruta}: la guía «${p.guia}» es de otra ruta`).toBe(ruta);
    }
    for (const g of GUIAS) expect(PANTALLAS[g.ruta], `La guía «${g.id}» no está declarada en el registro`).toEqual({ estado: "aplicada", guia: g.id });
  });
});

describe("guías interactivas — cada guía está bien armada", () => {
  it("claves únicas y válidas para la base (`retail.guias_vistas.guia`)", () => {
    const ids = GUIAS.map((g) => g.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(id, `«${id}» no la acepta la base`).toMatch(/^[a-z0-9][a-z0-9._-]{0,79}$/);
  });

  it("el escáner lee las mismas guías que el registro (lo usa `guias:huella`)", () => {
    const leidas = E.guiasDeLosArchivos().map((g) => `${g.id} ${g.ruta}`).sort();
    expect(leidas).toEqual(GUIAS.map((g) => `${g.id} ${g.ruta}`).sort());
  });

  it("pasos con id único, título corto y texto que se lee en 5 segundos", () => {
    for (const g of GUIAS) {
      const ids = g.pasos.map((p) => p.id);
      expect(new Set(ids).size, `${g.id}: pasos con id repetido`).toBe(ids.length);
      for (const p of g.pasos) {
        expect(p.titulo.length, `${g.id} ▸ ${p.id}: título de más de 40 letras`).toBeLessThanOrEqual(40);
        expect(p.texto.length, `${g.id} ▸ ${p.id}: texto de más de 320 letras (que se entienda en 5 segundos, ADR-0350)`).toBeLessThanOrEqual(320);
      }
    }
  });

  it("habla como la tienda (vocabulario obligatorio): nunca empleado, jefe, sucursal, clienta ni socia", () => {
    const prohibidas = /\b(empleado|empleada|jefe|jefa|sucursal|clienta|clientas|socia|socias)\b/i;
    for (const g of GUIAS) for (const p of g.pasos) expect(`${p.titulo} ${p.texto}`, `${g.id} ▸ ${p.id}`).not.toMatch(prohibidas);
  });
});

describe("guías interactivas — anclas y huella al día con el código", () => {
  const codigo = E.anclasDelCodigo();

  it("cada paso apunta a un `data-guia` que existe en el código", () => {
    const rotas = GUIAS.flatMap((g) => anclasDeGuia(g).filter((a) => !E.anclaExiste(a, codigo)).map((a) => `${g.id} → ${a}`));
    expect(rotas, `Pasos que apuntan a una pieza que ya no existe (se renombró o se quitó su data-guia):\n${rotas.join("\n")}`).toEqual([]);
  });

  it("ningún `data-guia` queda sin un paso que lo use (una pieza anclada que ninguna guía explica es una guía a medias)", () => {
    const usadas = new Set(GUIAS.flatMap(anclasDeGuia));
    const sueltas = [...codigo.literales.entries()].filter(([a]) => !usadas.has(a)).map(([a, f]) => `${a} (${f})`);
    const patronesSueltos = codigo.patrones.filter((p) => ![...usadas].some((a) => p.re.test(a))).map((p) => `${p.fuente} (${p.archivo})`);
    expect([...sueltas, ...patronesSueltos], "Anclas sin paso: úsalas en una guía o quítalas").toEqual([]);
  });

  for (const g of GUIAS) {
    it(`la huella de controles de «${g.id}» coincide con la pantalla`, () => {
      const archivo = new URL(`${g.id}.json`, DIR_HUELLAS);
      expect(existsSync(archivo), `Falta la huella de «${g.id}»: corre \`pnpm --filter web guias:huella ${g.id}\``).toBe(true);
      const guardada = JSON.parse(readFileSync(archivo, "utf8")).controles;
      const { nuevos, quitados } = E.diferenciaDeHuella(guardada, E.huellaDePantalla(g.ruta));
      const detalle = [...nuevos.map((n) => `  + ${n}`), ...quitados.map((q) => `  - ${q}`)].join("\n");
      expect(
        nuevos.length + quitados.length,
        `La pantalla ${g.ruta} cambió y su guía puede haber quedado vieja:\n${detalle}\n\nRevisa la guía «${g.id}» (lib/guias/pantallas/): explica lo nuevo (con su data-guia) o decide que no hace falta, quita lo que ya no está, y recién ahí acepta la huella con \`pnpm --filter web guias:huella ${g.id}\`. La skill /guia lo hace por ti.`,
      ).toBe(0);
    });
  }
});
