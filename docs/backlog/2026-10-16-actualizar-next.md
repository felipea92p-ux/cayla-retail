## ⬆️ Next 16.4.1, eslint-config-next 16.4.1 y @sentry/nextjs 10.76.2 (2026-10-16) — solo dependencias y una barrera de error; rama `fix/actualizar-next`

- [x] `apps/web` y `apps/tienda`: `next` y `eslint-config-next` 16.2.10 → 16.4.1; `@sentry/nextjs` 10.75.3 → 10.76.2. Sin excepciones
      nuevas en `pnpm-workspace.yaml` (16.4.2 y Sentry 11.8.0 tienen menos de 24 h y pnpm las agregaría a `minimumReleaseAgeExclude`).
- [x] `global-error.tsx`: `unstable_retry` → `retry` (estable desde Next 16.3). Lo atrapó `lib/errores-reintentar.test.ts`, que ahora vigila
      `retry` y trata `unstable_retry` como el nombre viejo.
- [x] Verificado en local: `pnpm install` sin cambios en el workspace, `pnpm typecheck`, `pnpm test`, `pnpm --filter web lint`, `pnpm knip`,
      `next build` de web y tienda con variables de relleno en la línea del comando.
- [x] `pnpm audit --prod`: 34 → 14 alertas (0 críticas). Las 17 de `next` desaparecieron.
- [ ] Las 14 alertas que quedan son de compilación, no del código que corre en la tienda: `sharp` 0.34.5, `postcss` 8.5.19, `nanoid` 3.3.16,
      `browserslist` 4.28.6, `brace-expansion` 5.0.7, `source-map-js` 1.2.1 (por `@sentry/webpack-plugin` → `webpack` →
      `minimizer-webpack-plugin`, y `postcss` dentro de `next`) y `baseline-browser-mapping` 2.10.43. Sus parches ya tienen más de 24 h
      (`baseline-browser-mapping` 2.11.0 desde el 15-oct 18:12 UTC): `pnpm update -r` de esas siete, en otro PR.
- [ ] **Decisión de Felipe:** subir Sentry a la 11.x (hoy 11.7.0 pasa el freno). Quita `sendDefaultPii` y hay que escribir `dataCollection`
      (sin `userInfo`, cookies, encabezados, cuerpos ni parámetros de URL) para sostener lo que promete ADR-0424.
- [ ] **Sin probar:** la web en el navegador con 16.4.1 (solo compiló y pasaron las pruebas), y la pantalla `global-error` con el botón
      «Reintentar» de verdad (solo la vigila el candado). Al compilar, `/inventario/traslados/nuevo` escribe «WhatsApp de las sedes: Dynamic
      server usage» en el log: es el `catch` de `getWhatsappDeSedes` tragándose el aviso con que Next marca la ruta como dinámica; no se
      comparó contra el log de la 16.2.10.
