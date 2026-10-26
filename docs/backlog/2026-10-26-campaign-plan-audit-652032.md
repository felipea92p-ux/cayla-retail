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

## Pendiente

1. **Pegar la migración `20261026171000` en producción** (Felipe, tras el OK puntual): ver el ADR-0520, «Pegarla y comprobarla». Después, refrescar el diccionario de datos (`pnpm datos:generar:produccion`, `docs/datos/generado/COMO-REFRESCAR.md`) y mirar el check «SQL pegado» del PR.
2. **Abrir el PR con `/abrir-pr`** (Felipe). Trae `main`, revisa reservas y choques, y escribe los choques probables.
3. **Tareas #5 a #13 del informe**, cada una con su OK de Felipe: #5 pestaña Presupuesto y plan con tope · #6 versiones del plan (sobre el historial de A2) · #7 calendario del plan · #8 historia por campaña · #9 paso 2 por modelos, colores y tallas · #10 Inversión en mercadería en Finanzas (**varios módulos; contrato con la sesión del Resumen aprobado, falta avisarle cuando exista la función de lectura**) · #11 pulido · #12 decidir «programa del año» · 7b enviar a Compras · #13 cómo pagar la campaña (después de #10).
4. **Que nada lea el historial todavía:** ni la pantalla ni una función lo lee; leerlo es la tarea #6 y la de medir aciertos.

## Lo que quedó fuera de esto (por si se pregunta)

- `plan_compra_historia` S1–S3 fallan en la base local compartida (con y sin esta migración): son datos de ventas del seed local, no de este cambio.
- El servidor de desarrollo del puerto 3013 lleva días corriendo desde este worktree y quedó desfasado (el lateral falla al hidratar: «Proveedores» frente a «Revisar compras»); la página se recupera sola en el cliente. Reiniciarlo lo arregla.
