/**
 * La ruta de un archivo interno de git (`info/exclude`, `hooks/…`) que pide `espejo.mjs`, lista para abrir.
 *
 * EL PROBLEMA. `git rev-parse --git-path <x>` contesta distinto según dónde se corre: en la carpeta principal del repo, una
 * ruta RELATIVA (`.git/info/exclude`); en un worktree, una ABSOLUTA (`/Users/…/cayla-retail/.git/info/exclude`), porque
 * `info/exclude` es común a todos los worktrees y vive en la carpeta principal. `espejo.mjs actualizar` hacía
 * `join(RAIZ, salida)`, que con la absoluta arma `RAIZ/Users/…/.git/info/exclude`, una ruta que no existe: el 2026-11-13,
 * corrido desde un worktree, aplicó las 412 migraciones, creó la rama de corrida y se cayó con ENOENT antes de escribir la
 * exclusión y `.flujo-de-negocio/actualizacion.json` (se completaron a mano).
 *
 * LA REGLA. `resolve` deja la absoluta tal cual y ancla la relativa en la raíz desde la que se corrió git.
 */

import { resolve } from "node:path";

/** @param {string} raiz carpeta donde corrió `git rev-parse` · @param {string} salida lo que contestó `--git-path` */
export const rutaDeGit = (raiz, salida) => resolve(raiz, salida.trim());
