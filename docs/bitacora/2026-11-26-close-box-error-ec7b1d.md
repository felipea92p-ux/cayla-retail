# 2026-11-26 — «Cerrar caja» se caía en Lima

- **Qué pasó:** en Tienda LIM, «Cerrar caja» mostraba «Esta pantalla no está mostrando datos» (Sentry CAYLA-RETAIL-1G,
  `ReferenceError: Cannot access 'W' before initialization`, release 735b6fe0a). En `CerrarCajaModalV2.tsx`, `cierreDelDestino`
  leía `destino` dentro de un `.find` nueve líneas antes de que `destino` se declarara (commit aac1f2c80, ADR-0683 act. 3).
  Solo Lima tiene aliada (CLAURE): ahí la lista no viene vacía, el `.find` corre su función y el modal revienta; TRU y AQP no.
- **Arreglo:** `cierreDelDestino` se mueve debajo de `destino`/`destinoBase`. TypeScript no lo ve porque la lectura va dentro de
  una función; `@typescript-eslint/no-use-before-define` sí lo detecta (probado contra la versión vieja), pero en todo `apps/web`
  da 237 avisos, casi todos falsos, así que no entra al CI tal cual: queda como tarea aparte.
- **Cómo se verifica:** la regla de ESLint ya no marca el archivo; `tsc` limpio; `caja-cierre-reglas` y `empresas-aliadas-reglas`
  45/45. Falta abrir «Cerrar caja» en Lima en producción una vez publicado.
