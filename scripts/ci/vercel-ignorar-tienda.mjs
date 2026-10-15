#!/usr/bin/env node
/**
 * ¿Vercel construye esta versión de la TIENDA online? — el «Ignored Build Step» del proyecto `cayla-tienda` (`ignoreCommand` en
 * `apps/tienda/vercel.json`, ADR-0408). El del ERP es `vercel-ignorar.mjs` (ADR-0383).
 *
 * EL PROBLEMA. Vercel construye una versión a la vez para toda la cuenta (~2 min cada una), y el repositorio recibe varias fusiones
 * por hora más los «traer main» de cada rama con PR (ADR-0383). Sin este paso, cada uno de esos commits construía también la tienda,
 * aunque no la tocara, y las publicaciones del ERP hacían fila detrás. Además, una vista previa de la tienda no sirve: sus variables
 * (la base, el proyecto de clientes) están solo en Producción, así que saldría rota.
 *
 * QUÉ PROMETE. Sale con 0 («no construyas») si NO es producción (`VERCEL_ENV`), o si es producción y ningún archivo que la tienda
 * compila cambió desde su última versión construida (`VERCEL_GIT_PREVIOUS_SHA`): su carpeta, `packages/shared` (que importa), la
 * lista de paquetes y la versión de Node. Todo lo demás sale con 1 y se construye: la primera versión, un `git` que no encuentra la
 * versión anterior (clon corto, rama reescrita) o cualquier error. Ante la duda construye: si se equivoca, se equivoca hacia gastar
 * dos minutos, nunca hacia dejar la tienda sin su cambio.
 *
 * QUÉ ASUME. Vercel lo corre dentro del clon, antes de instalar dependencias (solo usa Node y `git`), y entiende 0 = ignorar,
 * 1 = construir. `git diff --name-only` da las rutas desde la raíz del repositorio aunque se corra en `apps/tienda`.
 */
import { execFileSync } from "node:child_process";
import { pathToFileURL } from "node:url";

/** Lo que la tienda compila: su carpeta y lo que importa o la arma. Un archivo nuevo de afuera que la tienda use se suma aquí. */
export const RUTAS_DE_LA_TIENDA = ["apps/tienda", "packages/shared", "pnpm-lock.yaml", "pnpm-workspace.yaml", "package.json", ".nvmrc"];

const esDeLaTienda = (archivo) => RUTAS_DE_LA_TIENDA.some((r) => archivo === r || archivo.startsWith(`${r}/`));

/**
 * `entorno` = VERCEL_ENV (`production` | `preview` | `development`).
 * `cambiadas` = los archivos que cambiaron desde la última versión construida, o `null` si no se pudo saber.
 */
export function decidir({ entorno, cambiadas }) {
  if (entorno !== "production") {
    return { construir: false, motivo: `entorno «${entorno || "sin dato"}»: la tienda solo se construye en producción` };
  }
  if (!cambiadas) return { construir: true, motivo: "no se sabe qué cambió desde la última versión: ante la duda, se construye" };
  if (cambiadas.length === 0) return { construir: true, motivo: "es la misma versión que la última construida: alguien pidió repetirla" };
  const propio = cambiadas.find(esDeLaTienda);
  if (propio) return { construir: true, motivo: `«${propio}» es de la tienda` };
  return { construir: false, motivo: `ninguno de los ${cambiadas.length} archivos que cambiaron es de la tienda` };
}

function cambiadasDesde(anterior) {
  if (!anterior) return null;
  try {
    return execFileSync("git", ["diff", "--name-only", anterior, "HEAD"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] })
      .split("\n")
      .filter(Boolean);
  } catch {
    return null;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const d = decidir({ entorno: process.env.VERCEL_ENV, cambiadas: cambiadasDesde(process.env.VERCEL_GIT_PREVIOUS_SHA) });
  console.log(`${d.construir ? "Se construye" : "No se construye"} la tienda: ${d.motivo}.`);
  process.exit(d.construir ? 1 : 0);
}
