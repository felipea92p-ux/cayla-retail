-- ============================================================================
-- Medio botón no existe (/chaos de «Nuevo avío», 2026-10-31, hallazgo 2; Felipe pidió cerrarlo)
--
-- EL PROBLEMA
--   Escribir «0,5» en «¿Ya tienes?» de un avío que se cuenta en UNIDADES se aceptaba sin una palabra. En la base
--   quedaba `cantidad_ingresada = 0.500`; en la pantalla se leía «1 unid.», porque una unidad se dibuja sin
--   decimales. O sea, dos cosas a la vez: un stock que no puede existir (medio botón) y una pantalla que decía
--   que había uno entero. Nadie lo frenaba: ni la web ni la base.
--
--   Lo que se MIDE sí admite partes: medio metro de tela es medio metro, y 2.35 kg son 2.35 kg. Lo que se CUENTA
--   de uno en uno —unidades, conos, pares, docenas— no.
--
-- POR QUÉ UN DISPARADOR Y NO UN `check`
--   La cantidad que se puede escribir depende de la UNIDAD, que vive en otra tabla (`insumos.unidad_medida`), y un
--   `check` no puede mirar otra tabla. Y hay muchas puertas que escriben cantidades de insumo (las RPC de ingreso,
--   corrección, consumo, devolución, producción…): poner la regla en cada una la deja a merced de que la próxima se
--   olvide. El disparador las cierra todas de una vez, que es lo que pide el principio 2 — un estado imposible se
--   impide en el diseño, no se parchea después.
--
-- QUÉ NO HACE
--   No toca lo que ya está guardado. Un disparador solo mira lo que se escribe de ahora en adelante, así que esto
--   entra sin revisar ni corregir una sola fila. Si hubiera un lote viejo con media unidad, se queda como está y la
--   pantalla ahora lo MUESTRA como «0.5 unid.» en vez de redondearlo a «1 unid.» (eso va en la web, no aquí).
--   Y no impide corregir ni anular ese lote viejo: un `update` que no toca la cantidad no dispara nada.
--
-- Se pega de una sola vez. No trae políticas ni `alter` de tablas en uso (ADR-0195).
-- ============================================================================
set search_path to retail, public;
set lock_timeout = '3s';

-- ---------- 1 · qué unidades no admiten partes ----------
-- La MISMA lista que la web (`seCuentaEntera` en `lib/insumos-reglas.ts`): las que no admiten decimales al pedirlas
-- tampoco los admiten al contarlas.
create or replace function retail.fn_unidad_se_cuenta_entera(p_unidad text)
returns boolean language sql immutable as $$
  select coalesce(p_unidad, '') in ('unidad', 'cono', 'par', 'docena');
$$;

comment on function retail.fn_unidad_se_cuenta_entera(text) is
  'Si la unidad se cuenta de uno en uno (unidad, cono, par, docena) y no admite partes. Lo que se mide (metro, kilo) sí '
  'las admite. Misma lista que `seCuentaEntera` de la web (20261031211000).';

-- ---------- 2 · el candado, en las dos tablas que guardan cantidades ----------
create or replace function retail.fn_cantidad_entera_si_toca()
returns trigger language plpgsql as $$
declare
  v_cantidad numeric;
  v_unidad   text;
  v_nombre   text;
begin
  -- `cantidad_ingresada` en los lotes, `cantidad` en los movimientos: una sola función para las dos tablas.
  -- Con `if`, no con un `case`: el `case` evalúa las DOS ramas y revienta con «record "new" has no field "cantidad"»
  -- en la tabla que no la tiene (medido el 2026-10-31 al ensayarlo, y por eso esto está escrito así).
  if tg_table_name = 'insumo_lotes' then
    v_cantidad := new.cantidad_ingresada;
  else
    v_cantidad := new.cantidad;
  end if;
  if v_cantidad is null or v_cantidad = trunc(v_cantidad) then
    return new;  -- entero (o nada que mirar): el camino de siempre, sin costo
  end if;

  select i.unidad_medida, i.nombre into v_unidad, v_nombre
    from retail.insumos i where i.id = new.insumo_id;

  if retail.fn_unidad_se_cuenta_entera(v_unidad) then
    raise exception
      'En «%» el stock se cuenta de uno en uno (%): % no se puede. Escribe un número entero.',
      coalesce(v_nombre, 'ese insumo'), v_unidad, trim(trailing '0' from trim(trailing '.' from v_cantidad::text))
      using errcode = 'check_violation';
  end if;
  return new;
end $$;

comment on function retail.fn_cantidad_entera_si_toca() is
  'Impide media unidad, medio cono, medio par o media docena en `insumo_lotes` y `movimientos_insumo`. Lo que se mide '
  '(metro, kilo) sigue admitiendo partes. No mira lo ya guardado: solo lo que se escribe (20261031211000).';

-- `create or replace trigger` y nunca `drop trigger`: el drop toma en exclusiva las 21 tablas de auth y storage
-- hasta el final de la transacción y choca con el Asesor de seguridad del panel (ADR-0195).
create or replace trigger insumo_lotes_cantidad_entera
  before insert or update of cantidad_ingresada on retail.insumo_lotes
  for each row execute function retail.fn_cantidad_entera_si_toca();

create or replace trigger movimientos_insumo_cantidad_entera
  before insert or update of cantidad on retail.movimientos_insumo
  for each row execute function retail.fn_cantidad_entera_si_toca();
