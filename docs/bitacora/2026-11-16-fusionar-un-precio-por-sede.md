# 2026-11-16 · Fusionar: un precio por sede (ADR-0650, act. 2026-11-16)

- **Qué:** tras fusionar, en cada sede que la hoja muestra toda la prenda cobra un solo precio (el de la ficha ganadora); la lista de sedes mira el
  precio general elegido. Migración `20261116020000`, `precioGeneralElegido` y la previsualización de la hoja.
- **Verificado:** en un Postgres local con todas las migraciones, `pruebas:fusionar-productos` 39/39; con las funciones de antes fallan 29, 36 y 37, y sin
  el parche del candado de la terminal falla 35. La migración se aplica dos veces sin efecto. En producción (solo lectura) el ancla aparece una vez y no
  hubo fusiones desde el pegado de 20261115153000. `tsc` limpio y 34 pruebas de las reglas de la web. **No verificado:** la hoja en el navegador.
- **Riesgo:** hasta pegar `20261116020000`, una fusión en producción puede dejar dos precios por sede en los tres casos del ADR.
