import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
// El escáner de `pnpm sugerir` es la ÚNICA definición de «ejemplo estático»: la prueba lo importa en vez de copiarlo, para que no se
// desincronicen (la Guía de foco sí tuvo que espejar el suyo; aquí no hace falta).
import { superficies } from "../../../scripts/sugerir/escanear.mjs";
import { ARCHIVOS_PENDIENTES, PENDIENTES_HOY } from "./sugerir-archivos";

// REGLA (Felipe, 2026-09-30 — CLAUDE.md «Sugerencias coherentes», ADR-0289): un ejemplo o texto de ayuda en un campo tiene que ser
// coherente con lo que la persona ya eligió. Esta prueba es la parte que no depende de que alguien se acuerde: un archivo NUEVO con un
// ejemplo escrito a mano falla aquí, y la deuda de antes (`lib/sugerir-archivos.ts`) solo puede bajar. Misma idea que
// `lib/guia-de-foco.test.ts` y `lib/modulos.test.ts`.

const RAIZ_WEB = new URL("../", import.meta.url);

/** Los `.tsx` de `components/` (sin `components/ui/`) y de `app/(app)/`, como los mira el escáner: rutas relativas a `apps/web/`. */
function archivosDeUi(): string[] {
  const out: string[] = [];
  const recorrer = (dir: URL, rel: string) => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const hijo = `${rel}/${e.name}`;
      if (e.isDirectory()) {
        if (hijo === "components/ui" || e.name === "node_modules") continue;
        recorrer(new URL(`${e.name}/`, dir), hijo);
      } else if (e.name.endsWith(".tsx") && !/\.test\./.test(e.name)) out.push(hijo);
    }
  };
  recorrer(new URL("components/", RAIZ_WEB), "components");
  recorrer(new URL("app/(app)/", RAIZ_WEB), "app/(app)");
  return out.sort();
}

const texto = (archivo: string) => readFileSync(new URL(archivo, RAIZ_WEB), "utf8");
const estaticos = (archivo: string) => superficies(texto(archivo)).filter((s: { estatica: boolean; clase: string }) => s.estatica && s.clase === "ejemplo");

describe("sugerencias — cada ejemplo sigue lo elegido, o dice por qué no", () => {
  const archivos = archivosDeUi();
  const conEjemploEstatico = archivos.filter((a) => estaticos(a).length > 0);

  it("encuentra la web (la prueba no está mirando una carpeta vacía) y el escáner ve los placeholders", () => {
    expect(archivos.length).toBeGreaterThan(200);
    expect(archivos).toContain("components/NuevoProductoForm.tsx");
    const todas = archivos.flatMap((a) => superficies(texto(a)));
    expect(todas.length).toBeGreaterThan(150);
  });

  it("todo ejemplo estático está en la lista de deuda: uno NUEVO se deriva de la selección o se marca `sugerir-fijo` con su motivo", () => {
    const nuevos = conEjemploEstatico.filter((a) => !ARCHIVOS_PENDIENTES.includes(a));
    expect(
      nuevos,
      `Ejemplo escrito a mano en: ${nuevos.join(", ")}. Un ejemplo que no sigue lo que la persona eligió puede decirle algo falso (elige «Casacas» y el nombre sugiere «Blusa Aurora»). ` +
        `Córrele /sugerir (o pnpm sugerir --archivo <archivo>): derívalo con lógica pura en lib/sugerencias-<pantalla>.ts, o, si de verdad no depende de nada elegido antes, ` +
        `márcalo en su línea con «// sugerir-fijo: <por qué>». No lo agregues a lib/sugerir-archivos.ts: esa lista es deuda de antes de la regla.`
    ).toEqual([]);
  });

  it("no queda en la lista un archivo que ya no tiene el problema (o que ya no existe): se borra y se baja PENDIENTES_HOY", () => {
    const resueltos = ARCHIVOS_PENDIENTES.filter((a) => !conEjemploEstatico.includes(a));
    expect(
      resueltos,
      `Ya no tienen ejemplos estáticos (o no existen): ${resueltos.join(", ")}. Bórralos de ARCHIVOS_PENDIENTES en lib/sugerir-archivos.ts y baja PENDIENTES_HOY. Así el tablero no miente.`
    ).toEqual([]);
  });

  it("la lista no repite archivos", () => {
    expect(new Set(ARCHIVOS_PENDIENTES).size).toBe(ARCHIVOS_PENDIENTES.length);
  });

  it("la cuenta de pendientes es exacta: baja al avanzar, nunca sube", () => {
    expect(
      ARCHIVOS_PENDIENTES.length,
      `La lista tiene ${ARCHIVOS_PENDIENTES.length} archivos y PENDIENTES_HOY dice ${PENDIENTES_HOY}. Si arreglaste uno, bórralo de la lista y baja PENDIENTES_HOY. Si la cuenta subió, agregaste un archivo a la deuda: un archivo nuevo trae su sugerencia derivada o marcada «sugerir-fijo».`
    ).toBe(PENDIENTES_HOY);
  });

  it("Nuevo producto ya no tiene ninguno pendiente: su ejemplo sale de `lib/sugerencias-alta-producto.ts`", () => {
    const pantalla = [
      "components/NuevoProductoForm.tsx",
      "components/alta-producto/ProponerValor.tsx",
      "components/alta-producto/NuevoColorAlta.tsx",
      "components/alta-producto/NuevaMarcaForm.tsx",
      "components/SelectorColor.tsx",
    ];
    for (const a of pantalla) {
      expect(ARCHIVOS_PENDIENTES, `${a} volvió a la deuda`).not.toContain(a);
      expect(estaticos(a), `${a} tiene un ejemplo escrito a mano`).toEqual([]);
    }
    for (const a of ["components/NuevoProductoForm.tsx", "components/alta-producto/ProponerValor.tsx", "components/alta-producto/NuevoColorAlta.tsx"]) {
      expect(texto(a), `${a} no usa lib/sugerencias-alta-producto`).toContain("sugerencias-alta-producto");
    }
  });
});
