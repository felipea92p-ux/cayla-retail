import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

// Dos cosas que un rediseño no debe poder romper sin que alguien se entere (ADR-0616, auditoría 2026-11-06):
//   1. La tienda y el ERP no comparten estilos: cada uno tiene los suyos y cambiar uno no toca al otro.
//   2. Una pieza cuya única línea es un borde de un lado (una pestaña, una fila con su raya) no lleva esquinas redondas: el borde se curva en
//      las puntas y se ve un arco. Fue lo que pasó con las pestañas del catálogo y con «Nuestras tiendas».

const RAIZ = join(__dirname, "..", "..", "..");
const TIENDA = join(RAIZ, "apps", "tienda");
const WEB = join(RAIZ, "apps", "web");
const FUERA = new Set(["node_modules", ".next", "public", "coverage"]);

function archivos(carpeta: string, extensiones: RegExp): string[] {
  return readdirSync(carpeta, { withFileTypes: true }).flatMap((e) => {
    if (FUERA.has(e.name)) return [];
    const ruta = join(carpeta, e.name);
    if (e.isDirectory()) return archivos(ruta, extensiones);
    return extensiones.test(e.name) ? [ruta] : [];
  });
}

const leer = (ruta: string) => readFileSync(ruta, "utf8");
/** El texto de un CSS sin sus comentarios: un comentario pegado a un selector lo volvería invisible para los detectores. */
const sinComentarios = (css: string) => css.replace(/\/\*[\s\S]*?\*\//g, "");
const CSS_TIENDA = archivos(join(TIENDA, "app"), /\.css$/);
const CSS_WEB = archivos(join(WEB, "app"), /\.css$/);
/** Lo que trae código o estilos de otro archivo, sin mirar los comentarios. */
const IMPORTACION = /(?:^|\n)\s*(?:import\b[^\n]*?from\s+|import\s+|@import\s+(?:url\()?|export\b[^\n]*?from\s+)["']([^"']+)["']/g;
const importaciones = (texto: string) => [...texto.matchAll(IMPORTACION)].map((m) => m[1]);

describe("la tienda y el ERP no comparten estilos", () => {
  it("la tienda no importa nada de apps/web", () => {
    const ajenos = archivos(TIENDA, /\.(css|ts|tsx|mjs)$/).flatMap((f) =>
      importaciones(leer(f))
        .filter((i) => /apps\/web|\.\.\/web\//.test(i))
        .map((i) => `${relative(RAIZ, f)} → ${i}`),
    );
    expect(ajenos).toEqual([]);
  });

  it("el ERP no importa nada de apps/tienda", () => {
    const ajenos = archivos(WEB, /\.(css|ts|tsx|mjs)$/).flatMap((f) =>
      importaciones(leer(f))
        .filter((i) => /apps\/tienda|\.\.\/tienda\//.test(i))
        .map((i) => `${relative(RAIZ, f)} → ${i}`),
    );
    expect(ajenos).toEqual([]);
  });

  it("ninguno usa las variables del otro: `--color-*` son del ERP y `--dn-*` de la tienda", () => {
    const delErp = CSS_TIENDA.filter((f) => /var\(--color-/.test(leer(f))).map((f) => relative(RAIZ, f));
    const deLaTienda = CSS_WEB.filter((f) => /var\(--dn-/.test(leer(f))).map((f) => relative(RAIZ, f));
    expect({ delErp, deLaTienda }).toEqual({ delErp: [], deLaTienda: [] });
  });

  it("no hay una hoja de estilos en un paquete compartido que una de las dos cargue (la de los efectos de campaña es una copia en cada una)", () => {
    for (const f of [...CSS_TIENDA, ...CSS_WEB]) {
      expect(importaciones(leer(f)).filter((i) => /packages\/|@cayla-retail\//.test(i)), relative(RAIZ, f)).toEqual([]);
    }
  });
});

/** Las clases sueltas que una regla de `diseno-nuevo.css` redondea (`.t-pag`; no `.en-form .w-tipos`, que es otra pieza). */
function clasesRedondeadas(css: string): string[] {
  const clases = new Set<string>();
  for (const m of sinComentarios(css).matchAll(/([^{};]+)\{([^{}]*)\}/g)) {
    if (!/border-radius\s*:/.test(m[2]) || /border-radius\s*:\s*0\b/.test(m[2])) continue;
    const selector = m[1].trim().replace(/^&\s*/, "");
    const dentro = selector.match(/^:is\(([\s\S]*)\)$/)?.[1] ?? selector;
    for (const s of dentro.split(",")) {
      const limpio = s.trim().replace(/^&\s*/, "");
      if (/^\.[\w-]+$/.test(limpio)) clases.add(limpio);
    }
  }
  return [...clases];
}

/** Las clases cuya regla base dibuja solo un borde de un lado (`border-bottom`, `border-top`, `border-block`) y ningún borde completo. */
function clasesConLineaDeUnLado(css: string): string[] {
  const clases = new Set<string>();
  for (const m of sinComentarios(css).matchAll(/(?:^|[}\n])\s*([.][\w-]+(?:\s*,\s*[.][\w-]+)*)\s*\{([^{}]*)\}/g)) {
    const reglas = m[2];
    const deUnLado = /(?:^|[;\s])border-(?:bottom|top|block)\s*:\s*[^0n\s]/.test(reglas);
    const completo = /(?:^|[;\s])border\s*:\s*[^0n\s]/.test(reglas);
    if (deUnLado && !completo) for (const c of m[1].split(",")) clases.add(c.trim());
  }
  return [...clases];
}

describe("una línea de un solo lado no se curva", () => {
  it("el detector ve el caso de verdad (si no, esta prueba no vigila nada)", () => {
    const base = ".t-orden-x { border: 0; border-bottom: 1px solid var(--sand); }\n.t-caja { border: 1px solid var(--sand); border-bottom: 2px solid red; }";
    expect(clasesConLineaDeUnLado(base)).toEqual([".t-orden-x"]);
    expect(clasesRedondeadas(":root { /* una nota */ & :is(.t-orden-x, .t-caja, .a .b) { border-radius: 8px; } & .t-otra { border-radius: 0; } }")).toEqual([".t-orden-x", ".t-caja"]);
  });

  it("ninguna pieza con una sola línea recibe esquinas redondas en la identidad de la tienda", () => {
    const nuevo = CSS_TIENDA.find((f) => f.endsWith("diseno-nuevo.css"))!;
    const redondeadas = new Set(clasesRedondeadas(leer(nuevo)));
    const conLinea = new Set(CSS_TIENDA.filter((f) => f !== nuevo).flatMap((f) => clasesConLineaDeUnLado(leer(f))));
    expect([...redondeadas].filter((c) => conLinea.has(c))).toEqual([]);
  });
});

describe("lo que la auditoría del 2026-11-06 encontró roto no vuelve", () => {
  const fuente = (ruta: string) => leer(join(TIENDA, ruta));

  it("`hidden` esconde siempre, aunque la pieza sea una rejilla", () => {
    expect(fuente("app/estilos/diseno-nuevo.css")).toMatch(/\[hidden\]\s*\{\s*display:\s*none\s*!important/);
  });

  it("la lupa de la cabecera pide la lista, y la lista no exige una cuenta", () => {
    expect(fuente("components/CabeceraConCuenta.tsx")).toContain('if (cual === "buscar") prepararBuscador();');
    expect(fuente("lib/buscador-servidor.ts")).not.toContain("leerSesion");
  });

  it("el navegador deja que este sitio pida la ubicación (la tienda más cercana)", () => {
    expect(fuente("next.config.ts")).toContain("geolocation=(self)");
  });
});

// El rojo de CAYLA (ADR-0615, actualización 2026-11-06). Se mide aquí porque en la maqueta se escapó un vino escrito fuera de los tokens (el fondo de la modelo), y porque
// el rojo del logo se lee bien con letra blanca pero no como letra chica sobre marfil o rosa.
describe("el rojo de CAYLA", () => {
  const DISENO = leer(join(TIENDA, "app", "estilos", "diseno-nuevo.css"));
  const GLOBAL = leer(join(TIENDA, "app", "globals.css"));
  /** El valor de un token en modo claro: la primera vez que aparece en el archivo, antes de los bloques oscuros. */
  const token = (css: string, nombre: string) => {
    const hallado = css.match(new RegExp(`--${nombre}:\\s*(#[0-9a-f]{3,6})\\b`, "i"))?.[1];
    if (!hallado) throw new Error(`No encuentro el token --${nombre} con un color fijo`);
    return hallado.length === 4 ? `#${[...hallado.slice(1)].map((c) => c + c).join("")}` : hallado;
  };
  const luz = (hex: string) => {
    const [r, g, b] = [1, 3, 5]
      .map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
      .map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  const contraste = (a: string, b: string) => {
    const [claro, oscuro] = [luz(a), luz(b)].sort((x, y) => y - x);
    return (claro + 0.05) / (oscuro + 0.05);
  };

  it("no queda vino en ningún estilo de la tienda, ni escrito fuera de los tokens", () => {
    const conVino = CSS_TIENDA.filter((f) => /#681c24|#4f141b|79,\s*20,\s*27/i.test(sinComentarios(leer(f))));
    expect(conVino.map((f) => relative(RAIZ, f))).toEqual([]);
  });

  it("el rojo de las acciones es exactamente el del logo", () => {
    expect(token(DISENO, "dn-rojo")).toBe(token(GLOBAL, "t-logo"));
    expect(token(DISENO, "t-oscuro")).toBe(token(GLOBAL, "t-logo"));
  });

  it("el fondo de la modelo y el bloque de Arma tu outfit terminan en el mismo rojo: entre los dos no hay línea", () => {
    const css = sinComentarios(DISENO);
    expect(css).toMatch(/\.dn-banner \{[^}]*background: var\(--dn-rojo-hondo\)/);
    expect(css).toMatch(/\.dn-foto-modelo \{[^}]*radial-gradient\([^;]*var\(--dn-rojo-hondo\)\);/);
  });

  it("todo lo que se lee sobre el rojo, o en rojo, llega a 4,5", () => {
    const blanco = "#ffffff";
    const parejas: [string, string, string][] = [
      ["botón: blanco sobre el rojo", blanco, token(DISENO, "dn-rojo")],
      ["botón al pasar el mouse", blanco, token(DISENO, "dn-rojo-hondo")],
      ["franja de arriba", token(DISENO, "t-oscuro-tinta"), token(DISENO, "t-oscuro")],
      ["bloque del Club", token(DISENO, "t-hero-tinta"), token(DISENO, "t-hero")],
      ["insignia de oferta", token(GLOBAL, "t-oferta-tinta"), token(DISENO, "t-oferta")],
      ...["papel", "crema", "marfil", "hueso", "dn-arena", "dn-arena-2", "dn-heroe"].map(
        (fondo): [string, string, string] => [`letra en rojo sobre ${fondo}`, token(DISENO, "dn-acento"), token(DISENO, fondo)],
      ),
    ];
    const flojas = parejas.filter(([, a, b]) => contraste(a, b) < 4.5).map(([nombre, a, b]) => `${nombre}: ${contraste(a, b).toFixed(2)}`);
    expect(flojas).toEqual([]);
  });

  it("los puntos de la portada, que no son letra, llegan a 3 sobre el escenario", () => {
    expect(contraste(token(DISENO, "dn-rojo"), token(DISENO, "dn-heroe"))).toBeGreaterThanOrEqual(3);
  });
});
