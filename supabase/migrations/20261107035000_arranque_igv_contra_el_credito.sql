-- ============================================================================
-- 20261107035000 — El arranque del Balance resta el saldo a favor de IGV: octubre no paga IGV
--
-- EL PROBLEMA PRIMERO. El Balance dice que CAYLA le debe a SUNAT 20,157.00 (4011 al arranque) y la deuda crece cada mes,
-- mientras Impuestos parte de 62,035 a favor (`saldo_favor_igv`, vigente desde el 1-oct, del PDT 621 de septiembre). Las dos
-- cosas no pueden ser ciertas a la vez: el IGV de octubre se descuenta de ese crédito y no se paga.
--
-- LA DECISIÓN (Felipe, 2026-11-06; ADR-0620). El arranque (1-nov-2026) resta el crédito contra lo que se debía:
--   · 4011: 20,157.00 por pagar − 62,035.00 de crédito = 41,878.00 a favor de CAYLA (debe). El Balance la muestra como activo.
--   · 50 Capital: 139,723.78 + 62,035.00 = 201,758.78. Ese crédito ya era de CAYLA antes de empezar: no es ganancia de octubre.
--   · 591 no cambia: el resultado de octubre sigue siendo −26,488.05 y el Estado de resultados no se entera.
--   Total del patrimonio al arranque: 110,423.63 → 172,458.63 (+62,035.00).
--
-- ADR-0618 SIGUE CIERTO SALVO ESTAS CIFRAS: su decisión (separar capital de resultados, 104 y 1413 como el sistema al 31-oct,
-- el capital como lo que falta para cuadrar) no cambia. Lo que ya no vale de ese ADR son los números de la 50 (139,723.78) y del
-- total del patrimonio (110,423.63), y que la 4011 estuviera por pagar.
--
-- POR QUÉ NO CAMBIA NINGUNA FUNCIÓN (se revisó, no se asumió):
--   · La fila 60 de la Comprobación (`fn_conciliacion_contable`, 20260925170000 y 20261106010000) pone el saldo de arranque en sus
--     DOS lados (diario y comprobantes): la corrección los mueve igual y la diferencia y el estado no cambian. No pasa a «revisar»
--     por esto.
--   · No se cuenta dos veces: `fn_impuestos_igv_meses` y la proyección leen `saldo_favor_igv` y no miran `saldos_iniciales`; la
--     fila 60 lee `saldos_iniciales` y no mira `saldo_favor_igv`. Ninguna suma las dos.
--   · `fn_saldos_iniciales_propuesta` sugiere `saldo_favor_igv` solo si la 4011 no tiene saldo vigente. Con esta fila devuelve lo
--     vigente, −41,878.00 en el modal («si SUNAT te debía, en negativo»), y el modal sigue cuadrando.
--   · `fn_balance_general` ya pone la 4011 en activo si tiene saldo deudor, y la web la llama «Crédito fiscal de IGV».
--
-- CONTRATO
--   PROMETE: (1) el debe vigente sigue igual al haber vigente; (2) ni un saldo de Cuentas y dinero, ni el diario, ni el Estado de
--            resultados, ni Impuestos cambian; (3) repetirla no cambia nada.
--   ASUME:   arranque del Balance el 1-nov-2026 y, vigentes, 4011 = 20,157.00 al haber, 50 = 139,723.78 y `saldo_favor_igv` =
--            62,035 desde el 1-oct-2026. Si no, avisa y no toca nada.
--   NO HACE: no borra ni edita filas (la anterior queda a la vista, `saldos_iniciales` es inmutable); no toca `saldo_favor_igv`; no
--            enlaza las dos cifras: si después se corrige `saldo_favor_igv` en Configuración, Impuestos cambia y el arranque no. Esa
--            corrección también lleva la suya en el modal de Saldos de arranque.
--
-- CÓMO SE PEGA EN PRODUCCIÓN: UNA SOLA EJECUCIÓN, en cualquier orden respecto de 20261107034000. Solo agrega dos filas: no crea
-- políticas, no hace `alter` ni lleva `select … into` en un texto entre comillas (ADR-0288).
-- DOWN: registrar desde el modal de Saldos de arranque 4011 = 20,157.00 y 50 = 139,723.78, con motivo. Agrega filas, no borra.
-- ============================================================================
set search_path = retail, public, extensions;
set lock_timeout = '3s';

do $$
declare
  v_arr date := retail.fn_fecha_de_arranque();
  v_igv retail.saldos_iniciales%rowtype;
  v_cap retail.saldos_iniciales%rowtype;
  v_favor numeric;
  v_favor_desde date;
  v_motivo text := 'Octubre no paga IGV (ADR-0620): 4011 = 20,157 por pagar menos 62,035 de saldo a favor del PDT 621 de septiembre; 50 sube 62,035, porque ese crédito ya era de CAYLA antes de empezar. Migración 20261107035000.';
  v_debe numeric;
  v_haber numeric;
begin
  if v_arr is distinct from date '2026-11-01' then
    raise notice 'Sin arranque del 1-nov-2026: no se corrigen saldos de arranque.';
    return;
  end if;
  if exists (select 1 from retail.fn_saldos_iniciales_vigentes() v where v.cuenta = '4011' and v.debe = 41878.00 and v.haber = 0) then
    return;  -- ya está
  end if;
  for v_igv in select s.* from retail.saldos_iniciales s
                where s.cuenta = '4011' and not exists (select 1 from retail.saldos_iniciales r where r.reemplaza_id = s.id)
                order by s.created_at desc limit 1 loop
    exit;
  end loop;
  for v_cap in select s.* from retail.saldos_iniciales s
                where s.cuenta = '50' and not exists (select 1 from retail.saldos_iniciales r where r.reemplaza_id = s.id)
                order by s.created_at desc limit 1 loop
    exit;
  end loop;
  for v_favor, v_favor_desde in select t.valor, t.vigente_desde from retail.fn_parametro_tributario('saldo_favor_igv', v_arr) t loop
    exit;
  end loop;
  if v_igv.id is null or v_cap.id is null
     or v_igv.debe <> 0 or v_igv.haber <> 20157.00
     or v_cap.debe <> 0 or v_cap.haber <> 139723.78
     or v_favor is distinct from 62035 or v_favor_desde is distinct from date '2026-10-01' then
    raise notice 'Los saldos ya no son los que esta migración esperaba (4011 = 20,157 al haber, 50 = 139,723.78, saldo a favor 62,035 desde el 1-oct): no se tocan. Corrígelo desde el modal.';
    return;
  end if;

  insert into retail.saldos_iniciales (fecha, cuenta, debe, haber, origen, nota, reemplaza_id, motivo, registrado_por) values
    (v_arr, '4011', 41878.00, 0,         v_igv.origen, v_igv.nota, v_igv.id, v_motivo, v_igv.registrado_por),
    (v_arr, '50',   0,        201758.78, v_cap.origen, v_cap.nota, v_cap.id, v_motivo, v_cap.registrado_por);

  v_debe := (select sum(v.debe) from retail.fn_saldos_iniciales_vigentes() v);
  v_haber := (select sum(v.haber) from retail.fn_saldos_iniciales_vigentes() v);
  if v_debe <> v_haber then
    raise exception 'Los saldos de arranque no cuadran después de corregir: debe % contra haber %.', v_debe, v_haber;
  end if;
end $$;

reset lock_timeout;
