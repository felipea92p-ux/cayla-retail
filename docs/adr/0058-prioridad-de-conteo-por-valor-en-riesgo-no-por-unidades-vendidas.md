# ADR-0058 — La sugerencia de "qué contar primero" ordena por valor en riesgo, no por unidades vendidas

**Fecha:** 2026-09-17
**Estado:** Aplicado en `main`, verificado en local.
**Afecta:** `retail.fn_prioridad_conteo` (nueva), `lib/conteos.ts`, `ConteoPanel.tsx`,
`app/(app)/inventario/conteo/page.tsx`. Sin cambios de esquema — solo una función nueva
de solo lectura.

## Contexto

`/inventario/conteo` (abrir_conteo/conteo_contar/cerrar_conteo) ya existía y funciona.
Lo que no existía en `main` es una sugerencia de qué contar primero — el colaborador
busca a ciegas por SKU o escanea lo que se le ocurre, así que en la práctica termina
contando primero lo que más se nota (lo que más rota), y una prenda cara de baja
rotación puede pasar meses sin que nadie la cuente.

Un documento externo (compartido por Felipe, generado fuera de este repo) afirmaba que
esto ya estaba corregido, citando un commit (`1b69160`) que no existe en ningún lugar
del historial de git (verificado con `git log --all`, 695 commits, todas las ramas). La
única función `fn_prioridad_conteo` real encontrada en todo el historial (rama
`traslados-costeo-reorden-conteo`, no fusionada) ordena por `ventas_30d desc` —
unidades vendidas, exactamente el criterio que el documento decía corregido. Esta ADR
documenta la versión que sí corrige eso, escrita desde cero en `main`.

## Decisión

1. **El criterio es `stock.cantidad × variantes.precio` ("valor en riesgo"), no ventas
   del mes.** Una prenda cara que casi no rota igual tiene plata parada en la percha; un
   descuadre ahí cuesta más que uno en un básico barato que vende mucho pero vale poco
   por unidad. Ventas del mes mide qué tan rápido se mueve algo, no cuánta plata hay
   expuesta ahora mismo — son dos preguntas distintas, y la que le importa a un conteo
   es la segunda.
2. **Cobertura antes que valor.** Lo nunca contado va primero siempre (`dias_sin_contar
   is null`, vía `nulls first`) — cero confianza en ese número hasta la primera vez que
   alguien lo cuenta, sin importar cuánto valga. Dentro de eso, ordena por valor en
   riesgo descendente. No se tocó esta parte porque no era lo que estaba roto.
3. **Sin `p_alcance_categoria_id`.** La rama no fusionada trae también un selector de
   categoría para acotar la sugerencia; no se portó acá porque no es el problema que se
   pidió resolver y `main` no tiene ningún otro punto de la pantalla que use ese
   concepto todavía — agregarlo ahora sería una abstracción sin un segundo uso real.
4. **Alcance por `ubicación`, no por `sububicación` (piso/almacén).** `stock` guarda
   cantidad por `variante_id + ubicacion_id` únicamente — no existe un desglose por
   piso/almacén en esa tabla (sí en `movimientos`, no en el snapshot). Pedir precisión
   de sububicación acá exigiría inventar una fuente de verdad nueva; se respeta la que
   ya existe.
5. **Integrado en la pantalla, no solo en el backend.** Se agregó un bloque "Sugerido
   para contar (mayor plata en riesgo)" arriba del buscador en `ConteoPanel.tsx`, top 5,
   excluyendo lo ya contado en el conteo abierto (mismo `Set` que ya existía para
   marcar "· ya contada" en la búsqueda). Tocar una sugerencia selecciona la variante
   exactamente como tocar un resultado de búsqueda — mismo flujo, un atajo menos.

## Se rompe si

Si `stock.cantidad` alguna vez queda desactualizado respecto al piso real (ej. mientras
existe un conteo abierto que aún no cierra), la sugerencia va a subestimar el valor en
riesgo de lo que ya se vendió mal contado — mismo límite que ya tiene todo el módulo de
Inventario hoy, no uno nuevo que esto introduzca.

## Verificado

`tsc --noEmit`, `eslint`, `vitest run` (239/239) en verde. `supabase db reset` aplica la
migración limpia sobre el resto del esquema. En navegador, como Micaela (colaboradora,
Tienda Trujillo): abrí un conteo de piso de venta, la sugerencia mostró Casaca Luciana
(S/799.50, nunca contada) primero — no el básico más vendido —, tocarla llevó directo al
formulario de cantidad, y al registrar 3 unidades la sugerencia la sacó de la lista y
subió la siguiente por valor.
