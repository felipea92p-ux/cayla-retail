## Cada tienda maneja lo suyo (ADR-0458)

- [ ] **Pegar `20261019223000_tienda_separar_solo_lo_de_la_tienda.sql` en producción** (con el OK de Felipe): después, comprobar con una consulta que `tienda_separar` y `tienda_look` tienen ya el cuerpo nuevo (`position('array[p_ubicacion_id]' in prosrc) > 0`).
- [ ] **Probar con una cuenta real** (pila de clientes): elegir Trujillo, abrir una prenda que solo hay en Arequipa y mirar «Agotada», «Hay en Arequipa.» y «Avísame cuando llegue»; probar «Separar» con una bolsa armada antes del cambio.
- [ ] Una prenda que no hay en la tienda elegida se esconde del catálogo pero **no** de la ficha (enlace compartido, favorito): si Felipe prefiere otra cosa, decidirlo aparte.
- [ ] Falta un mutante de `tienda_separar` para esta regla en `pruebas:tienda-bolsa -- --mutantes` (la migración protege su propio md5, por eso no entra a la lista de mutantes de las tres migraciones de la bolsa); el escenario «solo separa lo que hay en la tienda de recojo» sí corre en el CI.
