# Recibir: pulir lo que llega sin aviso (rama `claude/recibir-pulir-sin-aviso`)

## En producción (2026-11-07, con el OK de Felipe)
- [x] `20261107183000`, `20261107191000`, `20261107192000` y `20261107194000`, pegadas por `supabase db query --linked -f` (cada una en `begin … commit`). Las funciones tienen el mismo md5 que en local, y ninguna de las cinco del costo conserva `not retail.fn_puede_ver_dinero_de_compras()`.

- [x] `20261107201000` (arreglo del CI, mismo día, con el OK de Felipe), pegada por el conector de Supabase en `begin … commit`: la llave `variante_id` de `variantes_nacidas_al_recibir` quedó `ON DELETE CASCADE` y validada; sus 6 filas siguen ahí.

## Pendiente
- [ ] Felipe elige una de las tres maquetas de «Revisa y cierra» (`docs/maquetas/recibir-revisa-y-cierra-2026-11/`); recién ahí se rediseña la pantalla.
- [ ] Probar el costo con una cuenta de terminal en el navegador (la base ya lo deja: casos S3, S3c, A4).
- [ ] La × de «quitar lo agregado por error» en la placa del conteo («Tallas y colores» al contar): hoy solo esconde, y solo con dos o más.
- [ ] `veDinero` en las piezas de Recibir ya solo decide el costo: renombrarlo (`poneCosto`) cuando se toquen.
- [ ] `/chaos` y `/formidable` sobre «De quién llegó», «Ya la tenemos», «Lo que entró al stock» y la × de quitar.
- [ ] Una prenda creada al contar con su línea sin proveedor queda sin proveedor aunque después se ponga el de su marca: se completa en Editar producto (como antes).
