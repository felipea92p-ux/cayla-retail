# ADR-0407 — Sin vistas previas en Vercel: el CI compila la web antes de fusionar

- **Fecha:** 2026-10-14 · **Estado:** aceptado (Felipe: «Opción B, mide primero cuánto tarda el build»). El job entra con este PR;
  las vistas previas se apagan en Vercel (Settings ▸ Git ▸ «Preview Deployments») una vez que `Compila la web` corre verde en este mismo PR.
- **Pedido:** Felipe vio que `Build CPU Minutes` sumaba US$ 148 de los US$ 187 gastados en Vercel desde julio (79 % de la cuenta) y
  preguntó si apagar las vistas previas, que hoy no se usan para nada, bajaba la factura.

## El problema (medido en Vercel, del 2026-09-14 al 2026-10-14)

| | Builds | Minutos de build | Parte |
|---|---|---|---|
| Vista previa (PR y ramas) | 2.823 | ~3.780 | **72 %** |
| Producción (cada fusión a `main`) | 1.022 | ~1.480 | 28 % |

Estimación proporcional de lo que se ahorra: ~US$ 105 de los 148 (el reparto se midió desde el 14-sep; la factura detallada por
proyecto no se pudo leer con la CLI ni con el conector). El ADR-0383 ya saltaba las vistas previas de «traer main», y aun así
quedaban 2.823.

**Lo que NO se podía apagar sin más.** Los checks obligatorios de `main` (`Tipos, lint y pruebas`, `Pruebas de RPC contra Postgres`,
`SQL pegado`) no dependen de Vercel, así que apagar no cambia la fusión. Pero el CI nunca corrió `next build` (`ci.yml` lo explicaba:
«Vercel ya construye»), de modo que **la vista previa era el único build antes de fusionar**. Atrapó 24 builds rotos en un mes (0,8 %):
un `"use client"` llamado desde el servidor, una página que revienta al prerenderizarse, una importación que Turbopack no resuelve —
cosas que `tsc`, lint y las pruebas no ven. Sin ella, ese error se descubre ya en `main`, cuando falla la publicación; la web que está
publicada no se cae (Vercel conserva la anterior), pero lo nuevo no sale hasta otro PR.

## Decisión

1. **Job `compilar-web` en `ci.yml`** («Compila la web»): `pnpm install --frozen-lockfile` + `pnpm --filter web exec next build`, con
   `NEXT_PUBLIC_SUPABASE_URL` y la llave pública de mentira (el build no habla con Supabase; solo lee la URL para la lista de hosts de
   imágenes de `next.config.ts`).
2. **Solo cuando puede cambiar lo que se compila.** `scripts/ci/alcance.mjs` escribe una salida nueva, `compilar=si|no`: `si` si el PR
   toca `apps/web/`, `packages/`, `package.json`, `pnpm-lock.yaml`, `pnpm-workspace.yaml`, `turbo.json` o `.nvmrc`. En un push a `main`
   es `no` (Vercel construye producción). El job usa `!= 'no'`, no `== 'si'`: si `alcance` falla, el job corre.
3. **Apagar `Preview Deployments`** en el proyecto `cayla-retail` de Vercel. Producción no cambia. El `ignoreCommand` del ADR-0383 se
   deja: solo actúa sobre vistas previas, que ya no habrá, no estorba y vuelve a servir si alguien las reactiva.

## Medido: cuánto cuesta el reemplazo

Corrida real en un runner `ubuntu-latest` de GitHub el 2026-10-14 (rama temporal, ya borrada): **`next build` 92 s**, instalación 6 s con
la caché de pnpm, ~110 s de job. A US$ 0,008 el minuto de Actions son ~US$ 0,02 por corrida, y solo en los PR que tocan la web. Una
segunda compilación con la caché de Next tibia tardó igual (94 s), así que no se guarda caché.

## DESCARTÉ

- **Apagar sin reemplazo (opción A):** ahorra lo mismo, pero el primer aviso de un build roto llega en `main`, no en el PR.
- **El build como paso de `Tipos, lint y pruebas`:** lo vuelve bloqueante, pero suma 90 s en serie a cada PR (también a los de solo
  documentos) en el job más largo. Un job aparte corre en paralelo y solo si toca la web.
- **Dejar las vistas previas:** US$ 105 al mes por un build que nadie abre.

## SE ROMPE SI

- Alguien necesita **ver una rama desplegada** (enseñarle un cambio a una tienda sin correrlo local): ya no hay URL. Se reactiva en
  Vercel en un clic, o se despliega a mano con `vercel deploy`.
- Un PR cambia algo que afecta el build **fuera** de las rutas de `COMPILA_LA_WEB` (una variable de entorno que Vercel inyecta, un
  `vercel.json` en la raíz): `compilar` diría `no`. Se arregla ampliando esa lista en `alcance.mjs`.
- El job `Compila la web` **no es un check obligatorio**: igual que la vista previa, un rojo avisa pero no impide fusionar. Volverlo
  obligatorio es un cambio del ruleset `main-protegida`, y queda como decisión de Felipe.
- El build en el runner usa variables de mentira: un error que solo aparece con valores reales (una página que consulta la base al
  compilarse) sigue saliendo recién en producción.
