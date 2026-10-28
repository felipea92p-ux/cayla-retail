## 2026-09-30 (La guía de foco ya no apura a quien escribe, y «Familia» del color ya pasa por la guía)

Qué hice: en «Nuevo color del vocabulario», con escribir una letra en Nombre la luz «Sigue aquí» saltaba a Código y, al completarse el código
sugerido, a Color sin pasar por Familia. Arreglé las dos causas en la pieza común de la guía, no solo en esta pantalla: el campo de texto donde
alguien escribe conserva la luz hasta que sale de él (`siguienteDe(campos, enFoco)` en `lib/guia-campos.ts`, informado por `CampoGuiado`), y
«Familia» —que viene en «Neutro» y por eso nunca pasaba— entra a la guía como sugerida, «hecha» cuando la persona la elige. Un combo o un chip
sigue avanzando al elegir. No cambia qué se puede guardar. Dejé escrito en la skill `/focus`, en CLAUDE.md y en el ADR-0284 (act. h) las dos reglas.

Por qué así: «hecho» se calcula de un valor, y un valor existe desde la primera letra; lo que faltaba era saber que la persona seguía ahí, y eso lo
dice el foco, no el texto. Elegí retener solo en cajas de texto porque en un combo elegir SÍ es terminar. Familia es sugerida y no obligatoria: no
bloquea `Guardar`, el pie solo dice «Sin elegir: Familia · puedes seguir así». Probarlo en el navegador encontró dos trampas que la prueba unitaria no
ve: soltar la luz dentro del `blur` mueve nodos con el foco aún en `<body>` y el FocusScope de Radix devuelve el foco al modal (Tab no llegaba al campo
de al lado), y la limpieza de StrictMode borraba el registro recién hecho por el `autoFocus`.

Felipe se lleva: recorrido real en escritorio y a 375 px (una letra → nombre → Tab → Código → Tab → Familia → combo por teclado y por clic → la luz llega
a Color) y «Editar color». `lib/guia-campos.test.ts` +9 casos, vitest completo (259 archivos), `tsc` y eslint limpios. Los demás modales que ya usan
`CampoGuiado` heredan la retención sin tocarlos; no los recorrí uno por uno ni busqué en ellos otro combo con valor de fábrica sin guiar.

**Añadido (misma sesión): las rayas del círculo punteado de lo opcional giran.** Felipe pidió que se muevan en círculo «para que se note»: quieto,
un círculo de rayas se leía como adorno. `.hilo-marca[data-estado="opcional"]` gira una vuelta cada 8 s (`hilo-gira`, `linear`, infinito;
`app/estilos/alta-guia.css`), quieto con `prefers-reduced-motion`. Es la tercera excepción a «nunca en bucle» de ADR-0136 (la anotó Felipe al pedirlo;
ADR-0136 act. c y CLAUDE.md): es una señal —dice que el campo se puede saltar—, no un adorno, y solo gira esa marca. Solo `transform`, sin repintar.
Verificado el movimiento moviendo el reloj de la animación (0°, 90°, 180°, 270°, 360° a 0, 2, 4, 6 y 8 s); **no lo vi girar en pantalla** (el panel del
navegador estaba oculto y no dibujaba cuadros), así que la velocidad —8 s— la juzga Felipe a ojo.

**Añadido (misma sesión): Nuevo producto tenía el mismo defecto y ya está arreglado.** Con una letra en «Nombre» la luz saltaba a «Tejido» apenas terminaba la
comprobación del nombre (lo reproduje en el navegador: a los 2,6 s ya estaba en Tejido). Lo mismo pasaba con el precio y las cantidades. El alta no usa
`CampoGuiado` sino `FilaAlta` y `lib/alta-producto-guia.ts`: les di `enFoco` y saqué la parte «¿sigue tecleando aquí?» a una pieza compartida
(`useRetenerLuz`), que ahora usan las dos. Felipe propuso guiarse por el mouse; usé el foco porque sirve con Tab, con lector y en el celular (sin mouse), y un
roce del mouse a media palabra adelantaría la luz (ADR-0284 act. h lo razona y deja la puerta abierta a sumar el mouse como segunda señal). +8 casos en
`lib/alta-producto-guia.test.ts`, suite completa (259 archivos), `tsc` y eslint en verde. En el navegador: con el foco en Nombre la luz se queda aun con el
nombre ya comprobado; al salir, Nombre lleva ✓ y la luz pasa a Tejido; al volver recupera la luz; la descripción (opcional) con foco no la roba. **Lo verifiqué con
eventos de foco sintéticos** (el panel del navegador estaba oculto): falta repetirlo a mano con el teclado real, sobre todo los pasos 3 y 4 (precio, cantidades),
que probé solo con pruebas unitarias.

**Añadido (misma sesión): Tallas y Colores esperan a que se termine de elegir.** Con la primera talla o el primer color la luz saltaba al siguiente campo aunque la
persona quisiera marcar más. Como son chips de varias opciones y en Safari un botón no toma el foco al clic, `FilaAlta` ganó el modo `retiene="fila"`: la luz se queda
mientras se toca algo dentro de la fila y se va al tocar o enfocar otra cosa (un oyente de `document` dentro de `useRetenerLuz`; autónomo: sirve también a un modal con `CampoGuiado retiene="fila"`). Probado
en el navegador con el paso 3: 1, 2 y 3 colores → la luz sigue en Colores; tocar una talla → la luz pasa a Tallas; tocar fuera de la fila → se suelta. Eventos de
puntero sintéticos (panel oculto); falta repetirlo a mano con el ratón y, si se puede, en Safari.

**Añadido (misma sesión): la skill `/focus` reescrita.** Para que la próxima invocación no repita los errores: «segunda regla madre» (la guía acompaña, no apura), una tabla de qué hace la
luz con cada tipo de control, una «mirada de tolerancia» en el Paso 1, un Paso 4 de verificación (recorrido «una letra → Tab → combo», las dos trampas del foco, cómo montar el entorno y qué
hacer con el panel oculto) y un informe que separa lo verificado de lo sintético. El modo «fila» se hizo autónomo dentro de `useRetenerLuz` para que la skill pueda prometerlo en
cualquier pantalla, y el escáner (`scripts/focus/escanear.mjs`) reconoce `useRetenerLuz` como pieza de la guía (su prueba `escanear.test.mjs`, 25 casos, en verde).
