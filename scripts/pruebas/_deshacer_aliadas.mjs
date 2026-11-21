/**
 * Ayudante de las pruebas de CLAURE que vuelven a pegar sus migraciones viejas dentro de su transacción (ADR-0683): antes de hacerlo, devuelven a su texto de
 * antes lo que las migraciones de las empresas aliadas cambiaron con un reemplazo anclado en funciones vivas. Sin esto, la migración vieja no encuentra el
 * texto que espera y aborta («cambió desde que se escribió esta migración»). Se ejecuta como dueño; nada se escribe fuera de la transacción de la prueba.
 *
 *   · 20261121160000: el Diario (`fn_asientos_claure`) lee lo de todas las aliadas → vuelve a leer lo de CLAURE.
 *   · 20261121162000: `cerrar_caja` deja el efectivo con la dueña de cualquier aliada → vuelve al candado de CLAURE; la proyección de caja descuenta lo de todas
 *     (`fn_aliadas_saldo_a`) → vuelve a `fn_claure_saldo_a`.
 * Si una base no tiene esas migraciones, cada `replace` no encuentra nada y no cambia nada.
 */
export const SQL_DESHACER_ALIADAS = `reset role;
do $deshacer_aliadas$
begin
  execute replace(replace(pg_get_functiondef('retail.fn_asientos_claure(date, date, boolean, uuid[])'::regprocedure),
    'retail.fn_aliadas_ventas(', 'retail.fn_claure_ventas('), 'retail.fn_aliadas_cambios(', 'retail.fn_claure_cambios(');
  execute replace(replace(pg_get_functiondef('retail.cerrar_caja(uuid, numeric, numeric, text, text, uuid)'::regprocedure),
    'where e.id <> retail.fn_empresa_casa_id() and e.cuenta_corriente_desde is not null and es.ubicacion_id = v_caja.ubicacion_id',
    'where e.clave = ''claure'' and e.activo and es.ubicacion_id = v_caja.ubicacion_id'),
    'El efectivo solo se queda con la dueña en una tienda donde opera una empresa aliada', 'El efectivo solo se queda con Claudia en una tienda donde opera CLAURE');
  execute replace(pg_get_functiondef('retail.fn_flujo_caja_proyeccion(integer)'::regprocedure), 'retail.fn_aliadas_saldo_a(v_hoy)', 'retail.fn_claure_saldo_a(v_hoy)');
end $deshacer_aliadas$;
`;
