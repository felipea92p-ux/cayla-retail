# Recibir: pulir lo que llega sin aviso (rama `claude/recibir-pulir-sin-aviso`)

## No está en producción
- [ ] `20261107183000_galeria_de_la_categoria_al_recibir.sql` (solo lectura).
- [ ] `20261107191000_quitar_combinacion_nacida_al_recibir.sql` (tabla nueva + parche a `preparar_prenda_al_recibir`).
- [ ] `20261107192000_proveedor_por_linea_sin_aviso.sql` (guardar, cerrar, preparar, corregir, conteos; función nueva `poner_proveedor_de_marca`).
- [ ] `20261107194000_costo_al_recibir_para_quien_recibe.sql` — **permiso sobre dinero: espera el OK explícito de Felipe.** Después de pegar, comprobar que ninguna de las cinco funciones siga con `not retail.fn_puede_ver_dinero_de_compras()` en el candado del costo.

## Pendiente
- [ ] Felipe elige una de las tres maquetas de «Revisa y cierra» (`docs/maquetas/recibir-revisa-y-cierra-2026-11/`); recién ahí se rediseña la pantalla.
- [ ] Probar el costo con una cuenta de terminal en el navegador (la base ya lo deja: casos S3, S3c, A4).
- [ ] La × de «quitar lo agregado por error» en la placa del conteo («Tallas y colores» al contar): hoy solo esconde, y solo con dos o más.
- [ ] `veDinero` en las piezas de Recibir ya solo decide el costo: renombrarlo (`poneCosto`) cuando se toquen.
- [ ] `/chaos` y `/formidable` sobre «De quién llegó», «Ya la tenemos», «Lo que entró al stock» y la × de quitar.
- [ ] Una prenda creada al contar con su línea sin proveedor queda sin proveedor aunque después se ponga el de su marca: se completa en Editar producto (como antes).
