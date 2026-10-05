## 🗓️ Finanzas cuenta desde una fecha (2026-10-04, ADR-0332) — rama `claude/ajuste-fecha-nomina-07b3ed`; **SQL SIN PEGAR en producción**

Pedido de Felipe: que la planilla de Dynamic de septiembre no aparezca como pérdida en un sistema que arrancó en octubre. Opción A elegida.

- [x] **SQL escrito y probado:** `supabase/migrations/20261004190000_finanzas_cuenta_desde.sql` (columna `parametros_finanzas.inicio_finanzas`,
  `fn_finanzas_desde`, `guardar_inicio_finanzas`, reemplazo anclado en `fn_asientos`, `fn_estado_resultados`, `fn_flujo_caja_real`,
  `fn_parametros_finanzas`). `pnpm pruebas:finanzas-arranque` 39/39 + mutación. En `ci.yml`.
- [x] **Web:** `lib/finanzas-arranque-reglas.ts` (+ prueba), Resumen (`resumen-finanzas-reglas.ts`, `ResumenFinanzas.tsx`), Configuración ▸ Caja y
  avisos (`ConfiguracionCajaAvisos.tsx`), Cierre (`cierre/page.tsx`, `CierreMes.tsx`) y Reportes (`reportes/page.tsx`).
- [ ] **PEGAR EN PRODUCCIÓN (Felipe, una ejecución):** el archivo `20261004190000_finanzas_cuenta_desde.sql` tal cual, en el SQL Editor.
  Antes: comprobar que las huellas md5 de `fn_asientos`, `fn_estado_resultados`, `fn_flujo_caja_real` y `fn_parametros_finanzas` siguen siendo las
  del ADR-0332 (si alguien las parchó, la migración aborta sola y no toca nada). **Orden: primero el SQL, después fusionar la web.**
- [ ] **Después de pegar:** Configuración ▸ Caja y avisos ▸ «Desde cuándo cuenta Finanzas» ▸ **Desde Octubre 2026** ▸ Guardar. Verificar en el
  Resumen: ya no dice «Utilidad de septiembre», «TRU perdió…» ni «Septiembre sigue abierto»; sigue diciendo los días de caja, la semana bajo el
  mínimo (26-oct a 1-nov) y «septiembre: S/ 252 por declarar» del IGV. Correr `pnpm datos:generar:produccion` (regla de oro del diccionario:
  `parametros_finanzas` gana una columna).
- [ ] **Abierto · la base permite cerrar un mes anterior al corte.** Hoy solo la web no lo ofrece. Si alguien llama `cerrar_periodo` para
  septiembre con el corte puesto, congela un diario vacío y bloquea mover el corte (hay un mes cerrado). Cerrarlo en `cerrar_periodo` pide otro
  reemplazo anclado sobre una función viva (huella `39bca3adbda7abb3a365c8fe3071cdd1` el 2026-10-04): se hace si aparece el caso.
- [ ] **Abierto · saldos de arranque.** `saldos_iniciales` tiene 0 filas, así que el Balance no tiene fecha de arranque (`fn_fecha_de_arranque()`
  sale nula y nadie la usa todavía). Cuando se carguen, que sea **la misma fecha** que `inicio_finanzas`: dos «arranques» distintos en el mismo
  módulo serían dos verdades. Decisión de Felipe cuando se llegue al Balance.
- [ ] **Abierto · octubre y la planilla.** Octubre solo tendrá sueldos cuando Dynamic marque pagado su período (29-sep a 28-oct). Hasta entonces, la
  utilidad de octubre a la fecha sale sin planilla y se ve mejor de lo que es (la nota «se suma cuando Dynamic la pague» ya existe en Reportes).
