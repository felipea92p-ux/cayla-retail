## 2026-10-05 (Nace «Formidable»: el criterio para que cada pantalla se entienda sin manual — ADR-0350)
Qué hice: Felipe pidió un ultra prompt para que el ERP se sienta como un iPhone. Lo definimos en 44 preguntas con opciones y quedó como skill `/formidable`:
nueve leyes de comprensión (sin manual, una pregunta una respuesta, simplicidad profunda, lenguaje de tienda, contenido primero, lo difícil a un toque,
perdonar antes que preguntar, quitar antes de agregar, de punta a punta) y un eje aparte de «oficio visual» que se mide en el navegador (alineación,
espaciado, contraste, foco, tamaño de los controles). Incluye una prueba ciega con un agente sin contexto y una guía para observar a 3–5 colaboradoras.
Investigué las guías de Apple, Nielsen, WCAG 2.2 y las lecciones de Jobs en la biografía de Isaacson; cada fuente quedó con su nivel de evidencia.
Por qué así: la captura de Frescura del piso no tenía un problema de estética sino de lenguaje: «quizá más», «se esperaban 0.6» y «Pocos datos» tres veces
exigen entender estadística. Ningún skill existente medía si una persona entiende sin ayuda. Se mantiene en una página con referencias aparte, porque Apple
no se hizo con 30 reglas. El script de medición se probó contra una página con 8 defectos sembrados: la primera versión vio 7 y dio un falso positivo,
y la segunda las 8; además avisa si el panel está oculto, porque ahí mide todo en cero.
Felipe se lleva: el skill `.claude/skills/formidable/`, el ADR-0350, la sección «Formidable» de `CLAUDE.md` y el tablero `docs/formidable/README.md`.
Pendiente: correr el piloto en Inventario ▸ Frescura del piso (con los 4 agentes avisados antes), y decidir cuándo pasa a prueba en el CI. Dos cosas
que Felipe decidió y conviene recordar: el escritorio (Mac mini) manda sobre el celular, y puede proponer cambiar reglas de negocio, pero dinero, stock,
permisos y SUNAT siempre esperan su OK.

## 2026-10-05 (Primer piloto de Formidable: Frescura del piso, con 4 agentes)
Qué hice: corrí `/formidable` sobre Inventario ▸ Frescura del piso con un medidor, un revisor de leyes, una prueba ciega y un escéptico. Resultado: leyes 4,5 (±1) con cuatro
leyes en 3 (una pregunta una respuesta, simplicidad profunda, contenido primero, quitar antes de agregar), oficio visual 5 (provisional); la ley 1 queda sin nota. Lo mejor de la pantalla es
«Anotar» con «Deshacer» (9 en perdonar antes que preguntar); lo peor, que la prenda se dibuja sin color ni categoría y que la decisión se esconde en una cifra ámbar.
Por qué así: el escéptico descartó o achicó 7 de 14 hallazgos y mostró tres errores míos en el skill (cita de WCAG, enlaces en línea, escala de espaciado); además el script de medición no leía los colores
modernos de Chrome. Todo quedó corregido y probado sobre la pantalla real. La prueba ciega salió débil: el primer intento lo frenó un filtro de la API y el reintento con Haiku no entregó el formato pedido.
Felipe se lleva: el informe `docs/formidable/inventario-frescura.md` con los 3 cambios, dos decisiones de negocio suyas (qué se decide en «Por decidir» y si se muestra el semáforo con menos de 10 ventas) y
una alerta: en TRU el semáforo se apoya en 4 ventas en 120 días. No se cambió ninguna pantalla: espera su OK.

## 2026-10-05 (Frescura del piso se entiende de un vistazo: se ejecutaron los 3 cambios de Formidable — ADR-0350, ADR-0208 act. 2026-10-05)
Qué hice: Felipe aprobó los tres cambios del informe y los ejecuté en tres commits. (1) La fila es una prenda y una frase: miniatura con su color y el ícono de su categoría, una palabra de estado
(Recién llegada / En su tiempo / Se está quedando / Hay que moverla), «Lleva N días o más» y una sola acción; cuatro columnas en vez de siete. (2) La frase bajo el título es la pregunta con su respuesta («¿Qué lleva mucho tiempo
colgado? 2 prendas esperan tu decisión»), la cabecera queda con dos datos neutros y de entrada se ven primero las prendas por decidir, con «Ver todas las prendas» a un toque. (3) La metodología pasó a «¿Cómo se lee esto?»,
se quitó «Ventas a pedido» (no tenía dato), y lo aproximado se dice una vez cuando es la regla y se marca solo cuando es la excepción.
Por qué así: sin migración y sin tocar ninguna regla: el color, la foto y la categoría de la miniatura se piden aparte y, si fallan, la pantalla sigue entera. El título se queda como nombre del menú (ADR-0220) y la pregunta va en la frase.
Dos decisiones del 28-sep de Felipe (nombres de estado y «frases C») quedaron reemplazadas con su OK y escritas en ADR-0208. Al volver a medir, el medidor encontró un defecto mío (botones de 16 px) y lo corregí.
Felipe se lleva: 4 commits locales en `claude/ultra-prompt-ui-ux-apple-cf045a`, sin push ni PR. Verificado a 1440 y 375 px y con 444 pruebas en verde, pero con datos de ensayo y no con colaboradoras reales:
las notas no se recalificaron. Sigue abierto: qué se decide en «Por decidir» y si el semáforo se muestra con menos de 10 ventas.

