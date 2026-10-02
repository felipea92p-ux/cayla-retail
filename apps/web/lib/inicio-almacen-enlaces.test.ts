import { readdirSync, readFileSync, statSync, existsSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { hrefFichaProducto, hrefFotosProducto } from "./inicio-almacen-reglas";

// Candado de los enlaces del Inicio de almacén (Felipe, 2026-09-30: «le doy clic a cualquiera y me sale 404»; ADR-0292).
//
// Qué pasó: la primera versión enlazaba cada producto a `/productos/{id}`. Esa ruta NO existe —la ficha es `/productos/{id}/editar`—
// y ninguna prueba lo miraba: se verificó que los filtros, la tecla N y los estados funcionaran, pero no adónde llevaba cada «Ver».
// Un 404 en el Inicio de la cuenta de almacén, justo en lo más visible, y lo encontró quien lo estrenó.
//
// Contrato. PROMETE: que todo enlace interno escrito como literal (`href="/…"`, ``href={`/…/${id}`}``, `href: "/…"`) en los archivos del Inicio
// de almacén cae en una ruta que existe bajo `app/(app)` (una carpeta con `page.tsx`; los grupos `(x)` no cuentan, `[id]` acepta cualquier
// valor). NO PROMETE: los enlaces que llegan armados desde otra parte (`href={a.href}`: los de `lib/inicio-avisos.ts` sí se leen porque
// son literales allí), ni que la persona tenga el módulo de esa pantalla (eso lo dicen `lib/modulos.test.ts` y `exigirModulo`).

const RAIZ = join(__dirname, "..");
const APP = join(RAIZ, "app", "(app)");

/** Cada ruta de la app como lista de segmentos (`/productos/[id]/editar` → ["productos", "[id]", "editar"]). */
function rutasDeLaApp(): string[][] {
  const rutas: string[][] = [];
  const recorrer = (dir: string, segmentos: string[]) => {
    if (existsSync(join(dir, "page.tsx"))) rutas.push(segmentos);
    for (const nombre of readdirSync(dir)) {
      const ruta = join(dir, nombre);
      if (!statSync(ruta).isDirectory()) continue;
      if (nombre.startsWith("@") || nombre.startsWith("(.")) continue; // ranuras y rutas interceptadas: no son una URL propia
      const esGrupo = /^\(.*\)$/.test(nombre);
      recorrer(ruta, esGrupo ? segmentos : [...segmentos, nombre]);
    }
  };
  recorrer(APP, []);
  return rutas;
}

const RUTAS = rutasDeLaApp();

/** ¿Existe una pantalla para esta ruta? `[x]` acepta un segmento cualquiera, `[...x]` uno o más. */
function existe(ruta: string): boolean {
  const partes = ruta.split("/").filter(Boolean);
  return RUTAS.some((r) => {
    for (let i = 0; i < r.length; i++) {
      const seg = r[i]!;
      if (/^\[\[?\.\.\./.test(seg)) return partes.length > i || seg.startsWith("[[");
      if (partes[i] === undefined) return false;
      if (!/^\[.*\]$/.test(seg) && seg !== partes[i]) return false;
    }
    return r.length === partes.length;
  });
}

/** Los enlaces internos escritos como literal en una fuente, sin consulta ni ancla; `${…}` cuenta como un valor cualquiera. */
function enlacesLiterales(fuente: string): string[] {
  const salida: string[] = [];
  for (const m of fuente.matchAll(/href\s*[=:]\s*\{?\s*(`[^`]*`|"[^"]*"|'[^']*')/g)) {
    const texto = m[1]!.slice(1, -1).replace(/\$\{[^}]*\}/g, "x").replace(/[?#].*$/, "");
    if (texto.startsWith("/") && !texto.startsWith("//")) salida.push(texto || "/");
  }
  return salida;
}

function archivosDelInicio(): string[] {
  const componentes = readdirSync(join(RAIZ, "components", "inicio-almacen")).filter((f) => f.endsWith(".tsx")).map((f) => join("components", "inicio-almacen", f));
  return [...componentes, "lib/inicio-almacen.ts", "lib/inicio-almacen-reglas.ts", "lib/inicio-avisos.ts"];
}

describe("cómo se sabe si una ruta existe", () => {
  it("encuentra las que hay y rechaza la que causó el 404", () => {
    expect(existe("/")).toBe(true);
    expect(existe("/productos")).toBe(true);
    expect(existe("/productos/nuevo")).toBe(true);
    expect(existe("/productos/x/editar")).toBe(true);
    expect(existe("/productos/x")).toBe(false); // la que enlazaba el Inicio y no existe
    expect(existe("/no-existe")).toBe(false);
  });

  it("lee los enlaces literales y se salta los que no lo son", () => {
    const fuente = [
      '<Link href="/productos/nuevo">',
      "<Link href={`/productos/${p.id}`}>",
      "{ href: '/inventario/traslados' }",
      '<a href="https://ejemplo.com">',
      "<a href={a.href}>",
      '<Link href="/productos/x/editar#fotos">',
    ].join("\n");
    expect(enlacesLiterales(fuente)).toEqual(["/productos/nuevo", "/productos/x", "/inventario/traslados", "/productos/x/editar"]);
  });
});

describe("los enlaces del Inicio de almacén", () => {
  it("la ficha de un producto y su sección de fotos son rutas que existen", () => {
    expect(hrefFichaProducto("abc")).toBe("/productos/abc/editar");
    expect(hrefFotosProducto("abc")).toBe("/productos/abc/editar#fotos");
    expect(existe(hrefFichaProducto("abc").replace(/[?#].*$/, ""))).toBe(true);
  });

  for (const archivo of archivosDelInicio()) {
    it(`${archivo}: todo enlace literal cae en una pantalla que existe`, () => {
      const inexistentes = enlacesLiterales(readFileSync(join(RAIZ, archivo), "utf8")).filter((h) => !existe(h));
      expect(inexistentes, `rutas que no existen bajo app/(app): ${inexistentes.join(", ")}`).toEqual([]);
    });
  }
});
