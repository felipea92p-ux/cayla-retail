# Auditoría al milímetro — Empresas aliadas: Configuración, la hoja de la aliada y los filtros «Empresa» · 2026-11-21 · `claude/multi-empresa-rus-tienda-c7129a`

Medido: 1440×900 claro quieto · 1440×900 oscuro · 375×812 claro. Servidor: `localhost:3091` contra la base local compartida, cuenta Admin en Tienda Lima.
Medidores (`.claude/skills/*/referencia/medir.js`, corridos por `fetch` + `eval` desde una copia temporal en `public/__medir`, borrada antes del commit):
`milimetro` (estados, y una segunda pasada con `{ foco: true }` tras un Tab real), `espacio`, `tipografia`, `color` y `textos`. `movimiento` y `graficos` no se
corrieron: no cambió ninguna animación ni hay gráficos nuevos.
Alcance, con `window.__milimetro.raiz`:
- La sección `[data-guia="config.aliadas"]`: tarjetas, interruptor de campañas y «Agregar empresa aliada».
- La hoja `[role=dialog]` «Nueva empresa aliada».
- El panel `[data-guia="historial.filtros-panel"]` con la píldora «Empresa».
- La píldora «Empresa» de Existencias, que es la misma pieza (`DesplegablePildora`).
- La pregunta «¿A qué número pagó?» de Vender: no se midió; se vio a 375 px en la actividad 4 (reusa el botón de «¿Con qué máquina?»).

Resumen: **1 grave (arreglado) · 1 leve (arreglada) · 3 heredadas** · Historial ya no se cae si la base todavía no sabe filtrar por empresa, y la tarjeta de la aliada quedó en la escala de 4 px.

## Graves

1. **Historial se caía con `?emp=` en una base sin la migración 20261121175000.** Dónde: `app/(app)/vender/historial/page.tsx`. Medido: la pantalla mostraba
   «Esta pantalla no está mostrando datos» con la base local sin `empresas_de_la_venta`. Regla: principio 9 de `CLAUDE.md` («se degrada con gracia»).
   Arreglo: `baseFiltraPorEmpresa` (`lib/ventas-historial.ts`) prueba el filtro con una consulta de una fila; si la base no sabe, la lista sale entera.
   Verificado en el navegador: sin la columna, Historial carga.

## Leves

1. **La tarjeta de la aliada usaba 22 px de relleno y 6 px entre chips**, fuera de la escala de 4. Dónde: `.vs-aliada` y `.vs-aliada-fila`
   (`app/estilos/vidrio/vitrinas-sedes.css`). Pasó a `20px 24px` y `gap: 8px`. Verificado: a 375 px ya no sale en `espacio`.

## Heredadas (no son de esta rama)

1. **El interruptor apagado tiene contraste 1.11 contra la tarjeta** (`color`, 1440 claro y oscuro). Pasa igual en los otros dos interruptores de
   Configuración: es la pieza decidida `<Interruptor>` (WCAG 1.4.11 pide 3:1 para el límite de un control) → `/unificar`, familia `casilla`.
2. **El texto «Con los 11 dígitos, “Buscar” trae el nombre…» mide 13 px.** Sale de `ConsultaDocumento`, la pieza compartida de DNI y RUC.
3. **El globito de la cuenta de `TituloSeccion` mide 10,5 px y pide cifras tabulares que DM Sans no tiene.** Es la propuesta 1 de `/tipografia`.

## Sin fallas

- **Estados:**
  - El foco se ve en los 3 controles de la sección: sin anillo flojo y sin quedar tapado.
  - Lo elegido se anuncia: el chip «Empresa: CLAURE» y el `aria-checked` del interruptor.
  - El único botón apagado de la hoja es «Buscar», que dice su motivo a la vista.
  - «Guardar» confirma con la guía.
- **Contraste:** 0 textos fallan en claro y 0 en oscuro.
- **Medidas:** las píldoras miden 32 px de alto. A 375 px no hay desborde ni blancos de menos de 44 px.
- **Textos:** «CLAURE» en mayúsculas es el nombre de la empresa tal como está registrado, no un texto escrito a mano.

## No medido

- `movimiento` y `graficos` (no aplican).
- La hoja «Dar de baja», abierta con datos reales: abrirla en la base local exige una aliada sin prendas.
- La píldora de Existencias medida por separado: es la misma pieza que la de Historial.
