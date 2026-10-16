## 2026-10-16 (Next sube a 16.4.1 y se van las 17 alertas de seguridad que traía la 16.2.10)
Qué hice: `next` y `eslint-config-next` pasan de 16.2.10 a 16.4.1 en la web y en la tienda, y `@sentry/nextjs` de 10.75.3 a 10.76.2,
sin tocar `pnpm-workspace.yaml`. `pnpm audit --prod` baja de 34 alertas (3 críticas, todas de `next`) a 14 (11 altas, 3 moderadas), y
ninguna de las que quedan es de `next`. El candado `errores-reintentar.test.ts` atrapó el único cambio que rompía algo: Next 16.3
renombró `unstable_retry` a `retry`, y el «Reintentar» de `global-error.tsx` habría quedado muerto; se renombró ahí y en el candado.
Por qué así: 16.4.2 y Sentry 11.8.0 salieron hace menos de un día y el freno de antigüedad de pnpm (24 h, el valor de fábrica desde
pnpm 11) las instalaría solo agregando excepciones a `minimumReleaseAgeExclude`; 16.4.1 (14-oct) y 10.76.2 (8-oct) entran sin
excepción. Sentry se queda en la 10.x: la 11 quita `sendDefaultPii` y, sin reemplazarlo por `dataCollection`, mandaría cookies,
encabezados y búsquedas, lo que ADR-0424 prohíbe; ese salto es una decisión aparte.
Felipe se lleva: typecheck, 527 archivos de pruebas, lint, knip y `next build` de las dos apps en verde en local; las 14 alertas que
quedan son de piezas de compilación (`sharp`, `postcss`, `nanoid`, `browserslist`, `brace-expansion`, `source-map-js`,
`baseline-browser-mapping`) que llegan por el plugin de webpack de Sentry y por `postcss` dentro de `next`, y sus versiones parchadas ya
pasan el freno: un `pnpm update` de esas siete, en otro PR.
