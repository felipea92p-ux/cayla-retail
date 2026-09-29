## 2026-09-29 (Comparar períodos ya usa la misma tarjeta «PERÍODO ANALIZADO» que Desempeño, y recuerda lo que elegiste)

Qué hice: la parte de arriba de Análisis ▸ Comparar períodos era otra cosa que la de Desempeño (píldoras de otro estilo, un
selector de Categoría, y ningún lugar donde buscar una prenda). Ahora las dos pestañas dibujan LA MISMA tarjeta, con el mismo
componente: etiqueta «PERÍODO ANALIZADO», una fila de arriba y el buscador debajo. En Desempeño la fila trae los atajos (7,
30, 90 días, Este mes, Personalizado) y la Categoría; en Comparar trae solo «Período A: 1 ago. → 30 ago.» y «Período B: …»,
que abren el mismo selector de fechas de «Personalizado». Sin atajos, sin Categoría, con la búsqueda. Los avisos («A es
anterior al historial», «duran distinto», «se superponen») ya no son párrafos sueltos: salen dentro de la tarjeta y solo
cuando hay algo que decir. Lo que elijas para A y B se queda: cambiar de pestaña, salir a Existencias y volver por el menú,
o recargar la página los devuelve tal cual, por sede y por persona.

Por qué así: «literalmente el mismo componente» se cumple compartiendo el código, no copiando las medidas — por eso el HTML de
la tarjeta de Desempeño no cambió ni un elemento (verificado por hash) y a 1280 px las dos miden 147,5 px. Para recordar A y
B no usé una cookie que el servidor mezcle en silencio: la pantalla se guarda 30 s por dirección, y una dirección «vacía» con
fechas escondidas mostraría los períodos anteriores justo cuando esperas los últimos que elegiste. En cambio las fechas se
escriben en la dirección y el navegador solo las recuerda para sembrarla al entrar. También le di a B su propia dirección
(`bdesde`/`bhasta`): antes elegir «7 días» en Desempeño le cambiaba B a Comparar, y elegir B en Comparar le cambiaba el período
a Desempeño. Y un A escrito en el futuro ya no se cambiaba en silencio: ahora dice «El período A no puede empezar en el
futuro…», igual que B.

Verificado: contra la base local, con un servidor propio en :3030 (el :3020 lo ocupa otra rama y no se tocó). Medidas de las
dos pestañas a 1440, 1280, 1024, 768 y 375 px sin desborde horizontal; A y B se conservan al cambiar de pestaña, al salir y
volver por el menú, con enlace directo y con F5; la otra tienda (Lima) arranca con los de por defecto y Trujillo recupera los
suyos; buscar «casaca» baja las cifras de 16 a 2 variantes; la misma dirección con y sin `cat=` da lo mismo. `pnpm typecheck`,
ESLint y las 230 suites (152.779 casos) en verde.

Felipe se lleva: sin migración, nada que pegar. Tres cosas para que decidas: (1) **B sigue heredando el período de
Desempeño hasta que lo eliges en Comparar** (ADR-0138) — si prefieres que Comparar nunca herede, es un cambio de una línea;
(2) el selector de fechas compartido **no pone el cursor en «Desde» al abrirse**, aunque su comentario lo promete (pasa igual
en «Personalizado» de Desempeño): no lo toqué porque abriría el teclado del celular en las dos pestañas; (3) no hay botón
«restablecer», como pediste: para volver a «últimos 30 días» se escriben las fechas.
