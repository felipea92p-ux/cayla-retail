## 🧪 Pruebas de CLAURE: verificación del arreglo y duraciones del CI (2026-10-30) — solo pruebas y CI, sin migración; rama `claude/determined-villani-6b5355`

- [x] **Causa nombrada con evidencia:** el seed le pone a cada variante un id al azar (`gen_random_uuid()`), así que «la
      primera variante por id» —la que 13 suites de CLAURE tomaban prestada y marcaban como de CLAURE— es una prenda
      distinta en cada base del CI; y el seed deja ventas, un cambio y una devolución dañada de hoy sobre 5 de sus 11
      prendas. Reproducido en base privada con los mensajes exactos del CI.
- [x] **El arreglo quedó en `main`** (`bff3954ea`, `scripts/pruebas/_claure_prendas.mjs`, de otra sesión): elegir prendas
      sin historia comercial. El camino alterno de esta rama (que la escena CREE sus prendas) se descartó al traer `main`.
- [x] **Verificado sorteo por sorteo:** 14 suites × 20 prendas limpias = 280 corridas verdes contra una base privada
      (984 migraciones + seed, hora de Lima). Antes del arreglo, el mismo barrido daba 40 de 147 rojas.
- [x] `scripts/ci/pruebas-postgres-duraciones.json`: de 189 a 394 medidas (corrida 41137549225). Las 19 suites de CLAURE
      y `pruebas:materiales` estaban sin medir; el reparto estimado pasa de 263 s a 338 s por tanda.
- [ ] **Riesgo que queda (de diseño, no un bug):** `_claure_prendas.mjs` ENUMERA las tablas con historia
      (`venta_items`, `separacion_items`, `apartados`, `pedido_web_lineas`, `cambio_salidas`, `prendas_danadas`,
      mermas de `movimientos`). Una tabla nueva con historia de prenda que nadie sume ahí devuelve el rojo
      intermitente, y una prueba que COMMITEE sobre las 5 prendas limpias del seed puede dejar la lista en cero (ahí
      `\gset` no recibe filas y psql falla en voz alta, que es lo correcto). Si vuelve a pasar, el otro camino —crear
      la prenda dentro de la transacción— está descrito en la bitácora de esta rama.
- [ ] **Sin medir:** `pruebas:finanzas-lecturas-que-escalan` (nació después de la corrida medida; vale la mediana).
- [ ] **Sin verificar en el CI:** el barrido corrió en una base privada. Falta ver las 4 tandas verdes varias veces
      seguidas en GitHub Actions con el reparto nuevo.
