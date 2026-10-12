# ADR-0383 — Vercel no construye la vista previa de un merge que solo trae `main` a la rama

- **Fecha:** 2026-10-12 · **Estado:** aceptado (Felipe: «dale, aplica tu recomendación»). Construido y probado en local. **Sin
  migración ni pantalla:** entra en vigor cuando `apps/web/vercel.json` llega a `main` y, desde ahí, a cada rama que se pone al día.
- **Pedido:** Felipe vio en Vercel una columna de «Queued», una sola versión construyéndose y ningún log a la vista, y preguntó por qué
  demoraba tanto.

## El problema (medido en Vercel el 2026-10-12, de 09:33 a 11:12)

| | |
|---|---|
| Versiones que llegaron | 60, o sea **36 por hora** |
| Lo que Vercel construye | **una a la vez** (los horarios de inicio y fin nunca se cruzan), de 1,7 a 2,6 min cada una: **~25 por hora** |
| Canceladas por Vercel | 20, siempre la versión vieja de una rama que ya tenía un push más nuevo |
| Espera de una vista previa | de 1,5 a 10 min, y creciendo mientras la fila crece |

Llegaban 36 por hora y salían 25. Una versión en «Queued» no tiene log porque todavía no empezó: no estaba escondida, estaba en fila.

**De dónde salían:** 34 de las 60 (57 %) eran «Merge branch 'main' into claude/…» o «Merge remote-tracking branch 'origin/main' into
…». El ruleset `main-protegida` exige la rama al día con `main` (strict, ADR-0345): cada fusión a `main` hace que cada sesión con PR
abierto traiga `main` y suba, y cada subida pedía una vista previa que nadie abre. Las otras 26: 9 de producción y 17 vistas previas
con algo propio de la rama.

Producción ya pasaba adelante: el #973 entró a la fila a las 11:08, se saltó seis vistas previas y quedó publicado a las 11:17.

## Decisión

`apps/web/vercel.json` declara un `ignoreCommand` que corre `scripts/ci/vercel-ignorar.mjs`. El script sale con 0 («no construyas»)
**solo** si es una vista previa (`VERCEL_ENV=preview`) y el asunto del commit es un merge que trae `main` (las formas que escriben
git y las sesiones, sacadas del historial). Todo lo demás se construye como siempre: producción, un commit con código, ponerse al día
con la misma rama en el remoto, un merge de otra rama, un asunto que no reconoce, una variable que falta, un error del propio script o
un `git` que no responde. **Ante la duda construye:** el script solo puede equivocarse hacia gastar dos minutos, nunca hacia saltarse
una versión que alguien necesitaba.

Repetido sobre las 60 de esa mañana: se saltan las 34 y se construyen 26, ~16 por hora contra ~25 que Vercel alcanza.

Sus pruebas (`scripts/ci/vercel-ignorar.test.mjs`) corren en el CI, en el paso «Qué construye Vercel»: los asuntos reales que debe
saltar, los que debe construir (incluida una rama que se llama `claude/main-menu`), el código de salida que Vercel entiende y que la
orden de `vercel.json` funcione desde `apps/web` y desde la raíz.

## Descartado

- **Pagar construcciones en paralelo en Vercel.** La fila se vacía igual, pero seguiríamos construyendo 34 de cada 60 versiones que
  nadie mira, ahora pagando cada mes.
- **Apagar todas las vistas previas** (`git.deploymentEnabled` solo para `main`). El CI no corre `next build` (`ci.yml`, «POR QUÉ NO
  CORRE `build`»): la vista previa es la única compilación completa de una rama antes de fusionar. Sin ella, un error que solo aparece
  al compilar se vería recién al publicar.
- **Saltar según los archivos tocados** (`turbo-ignore`, `git diff --quiet`). Un merge de `main` trae las pantallas que cambió `main`,
  así que casi nunca se saltaría; solo se ahorraban los commits de puros documentos, 2 de 60.

## Se rompe si

Al traer `main`, la combinación de la rama con `main` rompe la compilación aunque cada lado compile solo: dos PR que tocan la misma
pieza, o un conflicto mal resuelto. La rama no se entera hasta su próximo commit con código, o hasta que se fusiona y Vercel construye
producción. Producción no se cae, porque Vercel no publica una versión que falló y deja la anterior, pero ese despliegue sale en rojo.
Lo que sí atrapa el CI antes de fusionar: en `pull_request`, tipos, lint y pruebas corren sobre el merge del PR con `main`; queda
afuera solo lo que aparece al compilar (un componente de servidor llamando a uno del navegador, una página que falla al generarse).

También se rompe si una sesión escribe el merge de `main` con un asunto que el script no reconoce: esa vista previa se construye como
hoy. Es la falla barata, y se corrige sumando la forma a `TRAEN_MAIN` en la prueba y en el script.

## Cómo se verifica

Después de fusionar, la primera rama que traiga `main` muestra en Vercel su versión como cancelada, y su log dice «No se construye: …
solo trae main a la rama … (ADR-0383)». Claude lo lee con la CLI, que sí tiene permiso sobre el equipo `cayla`:
`vercel inspect <url> --logs --scope cayla` (la conexión de Vercel dentro de Claude responde 403 al pedir logs).
