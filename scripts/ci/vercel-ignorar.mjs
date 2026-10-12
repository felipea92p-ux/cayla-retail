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
 * QUÉ PROMETE. Sale con 0 («no construyas») SOLO si es una vista previa (`VERCEL_ENV=preview`) y el asunto del commit es
 * el de un merge que trae `main` a la rama, como lo escriben git y las sesiones. Todo lo demás sale con 1 y se construye
 * como siempre: producción, un commit con código, un merge de otra rama, un asunto que no reconoce, una variable que
 * falta o un error. Ante la duda construye: si se equivoca, se equivoca hacia gastar dos minutos, nunca hacia saltarse
 * una versión que alguien necesitaba.
 *
 * QUÉ ASUME. Vercel lo corre antes de instalar dependencias (solo usa Node) y entiende 0 = ignorar, 1 = construir. Lo
 * propio de la rama ya se construyó en su commit anterior y `main` se construye en producción; lo que este salto deja
 * sin construir es solo la combinación de los dos. El CI de GitHub sí la prueba: en `pull_request` revisa tipos, lint y
 * pruebas sobre el merge del PR con `main`.
 */
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

/** `entorno` = VERCEL_ENV (`production` | `preview` | `development`); `mensaje` = VERCEL_GIT_COMMIT_MESSAGE, completo. */
export function decidir({ entorno, mensaje }) {
  if (entorno !== "preview") {
    return { construir: true, motivo: `entorno «${entorno || "sin dato"}»: solo se saltan vistas previas` };
  }
  const asunto = (mensaje ?? "").split("\n")[0].trim();
  if (!asunto) return { construir: true, motivo: "sin mensaje de commit: ante la duda, se construye" };
  if (TRAE_MAIN.some((r) => r.test(asunto))) {
    return {
      construir: false,
      motivo: `«${asunto}» solo trae main a la rama: main ya se construye en producción y lo propio de la rama, en su commit anterior`,
    };
  }
  return { construir: true, motivo: `«${asunto}» trae cambios propios de la rama` };
}

function main() {
  try {
    const { construir, motivo } = decidir({
      entorno: process.env.VERCEL_ENV,
      mensaje: process.env.VERCEL_GIT_COMMIT_MESSAGE,
    });
    console.log(`${construir ? "Se construye" : "No se construye"}: ${motivo} (ADR-0383)`);
    process.exit(construir ? 1 : 0);
  } catch (e) {
    console.log(`No se pudo decidir (${e.message}): se construye (ADR-0383)`);
    process.exit(1);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
