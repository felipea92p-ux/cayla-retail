## 🎁 Club, tanda 1d: «se la probó y no la llevó» y «es para regalo» (2026-09-30, ADR-0288 act. e) — migración sin pegar; rama `claude/club-paso1d-regalo-y-se-probo`

- [x] Migración en cuatro partes, cada una sola en el SQL Editor y en orden, después de la 1c:
  - `20260930240000` parte 1: `pedidos_no_atendidos.motivo`/`razon`;
  - `20260930240100` parte 2: `registrar_pedido_no_atendido` con `p_motivo`/`p_razon`;
  - `20260930240200` parte 3: `venta_items.es_regalo` — EN ESPERA;
  - `20260930240300` parte 4: `fn_clienta_compras` con `es_regalo` — EN ESPERA.

  Los «antes» coinciden con producción (medido el 2026-09-30). Se probó en un Postgres desechable con todas las
  migraciones (1b final y 1c incluidas) y el seed: `pnpm pruebas:club-regalo-y-se-probo`, 27/27.
- [x] **Cobrar: «¿Se la probó y no la llevó?» al quitar una prenda**, como en el spike:
  - cuatro razones y «No anotar»;
  - responsable como en «Anotar que no había»;
  - aviso del spike;
  - componente `punto-de-venta/SeProboNoLlevo.tsx` y lógica pura en `lib/se-probo-reglas.ts`.
- [x] Web:
  - la lista de Pedidos no atendidos muestra el motivo y la razón;
  - Inicio y Análisis cuentan solo «buscó y no había»;
  - la ficha dice «· regalo» y `deducirTallas` salta el regalo (sin la parte 4, todo es false).
- [ ] **Felipe: ¿«Es para regalo» se queda?** El spike la sacó del ticket.
  - **Si se queda:**
    - pegar las partes 3 y 4;
    - migración nueva para que `registrar_venta` lea `es_regalo` de `p_items`, sin cambiar su firma, con un reemplazo
      anclado sobre la de la 1c (`2b55a94a…`);
    - `ItemRegistrarVenta.es_regalo`;
    - la marca en la línea, solo con clienta.
  - **Si sale:** borrar las partes 3 y 4 y su lectura en la web (lista en el ADR-0288, act. e).
- [ ] **Felipe:** pegar las partes 1 y 2 (y la 3 y la 4 según la respuesta), fusionar después de pegar, y refrescar el
      diccionario (`pnpm datos:generar:produccion`).
- [ ] **Sin probar en el navegador:** la pregunta en Cobrar, en escritorio y a 375 px (PL-105). Lo prueba el coordinador.
- [ ] **Paso 3, «Llegó tu talla»:** filtrar `motivo = 'no_habia_talla'` (regla `esPedidoDeTalla`).
- [ ] **CL-14, «Tallas y prendas que faltaron» en Análisis:** lee las dos señales y agrupa por razón.
- Cómo verificas:
  - en Vender, agrega dos prendas y quita una;
  - bajo la clienta aparece «¿Se la probó y no la llevó? Quitaste «…» (talla)»;
  - toca «Precio»: sale «Anotado: se la probó y no la llevó»;
  - en `/pedidos-no-atendidos` la fila dice «Se la probó y no la llevó · precio».
