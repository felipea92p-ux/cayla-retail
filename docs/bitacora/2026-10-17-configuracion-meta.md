## 2026-10-17 (Metas: la meta sigue al calendario — por mes y por fecha, con el estimado de octubre a diciembre)
Qué hice: estimé las metas de TRU y AQP con un modelo de nivel + mes + día de la semana (validado hacia atrás: ~10 % de error mensual en TRU contra
18 a 20 % de copiar el año pasado; en AQP, estacionalidad de TRU a mitad de fuerza) y **cargué la semana de octubre en producción** (las 13 casillas,
desde Configuración ▸ Tiendas y caja, con el OK de Felipe). Después construí, solo en local, la tabla mes×día y las fechas especiales (ADR-0435):
`20261017020000` (tablas `ubicacion_metas_mes` y `ubicacion_metas_fecha`, `fn_parametros_caja` como envoltorio de `fn_parametros_caja_normal`, y
`guardar_metas_mes`, `guardar_meta_fecha`, `fn_configuracion_metas`) más dos tarjetas en Configuración y `pnpm pruebas:metas-mes-y-fecha`.
Por qué así: la semana tipo vale lo mismo los 12 meses y diciembre vende el doble; envolver la función (en vez de reescribir su cuerpo) deja intacto el
parche de seguridad del 15-oct. La fecha de un cierre es su «Marca temporal», no la columna «Fecha» (se corre días en AQP desde el 18-ago).
Felipe se lleva: **hay que pegar `20261017020000` en producción, en dos partes** (nada de la web nueva funciona hasta entonces; la web de hoy no se rompe).
Después, cargar noviembre y diciembre y las fechas del 23, 24 y 31 de diciembre. Probado: la suite nueva (todo en verde), `sesion-no-es-equipo`
(arreglada: repega una migración que compara md5), `configuracion-caja`, `metas-persona`, `roles`, vitest completo (551 archivos), `tsc` y `knip`; la
pantalla, en el navegador contra la base local (guardó una semana, un mes y una fecha). No verificado: el recorredor de guías (a la base local le faltan migraciones viejas).
