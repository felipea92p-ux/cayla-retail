# 2026-11-10 — Recibir: cada marca se lleva lo suyo del lote «Por confirmar»

- ENV-000007: Jirish y Blues Company salieron al stock sin proveedor (contadas antes de `20261107192000`) y compartían el lote «Por confirmar»; `poner_proveedor_de_marca` se negaba a ponerle proveedor a una.
- `20261110141000_completar_lote_por_confirmar_por_marca.sql` (ADR-0393 act. 2026-11-10, decisión de Felipe «Completar el provisional»): las entradas de la marca pasan al lote de su proveedor real, apagando el candado de movimientos solo dentro de la transacción; prueba A13 en `pruebas:envio-sin-aviso`, que sin la migración reproduce el error.
- No está en producción: espera el OK de Felipe. Al pegarla, en ENV-000007 elegir Textil Anqori SAC para Jirish y el proveedor de Blues Company en «Revisa y cierra».
