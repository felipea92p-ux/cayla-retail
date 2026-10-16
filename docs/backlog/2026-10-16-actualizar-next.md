## ⬆️ Next 16.4.1, eslint-config-next 16.4.1 y @sentry/nextjs 10.76.2 (2026-10-16) — solo dependencias y una barrera de error; rama `fix/actualizar-next`

- [x] `apps/web` y `apps/tienda`: `next` y `eslint-config-next` 16.2.10 → 16.4.1; `@sentry/nextjs` 10.75.3 → 10.76.2. Sin excepciones
      nuevas en `pnpm-workspace.yaml` (16.4.2 y Sentry 11.8.0 tienen menos de 24 h y pnpm las agregaría a `minimumReleaseAgeExclude`).
- [x] `global-error.tsx`: `unstable_retry` → `retry` (estable desde Next 16.3). Lo atrapó `lib/errores-reintentar.test.ts`, que ahora vigila
      `retry` y trata `unstable_retry` como el nombre viejo.
- [x] Verificado en local: `pnpm install` sin cambios en el workspace, `pnpm typecheck`, `pnpm test`, `pnpm --filter web lint`, `pnpm knip`,
      `next build` de web y tienda con variables de relleno en la línea del comando.
- [x] `pnpm audit --prod`: 34 → 14 alertas con Next 16.4.1 (las 17 de `next` desaparecieron) → **0** con el segundo commit:
      `pnpm update -r` de las 7 piezas de compilación que quedaban (`sharp` 0.35.5, `postcss` 8.5.30, `nanoid` 3.3.20, `browserslist` 4.29.3,
      `brace-expansion` 5.0.12, `source-map-js` 1.2.2, `baseline-browser-mapping` 2.11.28; llegan por `@sentry/webpack-plugin` → `webpack` →
      `minimizer-webpack-plugin` y por `postcss` dentro de `next`). Sin excepciones al freno: pnpm saltó `baseline-browser-mapping` 2.11.29
      (15-oct 18:12 UTC, menos de 24 h). Verificado otra vez: typecheck, tests y `next build` de web y tienda.
- [ ] **Decisión de Felipe:** subir Sentry a la 11.x (hoy 11.7.0 pasa el freno). Quita `sendDefaultPii` y hay que escribir `dataCollection`
      (sin `userInfo`, cookies, encabezados, cuerpos ni parámetros de URL) para sostener lo que promete ADR-0424.
- [ ] **Sin probar:** la web en el navegador con 16.4.1 (solo compiló y pasaron las pruebas), y la pantalla `global-error` con el botón
      «Reintentar» de verdad (solo la vigila el candado). Al compilar, `/inventario/traslados/nuevo` escribe «WhatsApp de las sedes: Dynamic
      server usage» en el log: es el `catch` de `getWhatsappDeSedes` tragándose el aviso con que Next marca la ruta como dinámica; no se
      comparó contra el log de la 16.2.10.
