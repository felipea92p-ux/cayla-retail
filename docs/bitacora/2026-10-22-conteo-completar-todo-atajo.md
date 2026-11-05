## 2026-10-22 («Completar todo» de una tarjeta de Conteo cuenta, pero lo dice — ADR-0328, decisión 10, segunda mitad)
Qué hice: el botón «Completar todo» de cada tarjeta (un modelo y color) ahora manda UNA llamada a `conteo_completar_tarjeta` en vez de una por talla, y la base
deja marcada cada línea (`conteo_items.completada_con_atajo`). Sigue contando para la exactitud y para el arranque, pero Revisar y Confirmar dicen «N de M variantes contadas
se completaron con «Completar todo», con lo que CAYLA esperaba». La migración (`20261022145000`, creada como `20261005233700` y renombrada a su versión reservada sin cambiar el SQL) la pegó Felipe en producción (comprobada por efectos el 2026-10-22: columna,
restricción, disparador, función, permisos y 0 filas marcadas). El trabajo se hizo el 2026-10-05 sobre una rama que quedó 2620 commits detrás de `main`; se rehízo en una rama
nueva desde `main` con solo los tres commits de Conteo (los de Análisis y de Buscar quedaron superados: `main` rehízo Análisis y ya lee `fn_existencias` en Buscar).
Una revisión independiente de solo lectura (SQL, web e integración con `main`, y un escéptico por hallazgo) no encontró nada que bloquee ni corrompa; con lo que sí confirmó
se quitó el respaldo «talla por talla» (era para la web antes que el SQL y ya no existe ese caso), se cambió la frase para que sea siempre cierta, y se corrigieron comentarios,
referencias del ADR y los siete «sin pegar» viejos de Conteo en `ARQUITECTURA.md`.
Por qué así: la pantalla mandaba el atajo como si la persona hubiera escrito cada número, y la base no podía distinguir «alguien contó 3» de «alguien tocó el botón»; un arranque
que nadie miró deja los errores de la carga inicial para el conteo siguiente, donde entran como merma. Felipe eligió contarlo pero decirlo (no marcarlo «sin contar»). La función
nueva LLAMA a `conteo_contar` en vez de reescribirla, porque esa lleva parches vivos, y por eso no es «otra puerta» (la ADR-0282 había descartado una acción de servidor por eso).
La frase dice «con lo que CAYLA esperaba» y no «nadie escribió su cantidad» porque teclear el MISMO número encima no llega a la base y la marca sigue: tiene que ser cierta también así.
Cómo verificas: (1) `node scripts/pruebas/conteo_atajo_tarjeta.mjs --contenedor <tu base>` da 15/15 con 4 controles que muerden por mutación; (2) abre un conteo en Inventario ▸ Conteo,
pulsa «Completar todo» en una tarjeta con varias tallas: en la pestaña de red sale UNA petición `conteo_completar_tarjeta`; cuenta otra talla con el `+` (sale `conteo_contar`);
en Revisar y en Confirmar dice «2 de 3 variantes contadas se completaron…». Medido el 2026-10-22 contra una base propia con las 807 migraciones de `main`: la prueba SQL 15/15,
`conteo_de_envio` 16/16, `conteo_vacio_no_se_cierra` 10/10, `conteo_rediseno` 49/49 y `conteo_firma_arranque` 49/49; en el navegador, la tarjeta en una sola petición, la marca solo en las
líneas del atajo y 375 px sin desborde. Batería de la web: 582 archivos, 161.493 pruebas, `tsc`, `eslint` y `knip` en verde.
