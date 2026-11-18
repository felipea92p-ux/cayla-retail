# Recibir sin fila «Total»: lo que queda

- [x] Pegar en producción `20261103182000_modelos_en_cero_al_contar.sql` (2026-11-03, con el OK de Felipe; versión registrada `20261103190810`).
- [ ] Refrescar el volcado (`docs/datos/generado/COMO-REFRESCAR.md`): `fn_envio_sin_ceros` todavía no está en el diccionario.
- [ ] **Decisión de Felipe:** este PR y #1616 resuelven de dos formas lo mismo: quitar lo agregado (tacho que confirma si ya se contó, contra una ✕ que no pregunta) y la fila «Total» (no existe, contra la fila de la categoría como total). El segundo en fusionar tiene que elegir.
- [ ] **Decisión de Felipe:** dos personas agregando modelos a la vez en la misma línea: la última pisa a la otra y el aviso habla de cantidades. ¿Se cuenta así en la tienda? Si sí, hay que unir lo separado al guardar.
- [ ] **`/formidable` completo** (prueba ciega) sobre el «+», «Blusa 1» y el tacho: solo corrió la medición.
- [ ] Probar con una colaboradora real: ¿el «+» se encuentra sin que nadie lo diga?
