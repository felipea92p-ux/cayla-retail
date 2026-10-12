# ADR-0350 · Formidable: el iPhone llevado al ERP (nueve leyes y un eje de oficio visual)

- **Fecha:** 2026-10-05 · **Estado:** skill escrito (`.claude/skills/formidable/`) y **primera corrida del piloto hecha** sobre Inventario ▸ Frescura del piso
  (`docs/formidable/inventario-frescura.md`): leyes 4,5 (±1), oficio 5 provisional, ley 1 sin nota. Solo documentos y skill: sin migración y sin cambios en la web.
- **Pedido:** Felipe, 2026-10-05: «resolver el tema de interfaz, UI, UX y utilidad; que la persona entienda de forma muy intuitiva, al estilo Apple»,
  «el iPhone llevado al ERP», y «trabajemos principios en lugar de cosas específicas». Se decidió en 44 preguntas con opciones («Ganas / Pagas»).
- **Complementa, no reemplaza:** `/pantalla` (analiza una captura y propone 12 tareas), `/focus` (ADR-0284: qué falta al llenar), `/sugerir`
  (ADR-0290: ejemplos coherentes), `/multi-view-responsive` (mide escritorio) y `skill-optimizacion-ui-ux-perf` (velocidad). **Ninguna mide si una
  persona entiende la pantalla sin ayuda**; ese era el hueco.

## Qué había

La captura de Frescura del piso (2026-10-05) funciona y es limpia, pero exige entender estadística: «2 *quizá más* días», «vendió 1, se esperaban
0.6», «Pocos datos» tres veces en una fila, siete columnas y un párrafo naranja arriba. **El problema no es la estética: es el lenguaje y la carga
mental.** Hoy nada en el repo lo detecta.

## Decisión

**Una pantalla Formidable se entiende en 5 segundos sin manual.** Se califica con dos notas separadas, cada una con evidencia etiquetada
(**Medido / Observado / Opinión**, el modelo del artefacto «Rápido por diseño»):

| | |
|---|---|
| **9 leyes** (el orden es la prioridad si chocan) | 1 sin manual · 2 una pregunta, una respuesta · 3 simplicidad profunda (traducir a veredicto, no esconder) · 4 lenguaje de tienda («tú», neutro peruano) · 5 contenido primero (ver antes que leer) · 6 lo difícil a un toque en «¿Por qué?» · 7 perdonar antes que preguntar (confirmar solo lo irreversible) · 8 quitar antes de agregar · 9 de punta a punta (vacíos, errores, primer uso, 375 px) |
| **Oficio visual** (eje aparte, medible) | alineación, espaciado en múltiplos de 4, jerarquía, radios y alturas, contraste, foco, teclado; blancos 24 mín. / 32 objetivo con mouse y 44 con dedo (WCAG 2.2 y guías de Apple) |
| **Dispositivo** | escritorio primero (Mac mini con mouse y teclado); tablet y 375 px se adaptan. Vender, Cambios y Devoluciones conservan el celular obligatorio (PL-105) |
| **Prueba** | agente ciego sin contexto (barato, repetible) + 3 a 5 colaboradoras reales; se observa lo que hacen, no lo que opinan. La ley 1 no pasa de 8 sin la pasada real |
| **Informe** | los **3** cambios de mayor impacto (no 12), «lo que sobra» y «lo que no pediste»; antes/después al mismo ancho |
| **Autonomía** | analiza → propone → espera el OK → implementa |
| **Candados** | puede proponer cambiar reglas de negocio con justificación, pero **dinero y precios, stock y movimientos, permisos y roles** esperan SIEMPRE el OK de Felipe; **comprobantes/SUNAT también, por CLAUDE.md, aunque Felipe no lo marcó** |
| **Costo** | hasta 4 agentes (medidor, ciego, revisor de leyes, escéptico), avisando la escala antes; `rapido` = solo el script, sin agentes |
| **Cumplimiento** | obligatoria **con tablero** (`docs/formidable/README.md`) **sin prueba en el CI al inicio**; se ofrece sola al terminar una pantalla. Despliegue módulo por módulo |
| **Intocables** | tokens (ADR-0169), movimiento sin rebote (ADR-0136), loader único (ADR-0149); si una medición choca con un token, se reporta y se decide con un ADR |
| **Sonido** | solo confirma lo importante y siempre apagable (no está implementado por esta decisión; ADR-0344 es el único antecedente) |

**DECIDÍ:** un skill propio con núcleo de una página y referencias bajo demanda, que orquesta los skills existentes y agrega leyes, oficio visual
y prueba ciega.
**DESCARTÉ:** reemplazar `/pantalla`, `/focus` y `/sugerir` con un solo skill, porque rompe lo que ya funciona y tiene pruebas; y una lista
de 30 reglas, porque nadie la recuerda ni la aplica (Apple no se hizo así).
**SE ROMPE SI:** (1) la prueba ciega da falsa seguridad porque un modelo no es una colaboradora con una clienta delante — por eso la nota de la ley 1 se
topa en 8 hasta la pasada real; (2) la «traducción a veredicto» de la ley 3 inventa una certeza que la regla de negocio no tiene (una prenda
«va bien» con 4 ventas) — por eso el veredicto debe incluir el nivel de confianza bajo «¿Por qué?» y los casos de pocos datos dicen qué falta;
(3) una pantalla de análisis que *necesita* columnas se «simplifica» hasta perder lo que la líder usa — por eso la ley 8 propone, no ejecuta, y
exige evidencia de uso.

## Lo que queda abierto (decide Felipe)
1. **Cuándo pasar a prueba en el CI** (hoy no): cuando una pantalla piloto fije qué es «bueno».
2. **Qué hace «Por decidir / Decididas»** en Frescura del piso: la ley 1 pregunta qué se decide; la respuesta es negocio, no diseño.
3. **Medir qué dispositivo abre cada ruta**: «sobre todo Mac mini» es una afirmación de Felipe, no un dato; antes de bajar la prioridad táctil de un módulo, se mide.

## Lo que enseñó el piloto (ajustes ya hechos al skill)
- **El escéptico paga.** De 14 hallazgos de los tres primeros agentes, 7 cayeron o se achicaron: una cuenta de columnas inventada (10 en vez de 7), enlaces
  en línea que WCAG exceptúa, defectos que eran del chrome global y un «problema» que era un acierto. Por eso ningún hallazgo entra sin su veredicto (`informe.md`).
- **El script de medición tenía tres errores míos**, que solo apareció al medir la pantalla real: no leía colores `oklab()` (67 falsos contrastes), contaba
  enlaces en línea como blancos pequeños y exigía múltiplos de 4 px cuando Tailwind admite medios pasos. Corregidos y vueltos a probar sobre la pantalla.
  La lección: un medidor probado solo con páginas de juguete no está probado.
- **El entorno decide qué se prueba.** La base local (4 prendas, ninguna envejecida, sin migraciones recientes) impidió que la ciega llegara a la decisión que la
  pantalla existe para tomar. `prueba-ciega.md` ahora pide verificar que la tarea es alcanzable antes de lanzarla.

Detalle de leyes, medidas, prueba y fuentes: `.claude/skills/formidable/` (`SKILL.md` y `referencia/`).
