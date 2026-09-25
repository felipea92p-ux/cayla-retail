import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// Paridad package.json ↔ .github/workflows/ci.yml (causa raíz de las 15 pruebas de Postgres que pasaron semanas sin correr
// en ningún sitio, 2026-09-25). Un script `pruebas:*` que nadie invoca en el CI es una intención, no un candado; y nada
// comparaba las dos listas. Esta prueba las compara, en el job `verificar` (bloqueante, sin base de datos):
//   1. Todo `pnpm pruebas:*` de package.json corre en ci.yml o está en EXCLUIDAS con su motivo. Uno nuevo sin cablear → rojo.
//   2. Ninguna excluida corre ya en ci.yml (se arregló y se cableó: hay que sacarla de la lista) y toda excluida existe.
//   3. Todo `pnpm pruebas:*` de ci.yml existe en package.json: un paso con el nombre viejo no correría nada, y como el job
//      de Postgres es `continue-on-error` nadie lo notaría.

/**
 * Lo que package.json declara y ci.yml NO corre, a propósito, con su porqué. Cablear una prueba roja enseña a ignorar el
 * rojo: el día que el job se ponga rojo por una de estas, nadie sabrá si es un bug nuevo o el de siempre. Medido el
 * 2026-09-25 contra una base con todas las migraciones y el seed. Cada una entra al CI el día que se arregle (y sale de aquí).
 */
const EXCLUIDAS: Record<string, string> = {
  "pruebas:archivar-datos-prueba": "no pasa: 1 de 16 verificaciones en verde",
  "pruebas:caja-cierre-traslado": "quedó vieja tras 20260923233000 (depósito sin número de operación): 4 casos fallan",
  "pruebas:colaboradores-endurecimiento": "nunca pudo pasar: 6 casos fallan",
  // Estas dos se midieron en rojo (10 de 11; 134 de 146) en el stack de quien las excluyó, el 2026-09-25. En un Postgres 17
  // desechable recién armado, con las 277 migraciones y el seed, dan 11/11 y 146/146: la diferencia es del entorno. Se quedan
  // fuera hasta confirmarlas en un `supabase start` real (o en el primer CI verde) y entonces se cablean.
  "pruebas:cotizaciones-maquila": "en rojo (10 de 11) en el stack donde se midió; verde en un Postgres 17 desechable: confirmar en `supabase start` antes de cablearla",
  "pruebas:fn-movimientos-busqueda-especial": "en rojo (134 de 146) en el stack donde se midió; verde en un Postgres 17 desechable: confirmar en `supabase start` antes de cablearla",
  "pruebas:lecturas-rapidas-y-cambio": "no PUEDE correr en el job: necesita la base `cayla_carga` (volumen + asistencia, la arma `pnpm carga:preparar`) y el job no la crea",
};

const leer = (ruta: string) => readFileSync(new URL(`../../../${ruta}`, import.meta.url), "utf8");

/** Los `pruebas:*` que declara un package.json. */
function declaradas(packageJson: string): string[] {
  const scripts = (JSON.parse(packageJson) as { scripts?: Record<string, string> }).scripts ?? {};
  return Object.keys(scripts).filter((k) => k.startsWith("pruebas:"));
}

/** Los `pnpm pruebas:*` que ci.yml invoca de verdad: las líneas de comentario no cuentan (un paso comentado no corre). */
function cableadas(yml: string): Set<string> {
  const vivo = yml
    .split("\n")
    .filter((linea) => !linea.trimStart().startsWith("#"))
    .join("\n");
  return new Set([...vivo.matchAll(/\bpnpm\s+(?:run\s+)?(pruebas:[\w:-]+)/g)].map((m) => m[1]));
}

/** Todo lo que rompe la paridad, en frases que dicen qué hacer. */
function problemas(declared: string[], wired: Set<string>, excluidas: Record<string, string>): string[] {
  const salida: string[] = [];
  for (const nombre of declared) {
    if (!wired.has(nombre) && !(nombre in excluidas)) {
      salida.push(`\`pnpm ${nombre}\` está en package.json pero ni corre en ci.yml ni está en EXCLUIDAS: cablea un paso en el job pruebas-postgres, o agrégalo a EXCLUIDAS con su motivo.`);
    }
  }
  for (const [nombre, motivo] of Object.entries(excluidas)) {
    if (!declared.includes(nombre)) salida.push(`\`${nombre}\` está en EXCLUIDAS pero ya no existe en package.json: bórralo de la lista.`);
    if (wired.has(nombre)) salida.push(`\`${nombre}\` está en EXCLUIDAS y a la vez corre en ci.yml: ya se cableó, bórralo de la lista.`);
    if (motivo.trim() === "") salida.push(`\`${nombre}\` está en EXCLUIDAS sin motivo: di por qué no corre.`);
  }
  for (const nombre of wired) {
    if (!declared.includes(nombre)) salida.push(`ci.yml corre \`pnpm ${nombre}\` pero package.json no lo declara: un paso con un nombre que no existe no ejecuta nada.`);
  }
  return salida;
}

describe("paridad package.json ↔ ci.yml", () => {
  const declared = declaradas(leer("package.json"));
  const wired = cableadas(leer(".github/workflows/ci.yml"));

  it("lee de verdad las dos listas (no compara vacío con vacío)", () => {
    expect(declared.length).toBeGreaterThan(50);
    expect(wired.size).toBeGreaterThan(50);
  });

  it("todo `pnpm pruebas:*` de package.json corre en ci.yml o está en EXCLUIDAS con su motivo, y ninguno del CI es un nombre muerto", () => {
    expect(problemas(declared, wired, EXCLUIDAS)).toEqual([]);
  });
});

describe("el detector de paridad muerde (entradas sintéticas)", () => {
  const paquete = JSON.stringify({ scripts: { build: "x", "pruebas:a": "node a", "pruebas:b": "node b" } });
  const yml = "      - run: pnpm pruebas:a\n      - run: pnpm pruebas:b\n";

  it("una prueba cableada y declarada no da problemas", () => {
    expect(problemas(declaradas(paquete), cableadas(yml), {})).toEqual([]);
  });

  it("un script nuevo sin cablear ni excluir se delata", () => {
    const nuevo = JSON.stringify({ scripts: { "pruebas:a": "x", "pruebas:b": "x", "pruebas:c": "x" } });
    expect(problemas(declaradas(nuevo), cableadas(yml), {})).toEqual([expect.stringContaining("pruebas:c")]);
  });

  it("quitar un paso del ci.yml se delata", () => {
    expect(problemas(declaradas(paquete), cableadas("      - run: pnpm pruebas:a\n"), {})).toEqual([expect.stringContaining("pruebas:b")]);
  });

  it("un paso comentado no cuenta como cableado", () => {
    const comentado = "      - run: pnpm pruebas:a\n      # - run: pnpm pruebas:b\n";
    expect(problemas(declaradas(paquete), cableadas(comentado), {})).toEqual([expect.stringContaining("pruebas:b")]);
  });

  it("una excluida con motivo no da problemas, pero sin motivo, ya cableada o inexistente sí", () => {
    const sola = "      - run: pnpm pruebas:a\n";
    expect(problemas(declaradas(paquete), cableadas(sola), { "pruebas:b": "está rota" })).toEqual([]);
    expect(problemas(declaradas(paquete), cableadas(sola), { "pruebas:b": " " })).toEqual([expect.stringContaining("sin motivo")]);
    expect(problemas(declaradas(paquete), cableadas(yml), { "pruebas:b": "está rota" })).toEqual([expect.stringContaining("ya se cableó")]);
    expect(problemas(declaradas(paquete), cableadas(yml), { "pruebas:z": "borrada" })).toEqual([expect.stringContaining("ya no existe")]);
  });

  it("un paso del ci.yml con un nombre que package.json no declara se delata", () => {
    expect(problemas(declaradas(paquete), cableadas(`${yml}      - run: pnpm pruebas:fantasma\n`), {})).toEqual([expect.stringContaining("pruebas:fantasma")]);
  });
});
