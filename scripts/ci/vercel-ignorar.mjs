#!/usr/bin/env node
/**
 * ¿Vercel construye esta versión? — el «Ignored Build Step» del proyecto (`ignoreCommand` en `apps/web/vercel.json`,
 * ADR-0383).
 *
 * EL PROBLEMA. Vercel construye una versión a la vez, ~2,3 min cada una. El 2026-10-12, de 09:33 a 11:12, llegaron 60:
 * 36 por hora contra ~25 que alcanza, y la fila crecía sola (vistas previas en «Queued» 10–20 min, sin log a la vista).
 * 34 de esas 60 eran «traer main a la rama»: el ruleset `main-protegida` exige la rama al día (strict, ADR-0345), así que
 * cada fusión a `main` hace que cada sesión con PR abierto traiga `main` y suba. Una vista previa por rama, que nadie abre.
 *
 * QUÉ PROMETE. Sale con 0 («no construyas») SOLO si es una vista previa (`VERCEL_ENV=preview`) y TODO lo que la rama sumó
 * desde su última versión construida con éxito (`VERCEL_GIT_PREVIOUS_SHA`) son merges que traen `main`, reconocidos por su
 * asunto. Mirar solo el último commit no alcanza: si una rama sube código y enseguida trae `main`, Vercel cancela la versión
 * con código que seguía en fila (la reemplaza la más nueva), y el código no se compilaría nunca. Pasó el 2026-10-12 con
 * «fix(pruebas)» de `claude/purchase-order-redesign-9b0c82`. Todo lo demás sale con 1 y se construye como siempre:
 * producción, un commit con código en ese tramo, la primera versión de una rama, repetir la misma versión, un `git` que no
 * encuentra la versión anterior (clon corto, rama reescrita) o cualquier error. Ante la duda construye: si se equivoca, se
 * equivoca hacia gastar dos minutos, nunca hacia dejar código sin compilar.
 *
 * PRODUCCIÓN (ADR-0648, 2026-11-12). La compilación era el 82 % de la factura de Vercel (US$ 84 de 102 en un mes) y
 * producción se construía con CADA fusión a `main`: 148 en 7 días, y 40 de ellas no tocaban nada de lo que la web compila
 * (solo `docs/`, bitácora, migraciones, scripts). Ahora producción sale con 0 si ningún archivo que cambió desde la última
 * versión construida con éxito (`VERCEL_GIT_PREVIOUS_SHA`) está en `RUTAS_DEL_ERP`: lo publicado ya es exactamente esa web.
 * Lo mismo que hace la tienda desde ADR-0408. Ante la duda (sin versión anterior, `git` que falla, la misma versión
 * repetida) se construye. El vigía de Vercel (ADR-0425) reconoce este salto y no lo toma por una alarma.
 *
 * QUÉ ASUME. Vercel lo corre dentro del clon, antes de instalar dependencias (solo usa Node y `git`), y entiende
 * 0 = ignorar, 1 = construir. Lo que este salto deja sin construir es solo la combinación de la rama con `main`; el CI de
 * GitHub sí la prueba: en `pull_request` revisa tipos, lint y pruebas sobre el merge del PR con `main`.
 * `git diff --name-only` da las rutas desde la raíz del repositorio aunque se corra en `apps/web`.
 */
import { execFileSync } from "node:child_process";
import { pathToFileURL } from "node:url";

// Los asuntos que traen `main` a la rama. Salen del historial real (`git log --merges --format=%s`, 2026-10-12): 365
// «Merge remote-tracking branch 'origin/main' into …», 249 «Merge branch 'main' into …» y una cola de variantes a mano.
const TRAE_MAIN = [
  // git: `git merge main`, `git merge origin/main`, `git pull origin main` (este último agrega «of <url>»).
  /^Merge (remote-tracking )?branch '(origin\/)?main'( of \S+)?( into \S+)?$/,
  // A mano: «Merge origin/main», «Merge origin/main into claude/x», «Merge origin/main en claude/x».
  /^Merge origin\/main( (into|en) \S+)?$/,
  // Conventional Commits de las sesiones: «merge: origin/main en …», «merge: trae origin/main al día»,
  // «merge: actualiza la rama con main». `main` como palabra suelta: «claude/main-menu» no cuenta.
  /^merge: (.*[\s/'])?main($|[\s'.,;:])/,
];

export const traeMain = (asunto) => TRAE_MAIN.some((r) => r.test(asunto.trim()));

/**
 * Lo que la web compila: su carpeta, los paquetes que importa (`@cayla-retail/shared`, `@cayla-retail/database`) y lo que
 * arma la instalación. Es la misma lista que `compilaLaWeb` de `alcance.mjs` (el CI), sin `ci.yml`, que Vercel no lee. Un
 * archivo de afuera que la web empiece a importar al compilar se suma aquí, o producción no se construiría con su cambio.
 */
export const RUTAS_DEL_ERP = ["apps/web", "packages", "pnpm-lock.yaml", "pnpm-workspace.yaml", "package.json", "turbo.json", ".nvmrc"];

/** ¿Alguno de estos archivos (rutas desde la raíz del repo) cambia lo que compila la web? */
export const tocaElErp = (archivos) => archivos.some((a) => RUTAS_DEL_ERP.some((r) => a === r || a.startsWith(`${r}/`)));

/**
 * `entorno` = VERCEL_ENV (`production` | `preview` | `development`).
 * `rama` = VERCEL_GIT_COMMIT_REF (la rama que se construye).
 * `asuntos` = los asuntos de los commits que la rama sumó desde su última versión construida (por primer padre, así que
 * no incluye lo que trajo cada merge), o `null` si no se pudo saber.
 * `cambiadas` = los archivos que cambiaron desde la última versión construida, o `null` si no se pudo saber (solo producción).
 */
export function decidir({ entorno, asuntos, rama, cambiadas }) {
  if (entorno === "production") {
    if (!cambiadas) return { construir: true, motivo: "producción: no se sabe qué cambió desde la última versión, ante la duda se construye" };
    if (cambiadas.length === 0) return { construir: true, motivo: "producción: es la misma versión que la última construida, alguien pidió repetirla" };
    const propio = cambiadas.find((a) => tocaElErp([a]));
    if (propio) return { construir: true, motivo: `producción: «${propio}» cambia lo que compila la web` };
    return {
      construir: false,
      motivo: `producción: ninguno de los ${cambiadas.length} archivo${cambiadas.length === 1 ? "" : "s"} que cambiaron desde la última versión construida es de la web (docs, migraciones, scripts…)`,
    };
  }
  if (entorno !== "preview") {
    return { construir: true, motivo: `entorno «${entorno || "sin dato"}»: solo se saltan vistas previas y producción sin cambios de la web` };
  }
  // La cola de fusión (2026-11-07) sube una rama `gh-readonly-queue/main/pr-…` por PR en la fila: la prueba el CI de GitHub
  // y, si pasa, queda tal cual en `main`, que se construye en producción. Una vista previa de esa rama nadie la abre.
  if (rama?.startsWith("gh-readonly-queue/")) {
    return { construir: false, motivo: `«${rama}» es la rama de la cola de fusión: la prueba el CI y producción construye main` };
  }
  if (!asuntos) {
    return { construir: true, motivo: "no se sabe qué se construyó antes en esta rama: ante la duda, se construye" };
  }
  if (asuntos.length === 0) {
    return { construir: true, motivo: "es la misma versión que la última construida: alguien pidió repetirla" };
  }
  const propio = asuntos.find((a) => !traeMain(a));
  if (propio !== undefined) return { construir: true, motivo: `«${propio}» trae cambios propios de la rama` };
  return {
    construir: false,
    motivo: `lo que la rama sumó desde su última versión construida solo trae main (${asuntos.length} merge${asuntos.length === 1 ? "" : "s"}): main ya se construye en producción y lo propio de la rama ya está construido`,
  };
}

/** Los asuntos por primer padre entre la última versión construida y HEAD, o `null` si no hay versión anterior o git falla. */
export function asuntosDesde(anterior, cwd = process.cwd()) {
  if (!anterior) return null;
  try {
    const salida = execFileSync("git", ["log", "--first-parent", "--format=%s", `${anterior}..HEAD`], {
      cwd,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    });
    return salida.split("\n").filter(Boolean);
  } catch {
    return null;
  }
}

/** Los archivos que cambiaron entre la última versión construida y HEAD, o `null` si no hay versión anterior o git falla. */
export function cambiadasDesde(anterior, cwd = process.cwd()) {
  if (!anterior) return null;
  try {
    return execFileSync("git", ["diff", "--name-only", anterior, "HEAD"], { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] })
      .split("\n")
      .filter(Boolean);
  } catch {
    return null;
  }
}

function main() {
  try {
    const { construir, motivo } = decidir({
      entorno: process.env.VERCEL_ENV,
      asuntos: asuntosDesde(process.env.VERCEL_GIT_PREVIOUS_SHA),
      rama: process.env.VERCEL_GIT_COMMIT_REF,
      cambiadas: process.env.VERCEL_ENV === "production" ? cambiadasDesde(process.env.VERCEL_GIT_PREVIOUS_SHA) : null,
    });
    console.log(`${construir ? "Se construye" : "No se construye"}: ${motivo} (ADR-0383, ADR-0648)`);
    process.exit(construir ? 1 : 0);
  } catch (e) {
    console.log(`No se pudo decidir (${e.message}): se construye (ADR-0383)`);
    process.exit(1);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
