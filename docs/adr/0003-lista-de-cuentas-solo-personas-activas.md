# ADR-0003 — La lista de cuentas del modal «Asignar rol» solo ofrece personas activas

**Fecha:** 2026-10-07
**Estado:** Aplicado en producción (cayla-dynamic, migración `cuentas_con_rol_solo_personas_activas`)

## Contexto

Felipe dio de baja a una persona en dynamic (`fn_cesar_persona` → `personas.estado =
'inactivo'`) y en retail seguía apareciendo en el buscador de cuentas del modal
«Asignar «Integrante»». Quería que la baja en dynamic fuera la baja en retail, sin un
segundo paso.

La lista sale de `retail.fn_cuentas_con_rol()`. Esa función unía `retail.colaboradores`
y `retail.colaboradores_suspendidos` con `public.personas` pero **no filtraba
`p.estado = 'activo'`**.

El acceso, en cambio, ya cerraba solo: las funciones de identidad de producción exigen
persona activa — `fn_es_lider`, `fn_mi_rol_id`, `fn_ubicacion_actual_persona`,
`fn_actor_persona_id`, `fn_es_admin`, `fn_persona_actual_resumen`. Una persona de baja
no es Líder, no tiene rol (no ve módulos) y no tiene sede en retail. El hueco era solo
la lista. (Se revisaron esas puertas centrales; no las 915 funciones ni las políticas de
las 163 tablas.)

## Decisión

Una sola fuente de verdad: `public.personas.estado` de dynamic. Retail no guarda copia
ni «estado propio», así que no hay nada que sincronizar ni que pueda desfasarse
(principio 4). Se corrige en la función que arma la lista, agregando
`where p.estado = 'activo'` a sus dos ramas de personas (colaboradores y suspendidos).
La rama de terminales no cambia. No se borra ninguna fila de `colaboradores`.

Verificación en producción: ejecutada con la identidad de un Líder activo, la función
devuelve 29 cuentas (23 personas activas + 6 terminales) y 0 personas de baja. Antes
ocultaba de más a 2 personas dadas de baja que sí aparecían.

## Alternativas descartadas

- **Borrar la fila de `colaboradores` al dar de baja** (`quitar_colaborador`). Pierde la
  reversibilidad: reactivar en dynamic ya no devolvería el acceso. Sigue disponible
  como baja formal con historial si Felipe la quiere para un caso concreto.
- **Banear la cuenta de Supabase Auth.** Corta también el login a dynamic (que tiene
  sus propias reglas para cesados) y necesita la llave de servicio, rotada a propósito.
- **Filtrar solo en la pantalla.** Esconde a la persona pero deja la función devolviendo
  datos de bajas por API directa; es el parche que el principio 2 prohíbe.
- **El «paso 12» de `supabase/unificacion/`** (redefinir candados y vistas de un schema
  `retail` con `retail.personas`, `retail.es_lider`…). Se escribió y **no se aplicó**:
  ese schema no es el que corre en producción (ver Consecuencias).

## Consecuencias

- Dar de baja en dynamic saca a la persona de la lista del modal y ya le cerraba el
  acceso; reactivarla (`fn_reactivar_persona`) lo devuelve todo sola.
- Su login de Supabase Auth sigue existiendo: puede iniciar sesión, pero no ve ni opera
  nada en retail.
- **Hallazgo estructural:** `supabase/unificacion/01-11` y la app de este repo asumen un
  schema `retail` que NO es el de producción. En cayla-dynamic, `retail` tiene 163 tablas
  y 915 funciones (`colaboradores`, `roles`, `asignar_rol`, `quitar_colaborador`…) y no
  existen `retail.es_lider` ni `retail.personas`. El código fuente de ese Retail real no
  está en este repo. Ver BACKLOG.

## SQL aplicado (referencia y reversa)

```sql
CREATE OR REPLACE FUNCTION retail.fn_cuentas_con_rol()
 RETURNS TABLE(tipo text, id uuid, nombre text, ubicacion_nombre text, rol_id uuid, es_lider boolean, estado text)
 LANGUAGE plpgsql STABLE SECURITY DEFINER
 SET search_path TO 'retail', 'public', 'extensions'
AS $function$
begin
  perform retail.fn_exigir_lider_de_roles();
  return query
    select 'persona'::text, p.id, (p.nombres || ' ' || p.apellidos)::text, u.nombre::text, c.rol_id, c.rol = 'lider', c.estado::text
      from retail.colaboradores c
      join public.personas p on p.id = c.persona_id
      left join retail.ubicaciones u on u.id = c.ubicacion_asignada_id
      where p.estado = 'activo'
    union all
    select 'persona', p.id, p.nombres || ' ' || p.apellidos, u.nombre, s.rol_id, s.rol = 'lider', 'suspendido'
      from retail.colaboradores_suspendidos s
      join public.personas p on p.id = s.persona_id
      left join retail.ubicaciones u on u.id = s.ubicacion_asignada_id
      where p.estado = 'activo'
    union all
    select 'terminal', t.id, t.nombre, u.nombre, t.rol_id, false, case when t.activo then 'activo' else 'desactivada' end
      from retail.terminales t
      join retail.ubicaciones u on u.id = t.ubicacion_id
    order by 1, 3;
end;
$function$;
```

Reversa: la misma función sin las dos líneas `where p.estado = 'activo'`.
