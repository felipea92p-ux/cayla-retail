# ADR-0161 — «Quién vendió»: la vendedora se elige en el ticket y vive junto a la sesión que cobró

**Fecha:** 2026-09-21 · **Estado:** aceptado (diseño aprobado por el usuario el 2026-09-21). Migración `20260922143700_vendedora_en_la_venta.sql` aplicada **solo en local**; producción espera el OK explícito · **Spec:** `docs/superpowers/specs/2026-09-21-vendedora-en-el-ticket-design.md`

## Contexto

En Tienda TRU hay varias colaboradoras y un solo equipo de caja. `ventas.usuario_id` es la persona de la **sesión** que cobró (la RPC lo saca de `auth.uid()`), así que todas las ventas del equipo salían a nombre de quien tuviera la sesión abierta, y ni el ticket ni la boleta podían decir quién atendió.

## Decisión

1. **Columna nueva `ventas.vendedora_id`, además de `usuario_id`.** La sesión sigue siendo la auditoría de quién operó el equipo (caja, anulaciones); `vendedora_id` dice quién atendió. Sobrescribir `usuario_id` habría perdido esa auditoría. Vacío = «no se eligió»: vale `usuario_id`.
2. **Una fila de chips en el ticket, sin preselección, elegida en cada venta.** Un toque; cobrar queda bloqueado hasta tocar uno (con 2 o más marcadas). Recordar «la última» costaba 0 toques pero atribuía mal, en silencio, cuando la siguiente olvidaba cambiarla.
3. **Aparecen solo las colaboradoras marcadas `colaboradores.atiende_en_caja`**, que cambia un líder desde el propio Punto de venta (no desde `/colaboradores`, que otra sesión estaba reescribiendo). Con 0 marcadas en la sede la fila no aparece y se vende como antes: si no, el día del despliegue nadie podría cobrar. Con 1, es ella sola.
4. **`registrar_venta` gana `p_vendedora_id` (12.º parámetro).** Firma nueva por `drop` + `create` (no `create or replace`: dejaría dos versiones vivas). La base valida que sea colaboradora **de esa sede** (activa o suspendida: una venta guardada sin red no debe perderse porque un líder suspendió a alguien entre tanto) y **no** exige el interruptor. El navegador solo propone.
5. **Solo cambia el papel impreso.** El nombre no entra en lo que se envía a SUNAT/Nubefact.

## Consecuencias

- Los reportes cuentan a `vendedora_id` y, si falta, a `usuario_id` (`fn_ventas_del_dia`, historial, buscador de Cambios/Devoluciones, detalle de caja).
- La marca vive en `colaboradores`: al **suspender** una colaboradora su fila se mueve a `colaboradores_suspendidos` (ADR-0148), sale de la fila del ticket y, al reactivarla, vuelve **sin marca**. Cambiarla de sede apaga la marca (trigger).
- Los líderes no son elegibles (no tienen sede asignada): sus ventas siguen a nombre de la sesión.

## Se rompe si

- Se despliega la web antes de pegar la migración: la lectura da PGRST202, la fila no aparece y se vende como siempre, pero nadie puede marcar a nadie. **Orden: migración primero, web después.**
- El ADR-0150 (roles a medida) agrega roles a `colaboradores`: el `rol = 'colaborador'` de estas funciones tendría que revisarse.

## Fuera de alcance

Comisiones o metas por vendedora, PIN por colaboradora, líderes como vendedoras, reescribir ventas anteriores y mover el interruptor a `/colaboradores`.
