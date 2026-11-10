## Compras → Existencias (rama compras-stock-cayla-c20350, ADR-0636)
- [ ] Probar `20261110011000_unir_recepcion_con_su_compra.sql` contra Postgres local (no se pudo: Docker caído) y escribir su prueba en `scripts/pruebas/` (unir, repetido, envío con conteo, doble unión, pase al libro, recibido antes).
- [ ] Revisión adversarial de esa migración (volver a correr; la primera salió vacía por el límite semanal). Punto a mirar: el disparador `compra_papeles_llegada_reparte` supone que `completar_papel_compra` ya creó `compra_items` antes de poner el papel en «completado».
- [ ] Paso 3: lista para unir lo ya recibido (3 parejas exactas, 2 probables; ojo envío 2 de TRU: que no lo cierren hasta revisar la boleta de 40 prendas).
- [ ] Pantalla que llama a `unir_recepcion_con_compra`.
- [ ] Pegar en producción, con OK de Felipe: `20261109231000`, `20261109235000`, `20261110004000` (independientes) y después `20261110011000` en dos partes. Hoy ninguna está pegada.
