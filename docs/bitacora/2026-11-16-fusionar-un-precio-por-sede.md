# 2026-11-16 · Fusionar: un precio por sede (ADR-0650, act. 2026-11-16)

- **Qué:** tras fusionar, en cada sede que la hoja muestra el precio de la prenda es uno (el de la ficha ganadora) y cada excepción de talla se queda en
  su talla; la lista de sedes mira precios de prenda y el precio general elegido. La talla de obsequio
  sigue en 0, ningún precio de tienda queda bajo el costo y las excepciones conservadas guardan su motivo y autor. Cuatro rondas de revisión adversarial, cada hallazgo reproducido. Migración `20261116020000`, `precioGeneralElegido` y la previsualización de la hoja.
- **Verificado:** en un Postgres local con todas las migraciones, `pruebas:fusionar-productos` 45/45; con las funciones de antes fallan 29, 36, 37, 41, 42 y 43 (44-45 con la versión previa), y sin
  el parche del candado de la terminal falla 35. La migración se aplica dos veces sin efecto. En producción (solo lectura) el ancla aparece una vez y no
  hubo fusiones desde el pegado de 20261115153000. `tsc` limpio y 34 pruebas de las reglas de la web. **No verificado:** la hoja en el navegador.
- **Riesgo:** hasta pegar `20261116020000`, una fusión en producción puede dejar dos precios por sede en los tres casos del ADR.
