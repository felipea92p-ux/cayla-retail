import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// Candado de las pantallas de error: «Reintentar» tiene que volver a pedir los datos.
//
// El defecto que vigila: en Next 16 `reset()` a secas solo vuelve a pintar la barrera con la respuesta que
// ya llegó, y esa respuesta trae el mismo error. La persona en el mostrador pulsa «Reintentar», el corte de
// red ya pasó, y la tarjeta de error reaparece igual: el botón parece muerto. Lo que sí re-pide es
// `router.refresh()` (barreras dentro de la app) o `unstable_retry()` (la que Next entrega a las barreras,
// la que documenta para `global-error.tsx`); ambos hacen refresh + reset dentro de una transición.
//
// Las tres piezas del botón, y qué pasa si falta una:
//   - `router.refresh()`  pide los datos de nuevo. Sin él, el error reaparece (el defecto original).
//   - `reset()`           limpia la barrera. Sin él, la tarjeta de error queda pegada aunque lleguen datos buenos.
//   - `startTransition`   los junta en una sola actualización: `reset()` fuera de la transición repinta AL
//                         INSTANTE con la respuesta vieja, vuelve a lanzar el mismo error y la barrera cae
//                         antes de que llegue el refresh.
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

/** Lo que hay entre `abre` y el `cierra` que lo empareja, con los anidados balanceados; `desde` es el índice
 *  justo DESPUÉS de la apertura. Sin cierre, hasta el final del texto. */
function contenidoBalanceado(codigo: string, desde: number, abre: string, cierra: string): string {
  let profundidad = 1;
  let i = desde;
  for (; i < codigo.length && profundidad > 0; i++) {
    if (codigo[i] === abre) profundidad++;
    else if (codigo[i] === cierra) profundidad--;
  }
  return profundidad === 0 ? codigo.slice(desde, i - 1) : codigo.slice(desde);
}

/** Lo que hay entre las llaves de cada `onClick={ … }`. */
function manejadoresOnClick(codigo: string): string[] {
  return [...codigo.matchAll(/onClick\s*=\s*\{/g)].map((a) =>
    contenidoBalanceado(codigo, a.index + a[0].length, "{", "}"),
  );
}

/** Lo que hay entre los paréntesis de cada `startTransition( … )`. */
function cuerposDeTransicion(codigo: string): string[] {
  return [...codigo.matchAll(/\bstartTransition\s*\(/g)].map((a) =>
    contenidoBalanceado(codigo, a.index + a[0].length, "(", ")"),
  );
}

const LLAMA_REFRESH = /\brouter\.refresh\s*\(/;
const LLAMA_RESET = /\breset\s*\(/;
const RECARGA_COMPLETA = /\blocation\.reload\s*\(/;
// Dentro de un `onClick={…}` no hay declaraciones de props, así que NOMBRAR `unstable_retry` es usarla: llamándola
// (`() => unstable_retry()`) o pasándola tal cual (`onClick={unstable_retry}`), que es igual de válido en Next.
const USA_UNSTABLE_RETRY = /\bunstable_retry\b/;

/** Lo que está mal en una barrera; vacío = bien. Una barrera que ni usa `reset` ni reintenta no tiene botón
 *  que vigilar. Solo se mira el arranque del reintento, no que la persona lo entienda: eso es de la pantalla. */
function problemasDeReintento(fuente: string): string[] {
  const codigo = sinComentarios(fuente);
  const manejadores = manejadoresOnClick(codigo);
  const problemas: string[] = [];

  // 1) Un botón de reintento (toca `reset` o `router.refresh`) tiene que hacer TODO en ese mismo manejador: un
  //    `router.refresh()` suelto en un efecto no arregla un `onClick={reset}`.
  for (const manejador of manejadores) {
    // `unstable_retry` ya es refresh + reset en transición (lo arma Next) y la recarga completa empieza de cero:
    // en esos dos no hay nada más que exigir.
    if (USA_UNSTABLE_RETRY.test(manejador) || RECARGA_COMPLETA.test(manejador)) continue;

    const pide = LLAMA_REFRESH.test(manejador);
    if (!pide && !/\breset\b/.test(manejador)) continue; // no es un botón de reintento

    if (!pide) {
      problemas.push(`onClick con reset y sin volver a pedir los datos: {${manejador.trim()}}`);
    } else if (!LLAMA_RESET.test(manejador)) {
      // Pide los datos pero no limpia la barrera: llegan datos buenos y la tarjeta de error sigue ahí.
      problemas.push(`onClick pide los datos pero no llama a reset(), el error queda pegado: {${manejador.trim()}}`);
    } else if (!cuerposDeTransicion(manejador).some((c) => LLAMA_REFRESH.test(c) && LLAMA_RESET.test(c))) {
      // Con `reset()` fuera de la transición (o sin ella) la barrera se limpia al instante, repinta con el
      // payload viejo y vuelve a lanzar el mismo error antes de que llegue el refresh.
      problemas.push(
        `router.refresh() y reset() tienen que ir juntos dentro de startTransition(): {${manejador.trim()}}`,
      );
    }
  }

  // 2) Y el archivo, en algún lado, tiene que pedirlos (si usa `reset`, no basta con nombrarlo). `unstable_retry`
  //    cuenta llamado o como manejador de un botón; nombrarlo solo en las props no.
  const pideEnElArchivo =
    /\bunstable_retry\s*\(|\brouter\.refresh\s*\(|\blocation\.reload\s*\(/.test(codigo) ||
    manejadores.some((m) => USA_UNSTABLE_RETRY.test(m));
  if (/\breset\b/.test(codigo) && !pideEnElArchivo) {
    problemas.push("usa reset y en ningún lado llama a router.refresh(), unstable_retry() ni location.reload()");
  }
  return problemas;
}

/** ¿Algún botón de esta barrera reintenta con `unstable_retry`, llamándola o pasándola tal cual? Que la
 *  destructure y la tipe en las props NO cuenta: ese es justo el botón muerto que `tsc` no avisa. */
function reintentaConUnstableRetry(fuente: string): boolean {
  return manejadoresOnClick(sinComentarios(fuente)).some((m) => USA_UNSTABLE_RETRY.test(m));
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
    it(`${nombre(ruta)} vuelve a pedir los datos, limpia la barrera y lo hace en una transición`, () => {
      expect(problemasDeReintento(readFileSync(ruta, "utf8"))).toEqual([]);
    });
  }

  // Convención de Brooks (una sola forma de resolver lo mismo) para la barrera del layout raíz: es el camino
  // que Next documenta para `global-error.tsx`. NO es que `useRouter` no sirva ahí (sí serviría: Next monta la
  // barrera dentro del contexto del router), y por eso no se prohíbe; se exige el camino documentado.
  it("global-error.tsx reintenta con unstable_retry, el camino que Next documenta para esa barrera", () => {
    expect(reintentaConUnstableRetry(readFileSync(join(RAIZ_APP, "global-error.tsx"), "utf8"))).toBe(true);
  });

  it("el detector distingue la versión vieja (reset a secas) de las que sí vuelven a pedir los datos", () => {
    // El botón dentro de una barrera de mentira: la firma incluye `reset` como la de Next.
    const conBoton = (manejador: string, extra = "") =>
      `"use client"; ${extra} export default function E({ error, reset }) { return <button onClick={${manejador}}>Reintentar</button>; }`;
    const conRouter = "const router = useRouter();";

    // Lo que había: el botón atado a reset, directo o envuelto.
    expect(problemasDeReintento(conBoton("reset"))).toHaveLength(2);
    expect(problemasDeReintento(conBoton("() => reset()"))).toHaveLength(2);
    // Un refresh en otro lado (un efecto) no arregla el botón que sigue llamando a reset a secas.
    const enEfecto = "const router = useRouter(); useEffect(() => { router.refresh(); }, []);";
    expect(problemasDeReintento(conBoton("reset", enEfecto))).toHaveLength(1);
    // Un refresh que solo aparece en un comentario no cuenta.
    expect(problemasDeReintento(conBoton("reset", "// router.refresh() lo arreglaría\n /* router.refresh() */"))).toHaveLength(2);

    // Lo correcto: el patrón de Facturación, unstable_retry (llamado o pasado tal cual) y la recarga completa.
    expect(
      problemasDeReintento(conBoton("() => startTransition(() => { router.refresh(); reset(); })", conRouter)),
    ).toEqual([]);
    expect(problemasDeReintento(conBoton("() => unstable_retry()"))).toEqual([]);
    expect(problemasDeReintento(conBoton("unstable_retry"))).toEqual([]);
    expect(problemasDeReintento(conBoton("() => window.location.reload()"))).toEqual([]);
    // Una barrera sin botón de reintento no tiene nada que vigilar aquí.
    expect(problemasDeReintento('export default function E() { return <a href="/">Volver</a>; }')).toEqual([]);
  });

  it("el detector exige reset() (que el error se limpie) y la transición (que no repinte con lo viejo)", () => {
    const conBoton = (manejador: string) =>
      `"use client"; const router = useRouter(); export default function E({ error, reset }) { return <button onClick={${manejador}}>Reintentar</button>; }`;

    // Se mira también el MENSAJE: quien vea rojo tiene que leer la causa real, no solo «algo falla».
    const sinReset = /no llama a reset\(\)/;
    const sinTransicion = /juntos dentro de startTransition/;

    // Sin reset(): pide los datos, llegan buenos y la tarjeta de error queda pegada (botón muerto).
    expect(problemasDeReintento(conBoton("() => startTransition(() => { router.refresh(); })"))).toEqual([
      expect.stringMatching(sinReset),
    ]);
    expect(problemasDeReintento(conBoton("() => { router.refresh(); }"))).toEqual([expect.stringMatching(sinReset)]);
    // Sin transición: reset repinta al instante con la respuesta vieja y vuelve a lanzar el mismo error.
    expect(problemasDeReintento(conBoton("() => { router.refresh(); reset(); }"))).toEqual([
      expect.stringMatching(sinTransicion),
    ]);
    // reset() FUERA de la transición es lo mismo que no tenerla: solo el refresh va en ella.
    expect(
      problemasDeReintento(conBoton("() => { startTransition(() => { router.refresh(); }); reset(); }")),
    ).toEqual([expect.stringMatching(sinTransicion)]);
    // Un startTransition que no toca ni el refresh ni el reset tampoco los junta.
    expect(
      problemasDeReintento(conBoton("() => { startTransition(() => { avisar(); }); router.refresh(); reset(); }")),
    ).toEqual([expect.stringMatching(sinTransicion)]);
    // Las dos cosas juntas dentro de la transición, sea cual sea el orden o la forma de la flecha.
    expect(
      problemasDeReintento(conBoton("() => startTransition(() => { reset(); router.refresh(); })")),
    ).toEqual([]);
    expect(
      problemasDeReintento(conBoton("() => { startTransition(() => { router.refresh(); reset(); }); }")),
    ).toEqual([]);
  });

  it("el candado de global-error no confunde declarar unstable_retry con usarla", () => {
    const barrera = (props: string, boton: string) =>
      `"use client"; export default function E(${props}) { return <button ${boton}>Reintentar</button>; }`;
    const propsTipadas = `{ error, unstable_retry }: { error: Error; unstable_retry: () => void }`;

    expect(reintentaConUnstableRetry(barrera(propsTipadas, "onClick={() => unstable_retry()}"))).toBe(true);
    // Sin flecha: equivalente y válido en Next.
    expect(reintentaConUnstableRetry(barrera(propsTipadas, "onClick={unstable_retry}"))).toBe(true);
    // La destructura y la tipa pero el botón hace otra cosa: es el botón muerto que `tsc` no avisa.
    expect(reintentaConUnstableRetry(barrera(propsTipadas, "onClick={() => location.reload()}"))).toBe(false);
    expect(reintentaConUnstableRetry(barrera(propsTipadas, ""))).toBe(false);
    // Solo en un comentario tampoco cuenta.
    expect(reintentaConUnstableRetry(barrera(propsTipadas, "onClick={() => reset()} /* unstable_retry */"))).toBe(false);
  });
});

// `unstable_retry` es API inestable de Next. Si una versión nueva la quita o la renombra, el botón de
// `global-error.tsx` quedaría muerto en silencio —la pantalla que casi nadie ve— y ni `tsc` lo avisaría
// (las props se tipan a mano). Este candado hace que actualizar Next obligue a mirarlo.
/** ¿El tipo `ErrorInfo` —las props que Next entrega DE VERDAD a una barrera— declara `unstable_retry`? Se
 *  mira solo ese bloque: la clase `ErrorBoundaryHandler` del mismo `.d.ts` también lo declara como miembro, y
 *  ese no llega a la barrera (si Next lo quitara de `ErrorInfo` y lo dejara en la clase, esto seguiría verde). */
function declaraUnstableRetry(dts: string): boolean {
  const info = dts.match(/\btype\s+ErrorInfo\s*=\s*\{([^}]*)\}/);
  return info !== null && /\bunstable_retry\s*:\s*\(\)\s*=>\s*void/.test(info[1]);
}

describe("Next todavía entrega unstable_retry a las barreras de error", () => {
  const tipos = join(__dirname, "../node_modules/next/dist/client/components/error-boundary.d.ts");

  it("el tipo de las barreras de la versión instalada de Next declara unstable_retry", () => {
    expect(existsSync(tipos), "no está error-boundary.d.ts: revisar dónde declara Next las props de las barreras").toBe(true);
    expect(
      declaraUnstableRetry(readFileSync(tipos, "utf8")),
      "ErrorInfo ya no declara unstable_retry: revisar cómo reintenta ahora global-error.tsx",
    ).toBe(true);
  });

  it("solo cuenta lo que declara ErrorInfo, no el miembro de la clase que el d.ts trae aparte", () => {
    const clase = "export declare class ErrorBoundaryHandler { reset: () => void; unstable_retry: () => void; }";
    const conRetry = `export type ErrorInfo = { error: Error; reset: () => void; unstable_retry: () => void; };\n${clase}`;
    const sinRetry = `export type ErrorInfo = { error: Error; reset: () => void; };\n${clase}`;
    const renombrado = `export type ErrorInfo = { error: Error; reset: () => void; retry: () => void; };\n${clase}`;

    expect(declaraUnstableRetry(conRetry)).toBe(true);
    expect(declaraUnstableRetry(sinRetry)).toBe(false); // solo en la clase: no llega a la barrera
    expect(declaraUnstableRetry(renombrado)).toBe(false);
    expect(declaraUnstableRetry(clase)).toBe(false); // ni siquiera está ErrorInfo
  });
});
