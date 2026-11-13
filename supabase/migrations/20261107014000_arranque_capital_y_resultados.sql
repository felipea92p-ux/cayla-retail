-- ============================================================================
-- 20261107014000 — El arranque del Balance separa el capital de lo perdido en octubre, y su modal vuelve a cuadrar
--
-- EL PROBLEMA PRIMERO. El arranque del Balance (1-nov-2026) tenía TODO el patrimonio en una sola línea: Capital 104,749.13.
-- Esa cifra mezclaba lo que el dueño puso con lo que el negocio ganó o perdió en octubre, y dejaba dos huecos que la
-- Comprobación marca: (1) el fondo por rendir de la ronda 4 (1413 = 5,700 al 31-oct) no estaba en el arranque, así que el
-- diario de la 1413 queda 5,700 debajo de Fondos por rendir; (2) el banco (104) decía 5,330.74 cuando el sistema, al 31-oct,
-- tiene 5,305.24: un pago al Taller de 25.50 con fecha 28-oct se registró después de fijar el arranque.
-- Además, el modal de Saldos de arranque NO podía guardar ninguna corrección: `fn_saldos_iniciales_propuesta` no devuelve las
-- líneas que se registraron a mano fuera de su lista (231 y 241, 20261106171000), el modal calculaba el cuadre sin ellas
-- (-1,436.86) y nunca habilitaba «Guardar».
--
-- LA DECISIÓN (Felipe, 2026-11-06; ADR-0618).
--   · El arranque queda como el sistema lo tiene al 31-oct en 104 (5,305.24) y 1413 (5,700).
--   · El patrimonio se parte en dos: 591 Resultados acumulados = resultado de octubre (Estado de resultados: −26,488.05)
--     menos los retiros de octubre (2,812.10) = −29,300.15 (saldo deudor); 50 Capital = lo que falta para cuadrar =
--     139,723.78. El total del patrimonio pasa de 104,749.13 a 110,423.63 (+5,700 del fondo, −25.50 del banco).
--   · La propuesta devuelve también toda cuenta con saldo vigente que no esté en su lista, para que el modal cuadre.
--
-- CONTRATO
--   PROMETE: (1) el debe vigente sigue igual al haber vigente; (2) la Comprobación de la 1413 cuadra y la de la 104 baja de
--            113.50 a 88.00 (los dos ploteos de noviembre, que no son de este arreglo); (3) ni un saldo de Cuentas y dinero ni
--            el Estado de resultados cambian (los saldos de arranque no entran a ninguno de los dos); (4) repetirla no cambia
--            nada.
--   ASUME:   arranque del Balance el 1-nov-2026 y, vigentes, 104 = 5,330.74 y 50 = 104,749.13, sin 1413 ni 591. Si no, avisa
--            y no toca los saldos (sí arregla la propuesta).
--   NO HACE: no toca movimientos, cuentas de dinero, ventas ni gastos; no cambia la regla de la carga inicial tardía (sigue
--            contra el capital: el camino correcto para la mercadería de las rondas es completar sus papeles en Compras).
--
-- CÓMO SE PEGA EN PRODUCCIÓN: UNA SOLA EJECUCIÓN. Reescribe una función desde su definición viva y agrega cuatro filas a los
-- saldos de arranque. No crea políticas ni hace `alter` de tablas en uso. Sin `select … into` dentro de un texto entre
-- comillas (ADR-0288).
-- SE ROMPE SI: se cierra noviembre antes de pegarla.
-- DOWN: registrar desde el modal (ya puede guardar) 104 = 5,330.74, 1413 = 0, 50 = 104,749.13 y 591 = 0, con motivo.
-- ============================================================================
set search_path = retail, public, extensions;
set lock_timeout = '3s';

create or replace function pg_temp.reemplazar(p_firma text, p_viejo text, p_nuevo text, p_veces integer)
returns void
language plpgsql
as $f$
declare
  v_def text;
  v_n integer;
begin
  v_def := pg_get_functiondef(p_firma::regprocedure);
  if position(p_nuevo in v_def) > 0 then
    return;
  end if;
  v_n := (length(v_def) - length(replace(v_def, p_viejo, ''))) / length(p_viejo);
  if v_n <> p_veces then
    raise exception '% cambió desde que se escribió esta migración: se esperaban % apariciones de «%» y hay %. Regenera el reemplazo desde su definición real.',
      p_firma, p_veces, p_viejo, v_n;
  end if;
  execute replace(v_def, p_viejo, p_nuevo);
end;
$f$;

-- ---------- 1. La propuesta trae toda cuenta con saldo vigente (el modal vuelve a cuadrar) ----------
select pg_temp.reemplazar('retail.fn_saldos_iniciales_propuesta(date)',
$a$      ) m(cta, sugerido, detalle)
  )$a$,
$n$      ) m(cta, sugerido, detalle)
    union all
    -- 20261107014000: lo registrado a mano fuera de esta lista (231 y 241 del Taller) también se muestra; sin esto el
    -- modal calcula el cuadre sin esas líneas y nunca deja guardar.
    select g.cta, 'manual', g.d, 'Registrado a mano en el arranque'
      from vig g
     where g.cta not in ('4011', '41', '47', '50', '52', '591')
       and not exists (select 1 from sistema s where s.cta = g.cta and (s.d <> 0 or s.cta in ('101', '201', '421')))
  )$n$, 1);

-- ---------- 2. Los saldos de arranque: 104 y 1413 como el sistema al 31-oct; capital y resultados por separado ----------
do $$
declare
  v_arr date := retail.fn_fecha_de_arranque();
  v_104 retail.saldos_iniciales%rowtype;
  v_cap retail.saldos_iniciales%rowtype;
  v_motivo text := 'Arranque desde la primera venta (ADR-0618): 104 y 1413 como el sistema al 31-oct; 591 = resultado de octubre (−26,488.05) menos retiros (2,812.10); 50 = lo que falta para cuadrar. Migración 20261107014000.';
  v_debe numeric;
  v_haber numeric;
begin
  if v_arr is distinct from date '2026-11-01' then
    raise notice 'Sin arranque del 1-nov-2026: no se corrigen saldos de arranque.';
    return;
  end if;
  if exists (select 1 from retail.fn_saldos_iniciales_vigentes() v where v.cuenta = '591' and v.debe = 29300.15) then
    return;  -- ya está
  end if;
  for v_104 in select s.* from retail.saldos_iniciales s
                where s.cuenta = '104' and not exists (select 1 from retail.saldos_iniciales r where r.reemplaza_id = s.id)
                order by s.created_at desc limit 1 loop
    exit;
  end loop;
  for v_cap in select s.* from retail.saldos_iniciales s
                where s.cuenta = '50' and not exists (select 1 from retail.saldos_iniciales r where r.reemplaza_id = s.id)
                order by s.created_at desc limit 1 loop
    exit;
  end loop;
  if v_104.id is null or v_cap.id is null
     or v_104.debe - v_104.haber <> 5330.74 or v_cap.haber - v_cap.debe <> 104749.13
     or exists (select 1 from retail.fn_saldos_iniciales_vigentes() v where v.cuenta in ('1413', '591')) then
    raise notice 'Los saldos de arranque ya no son los que esta migración esperaba (104 = 5,330.74, 50 = 104,749.13, sin 1413 ni 591): no se tocan. Corrígelo desde el modal.';
    return;
  end if;

  insert into retail.saldos_iniciales (fecha, cuenta, debe, haber, origen, nota, reemplaza_id, motivo, registrado_por) values
    (v_arr, '104',  5305.24,  0,         v_104.origen, v_104.nota, v_104.id, v_motivo, v_cap.registrado_por),
    (v_arr, '1413', 5700.00,  0,         'sistema',    null,       null,     v_motivo, v_cap.registrado_por),
    (v_arr, '50',   0,        139723.78, v_cap.origen, v_cap.nota, v_cap.id, v_motivo, v_cap.registrado_por),
    (v_arr, '591',  29300.15, 0,         'manual',     null,       null,     v_motivo, v_cap.registrado_por);

  v_debe := (select sum(v.debe) from retail.fn_saldos_iniciales_vigentes() v);
  v_haber := (select sum(v.haber) from retail.fn_saldos_iniciales_vigentes() v);
  if v_debe <> v_haber then
    raise exception 'Los saldos de arranque no cuadran después de corregir: debe % contra haber %.', v_debe, v_haber;
  end if;
end $$;

reset lock_timeout;
