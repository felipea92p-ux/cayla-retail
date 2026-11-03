# Recibir sin fila «Total»: lo que queda

- [x] Pegar en producción `20261103182000_modelos_en_cero_al_contar.sql` (2026-11-03, con el OK de Felipe; versión registrada `20261103190810`).
- [ ] Refrescar el volcado (`docs/datos/generado/COMO-REFRESCAR.md`): `fn_envio_sin_ceros` todavía no está en el diccionario.
- [ ] **Cruce con #1616: manda #1617 (Felipe, 2026-11-03).** Al traer #1616 sobre esto se quedan el tacho (confirma si ya se contó) y la pantalla sin fila «Total»: su ✕ que no pregunta y su «la fila de la categoría es el total» se van. De #1616 se conserva lo que aquí no existe: cancelar la recepción de un envío sin aviso (ADR-0605) y quitar una categoría entera.
- [ ] **Decisión de Felipe:** dos personas agregando modelos a la vez en la misma línea: la última pisa a la otra y el aviso habla de cantidades. ¿Se cuenta así en la tienda? Si sí, hay que unir lo separado al guardar.
- [ ] **`/formidable` completo** (prueba ciega) sobre el «+», «Blusa 1» y el tacho: solo corrió la medición.
- [ ] Probar con una colaboradora real: ¿el «+» se encuentra sin que nadie lo diga?
