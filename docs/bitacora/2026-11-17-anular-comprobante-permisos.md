## 2026-11-17 (La baja de un comprobante: la pide su sede, la confirma el servidor)
Qué hice: `anular_comprobante` exige la sede del comprobante y solo anota el pedido; «anulado» lo escribe `fn_confirmar_baja_sunat`, ahora solo
con la llave de servicio, desde `lib/confirmar-baja-sunat.ts` en las dos rutas de Lucode y el barrido. Migración `20261117021000`, ADR-0673.
Por qué así: la base solo debe escribir «anulado» con la respuesta de SUNAT, y lo único que distingue al servidor de una sesión es su llave.
Felipe se lleva: se pega la migración en producción antes de publicar la web; `pnpm pruebas:anular-comprobante-permisos` en verde (10/10).
