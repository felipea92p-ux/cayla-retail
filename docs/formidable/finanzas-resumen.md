# Formidable · Finanzas ▸ Resumen, «El Pulso» (camino A)   (`/finanzas/resumen`)

- **Fecha / SHA:** 2026-10-16 · `fc5a966db` (PR #1127 + `main` del día) · **Dispositivo que manda:** escritorio (Mac mini); 375 px se adapta
- **Pregunta que debería resolver:** «¿Estoy ganando plata este mes y qué atiendo primero hoy?» · **Protagonista:** el dinero (lo que queda)
- **Veredicto en una línea:** «Se entiende en 5 s (la ciega dijo "resumen de cómo va el negocio; la respuesta ya está ahí") y le falta que el
  "Sí" y el "33 %" no se contradigan, y que la cuenta cierre a la vista (te quedan S/ 272 de S/ 258 vendidos).»

Cómo se midió: `medir-oficio.js` por Playwright (Chrome del sistema, sin panel) a 1440×900, 1024×768 y 375×812 contra la pila propia con el seed;
prueba ciega con un agente (Sonnet) sobre dos capturas (pliegue y página completa a 1440). Escala: 1 agente por pantalla, sin escéptico aparte
(el escéptico fui yo, con el código y las capturas; marcado donde matiza). Colaboradora real: **sin probar**.

## Notas (0–10)
| Eje | Nota | Evidencia |
|---|---|---|
| 1 Sin manual | 7 | [Observado] ciega: 5 s ✓ («un resumen de cómo va el negocio este mes… la respuesta ya estaba ahí»); tarea «a medias»: respondió «parece que sí, pero no puedo afirmarlo» y eligió bien lo primero (la factura vencida); 3 errores evitables («Pagar» creyendo que solo abre el detalle, «Cerrar el mes», cambiar «TIENDA LIMA» creyendo que filtra). Real: sin probar (tope 8) |
| 2 Una pregunta, una respuesta | 6 | [Observado] la pregunta es una, pero el «Sí» compite con «Todavía no sirve para decidir · 33 %» («no sé cuál creer»); dos selectores de tienda («VER Todas las tiendas» y «TIENDA LIMA»). [Medido] 0 `btn-primario` a la vista: ninguna acción manda |
| 3 Simplicidad profunda | 5 | [Observado] cuentas que no cierran a la vista: «te quedan S/ 272» > «vendiste S/ 258» (y Trujillo +203 de 127 vendidos); «Ya cubriste todo lo fijo» junto a «no hay nada fijo registrado»; «DEBES EN 7 DÍAS» cuya única deuda venció hace 15 días; «(100 %)» en un bloque que dice que no se puede calcular. [Código] `pulso-reglas.ts:140`: con `fijoMes = 0`, `diaCubre <= dia` y sale «Ya cubriste» |
| 4 Lenguaje de tienda | 7 | [Observado] 5 palabras no entendidas: «Dynamic», «Cuentas “por abonar”», «unidades», «cajones», «Probar escenario» |
| 5 Contenido primero | 8 | [Medido] la cifra es lo más grande de la pantalla (84 px, 25 431 px² de área, más que el título de 30 px) |
| 6 Lo difícil, a un toque | 7 | [Código] «¿Por qué S/ 272?» abre la cascada a un toque ✓; [Observado] la ciega no supo si abre algo o cambia de pantalla; «Si pasas el mouse, dice de qué pantalla sale» (la propia guía lo dice): solo con hover |
| 7 Perdonar antes que preguntar | 7 | [Código] «Pagar», «Cerrar el mes» y «Clasificar» abren una hoja que confirma; [Observado] la ciega no lo sabe y por eso no los tocaría: falta decir «abre…» |
| 8 Quitar antes de agregar | 6 | [Observado] 15 dudas; la ciega usó la cascada de cifras y cuadró a mano (69 + 203 = 272; 50 530 − 5 134 = 45 396) porque la pantalla no lo dice; «Probar escenario» y «Ver cuentas» sin saber qué son |
| 9 De punta a punta | 7 | [Medido] 375 px sin desborde horizontal; [Observado] vacíos cuidados («Todavía no hay un mes completo con ventas para calcularlo»), pero con un «(100 %)» huérfano al lado |
| **Leyes (promedio)** | **6,7** | ley 3 en 5 |
| **Oficio visual** | **5** | [Medido] fallan 5 de 8 comprobaciones propias: blanco de 20 px («¿Por qué S/ 272?», es un botón suelto, no un enlace en una frase), rojo en 9 piezas (tope 2: barras del flujo, «DEBES», puntos de «Para decidir hoy»), 5 radios distintos (12 · 8 · 4 · 16 · píldora), 1 fila de controles con alturas desiguales, bordes a 1–3 px («Cuadrar el banco» 986 vs 987). Pasan: contraste (0 textos bajo 4,5:1), espaciado en pasos de 2 px, sin sombras. Del chrome global, aparte: «Salir» 37×16, «Retail» 10 px, «Ctrl» 10 px, «Felipe Alvarez» a 2 px, radio del avatar |

## Los 3 cambios de mayor impacto (presentación: esperan el OK de Felipe)
1. **El «Sí» habla con el medidor.** Antes → «● Sí» en verde junto a «Todavía no sirve para decidir · 33 %». Después → el chip toma el nivel de confianza: bajo 50 % dice «Por ahora sí» en ámbar y la frase bajo la cifra agrega «con lo registrado hasta hoy (33 % seguro)». Ley 3 · verif.: ciega repetida no reporta la contradicción · esfuerzo S · decide Felipe (presentación; la regla de confianza no cambia).
2. **La cuenta cierra a la vista.** Antes → «De los S/ 258 que vendiste, esto es lo que queda tuyo» con S/ 272. Después → cuando lo que queda supera lo vendido, la frase nombra lo que suma («+ S/ 140 de sobrantes de caja y otros ajustes»), sin abrir «¿Por qué?». Ley 3 · verif.: con el seed, la frase menciona el tramo «Otros ajustes a favor» de la cascada · esfuerzo S · decide Felipe.
3. **Un solo selector de tienda, o que se expliquen.** Antes → «VER Todas las tiendas» en la cabecera de Finanzas y «TIENDA LIMA» arriba a la derecha. Después → el «VER» dice «Mirando: Todas las tiendas · tu sede sigue siendo Lima» (o el selector de sede se atenúa dentro de Finanzas). Ley 2 · verif.: la ciega deja de contar el cambio de sede como error evitable · esfuerzo M · decide Felipe. Transversal a las cinco pantallas de Finanzas con «VER».

## Lo que sobra (ley 8)
- «(100 %)» en «¿Cada tienda cubre sus costos?» cuando el bloque dice que no hay mes completo: se esconde hasta que haya dato.
- «Si pasas el mouse, dice de qué pantalla sale»: la fuente de cada cifra ya está escrita en cada aviso («sale de Cuentas y dinero · Por pagar»); el hover sobra.

## Lo que no pediste y importa más
«Ya cubriste todo lo fijo de octubre» con cero fijos registrados es una afirmación falsa que el medidor de al lado desmiente: `ritmoPulso`
(`lib/pulso-reglas.ts:140`) toma `fijoMes = 0` como «cubierto». Con fijos en cero la frase debería ser «No hay fijos cargados: cárgalos para
saber cuándo los cubres». Es una regla de texto, no de dinero; una línea con su prueba.

## Lista aparte (no se ejecuta)
- «DEBES EN 7 DÍAS» cuenta una factura vencida hace 15 días: el título dice lo que vence, el contenido lo que ya venció («Debes ahora»).
- «Para decidir hoy» ordena por «lo que más cuesta si se deja pasar» pero S/ 5 134 va antes que «faltan S/ 7 057»: decir el criterio o reordenar.
- «Pagar», «Cerrar el mes», «Clasificar», «Ver cuentas»: el botón dice el verbo pero no si abre una hoja o actúa; «Pagar…» con puntos suspensivos.
- La primera barra del flujo (S/ 45 396) es «plata disponible − lo vencido» y nadie lo dice.
- «Cuentas “por abonar”», «unidades», «cajones», «Dynamic»: vocabulario interno a la vista.
- Oficio: «¿Por qué S/ 272?» como botón de 32 px de alto; el rojo solo para lo que frena (hoy también colorea barras y puntos).

## Prueba ciega
| Medida | Resultado |
|---|---|
| Lectura de 5 s | ✓ «un resumen de cómo va el negocio este mes… la respuesta a mi pregunta ya estaba ahí» |
| Primer intento | a medias: «parece que sí, pero no puedo afirmarlo»; lo primero a atender, bien (factura vencida) |
| Pasos | 10 |
| Dudas | 15 («Sí» vs 33 %; 272 > 258; «cubriste todo lo fijo»; S/ 16 al día; dos selectores; S/ 50 000 sin arranque; «DEBES EN 7 DÍAS»; IGV S/ 0 con saldo a favor; «(100 %)»…) |
| Palabras no entendidas | 5 |
| Errores evitables | 3 |

## Antes de decir «listo»
- Concurrencia: pantalla de solo lectura; no aplica. · Caída externa: si `fn_resumen_finanzas` no responde, la pantalla dice «No se pudo leer el resumen.» y el medidor «No se pudo medir.» [código `ResumenFinanzas.tsx:58,92`]; sin pérdida de datos. · Persona sin contexto: ciega ✓ (sobre capturas) · real sin probar.

## Historial
| Fecha | SHA | Leyes | Oficio | Cambios cerrados |
|---|---|---|---|---|
| 2026-10-16 | fc5a966db | 6,7 | 5 | — (primer análisis; los 3 cambios esperan OK) |
