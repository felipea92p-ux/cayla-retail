import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// Candado de las pantallas de error: «Reintentar» tiene que volver a pedir los datos.
//
// El defecto que vigila: en Next 16 `reset()` a secas solo vuelve a pintar la barrera con la respuesta que
// ya llegó, y esa respuesta trae el mismo error. La persona en el mostrador pulsa «Reintentar», el corte de
// red ya pasó, y la tarjeta de error reaparece igual: el botón parece muerto. Lo que sí re-pide es
// `router.refresh()` (barreras dentro de la app) o `unstable_retry()` (la que Next entrega a las barreras,
// la única opción en `global-error.tsx`); ambos hacen refresh + reset dentro de una transición.
//
// Mismo espíritu que `facturacion-puerta.test.ts`: leer los fuentes y fallar si dejan de cumplirse. Se revisan
// TODAS las barreras (`error.tsx` y `global-error.tsx` bajo `app/`), para que la próxima que alguien agregue
// copie el patrón correcto o el candado avise.

const RAIZ_APP = join(__dirname, "../app");

/** Todas las barreras de error del App Router, sea cual sea su extensión. */
function barreras(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const ruta = join(dir, e.name);
    if (e.isDirectory()) return barreras(ruta);
    return /^(global-)?error\.(tsx|ts|jsx|js)$/.test(e.name) ? [ruta] : [];
  });
}

/** El fuente sin comentarios: uno que MENCIONE `router.refresh()` (como el que explica por qué hace falta)
 *  no debe contar como que lo llama. El `//` solo se quita al inicio de línea o tras un espacio, para no
 *  comerse una URL dentro de un string. */
function sinComentarios(fuente: string): string {
  return fuente.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|\s)\/\/.*$/gm, "$1");
}

/** ¿Este trozo de código vuelve a pedir los datos? `unstable_retry()`, `router.refresh()` (el `router` de
 *  `useRouter()`, como en todo el repo) o una recarga completa. `reset()` solo NO cuenta. */
function pideDatosDeNuevo(codigo: string): boolean {
  return /\bunstable_retry\s*\(|\brouter\.refresh\s*\(|\blocation\.reload\s*\(/.test(codigo);
}

/** Lo que hay entre las llaves de cada `onClick={ … }`, con las llaves anidadas balanceadas. */
function manejadoresOnClick(codigo: string): string[] {
  const salida: string[] = [];
  for (const apertura of codigo.matchAll(/onClick\s*=\s*\{/g)) {
    const desde = apertura.index + apertura[0].length;
    let profundidad = 1;
    let i = desde;
    for (; i < codigo.length && profundidad > 0; i++) {
      if (codigo[i] === "{") profundidad++;
      else if (codigo[i] === "}") profundidad--;
    }
    salida.push(codigo.slice(desde, i - 1));
  }
  return salida;
}

/** Lo que está mal en una barrera; vacío = bien. Una barrera que ni usa `reset` ni reintenta no tiene botón
 *  que vigilar. Solo se mira el arranque del reintento, no que la persona lo entienda: eso es de la pantalla. */
function problemasDeReintento(fuente: string): string[] {
  const codigo = sinComentarios(fuente);
  const problemas: string[] = [];

  // 1) Un botón cuyo manejador toca `reset` tiene que pedir los datos EN ese mismo manejador: un
  //    `router.refresh()` suelto en un efecto no arregla un `onClick={reset}`.
  for (const manejador of manejadoresOnClick(codigo)) {
    if (/\breset\b/.test(manejador) && !pideDatosDeNuevo(manejador)) {
      problemas.push(`onClick con reset y sin volver a pedir los datos: {${manejador.trim()}}`);
    }
  }

  // 2) Y el archivo, en algún lado, tiene que pedirlos (si usa `reset`, no basta con nombrarlo).
  if (/\breset\b/.test(codigo) && !pideDatosDeNuevo(codigo)) {
    problemas.push("usa reset y en ningún lado llama a router.refresh(), unstable_retry() ni location.reload()");
  }
  return problemas;
}

describe("Pantallas de error — «Reintentar» vuelve a pedir los datos", () => {
  const rutas = barreras(RAIZ_APP);
  const nombre = (ruta: string) => ruta.slice(RAIZ_APP.length).replace(/\\/g, "/");

  it("encuentra la barrera global, la de (app) y la de Facturación (que el candado no mire el vacío)", () => {
    const nombres = rutas.map(nombre);
    expect(nombres).toContain("/global-error.tsx");
    expect(nombres).toContain("/(app)/error.tsx");
    expect(nombres).toContain("/(app)/vender/comprobantes/error.tsx");
  });

  for (const ruta of rutas) {
    it(`${nombre(ruta)} no ata «Reintentar» a reset() a secas`, () => {
      expect(problemasDeReintento(readFileSync(ruta, "utf8"))).toEqual([]);
    });
  }

  it("global-error.tsx usa unstable_retry: es la única barrera sin el armazón de la app, y no depende de useRouter", () => {
    const fuente = sinComentarios(readFileSync(join(RAIZ_APP, "global-error.tsx"), "utf8"));
    expect(fuente).toMatch(/\bunstable_retry\s*\(/);
    expect(fuente).not.toMatch(/\buseRouter\b/);
  });

  it("el detector distingue la versión vieja (reset a secas) de las que sí vuelven a pedir los datos", () => {
    const conBoton = (manejador: string, extra = "") =>
      `"use client"; ${extra} export default function E({ error, reset }) { return <button onClick={${manejador}}>Reintentar</button>; }`;

    // Lo que había: el botón atado a reset, directo o envuelto.
    expect(problemasDeReintento(conBoton("reset"))).toHaveLength(2);
    expect(problemasDeReintento(conBoton("() => reset()"))).toHaveLength(2);
    // Un refresh en otro lado (un efecto) no arregla el botón que sigue llamando a reset a secas.
    const enEfecto = "const router = useRouter(); useEffect(() => { router.refresh(); }, []);";
    expect(problemasDeReintento(conBoton("reset", enEfecto))).toHaveLength(1);
    // Un refresh que solo aparece en un comentario no cuenta.
    expect(problemasDeReintento(conBoton("reset", "// router.refresh() lo arreglaría\n /* router.refresh() */"))).toHaveLength(2);

    // Lo correcto: el patrón de Facturación, unstable_retry y la recarga completa.
    const conRouter = "const router = useRouter();";
    expect(
      problemasDeReintento(conBoton("() => startTransition(() => { router.refresh(); reset(); })", conRouter)),
    ).toEqual([]);
    expect(problemasDeReintento(conBoton("() => unstable_retry()"))).toEqual([]);
    expect(problemasDeReintento(conBoton("() => window.location.reload()"))).toEqual([]);
    // Una barrera sin botón de reintento no tiene nada que vigilar aquí.
    expect(problemasDeReintento('export default function E() { return <a href="/">Volver</a>; }')).toEqual([]);
  });
});

// `unstable_retry` es API inestable de Next. Si una versión nueva la quita o la renombra, el botón de
// `global-error.tsx` quedaría muerto en silencio —la pantalla que casi nadie ve— y ni `tsc` lo avisaría
// (las props se tipan a mano). Este candado hace que actualizar Next obligue a mirarlo.
describe("Next todavía entrega unstable_retry a las barreras de error", () => {
  const tipos = join(__dirname, "../node_modules/next/dist/client/components/error-boundary.d.ts");

  it("el tipo de las barreras de la versión instalada de Next declara unstable_retry", () => {
    expect(existsSync(tipos), "no está error-boundary.d.ts: revisar dónde declara Next las props de las barreras").toBe(true);
    expect(readFileSync(tipos, "utf8")).toMatch(/\bunstable_retry\s*:\s*\(\)\s*=>\s*void/);
  });
});
