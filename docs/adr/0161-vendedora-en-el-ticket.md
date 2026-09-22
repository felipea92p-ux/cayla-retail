# ADR-0161 — «Quién vendió»: la fila «Atendió» del ticket sale de la asistencia de Dynamic

**Fecha:** 2026-09-21, rehecho el 2026-09-22 · **Estado:** aceptado (Felipe, 2026-09-22: «1A 2A 3A», ver abajo). Migración `20260922213700_ventas_del_dia_firma_con_quien_atendio.sql` **sin pegar en producción** · **Se apoya en:** ADR-0153 (`ventas.asesora_id`, `fn_asesoras_de_turno`, `registrar_venta` con `p_asesora_id` — ya en producción)

## Contexto

En Tienda TRU hay varias colaboradoras y un solo equipo de caja. `ventas.usuario_id` es la persona de la **sesión** que cobró, así que todas las ventas del equipo salían a nombre de quien tuviera la sesión abierta, y ni el ticket ni la boleta podían decir quién atendió.

La primera versión de este ADR (rama `claude/pos-ticket-seller-selection-95d5b3`, 2026-09-21) creó su propia columna `ventas.vendedora_id` y un interruptor `colaboradores.atiende_en_caja` que marcaba un líder. Mientras tanto, main recibió la 20260922150000 (ADR-0153, D-62), que ya guarda lo mismo en `ventas.asesora_id` y lee la asistencia de Dynamic (`fn_asesoras_de_turno`), y **se pegó en producción**. Fusionar las dos dejaba dos columnas para el mismo dato y dos sobrecargas de `registrar_venta`: el Punto de venta habría dejado de cobrar.

## Decisión

1. **Una sola columna: `ventas.asesora_id`** (la de main). `usuario_id` sigue siendo la sesión que cobró (auditoría de caja y anulaciones). La 20260922143700 de esta rama (que nunca se pegó) se eliminó entera.
2. **La fila «Atendió» muestra a quienes marcaron entrada hoy en Dynamic** (`fn_asesoras_de_turno`), no una lista que arma un líder. Reglas en `vendedorasDeTurno` (`lib/vender-reglas.ts`), elegidas por Felipe:
   - **Solo las `presente`** (2A). En almuerzo o trámite no aparecen; al marcar el regreso vuelven solas.
   - **Si nadie marcó nada hoy en la tienda, salen todas las de la sede con un aviso** (1A): un olvido en Dynamic no deja la venta sin a quién atribuirla.
   - **Sin interruptor del líder** (3A): todas las que marcan asistencia pueden vender. Se borraron `atiende_en_caja`, sus tres funciones y el modal.
3. **La fila se relee cada minuto y al volver a la pestaña** (`lib/useVendedorasDeTurno.ts`, mismo patrón que `useCajaEnVivo`): la caja queda abierta todo el día y la asistencia cambia. Si la lectura falla se conserva la última lista buena.
4. **Chips sin preselección, elegidos en cada venta.** Con 2 o más de turno, cobrar queda bloqueado hasta tocar una; con 1 es ella; con 0 la venta sale a nombre de la sesión, como antes.
5. **«Ventas de hoy» firma con quien atendió**: `fn_ventas_del_dia` junta `personas` por `coalesce(asesora_id, usuario_id)` (20260922213700, misma firma). Historial, buscador de Cambios/Devoluciones y detalle de caja hacen lo mismo en el código.
6. **Solo cambia el papel impreso.** El nombre no entra en lo que se envía a SUNAT/Nubefact.

## Consecuencias

- La base **no valida** que `p_asesora_id` sea de la sede: la versión de `registrar_venta` de main la guarda como referencia informativa. Es a propósito: una colaboradora de otra sede que marcó entrada aquí debe poder atender. La pantalla solo ofrece a quienes están de turno.
- Local no tiene asistencia de Dynamic (ADR-0033): `fn_asesoras_de_turno` devuelve vacío y la fila no aparece. Para verla con datos hay que probar contra producción o con una página temporal de vista previa.

## Se rompe si

- Se pega una versión anterior de `fn_ventas_del_dia` (la de `clientes` ya no compila) o se despliega la web sin la 20260922213700: la venta se guarda bien, pero «Ventas de hoy» la sigue firmando con la sesión (no se cae nada).
- Dynamic cambia la forma de `marcajes`/`jornadas`: `fn_asesoras_de_turno` devuelve vacío (se degrada sola) y la fila desaparece hasta ajustarla.

## Fuera de alcance

Comisiones o metas por vendedora, PIN por colaboradora, líderes como vendedoras, reescribir ventas anteriores.
