## 🧾 Recibir crea proveedor y marca (2026-11-09, ADR-0635) — 1 migración por pegar; rama `claude/provider-brands-creation-e1ae21`

- [x] `20261109230000_recibir_crea_proveedor_y_marca.sql`: `registrar_proveedor_de_recepcion` y `registrar_marca_de_recepcion`, por el módulo Recibir.
  Una parte, re-ejecutable, solo `create or replace`, `grant` y `comment`. Prueba: `pnpm pruebas:recibir-crea-proveedor-y-marca` (7 casos).
- [x] Hojas cortas `ProveedorNuevoRecepcion` y `MarcaNuevaRecepcion`, conectadas en «¿Qué llegó?», «De quién llegó» y la entrada sin aviso.
- [x] Probado en el navegador en un banco propio con una cuenta que solo ve Recibir (sin aviso: entrada, marca nueva con proveedor nuevo, cierre).
- [ ] **No está en producción:** pegar `20261109230000` (con el OK de Felipe) y después `pnpm datos:generar:produccion` con el volcado al día.
  Si la web se publica antes, la hoja dice «todavía no está disponible» y no se rompe nada.
- [ ] Ver en el navegador un envío de Compras con dos proveedores: el aviso bajo «De qué proveedor» y la marca nueva unida a uno de la guía.
- [ ] `/formidable` y `/chaos` de las dos hojas nuevas.
