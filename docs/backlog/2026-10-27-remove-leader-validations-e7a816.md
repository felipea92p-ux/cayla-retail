# Backlog · 2026-10-27 · Sin validaciones de líder en la tienda (ADR-0534) — rama `claude/remove-leader-validations-e7a816`

## NO está en producción — espera el OK de Felipe

1. `20261027164000_quitar_validaciones_del_lider.sql` — UNA parte, re-pegable, solo reemplazos anclados de funciones (sin tablas, políticas
   ni `drop trigger`). Si una función cambió en producción desde que se escribió, el pegado falla entero con «el ancla aparece N veces» y
   no se aplica nada.

**Orden con la web:** la web de este PR muestra «Aprobar», «Confirmar cuadre», etc. a quien no es líder. Si la web se publica antes que el
SQL, esa persona ve el botón y la base le responde con el mensaje viejo de «solo un líder». Conviene pegar el SQL primero (la web vieja con
la base nueva no rompe nada: solo esconde botones que ya funcionarían).

Comprobación (debe dar `0`): `select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'retail' and
p.proname in ('aprobar_devolucion','rechazar_devolucion','cuadrar_piso','resolver_prenda_danada','liquidar_prenda_danada','registrar_movimiento_caja','cerrar_cola_arranque','reabrir_prenda_cerrada','fn_cola_arranque_candidatas','regularizar_prendas_sugeridas','regularizar_prenda','activar_campana_regla','retirar_campana_regla','fijar_grupos_de_categorias','anular_comprobante','marcar_comprobante_no_emitido')
and pg_get_functiondef(p.oid) like '%fn_es_lider()%';`

Después de pegar: `pnpm datos:generar:produccion` (`docs/datos/generado/COMO-REFRESCAR.md`).

## Pendiente de decidir (Felipe)

- **Qué roles tienen Facturación.** Desde este cambio, quien ve Facturación anula comprobantes ante SUNAT. Revisar en Roles y accesos que la
  terminal de caja lo tenga solo si debe.
- **Lo que ya estaba pendiente** (devoluciones por aprobar, colores e insignias propuestos) no se aprobó solo: se revisa como siempre.
