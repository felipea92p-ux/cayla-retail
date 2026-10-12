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
 * QUÉ ASUME. Vercel lo corre dentro del clon, antes de instalar dependencias (solo usa Node y `git`), y entiende
 * 0 = ignorar, 1 = construir. Lo que este salto deja sin construir es solo la combinación de la rama con `main`; el CI de
 * GitHub sí la prueba: en `pull_request` revisa tipos, lint y pruebas sobre el merge del PR con `main`.
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
 * `entorno` = VERCEL_ENV (`production` | `preview` | `development`).
 * `asuntos` = los asuntos de los commits que la rama sumó desde su última versión construida (por primer padre, así que
 * no incluye lo que trajo cada merge), o `null` si no se pudo saber.
 */
export function decidir({ entorno, asuntos }) {
  if (entorno !== "preview") {
    return { construir: true, motivo: `entorno «${entorno || "sin dato"}»: solo se saltan vistas previas` };
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

function main() {
  try {
    const { construir, motivo } = decidir({
      entorno: process.env.VERCEL_ENV,
      asuntos: asuntosDesde(process.env.VERCEL_GIT_PREVIOUS_SHA),
    });
    console.log(`${construir ? "Se construye" : "No se construye"}: ${motivo} (ADR-0383)`);
    process.exit(construir ? 1 : 0);
  } catch (e) {
    console.log(`No se pudo decidir (${e.message}): se construye (ADR-0383)`);
    process.exit(1);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
