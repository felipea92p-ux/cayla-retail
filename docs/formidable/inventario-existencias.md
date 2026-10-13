# Formidable · Inventario ▸ Existencias: la tarjeta y el modal de la prenda   (`/inventario`, `?variante=`)

- **Fecha / SHA:** 2026-10-12 · `f2202e6ca` (+ los arreglos de esta corrida, sin commit al medir) · **Dispositivo que manda:** escritorio (Mac mini)
- **Pregunta que debería resolver (1 frase):** «¿Cuántas de esta prenda puede comprar el cliente ahora, dónde está el resto y qué me toca hacer?» · **Protagonista:** la prenda
- **Veredicto en una línea:** «Se entiende en 5 s (la ciega leyó bien el número grande y el "+N guardadas"), pero la pantalla se contradecía a sí misma en tres lugares —todos corregidos hoy— y lo nuevo que vino a mostrar, lo guardado, es su texto más chico.»
- **Alcance:** la tarjeta nueva (ADR-0391, una columna por talla), las cifras que filtran, el modal «Foto y lista» y su pestaña «Todas». El resto de la pantalla (barra de filtros, cabecera del módulo) se mide como chrome y se reporta aparte.
- **Cómo se midió:** `medir-oficio.js` con el Chrome del sistema vía Playwright (el panel del escritorio estaba oculto) a 1440×900, 1024×768 y 375×812, sobre la pantalla y sobre el modal solo (`[role=dialog]`); capturas en `.chaos/formidable-existencias/` (local). Prueba ciega sobre las capturas (Sonnet, formato de seis medidas exigido) y escéptico (Sonnet, 20 hallazgos: 9 confirmados, 8 matizados, 3 refutados, 0 no verificables). El modo oscuro no se repitió aquí: `tema:auditar` lo cubrió el mismo día (0 hallazgos solo en oscuro). Todas las capturas corren con el motor del piso mudo (`plan === null`, la base local no tiene `fn_piso_plan_lectura`); el escéptico separó lo que eso fabrica.

## Notas (0–10)
| Eje | Nota | Evidencia |
|---|---|---|
| 1 Sin manual | 7 | [Observado] ciega: a los 5 s «la lista de lo que hay de ropa en mi tienda; el número grande es lo colgado y el +6 lo que está atrás»; llegó a «Colgar en el piso» en 2 toques seguros (4 con los supuestos); dudas en 10 puntos (ver tabla) · real: sin probar |
| 2 Una pregunta, una respuesta | 6 | [visto + escéptico F9 MATIZADO] en «Qué hago» la acción sugerida va primera y teñida, pero no hay UNA primaria; las otras cuatro pesan igual; la pantalla no tiene `btn-primario` (cada tarjeta lleva el suyo) |
| 3 Simplicidad profunda | 6 | [código F13 CONFIRMADO] «Todas» decía «Todo en el piso» con 4 tallas a 0 colgadas (solo miraba al motor) — **corregido**; [código B3 MATIZADO] tres reglas para «por colgar» (filtro: motor; tarjeta: máx(motor, físico); modal: motor o números); los veredictos de la talla («Falta colgar · Cuelga 1», «Todo bien») sí traducen |
| 4 Lenguaje de tienda | 6 | [Observado B2 CONFIRMADO] «Otras tiendas: Taller 14» contra «Pedir (ninguna tienda tiene)» — **corregido** («Otras sedes»); [código F10 CONFIRMADO] dos vocabularios dentro del modal («0 piso» en las fichas, «unidades en almacén» en las acciones, «colgadas/guardadas» en las casillas); [Observado B4] la leyenda con cifras de ejemplo se leyó como total; [Observado B5] «la columna dice N/D» en la vista de tarjetas; no entendió «Subir», «Rótulo» vs «Etiquetas», «CMS-0001» |
| 5 Contenido primero | 7 | [visto] la foto grande manda en el modal y el número grande en la tarjeta; [Medido F1 CONFIRMADO] «+N guardadas» a 10,5 px y el nombre de la talla a 11 px: lo más chico de la tarjeta es lo que ADR-0391 vino a mostrar; [Medido F4 MATIZADO] la primera prenda a 419 px (1440×900) y 567 px (1024×768), casi todo chrome y cabecera del módulo |
| 6 Lo difícil, a un toque | 7 | [Observado B6 MATIZADO] «Cuelga 1: no hay en el piso y hay 7 en almacén» no dice por qué 1 (es el mínimo de fábrica) pero el paso siguiente pregunta «¿Cuántas?» con «Todas (7)»; la lectura del ritmo se explica sola |
| 7 Perdonar antes que preguntar | 9 | [código + /chaos] colgar confirma con «Así va a quedar» y un botón final (stock = irreversible); los filtros y las vistas no preguntan; «¿Salir sin guardar?» solo con un paso sucio (`antesDeCerrar`) |
| 8 Quitar antes de agregar | 7 | [visto F6 MATIZADO] «En camino: 0» siempre a la vista como texto suelto; [Observado B1 MATIZADO] los atajos de teclado (1·4·3·7·6) sin rótulo se leyeron como cantidades; a favor: salieron «Eliminar», el «N en esta sede» de 46 px y las acciones imposibles pasaron a una línea |
| 9 De punta a punta | 7 | [Observado B5 CONFIRMADO] el estado de error del motor habla de «la columna» y de «N/D»; [Medido F5 MATIZADO] a 1024×768 la lista cabe pero las fichas de talla quedan al filo del pliegue; [Medido F11] a 375 px «Cerrar» 28 px y los círculos 30 px (Inventario es de escritorio); el foco al cerrar caía al lateral (F8) — **corregido**, también desde «Más ⌄»; oscuro: 0 hallazgos |
| **Leyes (promedio)** | **6,9** | la ley 1 no pasa de 8 sin la pasada real |
| **Oficio visual** | **5** | [Medido] 6 de 12 comprobaciones fallan (sin blockers): #2 blancos con dedo (28–40 px), #6 texto bajo 12 px (10,5 y 11 px en la tarjeta; 11 y 11,5 px en el modal), #7 un borde a 1 px («Dónde está» contra su texto) y el cuadrito de la leyenda que se iba solo a un renglón — **corregido**, #8 huecos de 1 y 3 px en las columnas de talla, #9 ocho tamaños de texto en el modal, #10 radios sueltos (9, 11, 14 px fuera de la escala; la escala del sistema ya son 6 valores, no 3). Pasan: #1 blancos con mouse (los círculos de color tienen su `::after` de 26–32 px, F2 refutado), #3 contraste (tras subir tres ceros a taupe pleno: 5,6:1), #11 solo tokens y ≤ 2 rojos, #12 teclado (60 Tab sin salir del modal, Enter/Esc), #13 sin sombras pegadas al fondo, #14 orden de pantalla. No medidos: #4 y #5 (contraste del foco) |

## Los 3 cambios de mayor impacto (esperan el OK de Felipe)
1. **Que lo guardado se lea: la talla y «+N guardadas» a 12 px.** Antes → después: `text-[11px]` / `text-[10.5px]` → 12 px en las dos líneas chicas de la columna (`ColumnasTallas`, `ExistenciasTarjetas.tsx`); el escéptico midió que «+6 guardadas» cabe a 12 px en una tarjeta de 3 tallas (75 px en 107) y en 4+ ya va «+N». Ley 5 y oficio #6. Verifica: `medir-oficio.js` → `textoChico` sin elementos de la tarjeta. Esfuerzo S. Decide Felipe (presentación).
2. **Nada que parezca un dato sin serlo.** (a) La leyenda al pie («**2** colgadas en el piso · **+1** guardadas en el almacén») sin cifras de ejemplo: «el número grande: colgadas en el piso · debajo: +guardadas en el almacén», con sus muestras ámbar y rojo (la ciega la leyó como total y la comparó con los 6/183 de la cabecera; ADR-0290). (b) Los atajos de teclado de «Qué hago» (1·4·3·7·6) con rótulo («tecla 1») o visibles solo cuando se usa el teclado (la ciega los leyó como cantidades). Leyes 4 y 1. Verifica: ciega nueva sobre la captura; `pnpm sugerir` limpio. Esfuerzo S. Decide Felipe (presentación).
3. **Un solo vocabulario dentro del modal.** Las fichas de talla «0 piso» → «0 colgadas»; las subfrases «7 unidades en almacén» → «7 guardadas»; «en piso / en almacén» de las frases de «Qué toca» → «colgadas / guardadas» (`pieDeTalla`, `accionesDeTalla`, `queTocaConLaTalla` en `lib/existencias-panel-talla.ts`). Ley 4. Verifica: `grep -c "piso\b"` en las frases del modal = 0 fuera de «Colgar en el piso»; prueba del `lib`. Esfuerzo S. Decide Felipe (es el vocabulario que él no objetó en la propuesta, pero cambia textos que ya se usan).

## Lo que sobra (ley 8)
- «En camino: 0» como texto suelto cuando es 0: solo importa cuando viene algo (alimenta «¿Pedir?»); esconderlo en 0 o apagarlo como las casillas.
- Los atajos de teclado a la vista para quien usa el mouse (ver cambio 2b).

## Lo que no pediste y importa más
**Tres reglas distintas responden «¿falta colgar?» en la misma pantalla:** el filtro «Por colgar» cuenta solo lo que marca el motor (`hoyDeTalla`), la tarjeta toma el máximo entre el motor y los números (`botonDeTarjeta`) y el modal dice «Falta colgar» con el motor O con los números (`queTocaConLaTalla`). Hoy las tres tiendas tienen el motor en pausa (0 cuadres), así que la barra dice «Por colgar 0» mientras la blusa abierta dice «Falta colgar»: la ciega lo vio y «no supo cuál creer». Unificarlas en UNA función que las tres lean es una decisión de negocio de Felipe (qué manda cuando el motor calla: ¿los números, o nada hasta cuadrar?).

## Lista aparte (no se ejecuta)
- F9: una acción primaria real en «Qué hago» (la sugerida como `btn-primario`); es la distribución que Felipe eligió entre cuatro.
- F5: a 1024×768 las fichas de talla quedan al filo del pliegue del modal (la lista «Qué hago» sí cabe).
- F4: el marco antes de la primera prenda (62 px de barra + 130 de cabecera + 120 de filtros + 30 del aviso); lo propio de la pantalla son los 120 de filtros.
- B5: el aviso del motor caído («la columna dice N/D») en la vista de tarjetas; es un estado de error y habla en código.
- B6: un «¿Por qué 1?» a un toque junto a «Cuelga 1» (el mínimo de ADR-0328).
- F11: «Cerrar» a 28 px es del `<Modal conCerrar>` (chrome global, se arregla una vez para todas las hojas); los círculos de color del modal a 30 px.
- F3: 9, 11 y 14 px son radios sueltos fuera de la escala (que ya tiene 6 valores: ADR-0169).
- Refutados: F2 (los círculos de color tienen un `::after` de 26–32 px: el medidor no lo ve), F12 (la casilla «0 colgadas» que falta va en ámbar sólido, no punteada), B7 (la insignia «Falta colgar» es la pieza de estado del sistema; la ciega solo dijo que la tocaría).

## Cerrado en la rama durante la corrida (sin esperar el OK: eran defectos del código nuevo, no decisiones de diseño)
- F13: el chip de «Todas» sigue la regla de la tarjeta (`insigniaDelModelo`, con prueba); verificado en el navegador: «4 tallas sin colgar».
- F8: el foco vuelve a quien abrió el modal (`alCerrarEnfocar`), también desde «Más ⌄ ▸ Ver ficha» (repetidos TEC-06 y TEC-06b: «¿mismo botón? true»).
- B2: «Otras sedes: Taller 14» (el Taller no es tienda; «Pedir (ninguna tienda tiene)» ya era correcto).
- F7: el cuadrito de la leyenda va en línea con «Faltan en el piso…» y ya no se queda solo en un renglón.
- Los tres ceros atenuados a 2,3–3,0:1 (`tema:auditar`) pasaron a taupe pleno (5,6:1 claro, 6,9:1 oscuro).

## Prueba ciega (pasada 1, agente sobre las capturas a 1440 px; real: sin probar)
| Medida | Resultado | Pasa |
|---|---|---|
| Lectura de 5 s | «la lista de lo que hay de ropa en mi tienda, prenda por prenda y talla por talla; el número grande es lo colgado a la vista y el +6 lo que está atrás, en el almacén; lo que sigue: tocar una talla o "Colgar en el piso"» | sí |
| Primer intento | tocó la talla L de Blusa Emma y luego «Colgar en el piso · 7 unidades en almacén»; no retrocedió | sí (hasta donde la captura deja ver) |
| Pasos | 2 seguros + 2 supuestos (cantidad y cerrar) = 4; el mínimo real es 4 (talla → Colgar → Continuar → «Colgar 1») | sí |
| Dudas | el «0» grande sin palabra al lado · la leyenda «2 colgadas / +1 guardadas» contra «6 / 183» de la cabecera · «Por colgar 0» contra «Falta colgar» · «la columna dice N/D» sin columna · dos buscadores · «para vender ahora» no aparece escrito · «7 unidades en almacén» frente a «Cuelga 1» · la cajita «1» como cantidad · «Otras tiendas: Taller 14» contra «ninguna tienda tiene» · «2 Issues» | no: 10 (cada una es un hallazgo de arriba; «2 Issues» es la insignia de Next en desarrollo) |
| Palabras no entendidas | «Subir», «Rótulo» vs «Etiquetas», «CMS-0001», «N/D», las cajitas de teclas, el puntito dorado sobre los círculos | no: 6 |
| Errores evitables | ninguno tocado (sobre capturas no se toca); 9 cosas que «tocaría esperando algo» (3 refutadas, 6 en los hallazgos) | — |

## Antes de decir «listo»
- Concurrencia: `/chaos` CON-09, 10 sesiones a la vez sobre la misma talla: 7 colgaron, 3 recibieron «pides 1 y en el almacén hay 0», 0 deadlocks, stock = movimientos. · Caída externa: sin red, «Se cortó la conexión y no sabemos si se guardó» y lo escrito se conserva; con la respuesta perdida, «Confirmar de nuevo» devuelve lo ya guardado sin duplicar; con el motor del piso caído, la pantalla sigue y lo dice (B5: con un texto que hay que mejorar). · Persona sin contexto: la ciega la entendió en 5 s y llegó a colgar; real: **sin probar**.

## Historial
| Fecha | SHA | Leyes | Oficio | Cambios cerrados |
|---|---|---|---|---|
| 2026-10-12 | `f2202e6ca` (+ arreglos de la corrida) | 6,9 · ley 1: 7 | 5 (crudo, 0 blockers) | primera corrida; F13, F8, B2, F7 y los tres ceros cerrados en la rama; los 3 cambios esperan OK |
