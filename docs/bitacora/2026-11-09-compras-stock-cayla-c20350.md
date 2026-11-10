## 2026-11-09 y 10 (Compras → Existencias sin doble ni cero conteo, ADR-0636)
Qué hice: (1) Línea «Mercadería pagada» en el Balance (`20261109231000`), (2) el aviso de cierre dice cuánta plata queda fuera del libro
(`20261109235000`) y (3) la puerta «Recibir sin aviso» nombra las compras pagadas que vienen a esa sede (`20261110004000`): las tres YA ESTÁN EN
PRODUCCIÓN (verificado en solo lectura el 2026-11-09). (4) `20261110011000`: tabla `compra_papel_llegadas` y `unir_recepcion_con_compra`, que une una
recepción «sin aviso» con su compra pagada. Escrita, con prueba de base de 20 casos (`pnpm pruebas:unir-recepcion-con-compra`, 20/20; sin la
migración 0/20) y revisada por cuatro revisores adversariales y un escéptico por hallazgo. NO está pegada en producción.
La revisión reprodujo dos fallas altas y varias medias. Se cerraron en la migración: (a) la segunda compra se unía sin prendas que repartir
(se medía con una foto vieja; ahora con lo comprado de cada unida); (b) corregir el proveedor de la recepción después de unir dejaba el comprobante
con 0 «recibido antes» (stock doble): ahora no se corrige; (c) una compra unida ya no se anula, no cambia de tienda ni proveedor ni de cantidad;
(d) quien hizo la compra no la une; (e) la unión toma los mismos candados que crear_envio y bloquea envío antes que papel; (f) la PARTE 2 empieza
con una guarda de md5 (producción y local coincidían el 2026-11-09). Cambio de regla a confirmar con Felipe: NO se une si llegó menos de lo comprado
(antes: «el resto queda por recibir»), porque una compra unida no tiene otro camino para mandar, recibir o cerrar el resto.
Cómo verificas tú: levantar la base local al día (`supabase_db_cayla-lima`) y `RETAIL_CONTENEDOR_PG=supabase_db_cayla-lima pnpm pruebas:unir-recepcion-con-compra`.
No pegar `20261110011000` hasta que Felipe confirme la regla de arriba (va en dos partes, ver su encabezado).

## 2026-11-10 (paso 3: la lista de parejas posibles)
Qué hice: `20261110022000` (reservada con `pnpm reservar migracion`), `fn_uniones_posibles(sede)`: solo lee y lista las parejas recepción «sin aviso» × compra
pagada del mismo proveedor, con clase `exacto`, `probable` o `parcial`, si se puede unir y por qué no. Montos solo para quien ve el dinero de Compras.
No une nada: una persona decide cada pareja. 26 casos en total en `pnpm pruebas:unir-recepcion-con-compra` (L1 a L6 son los nuevos); sin las migraciones, 0/26.
Dato real (producción, solo lectura, 2026-11-10): 3 parejas exactas (candy lopez 10 prendas, Jacard 46, Shayatex 7), varias probables (Francisco Ramos) y
una llegada PARCIAL real: Victor Hugo Pun, compra de 40 (S/ 755) con 24 llegadas en dos recepciones. La regla «solo completa» no la une.
Cómo verificas tú: `RETAIL_CONTENEDOR_PG=supabase_db_cayla-lima pnpm pruebas:unir-recepcion-con-compra`. Pegar `20261110022000` DESPUÉS de `20261110011000`.
