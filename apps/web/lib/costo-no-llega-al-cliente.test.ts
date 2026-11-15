// «El cliente nunca ve el costo» (ADR-0668, A3; Felipe 2026-11-15). Desde 20261115200000 el costo de una prenda le llega a toda cuenta que
// fija precios (Productos, Recibir o Campañas): una terminal del mostrador con Productos lo recibe de la base. La base no distingue
// pantallas, solo cuentas; por eso esta prueba vigila las PANTALLAS que se le muestran al cliente o se le entregan impresas.
//
// CONTRATO
//   PROMETE: falla si una pantalla de cara al cliente (Vender, el ticket, Cambios, Devoluciones, los comprobantes, las etiquetas de
//            precio, los rótulos, la Vitrina y toda la tienda web), una pieza que dibuje o lo que esas llamen de `lib/`, alcanza la
//            cuenta del precio, la línea «Te quedan» o una lectura del costo.
//   ASUME:   que el costo solo se lee por las funciones de la base nombradas aquí (la columna `variantes.costo` está cerrada a
//            anon y authenticated: lo prueba `scripts/pruebas/costo_quien_fija_precio.mjs`).
//   NO HACE: no lee comentarios ni la palabra «costo» suelta (Vender explica en un comentario por qué no la muestra): mira imports y
//            lecturas de datos.
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const WEB = join(dirname(fileURLToPath(import.meta.url)), "..");
const TIENDA = join(WEB, "..", "tienda");

/** Las pantallas que ve o recibe el cliente. Una carpeta entra entera. */
const DE_CARA_AL_CLIENTE: readonly { app: string; rutas: readonly string[] }[] = [
  {
    app: WEB,
    rutas: [
      "app/(app)/vender",
      "app/(app)/cambios",
      "app/(app)/devoluciones",
      "app/(app)/etiquetas-de-precio",
      "app/(app)/rotulos",
      "app/api/etiquetas-de-precio",
      "components/punto-de-venta",
      "components/PuntoDeVenta.tsx",
      "components/PuntoDeVentaCatalogo.tsx",
      "components/PuntoDeVentaColaOffline.tsx",
      "components/PuntoDeVentaTicket.tsx",
      "components/CambioTicket.tsx",
      "components/EtiquetaPrecio.tsx",
      "components/ImprimirEtiquetasPrecio.tsx",
      "components/ImprimirRotulos.tsx",
      "components/RotuloAnaquel.tsx",
      "components/vitrina",
      "lib/transmitir-comprobante.ts",
      "lib/transmision-reglas.ts",
    ],
  },
  { app: TIENDA, rutas: ["app", "components", "lib"] },
];

/** Lo que dice o calcula el costo de una prenda: ninguna pantalla de cara al cliente lo alcanza, ni por un import de un import. */
const MODULOS_DEL_COSTO = [
  "lib/cuenta-de-precio.ts",
  "lib/margen-a-la-vista.ts",
  "components/ui/LineaMargen.tsx",
  "lib/precio-propuesto-reglas.ts",
  "lib/costo-prenda-reglas.ts",
  "lib/costo-tallas-reglas.ts",
  "lib/orden-compra-precio-ayuda.ts",
].map((m) => join(WEB, m));

/** Las lecturas del costo: las funciones de la base que lo devuelven y los cargadores de la web que las llaman. */
const LECTURAS_DEL_COSTO =
  /\b(getCostosVariantes|leerCostosDeHoy|getCostoDeLaPrenda|fn_costos_variantes_json|fn_costo_de_la_prenda|fn_costo_de_las_tallas|fn_costos_de_hoy|fn_precio_contexto|fn_precios_a_revisar|fn_valor_inventario_existencias)\b/;
/** Un `.select(…)` de PostgREST que pide la columna del costo. */
const SELECT_DEL_COSTO = /\.select\(\s*[`"'][^`"']*\bcosto(_\w+)?\b/;
/** Donde se DEFINEN los cargadores: una pantalla puede importar otras cosas de ellos sin llamar al costo. */
const DEFINEN_CARGADORES = new Set(["lib/catalogo-v2.ts", "lib/recepcion-conteo-acciones.ts", "lib/historial-prenda.ts", "lib/compras.ts"].map((m) => join(WEB, m)));

const EXTENSIONES = [".ts", ".tsx", ".js", ".mjs"];
const esFuente = (f: string) => EXTENSIONES.some((e) => f.endsWith(e)) && !/\.test\.|\.spec\./.test(f);

function archivosDe(ruta: string): string[] {
  if (!existsSync(ruta)) return [];
  if (statSync(ruta).isFile()) return esFuente(ruta) ? [ruta] : [];
  return readdirSync(ruta).flatMap((n) => (n === "node_modules" ? [] : archivosDe(join(ruta, n))));
}

/** De un import a su archivo, dentro de la misma app (`@/` es la raíz de cada app). Lo de afuera (paquetes) no se sigue. */
function resolver(desde: string, app: string, especificador: string): string | null {
  const base = especificador.startsWith("@/") ? join(app, especificador.slice(2)) : especificador.startsWith(".") ? join(dirname(desde), especificador) : null;
  if (!base) return null;
  for (const c of [base, ...EXTENSIONES.map((e) => base + e), ...EXTENSIONES.map((e) => join(base, "index" + e))]) {
    if (existsSync(c) && statSync(c).isFile()) return c;
  }
  return null;
}

const IMPORTS = /(?:import|export)\s[^'"`;]*?from\s*["']([^"']+)["']|import\(\s*["']([^"']+)["']\s*\)|^\s*import\s*["']([^"']+)["']/gm;

/**
 * Lo que alcanza una pantalla: su árbol de dibujo (los archivos de `app/` y `components/` que importa, uno tras otro) y, de ese árbol,
 * el primer salto a `lib/` (lo que la pantalla llama de verdad). Más allá no se sigue: los archivos centrales (`catalogo-v2.ts`,
 * `compras.ts`) se importan por un tipo o una constante y conectan casi toda la app; ahí no hay una lectura que la pantalla haga.
 * Guarda el camino, para decir por dónde llegó.
 */
function alcance(raices: readonly string[], app: string): Map<string, string[]> {
  const seDibuja = (f: string) => app !== WEB || f.startsWith(join(WEB, "app")) || f.startsWith(join(WEB, "components"));
  const camino = new Map<string, string[]>();
  const cola: [string, string[]][] = raices.map((r) => [r, [r]]);
  for (const [r, c] of cola) camino.set(r, c);
  while (cola.length > 0) {
    const [archivo, c] = cola.shift()!;
    const fuente = readFileSync(archivo, "utf8");
    for (const m of fuente.matchAll(IMPORTS)) {
      const destino = resolver(archivo, app, m[1] ?? m[2] ?? m[3]);
      if (destino && esFuente(destino) && !camino.has(destino)) {
        const nuevo = [...c, destino];
        camino.set(destino, nuevo);
        if (seDibuja(destino)) cola.push([destino, nuevo]);
      }
    }
  }
  return camino;
}

/** El código sin comentarios: un comentario que explica por qué no se muestra el costo no es una lectura. */
const sinComentarios = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`])\/\/.*$/gm, "$1");

const rel = (f: string) => relative(join(WEB, ".."), f);

describe("el costo nunca llega a una pantalla de cara al cliente (ADR-0668)", () => {
  for (const { app, rutas } of DE_CARA_AL_CLIENTE) {
    const raices = rutas.flatMap((r) => archivosDe(join(app, r)));
    const alcanzado = alcance(raices, app);

    it(`${rel(app)}: hay pantallas que revisar (si una carpeta se movió, la lista de arriba está vieja)`, () => {
      expect(raices.length).toBeGreaterThan(app === WEB ? 30 : 10);
      for (const r of rutas) expect(existsSync(join(app, r)), `${rel(app)}/${r}`).toBe(true);
    });

    it(`${rel(app)}: ninguna importa, ni por una pieza que dibuje, la cuenta del precio ni la línea «Te quedan»`, () => {
      const llegan = MODULOS_DEL_COSTO.filter((m) => alcanzado.has(m)).map((m) => alcanzado.get(m)!.map(rel).join(" → "));
      expect(llegan).toEqual([]);
    });

    it(`${rel(app)}: ninguna lee el costo de la base`, () => {
      const leen = [...alcanzado.keys()]
        .filter((f) => !DEFINEN_CARGADORES.has(f))
        .filter((f) => {
          const codigo = sinComentarios(readFileSync(f, "utf8"));
          return LECTURAS_DEL_COSTO.test(codigo) || SELECT_DEL_COSTO.test(codigo);
        })
        .map((f) => alcanzado.get(f)!.map(rel).join(" → "));
      expect(leen).toEqual([]);
    });
  }

  it("el escáner ve una lectura y un import si los hubiera (control)", () => {
    expect(LECTURAS_DEL_COSTO.test(`await supabase.rpc("fn_costos_variantes_json", { p_ids })`)).toBe(true);
    expect(SELECT_DEL_COSTO.test(`supabase.from("variantes").select("id, precio, costo")`)).toBe(true);
    expect(SELECT_DEL_COSTO.test(`supabase.from("variantes").select("id, precio")`)).toBe(false);
    expect(sinComentarios(`// el costo no se muestra: fn_costos_de_hoy es de Recibir\nconst x = 1;`)).not.toMatch(LECTURAS_DEL_COSTO);
    const recibir = join(WEB, "components/recepcion-conteo/PrecioDePrenda.tsx");
    expect(alcance([recibir], WEB).has(join(WEB, "lib/margen-a-la-vista.ts"))).toBe(true);
  });
});
