-- El Taller de retail se enlaza con su sede de Dynamic («Taller LIM», tipo taller).
--
-- EL PROBLEMA (2026-10-19). Con la cuenta del Taller, Producción ▸ Nueva orden decía «Nadie de turno en Taller»
-- aunque cuatro personas habían marcado entrada esa mañana en el kiosco. `fn_asesoras_de_turno` lee la asistencia de
-- Dynamic por `ubicaciones.sede_dynamic_id`, y para una ubicación sin enlace devuelve tabla vacía («el Taller antes de
-- enlazarse», 20260922150000): el combo «Responsable» lo lee como «nadie presente» y bloquea el guardado (ADR-0161).
-- Las tres tiendas tenían su enlace; el Taller nunca lo tuvo.
--
-- QUÉ HACE. Pone `sede_dynamic_id` en la ubicación de tipo taller con la única sede de tipo taller de Dynamic. Idempotente
-- (solo si aún está vacío) y a prueba de ambigüedad: con cero o dos sedes de tipo taller en Dynamic no toca nada, porque
-- adivinar cuál es mandaría la asistencia de otra gente. Es un `update` de datos sin políticas ni `alter`: se pega
-- entera en el SQL Editor de producción (CLAUDE.md, «Políticas y deadlocks»).
--
-- QUÉ MÁS CAMBIA. Quien en Dynamic tiene al Taller como sede base pasa a resolver su ubicación de retail como el Taller
-- (`fn_sede_actual_persona`, `fn_persona_actual_resumen`, `fn_puede_operar_ubicacion`), igual que ya pasaba con una
-- tienda; antes caía en «sin ubicación».

set search_path = retail, public, extensions;

do $$
declare
  v_sedes uuid[];
begin
  -- Dynamic puede faltar o tener otra forma (local sin su stub, ADR-0033): no se rompe, simplemente no enlaza.
  begin
    execute $q$select coalesce(array_agg(id), '{}') from public.sedes where tipo = 'taller'$q$ into v_sedes;
  exception when undefined_table or undefined_column then
    return;
  end;

  if coalesce(array_length(v_sedes, 1), 0) <> 1 then
    return;
  end if;

  update retail.ubicaciones
     set sede_dynamic_id = v_sedes[1]
   where tipo = 'taller'
     and sede_dynamic_id is null;
end $$;
