# ADR-0207 · La actividad de cada módulo: quién hizo qué, desde la cabecera

- **Fecha:** 2026-09-25 · **Estado:** Aceptado y construido (primer paso: Punto de venta, Historial de ventas, Caja y
  Cambios). **Producción:** migración `20260926090000_actividad_por_modulo.sql` **POR PEGAR** (una sola parte, sin
  políticas).
- **Alcance:** `supabase/migrations/20260926090000_actividad_por_modulo.sql`, `scripts/pruebas/actividad.mjs`,
  `apps/web/lib/actividad-reglas.ts`, `apps/web/components/actividad/*`, `apps/web/app/(app)/actividad/*`,
  `apps/web/components/AppShell.tsx` (el botón), `lib/modulos.ts` y `lib/terminales-reglas.ts` (el módulo nuevo).
- **Decide:** Felipe, 2026-09-25: «cada módulo debe tener su historial propio… solo lo vería el admin o la líder…
  no quiero que esté en el panel lateral… quizás en la parte superior al lado de sedes». Luego: líder de tienda = solo
  su sede (opción B), un traslado lo ven las dos sedes, y lo pasado se carga.

## Problema

Cada operación queda firmada, pero en la fila de lo que se hizo: unas 55 tablas, cada una con su propia columna de
firma (`ventas.usuario_id`, `cajas.abierta_por`, `cambios.usuario_id`, `separaciones.liberada_por`…). No hay un lugar
donde una líder pregunte «¿quién anuló esa venta?» o «¿qué pasó hoy en la Caja de Trujillo?» sin saber SQL. Además, las
EDICIONES no dejan rastro: la tabla guarda el valor nuevo y pierde quién lo cambió y cuál era el anterior.

## Decisión

- **D1 — Una sola tabla `retail.actividad`, de solo agregar** (como `movimientos`): un disparador rechaza UPDATE y
  DELETE. Cada fila: cuándo pasó, módulo, acción (clave estable), la frase sin el sujeto («anuló la venta B001-000123…»),
  quién (el responsable que firmó, ADR-0162), desde qué terminal, la sede (y la de destino en un traslado), a qué registro
  se refiere y un `detalle` jsonb con montos y motivo. «Cada módulo tiene su historial» es un FILTRO sobre esa tabla,
  no 30 tablas: una pieza, una sola forma de leerla.
- **D2 — Se llena con disparadores sobre las tablas que ya guardan**, no tocando las funciones que guardan (343). Cada
  evento lo arma UNA función (`fn_actividad_<evento>`) que usan el disparador y la carga inicial: el texto de hoy y el de
  lo reconstruido salen del mismo lugar. La venta se anota al CONFIRMAR (disparador de restricción diferido): su cabecera
  se guarda antes que sus prendas y su comprobante.
- **D3 — Un error del historial nunca detiene la operación.** Cada disparador envuelve su anotación: si falla, WARNING en
  el log y la venta sigue. Se prefirió perder una línea del historial a dejar una tienda sin cobrar (principio 9).
  `pnpm pruebas:actividad` lo prueba forzando la falla.
- **D4 — Se abre desde la cabecera, junto a la sede, no desde el lateral** (Felipe). El botón «Actividad» abre el
  historial DEL MÓDULO DONDE UNO ESTÁ (`moduloDeRuta`), en la sede del selector; dentro se cambia de módulo y de periodo.
  «Ver todo el historial» lleva a `/actividad` (fuera del lateral), con filtros de módulo, sede, persona y periodo. El
  panel es un `<Modal variante="papel">` y no un cajón lateral como en la maqueta del chat: la regla de modales (ADR-0136)
  no admite otro overlay.
- **D5 — Quién la ve.** Es un módulo más en Roles y accesos (`actividad`, grupo Gestión), aunque no tenga fila en el
  lateral: así «la líder de tienda» es simplemente un rol al que el líder le enciende «Actividad». Nace sin rol (ADR-0161).
  El Líder (y el Admin, que es Líder) ve todas las sedes; cualquier otra cuenta con el módulo, SOLO su sede
  (`fn_ubicacion_actual_persona`), pida lo que pida; un traslado cuenta para las dos sedes. **Solo personas:** se suma a
  `MODULOS_SOLO_PERSONAS` y a `fn_exigir_rol_de_terminal` — un aparato compartido de mostrador no revisa lo que hacen
  las demás.
- **D6 — La anulación es del Historial de ventas**, no del Punto de venta: cada evento pertenece al módulo cuya pantalla
  lo guarda. Así cada historial responde por su pantalla.
- **D7 — Lo pasado se carga** (`origen = 'carga_inicial'`) desde las firmas que ya existen, con la hora de cada operación;
  re-ejecutable (no repite). Las ediciones antiguas no se pueden recuperar: se anotan desde que cada módulo sume las suyas.

## Alternativas descartadas

- **Una vista que junte las 55 tablas.** No ve ediciones (lo pisado ya no existe), se rompe cada vez que una tabla cambia
  y se pone lenta con el volumen.
- **Anotar desde cada función que guarda.** 343 funciones; basta olvidar una para que el historial mienta sin que nadie
  lo note. El disparador está en la tabla: ninguna función nueva se lo salta.
- **Un botón fijo «Actividad ▸ elegir módulo».** Dos clics y pensar dónde buscar; cuando algo raro pasa, la líder ya
  está parada en ese módulo.

## Cómo se suma un módulo

Una migración propia con (1) una función `fn_actividad_<evento>(id, origen)` que llama a `fn_actividad_anotar`, (2) su
disparador envuelto (D3), (3) la carga de lo pasado con la misma función, y (4) la clave del módulo en
`MODULOS_CON_ACTIVIDAD` (`lib/actividad-reglas.ts`). Siguientes por valor: Devoluciones, Apartados, Traslados,
Existencias (ajustes), Productos (precio: con antes/después), Colaboradores y Roles.

## Producción

Una sola parte (no hay políticas: la tabla solo se lee por funciones `security definer`). Toma candados breves de
`ventas`, `cajas`, `caja_movimientos`, `caja_traslados` y `cambios` al crear los disparadores: pegarla fuera del horario
de tienda. `lock_timeout = 3s`: si una tienda está cobrando, falla sin trabar y se vuelve a pegar.
