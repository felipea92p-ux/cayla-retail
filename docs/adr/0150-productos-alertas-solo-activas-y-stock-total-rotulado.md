# ADR-0150 — Productos: las alertas de stock solo cuentan prendas activas, «Stock» se llama «Stock total» y los números de la cabecera dejan de mentir

**Fecha:** 2026-09-22
**Estado:** Aceptado e **implementado en local** (rama `claude/pantalla-ebc078`). Verificado con la base local real (18 verificaciones de
integración, con **prueba de mutación**: contra las funciones de producción fallan 6), 9 pruebas unitarias nuevas (también con mutación), tipos,
lint, las 2 379 pruebas de la app y una vista previa con datos inventados a 375 px y a 1 280 px. **Dos migraciones sin aplicar en producción**
(ver «Cómo se pega en producción»).
**Decide:** Felipe, el 2026-09-22: «opción A, y haz las tareas #1 a #4» del análisis `docs/pantallas/productos.md`.
**Afecta:** `fn_productos` y `fn_productos_resumen` (mismas firmas y columnas); `ProductosGrilla.tsx`, `ProductosAgrupados.tsx`,
`page.tsx` de `/productos`; `lib/productos-stock.ts` y `components/NotaStockTotal.tsx` (nuevos). **Ningún cambio de tablas, de permisos ni de
políticas.**

## Contexto — el problema

El análisis de `/productos` (2026-09-21) encontró cuatro problemas: tres números de la cabecera decían algo distinto de lo que el ojo leía, y el rojo se desbordaba:

1. **Los descontinuados disparaban alertas.** La lista incluye por defecto las prendas descontinuadas, y «sin stock», «stock bajo», «para pedir» y
   el bloque «A quién pedirle» las contaban a todas. Una prenda en liquidación, con ventas recientes y poco stock, salía como «para pedir» y la
   pantalla sugería comprársela otra vez al proveedor. Según una lectura de producción del 2026-09-21 (por confirmar con la consulta Q2 del análisis)
   «23 sin stock» eran 17 de verdad y los «3 para pedir» eran prendas de prueba descontinuadas.
2. **«Stock» sumaba toda la red** —todas las sedes y el Taller— bajo un selector de sede («TIENDA TRU») que parecía cambiarlo. Es una decisión de
   Felipe del 2026-09-15 (`20260915160000_productos_listado_filtros.sql`) que choca con R-48 («cada líder ve solo su sede»); nada en la pantalla
   decía de qué stock se hablaba.
3. **«190 variantes» era falso** (la base tiene 163): `fn_productos_resumen` contaba `count(v.id)` después de unir con `stock`, y una variante con
   stock en dos sedes se contaba dos veces.
4. **El rojo se desbordaba:** un «Stock 0» rojo por cada prenda agotada, más el rojo del subtítulo. Con 23 prendas en 0, más de la mitad de la
   grilla en rojo; el máximo por pantalla es 2 (`MAX_ROJO_POR_PANTALLA`).

## Decisión

**1. Una prenda descontinuada no dispara alertas.** Sigue listada, se puede buscar y reactivar (la Tabla tiene «Activar» en bloque), pero no cuenta
como «sin stock», «stock bajo» ni «para pedir», y no sale en «A quién pedirle». El filtro `p_stock` y el contador cambian **juntos**: el número de
arriba es lo que muestran las tarjetas de abajo. La Grilla marca la prenda con un chip «Descontinuado» (antes solo se veía dentro de la vista
rápida). Migración `20260922120000`.

**2. Opción A: «Stock total».** El número no cambia (sigue siendo el total de la red, decisión del 2026-09-15); lo que cambia es que **lo dice**:
«Stock total 12» en la tarjeta y en la Tabla, un `title` «Suma de todas las sedes y el Taller.» y una línea siempre visible bajo los contadores
(un `title` no se ve en una tablet) con un enlace a Inventario para ver una sola sede. **La opción B (cifra «vendible en mi sede») y la C («hay en
otra sede») quedan sin decidir**: dependen de resolver R-48 contra la decisión del 2026-09-15.

**3. «N variantes» cuenta variantes:** `count(distinct v.id)`. Migración aparte, `20260922121000`, porque cambia un número visible.

**4. «Agotado» no es rojo.** Un chip neutro en la tarjeta (texto en tinta en la Tabla). El rojo del subtítulo («N sin stock») queda como el único de
la pantalla.

La regla de qué prenda pide atención vive en un solo archivo, `lib/productos-stock.ts` (`alertaDeStock`), y la usan la Grilla y la Tabla: antes
cada una tenía su copia.

## DECIDÍ / DESCARTÉ / SE ROMPE SI

**DECIDÍ:** las alertas de stock solo cuentan prendas `estado = 'activo'`, en la base (contadores y filtro) y en la pantalla (chips).
**DESCARTÉ:** ocultar los descontinuados por defecto (`estado = activo` en la lista). Costo concreto: la Tabla trae «Activar» en bloque y el flujo
Activo → Descontinuado se verificó en esta pantalla (BITÁCORA 2026-09-15); ocultarlos obligaría a buscarlos con un filtro para reactivar una prenda.
**SE ROMPE SI:** una prenda descontinuada todavía se vende y de verdad hay que reponerla (una liquidación que resulta ser un éxito): dejaría de salir
en «A quién pedirle» y habría que reactivarla primero, que es lo correcto —un descontinuado que se sigue pidiendo ya no está descontinuado—, pero hay
que saberlo.

**DECIDÍ:** el número sigue siendo el total de la red y se rotula (opción A).
**DESCARTÉ:** cambiarlo ya a «mi sede» (opción B). Costo concreto: cambia el contrato de dos funciones `security definer` que tendrían que validar la
sede con `fn_puede_operar_ubicacion` (si no, cualquiera lee la sede ajena pasando su id), y el «para pedir» seguiría midiendo la demanda de toda la red.
**SE ROMPE SI:** una colaboradora de TRU lee «Stock total 3», entiende que son de su tienda y le promete una prenda a una clienta que en realidad está
en el Taller. El rótulo lo dice, pero no lo impide: solo la opción B lo impide.

## Lo que este ADR NO toca

- **R-48 contra la decisión del 2026-09-15** (qué número debe ver una tienda): sigue abierta. Opciones y recomendación en la sección 8 de
  `docs/pantallas/productos.md`.
- **Variantes inactivas** (tarea #9 del análisis): `total_variantes`, `stock_total`, los swatches y el rango de precio siguen contando variantes
  inactivas. Hoy no hay ninguna en un producto activo; decidir que «variantes» signifique «vigentes» es otro cambio.
- **El costo de `fn_productos`** (`lead_time` recorre todas las recepciones en cada evaluación): hoy cuesta 0 (0 lotes y 0 compras), crece con Compras.
  Tarea #7 del análisis, con medición previa.

## Cómo se pega en producción (lo hace Felipe, en este orden, DESPUÉS de revisar)

1. `supabase/migrations/20260922120000_productos_alertas_de_stock_solo_activos.sql`
2. `supabase/migrations/20260922121000_productos_resumen_variantes_distintas.sql`

Los dos archivos ya traen `set search_path = retail, public, extensions;`: sirven tal cual en el SQL Editor del proyecto de Dynamic. Son
`create or replace` con la misma firma: **el orden de despliegue no importa** (la pantalla vieja funciona con la migración nueva, y la pantalla nueva
funciona con la migración vieja; solo los contadores se ven distintos hasta que se pegue). Después, verificar:

```sql
-- «sin stock» y «para pedir» por estado: los descontinuados deben dar 0 en para_pedir en la lista y no contar en el resumen
select estado, count(*) as productos, count(*) filter (where stock_total = 0) as sin_stock, count(*) filter (where reponer_de_proveedor) as para_pedir
from (select distinct producto_id, estado, stock_total, reponer_de_proveedor from retail.fn_productos(p_por_pagina => 100)) t group by estado;
-- el subtítulo debe decir lo mismo que la suma de activos de arriba, y las variantes deben ser las reales
select * from retail.fn_productos_resumen();
select count(*) as variantes_reales from retail.variantes where producto_id <> '11111111-1111-4111-8111-111111111111'::uuid;
```

## Cómo lo verificas tú

- En `/productos` (Grilla): cada tarjeta dice «Stock total N» o un chip «Agotado» **sin rojo**; las prendas descontinuadas llevan el chip
  «Descontinuado» abajo a la izquierda de la foto; debajo del subtítulo hay una línea «Stock total — Suma de todas las sedes y el Taller…».
- En la Tabla: la columna se llama «Stock total» y las filas agotadas no son rojas.
- Con las migraciones pegadas: «N sin stock» y «N para pedir» no incluyen descontinuadas, y «N variantes» coincide con `variantes_reales`.
- CI: `pnpm pruebas:productos-alertas-de-stock` (18 verificaciones) y `pnpm test`.

## Qué se rompería sin esto

Una liquidación real disparando «A quién pedirle» hacia un proveedor, un encabezado con un número de variantes que crece solo al mover stock entre
sedes, y una grilla donde el rojo (el único color que avisa) está en la mitad de las tarjetas y por eso ya no avisa.
