-- ============================================================================
-- 20261027164000_quitar_validaciones_del_lider.sql — CAYLA V2 (ADR-0534 · 2026-10-27)
--
-- EL PROBLEMA PRIMERO. En las tiendas todas las colaboradoras trabajan con las mismas cuentas de terminal (caja y almacén), y las
-- líderes validan las operaciones EN PERSONA, al lado de la colaboradora. El sistema, en cambio, pedía que una cuenta de líder
-- entrara al equipo para aprobar: una devolución quedaba «Esperando aprobación de un líder», el cuadre del piso decía «pídele que
-- entre con su cuenta en este mismo equipo», una prenda dañada no salía de cuarentena, un ajuste de caja no se podía anotar. La
-- validación ya ocurría delante del mostrador; la del sistema solo trababa la terminal.
--
-- LA DECISIÓN (Felipe, 2026-10-27: «quita todas las validaciones de líder», en tres grupos: operaciones de tienda, aprobaciones del
-- catálogo y anular comprobante). Cada candado `fn_es_lider()` de esas operaciones pasa al permiso del MÓDULO donde vive su botón
-- (ADR-0306: quien ve el módulo hace lo que hay en él) y, donde la operación es de una sede, a `fn_puede_operar_ubicacion`. Quién lo
-- hizo sigue firmado con el combo «Responsable» (`fn_actor_persona_id(true)`), como toda operación.
--   Operaciones de tienda
--     · `aprobar_devolucion` / `rechazar_devolucion`: Devoluciones + la sede de la devolución. Sale también «quien la registró no la
--       aprueba»: en una terminal compartida es la misma persona, y la líder ya la revisó en el mostrador.
--     · `cuadrar_piso`: Existencias (escanear ya lo era; ahora también confirmar).
--     · `resolver_prenda_danada` / `liquidar_prenda_danada`: Existencias + la sede de la prenda (como `reportar_danada`).
--     · `registrar_movimiento_caja`: el ajuste de efectivo (faltante/sobrante) deja de ser solo del líder; Caja ya exige la sede.
--     · `cerrar_cola_arranque`, `reabrir_prenda_cerrada`, `fn_cola_arranque_candidatas`, `regularizar_prendas_sugeridas`:
--       Existencias (su pantalla, Por regularizar, ya lo exige); la sede ya se pedía.
--     · `regularizar_prenda`: sale «quien vendió no regulariza su propia venta, salvo el líder».
--   Catálogo
--     · Colores, tejidos, patrones, tallas e insignias propuestos nacen APROBADOS para cualquiera que los crea (antes, solo con el
--       módulo de catálogo o de insignias; si no, «pendiente» hasta que alguien los aprobara). Lo que ya estaba pendiente no se toca.
--     · Ofertas (`guardar_campana_regla`, `activar_campana_regla`, `retirar_campana_regla`): las activa, cambia y retira quien
--       tiene la llave de campañas (`fn_puede_campanas`, que ya se exigía); el borrador ya no espera a un líder.
--     · `fijar_grupos_de_categorias`: Plan del piso.
--   Comprobantes (SUNAT)
--     · `anular_comprobante` y `marcar_comprobante_no_emitido`: Facturación. Sigue siendo irreversible ante SUNAT; la pantalla lo
--       sigue confirmando con su hoja.
--
-- CONTRATO (Liskov)
--   PROMETE: ninguna de estas funciones pregunta ya `fn_es_lider()`; cada una exige el módulo nombrado arriba (un líder lo tiene
--            siempre: `fn_ve_modulo` responde sí al líder). Ninguna otra regla cambia: estados, montos, topes de reembolso, stock y
--            comprobantes se validan igual. Idempotente: repetir el pegado no cambia nada.
--   ASUME:   las definiciones vivas de main al 2026-10-27 (anclas verificadas en local ese día).
--   NO HACE: no toca la administración (roles, colaboradores, finanzas, configuración, series), que sigue siendo del líder; no
--            aprueba lo que ya estaba pendiente; no cambia quién ve qué módulo (eso es Roles y accesos).
--
-- DESCARTÉ
--   · Quitar `fn_es_lider()` sin poner nada: una función `security definer` sin candado la llama cualquier cuenta con sesión,
--     también una sin el módulo. El módulo es la llave que ya usa el resto del ERP.
--   · Volver líder a la cuenta de terminal: le abriría Roles, Colaboradores y Finanzas, que Felipe pidió dejar como están.
--   · Reescribir las funciones enteras: 22 cuerpos copiados chocan con cualquier PR que toque una de ellas; el reemplazo anclado
--     (ADR-0288) solo toca las líneas del candado y falla fuerte si la función cambió.
--
-- SE ROMPE SI
--   · Un rol que no debería anular comprobantes tiene Facturación: ahora anula. Se corrige en Roles y accesos, no aquí.
--   · Otra migración vuelve a escribir uno de estos candados: el reemplazo de aquí ya no lo ve (se aplicó antes).
--
-- CÓMO SE PEGA. Una sola parte, sin políticas ni `alter table`: solo reemplazos anclados de funciones. Sin `select … into` dentro
-- de un texto entre comillas (ADR-0288).
-- ============================================================================
set lock_timeout = '3s';

create or replace function pg_temp.reemplazar_anclado(p_firma text, p_viejo text, p_nuevo text)
returns void
language plpgsql
as $f$
declare
  v_def text;
  v_n integer;
begin
  v_def := pg_get_functiondef(p_firma::regprocedure);
  v_n := (length(v_def) - length(replace(v_def, p_viejo, ''))) / length(p_viejo);
  -- Ya aplicado = el ancla no está y el texto nuevo sí.
  if v_n = 0 and position(p_nuevo in v_def) > 0 then
    return;
  end if;
  if v_n <> 1 then
    raise exception '% cambió desde que se escribió esta migración: el ancla aparece % veces (se esperaba 1). Regenera el reemplazo desde su definición real.',
      p_firma, v_n;
  end if;
  execute replace(v_def, p_viejo, p_nuevo);
end;
$f$;

-- ── Operaciones de tienda ───────────────────────────────────────────────────

-- Devoluciones: aprueba quien ve Devoluciones en la sede de la devolución. Sin «otra líder tiene que revisarla».
select pg_temp.reemplazar_anclado(
  'retail.aprobar_devolucion(uuid, numeric, text, uuid)',
  $v$  if not fn_es_lider() then
    raise exception 'Solo un líder puede aprobar una devolución';
  end if;
  v_persona := retail.fn_actor_persona_id(true);

  -- Nuevo (docs/pantallas/devoluciones.md objeción #2): con 9 líderes de alcance global,
  -- nada impedía que quien registró la devolución fuera también quien la aprobara — pasó de
  -- verdad en producción (5,6 segundos entre las dos). Otra líder tiene que revisarla.
  if d.solicitado_por = v_persona then
    raise exception 'Quien registró esta devolución no puede aprobarla — pide que otra líder la revise';
  end if;
$v$,
  $n$  -- ADR-0534: aprueba quien ve Devoluciones en esa tienda; la líder la valida en persona, no con su cuenta.
  if not (fn_ve_modulo('devoluciones') and fn_puede_operar_ubicacion(d.ubicacion_id)) then
    raise exception 'Aprobar devoluciones de esta tienda necesita el módulo Devoluciones en tu rol' using errcode = '42501';
  end if;
  v_persona := retail.fn_actor_persona_id(true);
$n$
);

select pg_temp.reemplazar_anclado(
  'retail.rechazar_devolucion(uuid, text)',
  $v$  if not fn_es_lider() then
    raise exception 'Solo un líder puede rechazar una devolución';
  end if;
$v$,
  $n$  -- ADR-0534: rechaza quien ve Devoluciones en esa tienda.
  if not (fn_ve_modulo('devoluciones')
          and fn_puede_operar_ubicacion((select dv.ubicacion_id from devoluciones dv where dv.id = p_devolucion_id))) then
    raise exception 'Rechazar devoluciones de esta tienda necesita el módulo Devoluciones en tu rol' using errcode = '42501';
  end if;
$n$
);

-- Cuadre del piso: lo confirma quien lo escaneó (Existencias), sin que entre otra cuenta al equipo.
select pg_temp.reemplazar_anclado(
  'retail.cuadrar_piso(uuid, jsonb, timestamp with time zone, text, uuid)',
  $v$  -- Confirmar el cuadre es del líder, a la vista (escanear y revisar lo puede quien ve Existencias). Se le pregunta a la
  -- CUENTA, no al responsable: en una terminal, el líder entra con su cuenta en el mismo equipo (el borrador es por sede).
  if not fn_es_lider() then
    raise exception 'Solo un líder confirma el cuadre del piso. Escanea todo y pídele que entre con su cuenta en este mismo equipo y elija esta tienda arriba: lo escaneado no se pierde.'
      using hint = 'cuadre_solo_lider';
  end if;
$v$,
  $n$  -- ADR-0534: confirma el cuadre quien ve Existencias (el mismo que escanea); la líder lo valida en persona.
  if not fn_ve_modulo('existencias') then
    raise exception 'Confirmar el cuadre del piso necesita el módulo Existencias en tu rol.'
      using errcode = '42501', hint = 'cuadre_sin_modulo';
  end if;
$n$
);

-- Prendas dañadas: las resuelve y las liquida quien ve Existencias en la sede de la prenda (como `reportar_danada`).
select pg_temp.reemplazar_anclado(
  'retail.resolver_prenda_danada(uuid, text, text, uuid)',
  $v$  if not fn_es_lider() then
    raise exception 'Solo un líder puede resolver una prenda dañada';
  end if;
$v$,
  $n$  -- ADR-0534: quien ve Existencias en la tienda de la prenda.
  if exists (select 1 from prendas_danadas x where x.id = p_id
             and not (fn_ve_modulo('existencias') and fn_puede_operar_ubicacion(x.ubicacion_id))) then
    raise exception 'Resolver prendas dañadas de esta tienda necesita el módulo Existencias en tu rol' using errcode = '42501';
  end if;
$n$
);

select pg_temp.reemplazar_anclado(
  'retail.liquidar_prenda_danada(uuid, numeric, text, text)',
  $v$  if not fn_es_lider() then
    raise exception 'Solo un líder puede liquidar una prenda dañada';
  end if;
$v$,
  $n$  -- ADR-0534: quien ve Existencias en la tienda de la prenda.
  if exists (select 1 from prendas_danadas x where x.id = p_id
             and not (fn_ve_modulo('existencias') and fn_puede_operar_ubicacion(x.ubicacion_id))) then
    raise exception 'Liquidar prendas dañadas de esta tienda necesita el módulo Existencias en tu rol' using errcode = '42501';
  end if;
$n$
);

-- Caja: el ajuste de efectivo lo anota quien opera la caja (la sede ya se exige arriba en la misma función).
select pg_temp.reemplazar_anclado(
  'retail.registrar_movimiento_caja(uuid, text, numeric, text, text, boolean, uuid)',
  $v$  if v_es_ajuste and not fn_es_lider() then
    raise exception 'Solo un líder de equipo puede registrar un ajuste de efectivo';
  end if;
$v$,
  $n$  -- ADR-0534: el ajuste de efectivo ya no es solo del líder; lo anota quien opera esta caja.
$n$
);

-- Ventas sin registrar (Por regularizar, módulo Existencias): la sede ya se exige en cada una.
select pg_temp.reemplazar_anclado(
  'retail.cerrar_cola_arranque(uuid, timestamp with time zone, text, text)',
  $v$  if not fn_es_lider() then
    raise exception 'cola_solo_lider' using errcode = '42501', hint = 'Solo un líder puede cerrar la cola de arranque de una tienda';
  end if;
$v$,
  $n$  if not fn_ve_modulo('existencias') then
    raise exception 'cola_sin_modulo' using errcode = '42501', hint = 'Cerrar la cola de una tienda necesita el módulo Existencias (ADR-0534)';
  end if;
$n$
);

select pg_temp.reemplazar_anclado(
  'retail.reabrir_prenda_cerrada(uuid, text)',
  $v$  if not fn_es_lider() then
    raise exception 'cola_solo_lider' using errcode = '42501', hint = 'Solo un líder puede reabrir una venta cerrada sin prenda';
  end if;
$v$,
  $n$  if not fn_ve_modulo('existencias') then
    raise exception 'cola_sin_modulo' using errcode = '42501', hint = 'Reabrir una venta cerrada sin prenda necesita el módulo Existencias (ADR-0534)';
  end if;
$n$
);

select pg_temp.reemplazar_anclado(
  'retail.fn_cola_arranque_candidatas(uuid)',
  $v$  if not fn_es_lider() then
    raise exception 'cola_solo_lider' using errcode = '42501', hint = 'Solo un líder puede revisar las sugerencias de la cola de arranque';
  end if;
$v$,
  $n$  if not fn_ve_modulo('existencias') then
    raise exception 'cola_sin_modulo' using errcode = '42501', hint = 'Revisar las sugerencias de la cola necesita el módulo Existencias (ADR-0534)';
  end if;
$n$
);

select pg_temp.reemplazar_anclado(
  'retail.regularizar_prendas_sugeridas(uuid, jsonb)',
  $v$  if not fn_es_lider() then
    raise exception 'cola_solo_lider' using errcode = '42501', hint = 'Solo un líder puede identificar ventas con sugerencias';
  end if;
$v$,
  $n$  if not fn_ve_modulo('existencias') then
    raise exception 'cola_sin_modulo' using errcode = '42501', hint = 'Identificar ventas con sugerencias necesita el módulo Existencias (ADR-0534)';
  end if;
$n$
);

-- Regularizar una prenda: sale «quien vendió no regulariza su propia venta, salvo el líder». Se sigue pidiendo quién lo hace.
select pg_temp.reemplazar_anclado(
  'retail.regularizar_prenda(uuid, uuid, text)',
  $v$  if v_p.vendido_por is not null
     and ((v_p.vendido_por = v_persona and not (fn_es_lider() and v_persona is not distinct from fn_actor_persona_id(false)))
          or (v_p.vendido_por is not distinct from fn_actor_persona_id(false) and not fn_es_lider())) then
    raise exception 'Quien vendió esta prenda no puede regularizarla: que lo haga otra persona del equipo o un líder.'
      using errcode = '42501', hint = 'regularizar_propia_venta';
  end if;
$v$,
  $n$  -- ADR-0534: quien vendió también puede regularizarla; la líder la valida en persona.
$n$
);

select pg_temp.reemplazar_anclado(
  'retail.regularizar_prenda(uuid, uuid, text)',
  $v$  -- ADR-0328 (actividad 5, Felipe 2026-10-04): nadie regulariza su propia venta, salvo el líder. Sin nadie que firme no hay con
  -- quién comparar: se pide el nombre. «Salvo el líder» es el líder FIRMANDO ÉL MISMO: cuenta de líder (fn_es_lider, la cuenta,
  -- como todo permiso) y quien firma es la persona de esa cuenta. Con la sesión de una líder abierta en caja, elegir en el combo
  -- a la asesora que vendió no le presta la excepción; desde una terminal, elegir el nombre del líder tampoco. Y con su propia
  -- cuenta (sin ser líder), nombrar a otra persona no vuelve ajena la venta.
$v$,
  $n$  -- Sin nadie que firme no se sabe quién regularizó: se pide el nombre (ADR-0161).
$n$
);

-- ── Catálogo ────────────────────────────────────────────────────────────────

-- Colores, tejidos, patrones y tallas: lo que se crea nace aprobado, lo cree quien lo cree.
select pg_temp.reemplazar_anclado(
  format('retail.%s()', t),
  $v$    if retail.fn_puede_editar_catalogo() then
      new.estado := 'aprobado';
      new.aprobado_por := v_persona;
      new.aprobado_en := now();
    else
      new.estado := 'pendiente';
      new.aprobado_por := null;
      new.aprobado_en := null;
    end if;
$v$,
  $n$    -- ADR-0534: nace aprobado para cualquiera que lo crea; ya no espera a un líder.
    new.estado := 'aprobado';
    new.aprobado_por := v_persona;
    new.aprobado_en := now();
$n$
)
from unnest(array['fn_colores_estado_trigger', 'fn_tejidos_estado_trigger', 'fn_patrones_estado_trigger', 'fn_tallas_estado_trigger']) t;

select pg_temp.reemplazar_anclado(
  'retail.fn_etiquetas_estado_trigger()',
  $v$    -- Nace aprobada si quien la crea tiene la llave de ESA etiqueta (ADR-0476): una campaña, `fn_puede_campanas` (Campañas, Campañas de
    -- la tienda web o Sellos); otro sello, `fn_puede_editar_etiquetas` (Sellos).
    if (case when new.estilo = 'campana' then retail.fn_puede_campanas() else retail.fn_puede_editar_etiquetas() end) then
      new.estado := 'aprobado';
      new.aprobado_por := v_persona;
      new.aprobado_en := now();
    else
      new.estado := 'pendiente';
      new.aprobado_por := null;
      new.aprobado_en := null;
    end if;
$v$,
  $n$    -- ADR-0534: nace aprobada para cualquiera que la crea; ya no espera a un líder.
    new.estado := 'aprobado';
    new.aprobado_por := v_persona;
    new.aprobado_en := now();
$n$
);

-- Ofertas: quien tiene la llave de campañas (ya exigida en las tres) las activa, cambia y retira.
select pg_temp.reemplazar_anclado(
  'retail.guardar_campana_regla(uuid, uuid, text, numeric, date, date, smallint[], uuid[], uuid[], boolean, uuid[], boolean)',
  $v$  if coalesce(p_activar, false) and not v_lider then
    raise exception 'Solo un líder activa una oferta: guárdala como borrador y que un líder la active.' using errcode = '42501', hint = 'oferta_solo_lider';
  end if;
$v$,
  $n$  -- ADR-0534: activar ya no espera a un líder (la llave de campañas se exigió arriba).
$n$
);

select pg_temp.reemplazar_anclado(
  'retail.guardar_campana_regla(uuid, uuid, text, numeric, date, date, smallint[], uuid[], uuid[], boolean, uuid[], boolean)',
  $v$    if v_r.estado = 'activa' and not v_lider then
      raise exception 'Solo un líder cambia una oferta que ya rige.' using errcode = '42501', hint = 'oferta_solo_lider';
    end if;
$v$,
  $n$    -- ADR-0534: cambiar una oferta que ya rige es de quien tiene la llave de campañas.
$n$
);

select pg_temp.reemplazar_anclado(
  'retail.activar_campana_regla(uuid)',
  $v$  if not retail.fn_es_lider() then
    raise exception 'Solo un líder activa una oferta.' using errcode = '42501', hint = 'oferta_solo_lider';
  end if;
$v$,
  $n$  -- ADR-0534: activa quien tiene la llave de campañas (arriba); ya no espera a un líder.
$n$
);

select pg_temp.reemplazar_anclado(
  'retail.retirar_campana_regla(uuid)',
  $v$  -- Retirar una oferta que ya rige cambia el precio en la caja: es de un líder. Un borrador lo descarta quien lo guardó o cualquiera con la llave.
  if v_r.estado = 'activa' and not retail.fn_es_lider() then
    raise exception 'Solo un líder retira una oferta que ya rige.' using errcode = '42501', hint = 'oferta_solo_lider';
  end if;
$v$,
  $n$  -- ADR-0534: retirar una oferta, rija o no, es de quien tiene la llave de campañas (arriba).
$n$
);

-- Plan del piso: los grupos los decide quien ve Plan del piso.
select pg_temp.reemplazar_anclado(
  'retail.fijar_grupos_de_categorias(jsonb)',
  $v$  if not retail.fn_es_lider() then
    raise exception 'Solo el líder decide a qué grupo del plan del piso va cada categoría.' using errcode = '42501', hint = 'grupos_mix_solo_lider';
  end if;
$v$,
  $n$  if not retail.fn_ve_modulo('plan_piso') then
    raise exception 'Decidir los grupos del plan del piso necesita el módulo Plan del piso en tu rol (ADR-0534).' using errcode = '42501', hint = 'grupos_mix_sin_modulo';
  end if;
$n$
);

-- ── Comprobantes (SUNAT) ────────────────────────────────────────────────────

select pg_temp.reemplazar_anclado(
  'retail.anular_comprobante(uuid, text, boolean, jsonb)',
  $v$  if not fn_es_lider() then
    raise exception 'Solo un líder puede anular un comprobante — es irreversible ante SUNAT';
  end if;
$v$,
  $n$  -- ADR-0534: anula quien ve Facturación (antes, solo un líder). Sigue siendo irreversible ante SUNAT.
  if not fn_ve_modulo('facturacion') then
    raise exception 'Anular un comprobante necesita el módulo Facturación en tu rol — es irreversible ante SUNAT' using errcode = '42501';
  end if;
$n$
);

select pg_temp.reemplazar_anclado(
  'retail.marcar_comprobante_no_emitido(uuid, text)',
  $v$  if not fn_es_lider() then
    raise exception 'Solo un líder puede liberar un comprobante no emitido — es una decisión irreversible con implicancia de compliance';
  end if;
$v$,
  $n$  -- ADR-0534: libera quien ve Facturación (antes, solo un líder). Sigue siendo irreversible.
  if not fn_ve_modulo('facturacion') then
    raise exception 'Liberar un comprobante no emitido necesita el módulo Facturación en tu rol — es irreversible' using errcode = '42501';
  end if;
$n$
);
