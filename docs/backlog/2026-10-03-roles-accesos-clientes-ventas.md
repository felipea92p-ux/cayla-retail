## 👥 Roles y accesos: grupo «Clientes» (2026-10-03) — rama `claude/roles-accesos-clientes-ventas-6a2c38`

- [x] Web (`lib/modulos.ts`): `clientas` y `avisos_club` pasan al grupo «Clientes»; `clientas` se llama «Fichas de clientes».
- [x] Migración `20261004010000_modulos_grupo_clientes.sql` probada en LOCAL dentro de una transacción revertida.
- [ ] **NO está en producción**: pegarla en el SQL Editor (entera, sin partes: solo `update` de dos filas). Hasta entonces, los mensajes que arma la base siguen diciendo «Clientes».
- [ ] Después de pegarla: refrescar el volcado (`docs/datos/generado/COMO-REFRESCAR.md`).
