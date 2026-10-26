# Formidable · Tienda web ▸ Conf. Tienda (`/tienda-web/ajustes`)

- **Fecha / SHA:** 2026-10-26 · `7998bdca4` · **Dispositivo que manda:** escritorio (Mac mini o computador); tablet y 375 px se adaptan.
- **Pregunta que debería resolver:** «¿Cómo ve el cliente cada una de mis tiendas en la web, y cuánto espera un pedido?» (son dos; la segunda vive en otra tarjeta). **Protagonista:** la tienda (su fachada y su tarjeta del teléfono).
- **Veredicto en una línea:** «Se entiende en 5 segundos y se completa casi sola; lo que falla es que perder lo escrito no avisa, que cerrar un día no se ve y que un mismo dato tiene tres nombres.»
- **Cómo se probó:** la pantalla real pide sesión, así que se midió y se recorrió una **ruta temporal sin login** (no se commitea) que monta el mismo componente con 3 tiendas inventadas. El combo «Responsable» no carga ahí y «Guardar» no guarda: **lo que pasa después de guardar no se probó aquí** (lo cubre `pnpm pruebas:tienda-web-conf` y `/chaos`). Cuatro agentes: medidor (yo), ciega (Sonnet), revisor de leyes (Sonnet), escéptico (Sonnet).

## Notas (0–10)
| Eje | Nota | Evidencia |
|---|---|---|
| 1 Sin manual | **7** (tope 8) | [Observado] ciega: a los 5 s dijo «decidir qué ve el cliente de cada tienda» y acertó; completó 5 de las 6 partes de la tarea sin ayuda; 22 pasos (4 de rodeo), 7 dudas. Real: sin probar |
| 2 Una pregunta, una respuesta | **6** | [Medido] 2 `.btn-primario` en reposo apagados; solo se enciende el de la tarjeta tocada (decisión de Felipe, CTW:61-63). [Opinión] «Responsable» es lo primero que se ve |
| 3 Simplicidad profunda | **7** | [Opinión] «Abierta · cierra 9 p. m.» y el teléfono en vivo ya son veredictos; el anillo «0» con sus chips son datos sueltos |
| 4 Lenguaje de tienda | **6** | [Medido] «Nombre / Nombre en la web / Nombre que ve el cliente» y «Dónde / Dirección / Dirección para recoger» son el mismo dato; [Observado] la ciega no entendió «Dónde» ni «Cierres» sin leer el chip |
| 5 Contenido primero | **7** | [Opinión] la fachada y el teléfono mandan; las 7 barras negras son lo más pesado de la pantalla |
| 6 Lo difícil, a un toque | **5** | [Medido] la ayuda larga de los plazos vive solo en `title=` (RelojDelPedido.tsx:61); cada paso ya trae su frase corta visible, y el uso es de escritorio |
| 7 Perdonar antes que preguntar | **6** | [Medido] borrador hasta «Guardar» (bien), pero salir con cambios los pierde en silencio y Esc en un plazo borra los cuatro; el orden de tiendas guarda al soltar sin deshacer |
| 8 Quitar antes de agregar | **6** | [Medido] lo que falta se dice en 5 sitios (anillo, chips, marcas de campo, «Faltan:», teléfono); cada uno tiene su razón |
| 9 De punta a punta | **7** | [Medido] sin scroll horizontal a 375 px y sin conexión lo escrito se conserva; dos textos de desarrollo/vacío casi inalcanzables |
| **Leyes (promedio)** | **6,3** | Ninguna ley en 3 o menos; la más baja es la 6 (5) |
| **Oficio visual** | **6** | [Medido] a 1440 px fallan 6 de 8: blancos bajo 24 px (8; **7 son piezas del sistema**: los 3 interruptores 38×22, el calendario de `CampoFecha`, los 3 números de `PasoCantidad`), textos de 11 px (10), bordes casi alineados (8, de 1–2 px), huecos fuera de escala (4), filas de alturas desiguales (2) y 11 radios. Contraste 0 fallas; 2 rojos; sin scroll horizontal a 375 px |

## Los 3 cambios de mayor impacto (esperan el OK de Felipe)
Ninguno toca dinero, stock, permisos ni SUNAT.
1. **No perder lo escrito (ley 7; hallazgos H1 + H2).**
   *Antes:* salir por el menú, «atrás» o recargar tira lo que se arrastró en el horario de 3 tiendas y los plazos, sin aviso; Esc en «Confirmas» borra también «Paga», «Recoge» y la escala. *Después:* el aviso «¿Salir sin guardar?» de las demás pantallas (`useSalidaSinGuardar`, que ya cubre enlaces, atrás y cerrar la pestaña) y Esc que solo revierte la caja donde estás.
   *Se verifica:* escribir en una tienda y en plazos, tocar un enlace del menú → sale el aviso; Esc en un plazo cambia solo ese. *Esfuerzo:* S (subir el «sucio» de Plazos al padre). *Decide:* Felipe da el OK (presentación).
2. **Que se vea cómo se maneja el horario y el orden (ley 1 y 6; O1 + O3).**
   *Antes:* un día abierto no dice cómo cerrarse (la letra «L» es el botón; tocar la barra no hace nada) y el orden de las tiendas solo se arrastra, con un tooltip que nunca aparece y Alt+flechas escondido. *Después:* la misma frase de «Cerrado · toca para abrir», del otro lado: la letra con su «toca para cerrar» a la vista al pasar el mouse y en la pista, y el agarre de orden con su atajo escrito. Sin quitar ningún chip (los pidió Felipe).
   *Se verifica:* la ciega repetida cierra un día abierto sin dudar y ordena Lima de primera. *Esfuerzo:* S. *Decide:* Felipe (toca un texto de la maqueta aprobada).
3. **Un solo nombre por dato, y el WhatsApp bajo su campo (leyes 4 y 9; H5 + H10).**
   *Antes:* «Nombre» / «Nombre en la web» / «Nombre que ve el cliente» (igual con «Dónde/Dirección») y el error de WhatsApp sale arriba a la derecha solo al guardar. *Después:* «Nombre», «WhatsApp», «Dirección» en chip, pie y etiqueta (lo que aclara «que ve el cliente» pasa a la bajada de la caja), y el aviso de WhatsApp incompleto bajo su caja, al salir del campo.
   *Se verifica:* misma palabra en las tres partes; escribir 5 dígitos y salir del campo muestra el aviso en su sitio. *Esfuerzo:* S (la guía y sus pruebas leen `NOMBRE_DATO`: se ajustan). *Decide:* Felipe.

## Lo que sobra (ley 8)
«Sin guardar» en la etiqueta de la puerta **y** «Tienes cambios sin guardar» al pie de la misma tarjeta (con una basta); y el texto de desarrollo «Falta pegar en la base la migración…» (CTW:349), que ya no se puede ver con producción migrada.

## Lo que no pediste y importa más
**«Cerrar hoy» no avisa si esa tienda tiene pedidos web por recoger hoy:** la web dice «Cerrada hoy» al instante y un cliente con su código llegaría a una puerta cerrada. Bastaría una línea de solo lectura («Hoy esperan 3 pedidos») al elegir «Cerrar hoy» (`retail.separaciones` abiertas de esa tienda). Roza pedidos, pero no cambia dinero ni stock: es decisión tuya.

## Lo que se achicó o cayó con el escéptico
- **Refutado:** H7 «dos Guardar primarios» — son dos tarjetas con su botón, decisión de Felipe, y en reposo los dos están apagados.
- **Matizados:** H4 (solo 2 de los 4 chips son instrucciones; todos están en la maqueta aprobada o los pidió Felipe en ADR-0518 act. d), H6 (el texto es de la maqueta; roza pedidos), H9 (casi inalcanzable), H10 (el mapa y los plazos ya avisan en vivo; sobrevive el WhatsApp), H11 («X» y el eje vienen de la maqueta; las letras son de 12 px, no 11), H14 (7 de los 8 blancos chicos son piezas del sistema).
- **No verificable:** H12 (siete barras iguales; opinión sobre una maqueta aprobada) y el arrastre con mouse (la herramienta sintética nunca emite `drop`: la ciega «no pudo ordenar» es un límite de la prueba, no un defecto probado; Alt+→ sí funciona).
- **Artefactos de la prueba (no son hallazgos):** el texto escrito dos veces la primera vez (latencia del servidor de desarrollo), «Leyendo quién está de turno…» que nunca termina (no hay sesión).

## Lista aparte (no se ejecuta)
1. Guardado en varios pasos que no dice qué ya quedó guardado si uno falla (el WhatsApp se guarda primero y es el del QR del Club). 2. «Copiar lunes a todos» también abre el domingo (el botón dice «todos»; el comentario de `semanaComoElLunes` dice «o el primer día abierto» y no es así). 3. La puerta dice «Se ve en la web» mientras la fachada y el teléfono ya la muestran apagada (es a propósito: dice lo de hoy); «Sin guardar» es de 11 px taupe. 4. «Reloj del pedido»: «Confirmas / Paga / Recoge» no dicen quién (cambio solo de redacción, de Felipe). 5. «X» para miércoles y eje «8 a · 12 m · 2 p» frente a «10 a. m.» (maqueta aprobada). 6. `<Vacio>` para «No hay tiendas abiertas…» (CTW:289), que hoy corta toda la pantalla. 7. Siete barras iguales → «Lun–Sáb» + «Separar por día» (L; cambia la maqueta aprobada). 8. Riesgo no probado: en Firefox un `draggable` que contiene un `<button>` puede no arrancar el arrastre.

## Prueba ciega
| Medida | Resultado |
|---|---|
| Lectura de 5 s | **Pasa:** «decidir qué ve el cliente de cada tienda en la tienda online… lo que sigue es tocar AQP y llenar sus datos» |
| Primer intento | **Casi:** completó 5 de 6 partes; no logró «poner Lima de primera» (límite de la prueba, ver arriba) |
| Pasos | 22 (4 de rodeo: escribió el nombre dos veces, dos intentos de arrastre, uno con el teclado) |
| Dudas (7) | «Leyendo quién está de turno…»; el anillo «0» y los chips «Nombre / WhatsApp / Dónde» («¿son botones?»); «CERRADO · TOCA PARA ABRIR» (¿solo lunes?); «Copiar lunes a todos» (iba a abrir el domingo); la franja del domingo (cerró con la letra «D»: «sin que nada dijera que esa letra es el botón»); «dd/mm/aaaa»; «Arrastra para ordenar» |
| Palabras no entendidas | «Dónde» (la leyó «la dirección»), «Cierres», «Responsable», «Reloj del pedido / Separa / Confirmas / Paga / Recoge», «STOCK EN LA WEB» |
| Errores evitables | 3: texto duplicado (artefacto), «Copiar lunes a todos» abrió el domingo, tocó el agarre y se abrió el formulario en vez de moverse |
Real (colaboradora de tienda): **sin probar.** Esto es «ciega: pasa con reparos · real: sin probar».

## Antes de decir «listo»
- **Concurrencia:** sin probar aquí; lo guardado pasa por funciones `security definer` con candado de líder y `/chaos` es el siguiente paso.
- **Caída externa:** sin conexión lo escrito se conserva (`<RefrescoTrasCorte />`); con la base caída la página muestra el aviso de error de `page.tsx`. Sin probar en vivo.
- **Persona sin contexto:** la ciega lo respondió (arriba); la colaboradora real, no.

## Historial
| Fecha | SHA | Leyes | Oficio | Cambios cerrados |
|---|---|---|---|---|
| 2026-10-26 | `7998bdca4` | 6,3 | 6 | — (los 3 cambios esperan el OK de Felipe) |
