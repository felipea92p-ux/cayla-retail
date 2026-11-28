-- ============================================================================
-- 20261127010000 — El líder se lleva efectivo de la caja fuerte de una sede sin depositarlo todavía (ADR-0710)
--
-- EL PROBLEMA PRIMERO. La caja fuerte de una tienda guarda lo que el cierre de caja mandó ahí. A veces el líder pasa, se lleva una parte para
-- depositarla después y deja el sencillo. Esa plata ya no está en la caja fuerte y todavía no está en el banco: la tiene él. El sistema no tenía
-- dónde decirlo: «Efectivo entregado al líder» (la cuenta `por_rendir`) solo se alimentaba desde el cierre de caja (el traslado con destino `lider`),
-- y el candado de los movimientos rechazaba un «entre cuentas» de una caja fuerte a esa cuenta. La caja fuerte del sistema decía más plata de la que
-- había adentro, y contarla no cuadraba con nada.
--
-- CONTRATO (Liskov)
--   PROMETE: un movimiento `entre_cuentas` puede salir de una CAJA FUERTE y llegar a la cuenta `por_rendir`. Es de la sede de esa caja fuerte, lleva
--            su fecha, su monto y su nota, y se registra con la función de siempre (`registrar_movimiento_dinero`: mismo doble clic seguro, misma
--            firma del responsable, mismo piso de Finanzas, mismo mes abierto). La plata total de CAYLA no cambia: baja una cuenta y sube la otra.
--   ASUME:   lo hace el líder, con su sesión. El depósito posterior ya existe (`deposito` desde `por_rendir` a un banco).
--   FALLA:   `42501` si quien lo guarda no es líder (aquí, en la tabla, y antes en la función); `P0001` si lleva comisión, egreso o ingreso de caja;
--            `P0001` + hint `efectivo_insuficiente` si la caja fuerte quedaría bajo cero (el candado `movimientos_dinero_efectivo_en_cuenta`, que
--            ya existía y se revisa al terminar la operación).
--   NO HACE: no agrega un tipo de movimiento (el Flujo, el libro, el Diario y los reportes ya saben leer `entre_cuentas`: es plata que cambia de
--            lugar); no toca `registrar_movimiento_dinero`; no abre el camino de vuelta (devolver a la caja fuerte lo que el líder tiene); no impide
--            que «Efectivo entregado al líder» quede bajo cero si después se anula este movimiento con la plata ya depositada (esa cuenta nunca tuvo
--            ese candado: la pantalla lo muestra en rojo como «saldo negativo»).
--
-- ESTADOS QUE NO DEBEN EXISTIR
--   · Caja fuerte bajo cero: `fn_exigir_efectivo_en_cuenta`, diferido, con candado por cuenta (dos salidas a la vez se ordenan y la segunda ve la primera).
--   · Un retiro «al líder» guardado por quien no es líder: se pregunta aquí, en el disparador de la tabla, no solo en la función que lo llama.
--   · El mismo retiro dos veces por doble clic: `token_cliente` es único y la función devuelve el movimiento del primer intento.
--
-- DECIDÍ sumar una pareja de cuentas a `entre_cuentas`, en un bloque propio que termina la validación.
-- DESCARTÉ un tipo nuevo (`retiro_lider`): obliga a reescribir dos `check` de la tabla y a enseñarle el tipo al libro, al Flujo, al Diario, a los
--          textos y a cada `not in` de la base, para decir lo mismo que ya dice «entre cuentas» con su origen y su destino.
-- DESCARTÉ cambiar la línea de `entre_cuentas` de la regla general: esa línea vive DENTRO del texto que la migración de los fondos (20261013182000) y
--          sus pruebas vuelven a pegar; partirlo las hace abortar («cambió desde que se escribió esta migración»).
-- SE ROMPE SI alguien reescribe entera `fn_movimientos_dinero_validar` sin este bloque: el movimiento vuelve a rechazarse con «Ese movimiento no va
--          entre esas cuentas» (no se pierde nada: lo ya guardado sigue ahí). `pnpm pruebas:lider-se-lleva` lo detecta.
--
-- CÓMO SE PEGA. Una sola parte: solo una función (`create or replace` por reemplazo anclado), sin `alter`, sin políticas, sin datos. El reemplazo
-- frena si su ancla no aparece exactamente una vez y no hace nada si el bloque ya está: se puede pegar dos veces. La última línea dice «QUEDÓ BIEN».
-- Medido el 2026-11-26 con una lectura en producción: la función viva es idéntica a la de `main` (misma huella md5) y el ancla aparece 1 vez.
-- VOLVER ATRÁS. Pegar el reemplazo al revés (quitar el bloque «ADR-0710»). Los movimientos ya guardados no se tocan.
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

-- El bloque va ANTES del comentario con que empieza el de ADR-0638 (20261110001000), fuera de todo texto que otra migración vuelve a pegar. Una caja
-- fuerte y la cuenta `por_rendir` nunca son de otra empresa (una cuenta ajena es siempre un banco, `fn_cuentas_dinero_inmutable`), así que nada de lo
-- que viene después le aplica: ni cajón ni caja. Por eso termina aquí, como el pago de la planilla.
select pg_temp.reemplazar('retail.fn_movimientos_dinero_validar()',
$v$  -- ADR-0638: una cuenta de otra empresa no entra a ningún movimiento de CAYLA, ni de origen ni de destino.$v$,
$n$  -- ADR-0710: el líder se lleva efectivo de la caja fuerte de una sede sin depositarlo todavía. La plata sale de la caja fuerte y queda en
  -- «Efectivo entregado al líder» hasta que la deposite: es de esa sede, sin comisión y sin caja. Solo el líder, y se pregunta aquí también.
  if new.tipo = 'entre_cuentas' and coalesce(v_o.tipo, '') = 'caja_fuerte' and coalesce(v_d.tipo, '') = 'por_rendir' then
    if not retail.fn_es_lider() then
      raise exception 'Solo el líder anota que se llevó efectivo de la caja fuerte.' using errcode = '42501';
    end if;
    if new.caja_movimiento_id is not null or new.caja_ingreso_id is not null or coalesce(new.comision, 0) <> 0 then
      raise exception 'Lo que el líder se lleva de la caja fuerte va sin comisión y sin caja.' using errcode = 'P0001';
    end if;
    new.ubicacion_id := v_o.ubicacion_id;
    return new;
  end if;

  -- ADR-0638: una cuenta de otra empresa no entra a ningún movimiento de CAYLA, ni de origen ni de destino.$n$,
1);

do $$
begin
  if position('ADR-0710' in pg_get_functiondef('retail.fn_movimientos_dinero_validar()'::regprocedure)) = 0 then
    raise exception 'El candado de los movimientos no quedó con el bloque de ADR-0710.';
  end if;
end $$;

select 'QUEDÓ BIEN: el líder ya puede anotar lo que se lleva de una caja fuerte' as resultado;
