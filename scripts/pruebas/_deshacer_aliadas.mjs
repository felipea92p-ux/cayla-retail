/**
 * Ayudante de las pruebas de CLAURE que vuelven a pegar sus migraciones viejas dentro de su transacción (ADR-0683): antes de hacerlo, devuelven a su texto de
 * antes lo que las migraciones de las empresas aliadas cambiaron con un reemplazo anclado en funciones vivas. Sin esto, la migración vieja no encuentra el
 * texto que espera y aborta («cambió desde que se escribió esta migración»). Se ejecuta como dueño; nada se escribe fuera de la transacción de la prueba.
 *
 *   · 20261121160000: el Diario (`fn_asientos_claure`) lee lo de todas las aliadas → vuelve a leer lo de CLAURE.
 *   · 20261121164000: `fn_cuenta_sellada` deja que una cuenta de aliada reciba transferencias → vuelve a solo Yape y Plin.
 *   · 20261121162000: `cerrar_caja` deja el efectivo con la dueña de cualquier aliada → vuelve al candado de CLAURE; la proyección de caja descuenta lo de todas
 *     (`fn_aliadas_saldo_a`) → vuelve a `fn_claure_saldo_a`.
 *   · 20261121171000: el Diario resta los gastos de todas las aliadas (`fn_aliadas_gastos_base`) → vuelve a los de CLAURE; «lo que falta del mes» lee el
 *     reparto de todas (`fn_parte_de_aliadas`) → vuelve al de CLAURE; las funciones de ofertas preguntan `fn_campana_alcanza_empresa` → vuelven a «salvo CLAURE».
 * Si una base no tiene esas migraciones, cada `replace` no encuentra nada y no cambia nada.
 */
export const SQL_DESHACER_ALIADAS = `reset role;
do $deshacer_aliadas$
begin
  execute replace(replace(replace(pg_get_functiondef('retail.fn_asientos_claure(date, date, boolean, uuid[])'::regprocedure),
    'retail.fn_aliadas_ventas(', 'retail.fn_claure_ventas('), 'retail.fn_aliadas_cambios(', 'retail.fn_claure_cambios('),
    'retail.fn_aliadas_gastos_base(', 'retail.fn_claure_gastos_base(');
  if to_regprocedure('retail.fn_lo_que_falta_del_mes(date)') is not null then
    execute replace(pg_get_functiondef('retail.fn_lo_que_falta_del_mes(date)'::regprocedure),
      '(1 - retail.fn_parte_de_aliadas(f.categoria, f.ubicacion_id) / 100)',
      '(1 - coalesce((select r.pct_claure from retail.gasto_reparto_claure r
                               where r.categoria = f.categoria
                                 and exists (select 1 from retail.empresa_sedes es
                                              where es.empresa_id = v_claure and es.ubicacion_id = f.ubicacion_id)), 0) / 100)');
  end if;
  declare
    v_cola constant text := ' or p.empresa_id is distinct from (select em.id from retail.empresas em where em.clave = ''claure''))';
    v_forma text;
    v_def text;
    v_f oid;
  begin
    for v_f in select p.oid from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                where n.nspname = 'retail' and p.prosrc like '%retail.fn_campana_alcanza_empresa(p.empresa_id, %' loop
      v_def := pg_get_functiondef(v_f);
      foreach v_forma in array array['coalesce(r.incluye_claure, false)', 'coalesce(p_claure, false)', 'coalesce(o.claure, false)', 'r.incluye_claure'] loop
        v_def := replace(v_def, 'retail.fn_campana_alcanza_empresa(p.empresa_id, ' || v_forma || ')', '(' || v_forma || v_cola);
      end loop;
      execute v_def;
    end loop;
  end;
  execute replace(replace(pg_get_functiondef('retail.cerrar_caja(uuid, numeric, numeric, text, text, uuid)'::regprocedure),
    'where e.id <> retail.fn_empresa_casa_id() and e.cuenta_corriente_desde is not null and es.ubicacion_id = v_caja.ubicacion_id',
    'where e.clave = ''claure'' and e.activo and es.ubicacion_id = v_caja.ubicacion_id'),
    'El efectivo solo se queda con la dueña en una tienda donde opera una empresa aliada', 'El efectivo solo se queda con Claudia en una tienda donde opera CLAURE');
  execute replace(pg_get_functiondef('retail.fn_flujo_caja_proyeccion(integer)'::regprocedure), 'retail.fn_aliadas_saldo_a(v_hoy)', 'retail.fn_claure_saldo_a(v_hoy)');
  execute replace(replace(pg_get_functiondef('retail.fn_cuenta_sellada(text, text, uuid, date, uuid)'::regprocedure),
    'p_medio in (''yape'', ''plin'', ''transferencia'')', 'p_medio in (''yape'', ''plin'')'),
    'aquí solo entra lo cobrado por Yape, Plin o transferencia en su tienda.', 'aquí solo entra lo cobrado por Yape o Plin en su tienda.');
end $deshacer_aliadas$;
`;
