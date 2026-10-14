-- ============================================================================
-- 20261014171000_cuarentena_no_se_ajusta_a_mano.sql — CAYLA V2 · ADR-0328, actividad 10 (cierre del hueco que dejó #796)
--
-- YA ESTÁ EN PRODUCCIÓN — NO SE VUELVE A PEGAR. Se escribió el 2026-10-04 como `20261005150000_cuarentena_no_se_ajusta_a_mano.sql`
-- (commit 021def2a6) y se pegó en producción hacia el 2026-10-05, pero ese commit vivía solo en una rama local que nunca
-- se subió: #796 (Dañadas) se fusionó sin él. La revisión de deriva del 2026-10-14 lo encontró como huérfano —la función
-- y el disparador existían en producción y en ningún archivo de `main`— y se trajo tal cual (ADR-0328, «Actualización
-- 2026-10-14»). RENUMERADA el 2026-10-14 desde `20261005150000` a una versión reservada (ADR-0381): producción no guarda el
-- nombre del archivo, y así el CI la corre después de todas las de `main`, sobre el mismo `movimientos` que tiene hoy.
-- El cuerpo de la función es idéntico al vivo (md5 del cuerpo normalizado como en `scripts/migraciones/deriva.sql`:
-- d14f8102b614bbfbb9e79c714d931296 en los dos, 2026-10-14). Si alguien la pega de nuevo, es idempotente y deja lo mismo.
--
-- EL PROBLEMA PRIMERO. Lo que hay en la sububicación Cuarentena y lo que dice `prendas_danadas` tienen que ser la MISMA
-- cosa: cada unidad en cuarentena tiene una fila 'en_cuarentena' que dice de dónde vino y espera una decisión. Hoy entran
-- y salen por puertas que mantienen las dos mitades juntas (devolución, cambio, `reportar_danada`; y las salidas
-- `cuarentena_*` y «Se arregló»). Pero `ajustar_inventario` acepta CUALQUIER sububicación de la sede: un ajuste hecho contra
-- la cuarentena sube o baja el stock SIN tocar `prendas_danadas`. Desde ese momento Existencias dice «3 en cuarentena» y la
-- lista de Dañadas muestra 2 (o 4), y nadie puede resolver la que sobra ni encontrar la que falta. La pantalla no ofrece la
-- cuarentena como lugar de un ajuste, pero eso lo cuida la pantalla, no la base (ADR-0328 act. 10 lo dejó anotado).
--
-- QUÉ HACE. Un disparador BEFORE INSERT en `movimientos` rechaza todo movimiento `tipo = 'ajuste'` cuyo lugar sea una
-- sububicación de tipo `cuarentena`. Es el único punto por el que pasa TODO cambio de stock, hoy y en cualquier función
-- futura: mismo patrón que `20260924093700_cuarentena_no_se_vende.sql` (PL-78), que cerró la puerta de salida hacia la
-- clienta; este cierra la de entrada «a mano».
--
-- QUÉ NO TOCA (y por qué no hace falta tocarlo):
--   · Las entradas a la cuarentena: `entrada` (devolución, cambio) y `traslado` (reportar dañada).
--   · Sus salidas: `salida` con motivo `cuarentena_<estado>` (resolver y liquidar) y el `traslado` de «Se arregló».
--     Ninguna de las dos es `ajuste`, así que este disparador no las ve.
--   · El Conteo: `abrir_conteo` (20260930010100) ya solo deja contar el piso de venta o el almacén («la cuarentena tiene su
--     propio proceso»), así que `cerrar_conteo`, que es quien escribe `ajuste` con el lugar del conteo, nunca llega a la
--     cuarentena. Verificado en producción el 2026-10-04: 0 conteos sobre cuarentena y 0 abiertos. El conteo de arranque
--     (#789) tampoco abre otra puerta: sigue naciendo en `abrir_conteo`. La prueba de esta migración incluye ese rechazo.
--
-- POR QUÉ UN DISPARADOR NUEVO Y NO PARCHAR `ajustar_inventario`. Esa función está viva en producción, la llaman varios
-- módulos (Existencias, Conteos, el hallazgo de conteo) y puede diferir del repo; reemplazarla para sumarle un `if` obliga
-- a una guarda de md5 y a reescribir lo que otras migraciones parchan por ancla. El disparador no toca ninguna función
-- viva y vale también para la que se escriba mañana. Tampoco se sumó a `fn_movimiento_no_sale_de_cuarentena_a_la_clienta`:
-- su nombre y su comentario dicen «hacia la clienta» y dejaría de ser verdad.
--
-- ESTADOS QUE DEJAN DE SER POSIBLES: un ajuste (con `ajustar_inventario` o con una función que no existe todavía) que deje
-- la cuarentena y `prendas_danadas` con cantidades distintas.
--
-- CÓMO SE PEGA EN PRODUCCIÓN: UNA sola parte, tal cual en el SQL Editor. Sin políticas ni `drop trigger` (ADR-0195 no
-- aplica; es `create or replace trigger`). Toma un candado breve sobre `movimientos` al crear el disparador
-- (`lock_timeout` de 3 s: si no lo consigue, falla sin daño y se vuelve a pegar). Idempotente: pegada dos veces deja lo mismo.
-- Sonda de solo lectura ANTES (informativa: un ajuste viejo en cuarentena no impide pegar, pero avisa de un descuadre ya hecho;
-- el 2026-10-04 dio 0 y el stock en cuarentena era 0 = 0 en `prendas_danadas`):
--   select count(*) from retail.movimientos m join retail.sububicaciones s on s.id = m.sububicacion_id
--    where m.tipo = 'ajuste' and s.tipo = 'cuarentena';
-- Cómo se verifica después:
--   select tgname from pg_trigger where tgrelid = 'retail.movimientos'::regclass and tgname = 'movimientos_no_se_ajusta_la_cuarentena';
--
-- CÓMO SE DESHACE (solo si hiciera falta; `drop trigger` toma candados de auth y storage: se pega solo, sin nada más):
--   drop trigger if exists movimientos_no_se_ajusta_la_cuarentena on retail.movimientos;
--
-- SE ROMPE SI:
--   · aparece un camino que abra conteos sobre la cuarentena o que escriba `ajuste` allí a propósito (el cierre de ese conteo
--     fallaría entero, todo o nada): `pnpm pruebas:cuarentena-no-se-ajusta` falla en el caso de `abrir_conteo`;
--   · una sede tienda nace sin sububicación `cuarentena`: el disparador no la ve (no hay nada que cuidar) y reportar dice
--     «esta sede no tiene cuarentena»;
--   · alguien «corrige» una cuarentena descuadrada con un ajuste a mano: ya no puede. Lo correcto es resolver la dañada
--     (Dañadas) o reportarla (Existencias) para que las dos mitades se muevan juntas.
-- ============================================================================

set lock_timeout = '3s';
set search_path = retail, public, extensions;

create or replace function retail.fn_movimiento_no_ajusta_cuarentena()
returns trigger
language plpgsql
set search_path = retail, public
as $$
begin
  -- `tipo = 'ajuste'` va primero: el resto de los movimientos (miles al día) no paga la consulta de la sububicación.
  if new.tipo = 'ajuste'
     and exists (select 1 from retail.sububicaciones where id = new.sububicacion_id and tipo = 'cuarentena') then
    raise exception 'La cuarentena no se ajusta a mano: si la prenda está dañada, repórtala desde Existencias; si ya se decidió qué hacer con ella, resuélvela en Dañadas. Un ajuste aquí dejaría el stock y la lista de Dañadas diciendo cosas distintas.'
      using hint = 'cuarentena_no_se_ajusta';
  end if;
  return new;
end;
$$;

-- Solo la usa el disparador (que no necesita EXECUTE para dispararse): nadie la llama por la API.
revoke all on function retail.fn_movimiento_no_ajusta_cuarentena() from public, anon, authenticated;

comment on function retail.fn_movimiento_no_ajusta_cuarentena() is
  'ADR-0328 act. 10: ningún ajuste de stock cae en una sububicación Cuarentena. Lo que hay allí lo mueven solo las puertas que también mueven prendas_danadas (devolución, cambio, reportar_danada, resolver, liquidar, «Se arregló»).';

create or replace trigger movimientos_no_se_ajusta_la_cuarentena
  before insert on retail.movimientos
  for each row execute function retail.fn_movimiento_no_ajusta_cuarentena();
