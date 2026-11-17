## 2026-11-17 (Lo que respondió SUNAT lo escribe el servidor)
Qué hice: `actualizar_transmision_comprobante` pasa a ser solo de `service_role`; la web guarda la respuesta de Lucode con `crearClienteAdmin()`,
creado antes de transmitir, en `transmitirComprobante`, `resolverYaEmitido` y `consultarComprobante`. Migración `20261117141000`, ADR-0675.
Por qué así: el estado ante SUNAT sale solo de Lucode, y lo único que distingue al servidor de una sesión es su llave.
Felipe se lleva: primero se publica la web y después se pega la migración; `pnpm pruebas:actualizar-transmision-permisos` en verde (9/9).
