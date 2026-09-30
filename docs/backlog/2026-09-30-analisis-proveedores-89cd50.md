## 🚪 Las terminales pasan la puerta de lectura de retail (2026-09-30, ADR-0289) — migración `20260930050000` **NO está en producción**; rama `claude/analisis-proveedores-89cd50`

Compras ▸ Proveedores le mostraba «Esta pantalla no está mostrando datos» a la terminal administrativa de Tienda TRU: la base le
devolvía `[]` porque `fn_tiene_acceso_retail()` solo reconocía personas con colaborador, y `getProveedoresResumen()` lanza si no
llega la fila del resumen. Mismo hueco en `fn_existencias` / `fn_existencias_productos` (ahí se vería el stock vacío, sin aviso).

- [x] **Base:** la puerta reconoce una terminal activa de una sede activa (`fn_terminal_actual()`); guardia por md5 y se pega dos veces.
- [x] **Prueba:** `pnpm pruebas:terminales-lecturas`, 27 casos en el CI (puerta, pantalla completa, dinero por tienda, existencias,
  barrido de toda lectura sin argumentos que use la puerta, migración). Sin el arreglo: 10 rojos; con él: 27/27. Vecinas en verde.
- [ ] **Pegar en producción** (Felipe): una sola pegada, sin la web, sin partes (no crea políticas). Después verificar como la
  terminal con el `select` del ADR-0289 (proveedores = total, resumen = 1) y recargar Proveedores con esa cuenta.
- [ ] **Sin verificar en producción:** que el stock y la deuda por tienda se vean bien con la terminal real (hoy no hay compras;
  la prueba local cubre la lógica con dos comprobantes creados dentro del escenario).
- [ ] **Después de pegar:** `pnpm datos:generar:produccion` (refresca el diccionario) y `pnpm datos:comparar`.
- [ ] **Decisión de Felipe:** ¿el directorio de proveedores (banco, cuenta, CCI, billetera) debe depender del módulo `proveedores`
  y no solo de la puerta? Hoy lo lee cualquier cuenta que la pase; con este cambio se suman las terminales (la web no se lo muestra
  a la de ventas). Cambiarlo también cambia lo que ven los colaboradores.
- [ ] **Regla para lecturas nuevas:** «¿es actor de retail?» se pregunta con `fn_tiene_acceso_retail()`, nunca con un join propio a
  `personas` + `colaboradores` (el barrido de la prueba no vería esa función). Considerar subirla a `CLAUDE.md` («Módulos y roles»).
- [ ] **Ruido en registros (sin verificar que sea la misma cuenta):** `42501` «Elige quién hace esta operación» cada pocos segundos
  desde `fn_mi_pantalla_principal` → `fn_actor_persona_id(true)`. Es el candado del responsable (ADR-0162), no un error de Proveedores.
- [ ] **Base local atrasada:** llega a `20260928180000`; le faltan 28 migraciones (entre ellas la de `fn_existencias`). La
  `20260929100000_frescura_modulo_y_candado.sql` se detuvo por su guardia de `fn_frescura_sede` al aplicarla sobre una copia: revisar
  aparte (no toca proveedores ni terminales).
