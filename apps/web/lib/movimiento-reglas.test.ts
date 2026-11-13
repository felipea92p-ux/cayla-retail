import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  alternarMovimiento,
  ATRIBUTO_MOVIMIENTO,
  CLAVE_MOVIMIENTO,
  MOVIMIENTO_POR_DEFECTO,
  quedaQuieto,
  resolverMovimiento,
  SCRIPT_MOVIMIENTO_ANTES_DE_PINTAR,
  textosDelBotonMovimiento,
} from "./movimiento-reglas";

describe("animaciones — reglas puras (ADR-0625)", () => {
  it("arranca quieto (Felipe 2026-11-07)", () => {
    expect(MOVIMIENTO_POR_DEFECTO).toBe("quieto");
  });

  it("lo guardado ausente o corrupto cae a quieto; lo válido se respeta", () => {
    expect(resolverMovimiento("vivo")).toBe("vivo");
    expect(resolverMovimiento("quieto")).toBe("quieto");
    for (const raro of [null, undefined, "", "VIVO", "on", true, 1, {}]) {
      expect(resolverMovimiento(raro)).toBe("quieto");
    }
  });

  it("alternar va y vuelve", () => {
    expect(alternarMovimiento("quieto")).toBe("vivo");
    expect(alternarMovimiento(alternarMovimiento("quieto"))).toBe("quieto");
  });

  it("el aparato que pide menos movimiento gana siempre; si no, manda el botón", () => {
    expect(quedaQuieto("vivo", false)).toBe(false);
    expect(quedaQuieto("quieto", false)).toBe(true);
    expect(quedaQuieto("vivo", true)).toBe(true);
    expect(quedaQuieto("quieto", true)).toBe(true);
  });

  it("el nombre del botón no cambia; el título dice qué hará el clic", () => {
    expect(textosDelBotonMovimiento("quieto")).toEqual({ etiqueta: "Animaciones", titulo: "Encender las animaciones" });
    expect(textosDelBotonMovimiento("vivo")).toEqual({ etiqueta: "Animaciones", titulo: "Apagar las animaciones" });
  });
});

function correrScript(almacen: { getItem: (k: string) => string | null }): Record<string, string> {
  const atributos: Record<string, string> = {};
  const documento = { documentElement: { setAttribute: (k: string, v: string) => void (atributos[k] = v) } };
  new Function("document", "localStorage", SCRIPT_MOVIMIENTO_ANTES_DE_PINTAR)(documento, almacen);
  return atributos;
}

describe("script antes de pintar", () => {
  it("lee la clave del botón y fija el atributo que lee el CSS", () => {
    const pedidas: string[] = [];
    expect(correrScript({ getItem: (k) => (pedidas.push(k), "vivo") })).toEqual({ [ATRIBUTO_MOVIMIENTO]: "vivo" });
    expect(pedidas).toEqual([CLAVE_MOVIMIENTO]);
  });

  it("sin nada guardado, corrupto o sin almacenamiento: quieto, y siempre deja un valor puesto", () => {
    expect(correrScript({ getItem: () => null })).toEqual({ [ATRIBUTO_MOVIMIENTO]: "quieto" });
    expect(correrScript({ getItem: () => "VIVO" })).toEqual({ [ATRIBUTO_MOVIMIENTO]: "quieto" });
    expect(
      correrScript({
        getItem: () => {
          throw new Error("bloqueado");
        },
      }),
    ).toEqual({ [ATRIBUTO_MOVIMIENTO]: "quieto" });
  });
});

// 2026-11-12: con las animaciones apagadas, el reloj de un aviso duraba 0,01 ms y el aviso se cerraba al salir (en Vender se perdía
// «Agregar y registrar la bajada»). 2026-11-13: devolverle su animación dejó el anillo como lo único que se movía en una pantalla
// quieta, dentro de un vidrio desenfocado, y en las Mac de las tiendas la pantalla quedó lavada y con el texto doble. La regla: quieto,
// el reloj NO se anima (movimiento.css) y el componente cuenta el tiempo con `useCuentaAtrasQuieta`.
describe("los relojes con las animaciones apagadas: quietos, y el tiempo lo cuenta un temporizador", () => {
  const raiz = join(__dirname, "..");
  const css = readFileSync(join(raiz, "app/estilos/movimiento.css"), "utf8");
  const RELOJES = [
    { archivo: "components/ui/Avisos.tsx", clase: "aviso-reloj", animacion: "cayla-aviso-reloj" },
    { archivo: "components/ui/AvisoDestacado.tsx", clase: "destacado-reloj", animacion: "cayla-destacado-reloj" },
  ];

  it.each(RELOJES)("$clase: quieto no se anima y el componente cuenta su tiempo", ({ archivo, clase, animacion }) => {
    const fuente = readFileSync(join(raiz, archivo), "utf8");
    expect(fuente).toContain(clase);
    expect(fuente).toMatch(new RegExp(`animationName === "${animacion}"`));
    expect(fuente, `${archivo} cuenta el tiempo con useCuentaAtrasQuieta cuando está quieto`).toMatch(/useCuentaAtrasQuieta\([^)]*quieto \?/);
    const regla = css.match(new RegExp(`:root\\[data-movimiento="quieto"\\] \\.${clase}[^{]*\\{([^}]*)\\}`));
    expect(regla, `${clase} necesita su regla en movimiento.css`).not.toBeNull();
    expect(regla![1]).toContain("animation: none !important");
  });

  function componentesDe(dir: string): string[] {
    return readdirSync(join(raiz, dir)).flatMap((n) => {
      const rel = `${dir}/${n}`;
      if (n === "node_modules" || n.startsWith(".")) return [];
      if (statSync(join(raiz, rel)).isDirectory()) return componentesDe(rel);
      return /\.tsx$/.test(n) && !/\.test\.tsx$/.test(n) ? [rel] : [];
    });
  }

  it("no hay otro reloj que cierre algo sin estar en la lista", () => {
    const componentes = ["components", "app"].flatMap(componentesDe);
    const conReloj = componentes.filter((f) => /animationName === "cayla-[a-z-]*reloj"/.test(readFileSync(join(raiz, f), "utf8")));
    expect(conReloj.sort()).toEqual(RELOJES.map((r) => r.archivo).sort());
  });
});

// Toda pieza que anima desde JavaScript pregunta `prefiereQuieto()` (o `useQuieto()`): una pregunta suelta a
// `matchMedia("(prefers-reduced-motion: reduce)")` no vería el botón y seguiría animando con las animaciones apagadas.
describe("una sola pregunta por el movimiento", () => {
  const raiz = join(__dirname, "..");
  const PERMITIDOS = new Set(["lib/movimiento-cliente.ts"]);
  function archivos(dir: string): string[] {
    return readdirSync(join(raiz, dir)).flatMap((n) => {
      const rel = `${dir}/${n}`;
      if (n === "node_modules" || n.startsWith(".")) return [];
      if (statSync(join(raiz, rel)).isDirectory()) return archivos(rel);
      return /\.(ts|tsx)$/.test(n) && !/\.test\.tsx?$/.test(n) ? [rel] : [];
    });
  }

  it("nadie fuera de movimiento-cliente.ts pregunta matchMedia por el movimiento reducido", () => {
    const sueltos = ["app", "components", "lib"]
      .flatMap(archivos)
      .filter((f) => !PERMITIDOS.has(f))
      .filter((f) => /matchMedia\s*(\?\.)?\(\s*["'`]\(prefers-reduced-motion|["'`]\(prefers-reduced-motion:\s*reduce\)["'`]/.test(readFileSync(join(raiz, f), "utf8")));
    expect(sueltos, "Usa prefiereQuieto() de lib/movimiento-cliente.ts o useQuieto() de lib/useQuieto.ts (ADR-0625)").toEqual([]);
  });
});
