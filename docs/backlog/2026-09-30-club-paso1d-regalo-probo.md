## 🎁 Club, tanda 1d: «es para regalo» y «se la probó y no la llevó» (2026-09-30, ADR-0288 act. e) — migración sin pegar; rama `claude/club-paso1d-regalo-y-se-probo`

- [x] Migración `20260930240000_club_paso1d_regalo_y_se_probo.sql`:
  - `pedidos_no_atendidos.motivo`/`razon`, con candados;
  - `registrar_pedido_no_atendido` con `p_motivo`/`p_razon` al final;
  - `venta_items.es_regalo`;
  - `fn_clienta_compras` con `es_regalo`.
  Probada en un Postgres desechable con todas las migraciones y el seed: `pnpm pruebas:club-regalo-y-se-probo`, 23/23.
- [x] Web:
  - `deducirTallas` salta el regalo (se cerró el «límite conocido v1»);
  - la ficha dice «· regalo»;
  - la lista de Pedidos no atendidos muestra el motivo y la razón;
  - Inicio y Análisis cuentan solo «buscó y no había»;
  - `lib/se-probo-reglas.ts` y `lib/pedidos-no-atendidos-acciones.ts`, que usan «Anotar que no había» y Cambios.
- [ ] **Fase B:** `registrar_venta` guarda `(v_item ->> 'es_regalo')::boolean`, con un reemplazo anclado sobre la definición
      de la 1c, sin cambiar la firma, y `ItemRegistrarVenta.es_regalo`. Espera a que la 1c commitee su migración.
- [ ] **Pantalla de Cobrar** (con las ramas que tocan `PuntoDeVentaTicket.tsx`/`ClientaDelTicket.tsx`):
  - «¿Se la probó y no la llevó?» al quitar una prenda;
  - «Es para regalo» en la línea, solo con clienta.
  - Lo que usa está en el ADR-0288, «Actualización (e)». Se prueba a 375 px (PL-105).
- [ ] **Felipe:** pegar la migración DESPUÉS de las de la 1c; fusionar después de pegar; refrescar el diccionario
      (`pnpm datos:generar:produccion`).
- [ ] **Paso 3, «Llegó tu talla»:** filtrar `motivo = 'no_habia_talla'` (regla `esPedidoDeTalla`).
- [ ] **CL-14, «Tallas y prendas que faltaron» en Análisis:** lee las dos señales y agrupa por razón.
- Cómo verificas:
  - anota «no había» desde el modal de talla de Cobrar;
  - en `/pedidos-no-atendidos` la fila dice «Buscó y no había»;
  - con la fase B y la pantalla, vende una prenda marcada como regalo a una clienta: su talla en la ficha no cambia y la compra dice «· regalo».
