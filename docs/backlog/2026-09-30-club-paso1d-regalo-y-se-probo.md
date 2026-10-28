## 🧵 Club, tanda 1d: «se la probó y no la llevó» (2026-09-30, ADR-0288 act. e) — migración sin pegar; rama `claude/club-paso1d-regalo-y-se-probo`

- [x] Migración en dos partes, cada una sola en el SQL Editor y en orden, después de las tres de la 1c:
  - `20260930240000` parte 1: el `alter` de `pedidos_no_atendidos`, con `motivo` y `razon`;
  - `20260930240100` parte 2: `registrar_pedido_no_atendido` con `p_motivo` y `p_razon`.

  El «antes» coincide con producción (medido el 2026-09-30). Se probó en un Postgres desechable con todas las migraciones
  (1b final y 1c incluidas) y el seed: `pnpm pruebas:club-se-probo`, 22/22.
- [x] **Cobrar: «¿Se la probó y no la llevó?» al quitar una prenda**, como en el spike:
  - cuatro razones y «No anotar»;
  - responsable como en «Anotar que no había»;
  - el aviso del spike.
  - Convive con el canje del cumpleaños de la 1c, que ya está mergeado en esta rama.
- [x] Web:
  - la lista de Pedidos no atendidos muestra el motivo y la razón;
  - Inicio y Análisis cuentan solo «buscó y no había».
- [x] **Sacado: «es para regalo»** (Felipe, 2026-09-30: seguir el spike, que no la lleva). Se borraron:
  - las partes 3 (`venta_items.es_regalo`) y 4 (`fn_clienta_compras` con `es_regalo`);
  - la lectura en la ficha, el salto en `deducirTallas` y `lib/regalo-reglas.ts`.

  Un regalo cuenta para la talla deducida. Lo corrige la talla que ella dice en su ficha (preferencias, tanda 1f), que
  manda sobre la deducida.
- [ ] **Felipe:**
  - pegar la parte 1 y después la parte 2, DESPUÉS de las tres partes de la 1c;
  - fusionar después de pegar;
  - refrescar el diccionario (`pnpm datos:generar:produccion`).
- [ ] **Captura a 375 px** de la pregunta en Cobrar (PL-105). Todavía no se probó en el navegador.
- [ ] **Tanda 1f, preferencias:** la talla que ella dice en su ficha manda sobre la deducida. Así se corrige el regalo.
- [ ] **Paso 3, «Llegó tu talla»:** filtrar `motivo = 'no_habia_talla'` (regla `esPedidoDeTalla`).
- [ ] **CL-14, «Tallas y prendas que faltaron» en Análisis:** lee las dos señales y agrupa por razón.
- Cómo verificas:
  - en Vender, agrega dos prendas y quita una;
  - bajo la clienta aparece «¿Se la probó y no la llevó? Quitaste «…» (talla)»;
  - toca «Precio»: sale «Anotado: se la probó y no la llevó»;
  - en `/pedidos-no-atendidos` la fila dice «Se la probó y no la llevó · precio».
