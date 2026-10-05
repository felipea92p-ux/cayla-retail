# Las 9 leyes de Formidable — prueba, ejemplo y cura

Cada ley tiene: **de dónde sale** (nivel de evidencia en `fuentes.md`), **prueba** (pasa / falla, sin «me parece»), **falla típica** y **cura**.
Los ejemplos salen de la captura de **Inventario ▸ Frescura del piso (2026-10-05, Tienda TRU, 1440 px de ancho)**, la pantalla piloto. Cada
afirmación sobre esa captura es **[visto]**; la lectura de por qué falla es **Opinión** hasta que la prueba ciega la confirme.

El orden es la prioridad: si dos leyes chocan (p. ej. «quitar» contra «sin manual»), gana la de número menor.

---

## 1 · Sin manual
**Fuente:** Nielsen (reconocer en vez de recordar; ayuda visible) y Norman (la señal debe decir qué hacer). Verificado.
**Prueba:** un agente ciego y, si se puede, una colaboradora, completan la tarea al primer intento y con **0 preguntas**; a los **5 s** dicen
qué es la pantalla y qué sigue. Falla si alguien necesita que se la expliquen.
**Falla típica [visto]:** las pestañas «Por decidir 5 · Decididas 0»: ¿decidir qué, y entre qué opciones? El nombre no lo dice.
**Cura:** el título y el primer renglón dicen qué se decide; el siguiente paso aparece como botón con verbo.

## 2 · Una pregunta, una respuesta
**Fuente:** «Focus» (Isaacson sobre Jobs: decidir qué NO hacer es tan importante como decidir qué hacer) y la deferencia de las guías de Apple.
**Prueba:** la pantalla se resume en **una pregunta escrita en una frase** y tiene **una sola acción primaria** (`btn-primario`) a la vista.
Falla si hay dos preguntas distintas o dos botones que compiten.
**Falla típica [visto]:** cuatro cifras arriba, un párrafo naranja, filtros, una nota en negrita y recién después la tabla; el título es el
nombre del módulo («Frescura del piso»), no la pregunta que resuelve.
**Cura:** nombra la pregunta («¿Qué prendas llevan demasiado tiempo colgadas?») y deja arriba solo lo que la contesta.

## 3 · Simplicidad profunda
**Fuente:** Isaacson, sobre Jobs e Ive: la simplicidad que *vence* la complejidad, no la que la esconde. Reportado (biografía).
**Prueba:** ninguna cifra o estado complejo aparece crudo: cada uno se muestra como un **veredicto** de una palabra o frase («va bien»,
«revísala»), y el cálculo vive bajo «¿Por qué?» (ley 6). Falla si se ve un decimal de probabilidad, «esperado», «mediana», «percentil» o «quizá».
**Falla típica [visto]:** «2 *quizá más* días», «vendió 1, se esperaban 0.6», «Más rápida que las demás», «Pocos datos» (tres veces en una fila).
**Cura:** traduce a lo que la persona haría: «Se vende bien, déjala» / «Lleva 18 días sin salir: considera rebajarla». Si la regla misma es
difícil de traducir, propón simplificar la regla (candado 2 de `SKILL.md`: dinero, stock, permisos y SUNAT esperan el OK de Felipe).

## 4 · Lenguaje de tienda
**Fuente:** Nielsen (que el sistema hable el idioma de la persona). Verificado. Voz decidida por Felipe: «tú», español neutro peruano, sin modismos.
**Prueba:** el agente ciego **repite cada texto con sus palabras** sin equivocarse; ningún término sale de la lista de jerga (`estados internos`,
`quartil`, `tasa`, `elasticidad`, nombres de columna de la base). Se respeta el vocabulario del repo: cliente, sede, colaborador. Frases de
≤ 12 palabras como regla práctica (Opinión).
**Falla típica [visto]:** «Vigente / Envejecida / Crítica» son nombres de estados internos; «Nueva antes de 2 d · Vigente desde 2 d» exige
entender una escala; «Referencia de CAYLA: todas las tiendas juntas, la mitad se vende antes de 2 días».
**Cura:** nombra el estado por lo que significa para quien actúa («Recién llegada», «Se está quedando», «Hay que moverla»).

## 5 · Contenido primero
**Fuente:** deferencia (Apple HIG): la interfaz no compite con el contenido. Verificado.
**Protagonista por módulo:** Inventario = la **prenda** (foto, nombre, color) · Ventas = el **cliente** · Finanzas = el **dinero**. Un
módulo nuevo declara el suyo en el informe.
**Prueba:** el protagonista es el elemento **más grande y de mayor contraste** de su zona (se mide: área y contraste); la foto va antes que el
texto (**ver antes que leer**: foto, color, forma o barra primero; el texto solo confirma).
**Falla típica [visto]:** la prenda es una miniatura-ícono de ~40 px; las tarjetas de cifras y el párrafo naranja pesan más que cualquier prenda.
**Cura:** la prenda sube de tamaño; el marco (cifras, filtros, notas) baja de peso.

## 6 · Lo difícil, a un toque
**Fuente:** divulgación progresiva (Nielsen, diseño minimalista) y Apple (profundidad). Verificado.
**Prueba:** el detalle técnico («¿por qué dice esto?») existe, se abre con **un toque** en «¿Por qué?» —nunca depende de hover, que no existe en
tablet— y **no está a la vista por defecto**. Falla si falta (no se puede saber cómo se calculó) o si siempre está a la vista.
**Falla típica [visto]:** la leyenda «Nueva antes de 2 d · … con 4 ventas de los últimos 120 días» y «Referencia de CAYLA…» están siempre abiertas.
**Cura:** el veredicto arriba; «¿Por qué?» abre rangos, referencia y cuántas ventas lo sostienen.

## 7 · Perdonar antes que preguntar
**Fuente:** Nielsen (control y libertad: salida de emergencia, deshacer) y Apple (la persona manda). Verificado.
**Prueba:** inventario de acciones de la pantalla, cada una clasificada **reversible / irreversible**. Un «¿Seguro?» en algo reversible falla;
una acción irreversible sin resumen previo también. **Irreversible = dinero, stock, comprobantes, borrado** → confirmación con resumen. Lo
reversible (filtros, selección, borradores, «marcar visto») ofrece «Deshacer» unos segundos.
**Falla típica:** el «¿seguro?» puesto por costumbre en lo reversible, o ausente donde mueve stock. Verifica leyendo el código, no la captura.
**Cura:** reclasifica; confirma lo irreversible con el resumen de qué cambiará; ofrece Deshacer en lo demás (solo estado de interfaz).

## 8 · Quitar antes de agregar
**Fuente:** Jobs (reducir la línea de productos para enfocar) y Carmack («el código que no existe no tiene bugs»). Reportado / criterio del repo.
**Prueba:** por cada elemento visible: ¿ayuda a decidir lo que la ley 2 dice? ¿quién lo usó en el último mes (si se puede medir)? Los que no,
se proponen para **esconder o quitar de la vista**, con el porqué. **Calidad sobre cantidad:** el informe propone **3 cambios**, no 12.
**Nunca borra datos** (candado 3).
**Falla típica [visto]:** 7 columnas (Prenda, Tallas, En el piso, Estado, Rapidez, Vendió 30 d, Qué hacer); el aviso «¿De qué temporada es?
Complétala» es una tarea de *catálogo* metida dentro de una pantalla de *frescura*.
**Cura:** una fila = una prenda = **una frase** y una acción (foto, nombre, lectura, botón); el resto bajo «¿Por qué?» o en su pantalla.

## 9 · De punta a punta, hasta el último detalle
**Fuente:** «Take responsibility end to end» (Isaacson sobre Jobs) y la lección de «cuidar lo que no se ve». Reportado.
**Prueba:** recorrer **todos los estados** de la pantalla y ver que cada uno está cuidado: vacío, sin datos, error, cargando (ADR-0149), éxito, sin
permiso, sin conexión, primer uso, 375 px. Falla si un estado muestra texto de sistema, un código, un hueco o una disculpa.
- **Sin datos / vacío:** *dice qué falta y cómo conseguirlo* («todavía no hay ventas de esta prenda; en unos días verás su ritmo»), no «sin datos».
- **Error:** tres líneas: qué pasó, qué se conservó, qué sigue; sin culpar, sin código, lo escrito se conserva.
- **Primer uso:** la pantalla se explica sola; **cero tours**.
**Falla típica [visto]:** «sin datos aún» repetido tres veces en la misma línea de rangos; «Nada por ahora» como única acción de la columna final.
**Cura:** un texto cuidado por cada estado, escrito por la ley 4.

---

## Qué no es una ley
No son leyes (ya están cubiertas por ADRs o por otras skills, no se duplican): consistencia de piezas (ADR-0169, ADR-0136), loader y avisos
(ADR-0149), guía de foco al llenar campos (`/focus`, ADR-0284), ejemplos coherentes (`/sugerir`, ADR-0290), responsive de escritorio
(`/multi-view-responsive`).
