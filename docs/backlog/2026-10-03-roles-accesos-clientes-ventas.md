## 👥 Roles y accesos: grupo «Clientes» (2026-10-03) — rama `claude/roles-accesos-clientes-ventas-6a2c38`

- [x] Web (`lib/modulos.ts`): `clientas` y `avisos_club` pasan al grupo «Clientes»; `clientas` se llama «Fichas de clientes».
- [x] Migración `20261004010000_modulos_grupo_clientes.sql` probada en LOCAL dentro de una transacción revertida.
- [x] **EN PRODUCCIÓN** (2026-10-03, la pegó Felipe; verificado con `select` a `retail.modulos`).
- [ ] Después de pegarla: refrescar el volcado (`docs/datos/generado/COMO-REFRESCAR.md`).
