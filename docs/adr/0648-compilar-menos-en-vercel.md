# ADR-0648: Vercel compila menos, y más barato

- **Fecha:** 2026-11-12 · **Estado:** aceptado (Felipe: «hacemos de la 1 a la 4»). Sin migración ni pantalla: entra en vigor cuando
  llega a `main`.
- **Pedido:** Felipe vio una factura de Vercel de US$ 102 (US$ 82 con el crédito) y preguntó cómo bajarla.

## El problema (medido el 2026-11-12 con el conector de Vercel y `git log`)

| | |
|---|---|
| «Build CPU Minutes» | **US$ 84 de 102** (82 %); lo demás (funciones, transferencia, imágenes, observabilidad) suma menos de US$ 18 |
| Quién compila | cayla-retail ~45 %, cayla-dynamic ~40 %, cayla-tienda ~12 % (dos días de cargos, 9 y 10 de noviembre) |
| Fusiones a `main` en 7 días | 148, una compilación de producción cada una (`vercel-ignorar.mjs` solo se saltaba vistas previas) |
| De esas, sin nada que compile la web | **40 (27 %)**: bitácora, ADR, migraciones, scripts, skills |
| Una compilación de producción de retail | 157 s en una máquina Standard (4 núcleos): **54 s revisando tipos**, ~25 s subiendo source maps a Sentry, 38 s creando y subiendo la caché (966 MB) |

Vercel cobra los minutos de compilación (incluido lo de después, como la caché) multiplicados por los núcleos de la máquina, a
US$ 0,0035 el minuto-núcleo. Se paga más por compilar seguido, por compilar lento o por compilar en una máquina grande.

## Decisión

1. **Producción no se compila si la fusión no toca la web.** `scripts/ci/vercel-ignorar.mjs` mira, en producción, los archivos que
   cambiaron desde la última versión construida con éxito (`VERCEL_GIT_PREVIOUS_SHA`). Si ninguno está en `RUTAS_DEL_ERP`
   (`apps/web`, `packages`, el lockfile, `pnpm-workspace.yaml`, `package.json`, `turbo.json`, `.nvmrc`), sale con 0. Es lo mismo que
   la tienda hace desde ADR-0408, y la lista es la de `compilaLaWeb` del CI sin `ci.yml` (una prueba lo cruza). Ante la duda se
   compila: sin versión anterior, `git` que falla o la misma versión repetida.
2. **El vigía de Vercel (ADR-0425) distingue el salto a propósito del filtro roto.** Ante «Canceled by Ignored Build Step» pregunta a
   GitHub qué cambió el commit contra su primer padre. Si no toca `RUTAS_DEL_ERP`, está bien («listo», y cierra un aviso viejo: si el
   filtro saltó, nada de la web cambió desde lo publicado). Si las toca, o GitHub no responde, abre el aviso como antes.
3. **`next build` no revisa los tipos en Vercel** (`typescript.ignoreBuildErrors` solo con `VERCEL=1`, en `apps/web/next.config.ts`).
   Lo revisa el CI sobre el mismo commit que entra a `main`: la cola de fusión exige «Tipos, lint y pruebas» (`pnpm typecheck`), y
   «Compila la web» corre `next build` con los tipos encendidos. En la máquina de cada uno y en el CI, `next build` sigue revisándolos.
4. **La máquina de compilación pasa de «Elastic» a «Basic»** (2 núcleos, 8 GB, en cayla-retail, cayla-tienda y cayla-dynamic). Elastic
   nunca baja de Standard (4 núcleos). Basic tiene la misma memoria y el mismo precio por minuto-núcleo. Gran parte de cada compilación
   es esperar a la red (clonar, subir a Sentry, subir la caché), y eso no se acelera con más núcleos. Es una opción del panel de Vercel:
   el conector no tiene permiso de dueño, así que la cambia Felipe (pasos en la bitácora del día).

## Lo que se descartó

- **Juntar las publicaciones** (como máximo una cada 20–30 min). Ahorra otro ~30 %, pero un cambio tardaría hasta media hora en
  llegar a las tiendas. Felipe no lo pidió.
- **El «Skip deployments» de Vercel** (`enableAffectedProjectsDeployments`). Hace lo mismo que el punto 1, pero sin que el vigía ni las
  pruebas sepan qué decidió. El repo ya tiene su filtro probado.
- **Quitar la revisión de tipos en la tienda.** Su candado (`apps/tienda/lib/candados.test.ts`) solo deja leer sus propias variables,
  y la tienda ya se salta casi todas sus compilaciones (ADR-0408).
- **Apagar la caché de compilación.** Subirla cuesta 38 s, pero sin ella la instalación y la compilación parten de cero.

## Se rompe si…

- **La web empieza a importar un archivo de afuera de `RUTAS_DEL_ERP` al compilar** (un `docs/*.md` leído en el build): producción
  no se compilaría con su cambio. Se suma a la lista, y la prueba que la cruza con `compilaLaWeb` del CI avisa si las dos se separan.
- **Un commit llega a `main` sin la cola de fusión** (un administrador que se salta el ruleset): Vercel publicaría sin revisar tipos.
  El push a `main` sí corre «Tipos» (`alcance.mjs`: un commit directo pide `verificar`), pero eso sería después de publicar.
- **Basic se queda sin memoria** (tiene los mismos 8 GB que Standard, así que no debería pasar): la compilación falla en rojo, nada se
  publica roto. Se vuelve a Elastic en el panel.

## Cómo se verifica

- `node --test scripts/ci/vercel-ignorar.test.mjs scripts/ci/vigia-vercel.test.mjs`: producción se salta una fusión de documentos y
  se compila con una de la web, en un repo de verdad. El vigía da «listo» con el salto a propósito y avisa con el filtro roto.
- En Vercel, tras la primera fusión de solo documentos: la versión de producción sale «Canceled by Ignored Build Step» con el motivo
  «ninguno de los N archivos…», y el «Vigía de Vercel» de Actions queda en verde.
- En la factura, una semana después: «Build CPU Minutes» por día contra los ~US$ 1–2,6 diarios de antes.
