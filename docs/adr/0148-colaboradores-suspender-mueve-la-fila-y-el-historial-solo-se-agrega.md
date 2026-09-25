# ADR-0148 — Colaboradores: suspender mueve la fila y el historial de accesos solo se agrega

**Fecha:** 2026-09-22 · **Estado:** hecho en local y probado en Postgres (PGlite) y en el navegador con datos de ejemplo; migración `20260922110000_colaboradores_suspender_y_actividad.sql` **sin pegar en producción** · **Origen:** rediseño de `/colaboradores` a partir de la maqueta de Felipe; tareas #3, #6, #10 y #11 de `docs/pantallas/colaboradores.md`

## Contexto

La maqueta pedía cosas que la base no tenía: **Suspender / Reactivar**, **Cambiar ubicación**, alta de **varias personas a la vez**, una pestaña **Inactivas en Dynamic** y una pestaña **Actividad** con el historial de accesos. Suspender solo es real si corta el acceso de verdad. Y el acceso lo deciden `fn_tiene_acceso_retail`, `fn_es_lider`, `fn_ubicacion_actual_persona`, `fn_persona_actual_resumen` y las funciones que leen `retail.colaboradores` a mano (stock por sede, `registrar_venta`, perfil): ocho lugares.

## Decisión

1. **Suspender MUEVE la fila.** `retail.colaboradores` sigue siendo exactamente «quién tiene la puerta abierta hoy». Una persona suspendida sale de ahí y vive en `retail.colaboradores_suspendidos` con lo necesario para devolverla igual (rol, ubicación, quién la agregó y cuándo). Ninguna función de acceso cambia: un suspendido simplemente no está, y no puede entrar por ningún camino, incluidos los que leen la tabla a mano.
2. **Candado cruzado:** dos triggers impiden que una persona esté a la vez en las dos tablas.
3. **Historial que solo se agrega:** `retail.colaboradores_historial` (alta, baja, suspensión, reactivación, cambio de ubicación). Lo escribe una sola función interna, sin permiso para nadie más; un trigger impide `update` y `delete` incluso al dueño. Se siembra con las altas que ya existen (sin autor, y la pantalla lo dice: «ya tenía acceso cuando se empezó a llevar este historial»).
4. **RPC nuevas, solo líder:** `suspender_colaborador`, `reactivar_colaborador`, `cambiar_ubicacion_colaborador`, `agregar_colaboradores` (todo o nada). `agregar_colaborador` y `quitar_colaborador` (ADR-0145) siguen con su firma y ahora anotan el historial; `quitar_colaborador` también alcanza a un suspendido.
5. **Cada persona en UNA lista:** activos, suspendidos (activos en Dynamic) o inactivos en Dynamic. `fn_colaboradores` cambia de forma (suma `ubicacion_id`, `es_yo`, `ultimo_acceso`; se dropea la firma vieja), y nacen `fn_colaboradores_suspendidos`, `fn_colaboradores_inactivos` y `fn_colaboradores_actividad`.
6. **Suspender y Quitar conviven** en el menú «⋯» (decisión de Felipe): suspender es reversible y conserva historial; quitar es la baja definitiva, con confirmación.
7. **Los cuatro números de arriba son reales**, derivados de las listas. La maqueta traía datos de ejemplo («de 14 usuarios», «Dynamic Retail Sync · Conectado»); este último no se construyó: no existe una señal de sincronización que lo respalde.
8. **`/vender/historial`** arma su filtro «vendedor» con activos + suspendidos + inactivos: quien ya no opera igual vendió, y sus ventas tienen que poder filtrarse.

## Descartado

- **Bandera `suspendido_en` en `colaboradores` + reescribir las ocho funciones de acceso.** Olvidar una deja a un suspendido operando, y todas están en la ruta caliente de cada política RLS. Mover la fila cuesta una tabla más y dos triggers, y no toca nada de lo que ya funciona.
- **Historial por trigger sobre `colaboradores`.** Un `delete` + `insert` interno (suspender) se leería como baja y alta. Cada RPC escribe el evento con su nombre real; como nadie más puede escribir en la tabla (ADR-0145), no hay otro camino.
- **«Reactivar» sin condiciones.** Si Dynamic dio de baja a la persona o su ubicación ya no está activa, la RPC lo dice en vez de devolver un acceso que no funcionaría.

## Se rompe si

- **Se despliega la web antes de pegar la migración:** la pantalla nueva llama funciones que no existen y `/colaboradores` falla. Orden: **migración en producción primero, después fusionar la web.** (La web vieja sigue funcionando con la base nueva. `/vender/historial` tolera que las lecturas nuevas no existan: cae al filtro de antes.)
- Alguien inserta a mano en `colaboradores` a una persona suspendida: el trigger lo rechaza; se reactiva por RPC.
- Una suspensión con una caja abierta a su nombre: la caja no se cierra sola. Cerrarla sigue siendo del líder (ADR-0143).

## Cómo se verificó

- **Base:** 67 comprobaciones en PGlite (Postgres real en WASM) con un esquema mínimo que imita producción: permisos, todo-o-nada, candado cruzado, historial inmutable, líder frente a colaboradora, rol `authenticated` con RLS, ubicación inactiva, persona inactiva en Dynamic, y re-ejecución de la migración. **No es Docker ni la base de producción**: la prueba de `scripts/pruebas/` con el contenedor local sigue pendiente.
- **Pantalla:** en el navegador, con datos inventados y acciones simuladas (una ruta temporal, ya borrada): menú «⋯» con teclado, suspender con motivo, reactivar, cambiar ubicación, alta de 3 personas a la vez, las cuatro pestañas y el ancho de teléfono.

## Cómo se pega en producción

Con ok de Felipe, **entera y de una vez** en el SQL Editor de cayla-dynamic (trae `retail.`; es re-ejecutable). Después: `pnpm datos:generar:produccion` tras refrescar el volcado (`docs/datos/generado/COMO-REFRESCAR.md`) para que las dos tablas nuevas entren al diccionario. Verificar: que `authenticated` solo tenga SELECT sobre las dos tablas nuevas y que la pantalla muestre 4 pestañas con los conteos correctos.
