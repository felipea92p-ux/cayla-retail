# Backlog · 2026-10-27 · Sin validaciones de líder en la tienda (ADR-0534) — rama `claude/remove-leader-validations-e7a816`

## PEGADA en producción (2026-10-27, con el OK de Felipe) — ya no está por pegar

Se pegó el 2026-10-27 a las 17:19 UTC por el MCP de Supabase (registrada como `20261027171909`; el archivo se llama `20261027164000`), después de un ensayo dentro de una transacción revertida que confirmó que las 22 anclas calzaban con producción. Comprobación tras pegar: 0 funciones con `fn_es_lider()`, los 5 disparadores del catálogo con ADR-0534. Falta `pnpm datos:generar:produccion` al refrescar el volcado.

1. `20261027164000_quitar_validaciones_del_lider.sql` — UNA parte, re-pegable, solo reemplazos anclados de funciones (sin tablas, políticas
   ni `drop trigger`). Si una función cambió en producción desde que se escribió, el pegado falla entero con «el ancla aparece N veces» y
   no se aplica nada.

**Orden con la web (ya resuelto: el SQL se pegó primero):** la web de este PR muestra «Aprobar», «Confirmar cuadre», etc. a quien no es líder. Si la web se publica antes que el
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

## `20261027174000_cola_arranque_exige_cuadre_en_main.sql` — NO hace falta pegarla (producción ya la tiene)

Trae a main el candado `cola_sin_cuadre` de `cerrar_cola_arranque` que producción tiene desde el 2026-10-14 (pegado desde el PR #1094,
`20261015000109`, nunca fusionado). Sin él, el check «SQL pegado» veía `cerrar_cola_arranque` distinta en producción. Comprobado el
2026-10-27: la huella de la función en local tras esta migración es la misma que en producción (`b92f8af18f08`). Es idempotente: si se pega,
no cambia nada. Lo demás de #1094 (`anular_venta` con la baja pedida, el plazo de la cola que sigue a la carga inicial) sigue vivo en
producción y fuera de main hasta que ese PR se resuelva. La web ya traduce `cola_sin_cuadre`; lo que #1094 también hacía (no ofrecer
«Cerrar» a una tienda sin cuadre y decir por qué antes de tocar) no se trajo.
