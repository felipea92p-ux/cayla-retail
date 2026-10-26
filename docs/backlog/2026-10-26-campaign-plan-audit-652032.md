# Plan de campaña: auditoría y primeras tres tareas — traspaso (2026-10-26)

Rama: `claude/campaign-plan-audit-652032` · ADR: **0520** (`docs/adr/0520-plan-de-campana-historial-de-lo-que-propuso-el-sistema.md`) · Migración reservada: **20261026171000** (historial de líneas).
Informe y tareas: `docs/pantallas/compras-plan.md` (12 tareas + 7b enviar a Compras + 7c cómo pagar la campaña). Spikes: `docs/maquetas/plan-campana-vision-2026-10/`. Investigación: `docs/investigacion/2026-10-26-plan-de-campana-*.md`.

## Hecho (con `/construir`, un commit por actividad)

| Actividad | Qué dejó | Estado |
|---|---|---|
| A1 · #2 | El aviso de stock sin cuadrar dice hasta cuándo contarlo («Cuéntalo antes del 27/11: es el último día para pedir») | listo, con pruebas |
| A2 · #1 | Migración `20261026171000`: tabla `planes_compra_lineas_historial` (solo se agrega) y `guardar_plan_compra_linea` de 13 parámetros que la escribe en la misma transacción | probada 22/22, **solo en local** |
| A3 · #1 | La hoja manda la propuesta que mostró (`lib/plan-compra-propuesta-guardada.ts`); si la base no conoce el parámetro repite sin ella | listo, visto en el navegador |
| A4 · #1 | Paso a paso y consultas de huella para pegar en producción (en el ADR) | escrito; **producción espera el OK de Felipe** |
| A5 · #3 | «Los N días que lleva el ERP» en la fila, la hoja y la explicación (`lib/plan-compra-periodo.ts`); `propuestaDeNormal` con los días reales | listo |
| A6 · #3 | Una línea en la hoja de cada categoría: cuánto creerle a los números (`exactitudDeLosDatos`) | listo |
| B1–B4 · #4 | El centro de avisos del Plan como la maqueta (campana con número, línea que asoma, panel flotante), con el aviso de deriva del descuento; sale la franja del plazo y la línea del stock; «Descargar la lista» es solo ícono | listo, probado en local (ADR-0522) |
| C1 · #5 | Pestaña **Presupuesto** y plan con tope (un solo precio de la plata para todas las categorías); los supuestos de la campaña salen del cajón «Resumen» | listo, probado en local, **sin migración** (ADR-0523) |
| C2 · #6 | «Usar el plan con tope» se guarda en el plan y el Plan guarda **versiones** a las que se puede volver (volver no borra: crea otra) | probado 45/45, migración `20261026184000` **solo en local** (ADR-0523) |
| C3 · #7 y mitad de #8 | Pestaña **Calendario**: con cuáles campañas me quedo, cuáles descansan, «cada año / solo este año», campañas propias sin insignia, y «qué dice tu historia» por campaña (misma vara del Historial); el selector, los avisos y Resultados respetan lo decidido. De paso: el «Resumen» a la derecha de las notificaciones y dos contrastes del modo oscuro corregidos | probado 32/32 + 60 pruebas de la lógica, migración `20261026190000` **solo en local** (ADR-0525) |
| C4 · otra mitad de #8 | **«¿Subió la venta?»** en Resultados: al terminar una campaña, cuánto subió la venta esta vez contra los otros años (misma cuenta del Calendario), con enlace a su hoja en el Calendario | listo, probado en local, **sin migración** (ADR-0525, actualización b) |
| C5 · #9 | **Paso 2** de cada categoría: qué modelos, colores y tallas (ranking de modelos con su marca, % de repetir lo que ya vendió, «modelos nuevos por elegir», colores y tallas editables que suman hacia arriba); se guarda por versión y la lista marca «Paso 2 hecho» | probado 21/21 + 25 pruebas de la lógica, migración `20261026204000` **solo en local** (ADR-0526) |

## Pendiente

1. **Pegar las migraciones en producción, en este orden y cada una con tu OK puntual** (ahora son cuatro; la última, `20261026204000`, el paso 2, ADR-0526): `20261026171000` (historial de líneas, ADR-0520, «Pegarla y comprobarla»), `20261026184000` (el precio de la plata y las versiones del plan, ADR-0523) y `20261026190000` (el calendario, ADR-0525; **al pegarla, las campañas de Insignias que nunca tuvieron plan dejan de ofrecerse solas en el selector**: avisar a quien arma los planes). Después, refrescar el diccionario de datos (`pnpm datos:generar:produccion`, `docs/datos/generado/COMO-REFRESCAR.md`) y mirar el check «SQL pegado» del PR.
2. **Abrir el PR con `/abrir-pr`** (Felipe). Trae `main`, revisa reservas y choques, y escribe los choques probables.
3. **Lo que falta del informe, cada una con su OK de Felipe:** #9 Paso 2 por colores y tallas, con el ranking de modelos (spikes ③ y ⑥) · 7b Enviar a Compras (spike ⑦, con migración) · #10 Inversión en mercadería en Finanzas (**varios módulos; contrato con la sesión del Resumen aprobado, falta avisarle cuando exista la función de lectura**) · #13 cómo pagar la campaña (después de #10) · #11 pulido de Formidable · #12 decidir «programa del año». **Ya construidas: #1–#9** (la #9 es el paso 2: spikes ③ y ⑥ juntos).
4. **Que nada lea el historial todavía:** ni la pantalla ni una función lo lee; leerlo es la tarea #6 y la de medir aciertos.

## Lo que quedó fuera de esto (por si se pregunta)

- `plan_compra_historia` S1–S3 fallan en la base local compartida (con y sin esta migración): son datos de ventas del seed local, no de este cambio.
- El servidor de desarrollo del puerto 3013 llevaba días corriendo desde este worktree y se había desfasado (el lateral fallaba al hidratar: «Proveedores» frente a «Revisar compras»), y esa falla hacía que la página se regenerara y perdiera `data-tema="oscuro"`: `tema:auditar` medía en claro y decía «0 hallazgos» sin mirar el oscuro. Se reinició el 2026-10-26 y el auditor midió de verdad (halló y se corrigieron dos contrastes). **Si el auditor da 0 en oscuro, comprobar primero que `document.documentElement.dataset.tema` sigue en «oscuro» tras cargar.**
- `next dev` (16.4) escribe `apps/web/AGENTS.md` al arrancar; no se versiona (no entra a ningún commit de esta rama).
