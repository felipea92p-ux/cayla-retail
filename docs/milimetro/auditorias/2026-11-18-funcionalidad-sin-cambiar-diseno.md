# Auditoría al milímetro — cinco piezas que mejoran cómo funcionan, sin cambiar su diseño · 2026-11-18 · `claude/modern-web-guidance-skill-64cb91` (`c3d1e7e12` + arreglo de copiar)

Medido: 1440×900 claro (quieto, como arranca) · 375×812 claro · 1440 oscuro · animaciones vivas y quietas · foco con teclado. Servidor:
`localhost:3110` (`cayla-retail-dev-libre`) contra la base local `cayla-retail`, cuenta Admin en Tienda Lima. Los siete medidores de `/milimetro`
(`milimetro`, `espacio`, `tipografia`, `color`, `movimiento`, `textos`, `graficos`), servidos desde una carpeta temporal y borrada al terminar.
Rutas: **`/inventario`** (Existencias: el título, el «?», «Copiar enlace»), `/finanzas/reportes` (un «Ver más» con `alEncontrar`, decidido a
propósito por ADR-0611) y `/productos/categorias` (la nota de «Agregar categoría»).
Alcance: lo que cambia la rama (PR felipea92p-ux/cayla-retail#1947): `FilasDeMas` con `hidden="until-found"`, `useCerrarSiSeVa` en el «?» y el
«!», `BotonCopiar` con su aviso fuera del botón, `<NotasQueCrecen />` y `text-wrap: balance`/`pretty` en `app/estilos/titulos.css`.

Resumen: **0 graves de la rama · 0 medias de la rama · 1 arreglo en el camino** (copiar con el camino viejo dejaba el foco en `<body>`) · heredados de `main` anotados aparte (1 grave en la vitrina de Existencias).

## Lo que cambia la rama, medido

| Pieza | Qué se midió | Resultado |
|---|---|---|
| `titulos.css` (cortes de línea) | Alto de cada título y frase a la vista con la regla y sin ella (`text-wrap: wrap !important` inyectado y quitado), y alto total de la página | **0 elementos cambian de alto** a 1440 claro, 1440 oscuro y 375; la página mide lo mismo (2041 px y 4434 px). Solo se mueve dónde se corta la línea; letra, tamaño, color y espacios iguales |
| `FilasDeMas` | Estado plegado y búsqueda del navegador en `/finanzas/reportes` | Plegada: `hidden="until-found"`, sin `inert`, alto 0 (como antes). Con `#:~:text=Lo que dejó cada sede` el navegador la encontró, la lista se abrió sola por `alEncontrar` y el botón pasó a «Ver menos» (`aria-expanded="true"`) |
| `useCerrarSiSeVa` | «?» de la cabecera abierto y la página bajada 60 px y 1500 px | Con el botón a la vista el globo sigue abierto y pegado 12 px bajo él (igual que antes); con el botón fuera de la vista se cierra y `aria-expanded` vuelve a `false` |
| `BotonCopiar` | Dos copias con Enter real en «Copiar enlace» de Existencias, el aviso leído cada 20 ms | El aviso vive fuera del botón (`role="status"`, `sr-only`); el botón no tiene región viva adentro. Primera copia «Copiado ⍽», segunda «Copiado» (el espacio que no se oye hace que se vuelva a anunciar). Ancho del botón: 150 px antes y después |
| `<NotasQueCrecen />` | «Notas internas» de «Agregar categoría», con clic real, cuatro líneas escritas y luego borradas (la hoja se canceló, nada se guardó) | Al entrar guarda su alto (64 px) como mínimo; con cuatro líneas crece a 103 px sin barra; vacía vuelve a 64 px; el ancho no cambia (518 px) |

**Arreglado en el camino (de la rama):** con el portapapeles negado, `BotonCopiar` copia por el camino viejo (un texto oculto que se selecciona
y se borra) y el foco quedaba en `<body>`: el segundo Enter ya no copiaba. Ahora el foco vuelve al botón (`components/ui/BotonCopiar.tsx`,
`alPortapapeles`). Medido otra vez: el foco termina en el botón y las dos copias se anuncian.

**Movimiento:** la rama no agrega ninguna animación. Quieto: 0 animaciones. Vivo: 28, y los bucles son del aviso de cierre de caja
(`rcc-aurora`, ADR-0359), decidido a propósito.

## Heredados de `main` (no los toca la rama; van al tablero para decidir aparte)

### Graves
1. «Ver los 6 colores de …» (`button.vitrina-mas-colores`, tarjetas de Existencias) mide 22.4×16 px dentro de otro blanco — WCAG 2.5.8 pide 24 px — `[Norma]` AA — va a `/espacio`.

### Medias
1. «Página anterior» (`button.paginas-n.atras`) apagado sin motivo a la vista, 1.8:1 claro y 2.33:1 oscuro — regla del repo (propuesta 3 de `/milimetro`) — va a `/milimetro proponer`.
2. Los puntos de color de la vitrina (`button.vitrina-punto`) marcan el elegido solo con el color (11), y su relleno queda bajo 3:1 contra la tarjeta en algunos colores — WCAG 1.4.1 / 1.4.11 — `[Norma]` A/AA — revisar con ADR-0589 (la vitrina es diseño propio) — va a `/color`.
3. El anillo de foco del filtro «Todo» (`button.area-dedo`) contra su fondo: 1.07:1 — WCAG 2.4.13 — `[Norma]` AAA — va a `/color`.

### Leves
1. La pista del anillo de pendientes (`anillo-pista`) 1.15:1 — el arco pasa 6.37:1 — `[Práctica]` — va a `/graficos`.
2. Tres nombres de prenda cortados con «…» en la vitrina (`Blusa Camisera Crop Aterciopelada`, …) — revisar que el nombre completo se lea en su `title` o en la ficha — va a `/textos`.

## Decidido a propósito
- `/finanzas/reportes` (Estados financieros, ADR-0611): los hallazgos de espacio, cifras y pestaña del informe son de su diseño propio.
- Los bucles del aviso de cierre de caja (ADR-0359).

## Sin medir
- Ctrl+F con la barra de búsqueda del navegador: se probó con un fragmento de texto (`#:~:text=`), que usa el mismo camino; la barra en sí no se puede manejar desde las herramientas.
- VoiceOver de verdad: se midió el texto del aviso, no la voz.
- `/formidable`, `/focus`, `/sugerir`, `/chaos` y `/guia`: la rama no agrega ni cambia campos, pasos, botones ni pantallas que guardan.
