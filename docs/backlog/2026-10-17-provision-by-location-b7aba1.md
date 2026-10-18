## 🧾 La planilla estimada por sede (2026-10-17, ADR-0453) — migración sin pegar; rama `claude/provision-by-location-b7aba1`

- [x] `fn_planilla_provision` (+ la interna `fn_planilla_provision_calc`): por sede, lo devengado hasta hoy y lo que costaría el período entero, leído de `public.fn_proyeccion_periodo`
      de Dynamic. Probada con `pnpm pruebas:planilla-provision` (31 verificaciones; en `scripts/ci/pruebas-postgres.mjs`).
- [x] Web: `lib/planilla-provision-reglas.ts` (+16 pruebas) suma el estimado a Resultados y al Resumen, marcado «estimado»; el medidor de confianza lo cuenta; el Pulso ya no cuenta dos
      veces los sueldos y el desgaste (error previo, con prueba sobre la forma real de la base). 568 archivos de pruebas, tipos, lint y Knip en verde. Visto en el navegador con datos de ensayo (Resumen, cascada,
      tabla de Resultados y hoja «De dónde sale»).
- [ ] **Sin pegar en producción:** `supabase/migrations/20261018040000_planilla_provision_por_sede.sql`. Un solo pegado, sin políticas. Después: comparar el devengado de cada sede con la
      pantalla de Planilla de Dynamic del mismo período, y refrescar `docs/datos/generado/` (`COMO-REFRESCAR.md`).
- [ ] **Sin probar con Dynamic real desde el repo:** la base local solo tiene un stub de Dynamic. El contrato (`filas[]` con `sede`, `tipo_vinculo`, `sueldo_fijo`, `total`, `provision_total`) se midió a mano en
      producción el 2026-10-17 (solo lectura).
- [ ] **El Flujo de caja** (salida «Pago de la planilla») sigue repitiendo el último período pagado. Felipe pidió que las cifras sean las mismas: usar `al_cierre` de esta función como fuente única, en su
      propio PR (la función del Flujo tiene parches anclados).
- [ ] `/chaos` y `/formidable` no corridos: la pantalla no guarda nada (solo lectura) y no suma controles nuevos; la guía de foco y las guías interactivas no cambian (sus pruebas pasan).
- [ ] El Cierre de mes (`cierre-reglas.ts`) todavía avisa solo «el mes quedaría sin sueldos» si la cuenta no ve la planilla; no sabe que hay un estimado. Cerrar un mes con la planilla sin pagar deja el diario sin
      sueldos (como siempre): decidirlo con el contador (D-35).
