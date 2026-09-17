# ADR-0097 — Resumen de Inventario: quinta pantalla, no un reemplazo de Existencias

**Fecha:** 2026-09-17
**Estado:** Aplicado en LOCAL únicamente. No aplicado a producción ni a GitHub — Felipe pidió
explícitamente desarrollo 100% local para esta pieza; el push/PR y la migración a
producción quedan para cuando él lo indique, mismo protocolo ya acordado en esta sesión.
**Afecta:** `InventarioNav.tsx` (5ta pestaña), `retail.fn_resumen_inventario()` (RPC nueva),
`apps/web/lib/{resumen-inventario,curva-variantes,inventario-reglas}.ts`,
`apps/web/components/ResumenInventarioPanel.tsx`,
`apps/web/app/(app)/inventario/resumen/page.tsx`. **Ninguna tabla de stock ni
`movimientos` cambia de forma; ninguna RPC de escritura existente cambia.**

## Contexto

Felipe pidió analizar 8 ideas para Inventario (cobertura, sell-through, variantes rotas,
búsqueda, venta online, Matrix View, Inventory Velocity Report —urgente—, safety stock),
contrastarlas contra un análisis externo (ChatGPT, mirando solo las pantallas) y decidir
cómo construirlas. La investigación (ver conversación) encontró un hallazgo central: casi
todo esto ya existió una vez en `apps/web/lib/inteligencia.ts` (V1), borrado en el corte
V1→V2 del 2026-09-12 — no por estar mal pensado, sino porque V1 se volvió un archivo que
mezclaba 6 responsabilidades sin que nadie supiera bien qué hacía qué (razón que Felipe
confirmó explícitamente al revisar esta decisión). La instrucción de Felipe fue clara:
recuperar el VALOR de V1, no su DESORDEN — piezas chicas, separadas, documentadas.

Sobre dónde vive esto: `ADR-0071` fijó Inventario en cuatro pantallas (Existencias,
Movimientos, Traslados, Conteo) — una por responsabilidad operativa. El análisis externo
(ChatGPT) recomendó NO agregar una quinta pantalla y meter estas métricas dentro de
Existencias. Felipe, después de leer esa recomendación, pidió explícitamente lo contrario:
una pantalla nueva, "Resumen", con métricas, análisis y qué decisiones tomar, con detalle a
un click. Ver la conversación para el razonamiento completo — en corto: Existencias y
Resumen responden preguntas de gente distinta (el colaborador de piso mirando una fila,
contra quien decide reposición/liquidación/traslados a nivel de toda la red); forzar las
dos preguntas en una sola pantalla mezcla responsabilidades, lo que el propio criterio de
este repo (integridad conceptual) evita en todos lados.

Felipe también pidió, explícito, que todo número lleve su cifra visible en el mismo lugar
que el color/estado — nunca un semáforo pelado — porque un color solo puede significar
demasiadas cosas y un número le da seriedad a la alarma.

## Decisiones

1. **Resumen es una quinta pestaña, al final de la lista — no reemplaza ni reordena las
   cuatro de ADR-0071, y `/inventario` a secas sigue siendo Existencias.**
   - DESCARTÉ ponerla primera (como landing de todo el módulo): habría cambiado qué
     pantalla ve cualquiera que hoy tiene un enlace a `/inventario` guardado, un cambio de
     navegación que Felipe no pidió.
   - DESCARTÉ la recomendación externa de meterla dentro de Existencias: dos preguntas de
     dos audiencias distintas (piso vs. decisión de red) en una sola pantalla rompe
     integridad conceptual, y además Existencias ya está "cerca del máximo razonable de
     información horizontal" (el propio análisis externo lo señaló antes de recomendar,
     contradictoriamente, meterle más).
   - Solo Líder (`redirect` si no lo es) — mismo patrón que Compras/Colaboradores: es la
     pregunta de quien decide, no la de un colaborador de piso.

2. **Cobertura, sell-through y velocidad se calculan en una RPC nueva y dedicada
   (`retail.fn_resumen_inventario()`), no extendiendo `fn_productos`.**
   - DESCARTÉ extender `fn_productos`: ya paga el costo de 2 subconsultas `LATERAL` por
     producto en una pantalla que se recorre en cada carga de `/productos` (venta de
     catálogo); sumarle más cálculos encarecería una pantalla operativa con algo que solo
     importa para decidir reposición — mezclaría "vender" con "planificar inventario".
   - A nivel RED (todas las sedes juntas), no por sede — decisión de alcance para esta
     primera versión, documentada como pregunta abierta más abajo.

3. **Sell-through corrige el bug real de V1.** `inteligencia.ts:128` (V1) calculaba
   `ventas / (ventas + stockActual)` — matemáticamente correcto SOLO si la única salida en
   la ventana fue venta. Cualquier merma o traslado saliente quedaba invisible en el
   denominador y el número salía inflado. La fórmula nueva usa conservación de unidades:
   `venta_neta / (stock_actual + venta_neta + merma)` — venta_neta ya resta devoluciones
   (`tipo=entrada, motivo=devolucion`), y merma entra al denominador porque también es una
   salida real de la red que "gastó" stock sin ser venta.
   - SE ROMPE SI aparece una fila de `movimientos` con `motivo` fuera del vocabulario
     esperado (`venta`/`devolucion`/`merma`/...) — la columna es texto libre, sin `check`
     en la base (`unificacion/05_operacion.sql:208`, hueco ya documentado en
     `docs/datos/11-KPIS.md`). No se cerró ese candado en esta pasada — es prerrequisito
     real para confiar el número al 100%, anotado en BACKLOG, no bloqueante para esta
     versión porque el mismo patrón (comparar `motivo='venta'` como texto) ya lo usa
     `fn_productos` desde el 2026-09-16 sin que se haya visto un problema todavía.

4. **Curva rota: la curva "esperada" de un producto+color es el conjunto de tallas que YA
   tienen una variante dada de alta — nunca una talla que el producto nunca manejó.**
   Regla adoptada sin objeción explícita de Felipe al proponérsela. `detectarHuecosCurva`
   (`curva-variantes.ts`, 10 pruebas) marca hueco solo cuando hay stock ANTES y DESPUÉS de
   una talla en cero, en el orden canónico de `compararTallas` — agotarse en una punta de
   la curva no es un hueco.
   - DESCARTÉ una tabla nueva de "curva esperada por categoría": la señal ya existe en
     `variantes` (qué combinaciones talla/color se dieron de alta); pedir una tabla aparte
     sería una segunda fuente de verdad para lo mismo.
   - Por SEDE, no por red: la curva puede estar completa en la red y rota en una tienda
     puntual — es justo el caso que hace útil una sugerencia de traslado.

5. **Redistribución: CAYLA sugiere, nunca mueve stock por su cuenta.** Botón "Crear
   traslado" enlaza a `/inventario/traslados`, sin prellenar — mismo comportamiento que ya
   fijó `ADR-0071` ("hoy 'pedir traslado' es un llamado, no una acción del sistema") y que
   el propio análisis externo propuso de forma independiente. Tres fuentes coincidiendo sin
   haberse consultado: no queda como pregunta abierta.
   - DESCARTÉ prellenar el formulario de traslado en esta primera versión — es trabajo de
     UI aparte, no bloqueante para tener la sugerencia visible.

6. **El número principal siempre va en la misma etiqueta que el color — nunca un chip
   pelado.** "🔴 quedan ≈3 días", no "🔴" con el número detrás de un click. Decisión
   explícita de Felipe: un color sin número es una alarma sin peso.

## Verificado en local (2026-09-17)

- `npx supabase db reset --local` con las 90+ migraciones ya en `main` más la nueva —
  corrida limpia. (Nota aparte, no de este ADR: el reset reveló que este worktree no tenía
  activado `supabase/0000_local_stub_dynamic.sql.example` — paso de setup ya documentado en
  el README, no un bug.)
- `retail.fn_resumen_inventario()` probada directo contra Postgres: cobertura, sell-through
  y estado calculan coherente contra los datos de prueba del seed.
- `pnpm --filter web typecheck`: limpio.
- `npx vitest run` (apps/web): 307/307, incluidas las 10 nuevas de `curva-variantes.test.ts`.
- Probado en navegador (Chrome, desktop y viewport móvil 375×812): las 4 secciones
  renderizan, el detalle expande con los 9 campos, sin errores de consola. Un bug real se
  encontró y corrigió en el camino: "Venta media 0.0/día" al lado de "Cobertura ≈3540 días"
  parecía contradictorio — la demanda real (0.03/día) se perdía al redondear a 1 decimal;
  se corrigió a 2 decimales cuando la venta diaria es menor a 1 unidad.
- Con los datos de prueba actuales (catálogo real, casi sin ventas), "Riesgo de quiebre" y
  "Curvas incompletas" salen en 0 y "Sobrestock" muestra coberturas de miles de días — es
  el comportamiento ESPERADO de una fórmula correcta sobre poco historial, no un bug. Sigue
  pendiente (fuera de esta pieza, ya conversado con Felipe) generar 6 meses de datos
  simulados en LOCAL para poder probar esto contra una realidad útil.

## Preguntas abiertas (no bloquean lo ya construido, sí el siguiente paso)

- ¿Cobertura/sell-through/velocidad a nivel producto-red (como quedó acá) o también por
  sede? Cambia el diseño de la RPC.
- ¿Ventana fija de 30 días (como quedó) o elegible (7/14/30/60/90)?
- Cerrar el candado de `movimientos.motivo` (constraint o vocabulario cerrado, mismo patrón
  que ya se aplicó a colores/tallas/tejidos) antes de confiar el número al 100% con plata
  real.
- Cuándo llevar `fn_resumen_inventario()` a producción — depende de que
  `20260916100000_punto_reorden.sql` (safety stock) se aplique primero, todavía pendiente
  del ok puntual de Felipe.

## Consecuencias

- Inventario pasa de 4 a 5 pestañas por primera vez desde `ADR-0071` — el nav
  (`InventarioNav.tsx`) sigue con scroll horizontal en móvil sin indicador visual de que
  hay más pestañas fuera de vista; ya existía con 4, se nota más con 5. No se rediseñó acá
  (afecta a las 5 pestañas, no es de esta pieza) — queda anotado en BACKLOG.
- `packages/database/src/types.ts` se regeneró (`pnpm --filter database gen-types`) para
  incluir `fn_resumen_inventario` — cualquier sesión que siga trabajando en local sobre
  este worktree debe volver a generarlo si resetea su propio Postgres compartido.
