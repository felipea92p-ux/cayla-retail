# ADR-0145 — Colaboradores: una sola puerta de escritura y un alta sin valores puestos

**Fecha:** 2026-09-22 · **Estado:** migración `20260922100000_colaboradores_endurecimiento.sql` **aplicada en producción el 2026-09-22** (verificado: solo SELECT para `authenticated`, constraint presente) · **Origen:** auditoría de `/colaboradores` (`docs/pantallas/colaboradores.md`, tareas #1, #2, #4, #5, #7, #8, #9)

## Contexto

`retail.colaboradores` decide quién entra a retail y a qué ubicación queda fijo. La auditoría encontró que la tabla se protegía con una sola capa: en producción `authenticated` tiene INSERT, UPDATE y DELETE sobre ella (consulta del 2026-09-21) y solo RLS —con la política de SELECT como única— lo frena. Además, el alta abría con la primera persona y la primera ubicación ya elegidas, y `agregar_colaborador` ignoraba en silencio el caso de que la persona ya tuviera acceso.

## Decisión

1. **Escribir solo por RPC.** `revoke insert, update, delete, truncate` sobre `retail.colaboradores` a `authenticated` y `anon`, como ya se hizo con `movimientos`. Las RPC son `security definer` y no se ven afectadas.
2. **Candado de esquema:** `check (rol = 'lider' or ubicacion_asignada_id is not null)`. Un colaborador siempre tiene sede fija. Producción cumple hoy (16 de 16).
3. **Las RPC dicen la verdad:** `agregar_colaborador` falla si la persona ya tenía acceso; `quitar_colaborador` falla si ya no lo tenía, y nombra al rol correcto («otro líder»).
4. **El alta no trae nada elegido:** el modal abre con Persona y Ubicación vacías y «Agregar» deshabilitado hasta elegir ambas.
5. **Piel:** «Quitar acceso» deja de ser rojo por fila (el rojo queda para la confirmación y para el hover), y los textos de apoyo suben a contraste ≥ 4,5:1 y 12 px.

## Descartado

- **Baja lógica** (columna `quitado_en`) para conservar el historial: obliga a reescribir `fn_tiene_acceso_retail` y `fn_es_lider`, de las que cuelga el RLS de todo el sistema. El historial va aparte, como registro que solo se agrega (tarea #3 de la auditoría, no incluida acá).
- **Un `cambiar_ubicacion_colaborador`** (tarea #6): decisión de producto aparte, depende del historial.

## Se rompe si

- Se pega la migración con un colaborador sin ubicación: el `add constraint` falla entero. Antes: `select count(*) from retail.colaboradores where rol = 'colaborador' and ubicacion_asignada_id is null;` debe dar 0.
- Se despliega la web antes que la migración: no pasa nada (los textos nuevos del error solo aparecen con la migración; la pantalla ya funciona sin ella).

## Cómo se pega en producción

Con ok de Felipe. Entera, en el SQL Editor de cayla-dynamic (ya trae `retail.`); es re-ejecutable. Verificar después con la consulta de permisos de `role_table_grants`: solo debe quedar SELECT para `authenticated`; y probar en la pantalla agregar y quitar a una persona de prueba.
