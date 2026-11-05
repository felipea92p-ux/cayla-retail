# Finanzas ▸ Estados financieros · maqueta de vidrio (2026-11-05)

Pedido de Felipe: rehacer Estados financieros (hoy ADR-0585) para que sea gráfico, entendible para cualquiera, serio, sofisticado y con todas
las animaciones posibles sin abrumar. La dirección salió de 10 preguntas y de dos rondas de referencias marcadas por él, en un tablero privado:
las capturas son de terceros y no entran a este repo público.

- **La maqueta:** `index.html`, un solo archivo. **Las cifras son de ejemplo** y cuadran entre sí, mes con mes (agosto, septiembre y octubre).
- **No se tocó** código de la app, migraciones ni producción.

## Lo que Felipe definió

Neobanco moderno · la cifra y su veredicto como protagonista · muy poca información a la vista · cifras en sans · nombre real del estado más
una frase simple · claro y oscuro por igual.

De las referencias: le gustan el vidrio con fondo vivo (LifeStats, Apple Liquid Glass, ventanas de macOS, panel sobre atardecer, barra sobre
rojo), Revolut, el panel de Slash y el área de Altruist. Rescata el número de Brex, la línea con globito, el analytics de Loud, las categorías a
la vista de Monarch y la luz de iHealth. Descarta Mercury, Linear, Puzzle, ZenWallet, el río de flujo, los bloques de Revolut y CRED. Opina que
el vidrio actual del ERP es «algo pobre».

## Lo que propone

1. **Un fondo de hilos que fluyen, con un hilo rojo,** pintado una vez. Da lo que le falta al vidrio: la receta actual lo reconoce en `recetas.css` («con el fondo
   tan parejo el desenfoque casi no se ve»).
2. **Vidrio con filo de luz y borde que desvía lo de atrás.** El brillo sigue al mouse.
3. **Cifra enorme, frase que la interpreta y un solo gráfico** por estado: línea y área en Ganancias y en Patrimonio, cascada en Flujo, dos
   tubos en Balance. Las categorías siempre a la vista. El formato del contador queda plegado.
4. **Una recomendación de una línea** que sale de las cifras.
5. **La barra se puede explorar.** Al pasar el mouse por una parte, de la barra o de su lista, el resto se apaga; al tocarla, su detalle completo se abre
   justo debajo: de qué está hecha, qué significa y cómo viene mes a mes.
6. **El formato del contador es un libro con hilo:** cada fila muestra su tramo a escala y los totales van en placas de vidrio. El Balance prueba su
   ecuación a la vista.

**Felipe eligió (2026-11-05): pestañas fijas, letra Inter y el fondo Hilos.** Comparó Arena, Atardecer, Rojo, Dunas, Ventana, Trama y Niebla, que ya no
están en este archivo. El panel «Probar» queda solo para el tema claro u oscuro.

## El selector de fechas

Reemplaza a «‹ Octubre 2026 ›». Las flechas saltan al vecino del mismo largo y, al tocar la fecha, se abre un calendario de vidrio con atajos, los 13 meses
con su ganancia como barrita y dos meses de días. Un día se elige en dos toques (primero y último) y los meses se pueden arrastrar. La pantalla se
actualiza al completar el rango, sin un botón de aplicar. **En Balance se elige una sola fecha, porque el Balance es una foto;** en los demás, un rango.
Los puntos bajo cada día marcan los días con más ventas. Las cifras de la maqueta salen de repartir cada mes por día: son de ejemplo, pero cuadran en
cualquier rango (medido sobre 399 rangos: caja, Balance, patrimonio, sedes y desgloses).

**Para construirlo:** Estados financieros dejaría de usar solo `?mes=` y pediría `?desde=&hasta=`. Las lecturas de resultados y de flujo ya aceptan rango;
`fn_patrimonio_cambios` solo acepta un mes, así que necesitaría cambiar. Los puntos de cada día piden una lectura de ventas por día, y si frenan la
pantalla se quitan.

## Los campos de Finanzas

Felipe pidió ver cómo se verían aquí los campos con los que se ingresan datos en Finanzas (2026-11-05). El panel «Probar ▸ Ver» abre **Campos**: el formulario «Registrar gasto»,
con los mismos datos y condiciones principales de `HojaRegistrarGasto.tsx`, y debajo las demás piezas con sus estados.

- **Idioma:** lo que espera tu dato está hundido; al escribir, sube y dibuja su hilo. Lo que eliges es una gota que fluye.
- **Piezas:** monto, texto, combo con búsqueda, fecha, opciones con gota, RUC que consulta, serie que se ordena sola, tasa, cantidad, buscar, sí o no, casilla, archivo y texto largo.
- **Guía de foco (ADR-0284):** el bloque que sigue se enciende con «Sigue aquí»; la luz no se va mientras se escribe, y «Falta» lleva a cada campo.
- **«Así queda»:** muestra el registro en vivo y qué le hace a la ganancia y a la cuenta.
- **No incluye** todo lo de la hoja real: leer el QR, los gastos fijos y el medio de un banco.
- **Para construirlo:** son piezas nuevas. Serían de Finanzas (`fin-control`, ADR-0195) o del ERP (ADR-0358), y esa decisión es de Felipe porque toca varios módulos.

## Las mejoras de la comparación

Aplicadas aquí (2026-11-05) para decidir si llegan al ERP, según `docs/investigacion/2026-11-05-componentes-frente-a-sistemas.html`:

1. Guardar con un error lleva al primer campo, con el error debajo de cada uno y conectado al lector de pantalla.
2. Se valida al salir del campo y el error se borra apenas se corrige.
3. Un solo monto: S/, miles y dos decimales al salir.
4. El botón no se apaga antes de tiempo: si falta algo, lleva a lo que falta.
5. Tamaño para el dedo, con su control «Probar ▸ Tamaño». Medido: nada bajo 44 px con dedo ni bajo 24 con mouse en Campos.
6. Cuatro tiempos con nombre (`--t-resp`, `--t-cambio`, `--t-hoja`, `--t-momento`), con su control «Probar ▸ Movimiento».
7. Vidrio «Sólido» y «Contraste»; también los activan los ajustes del sistema.
8. Fechas que se escriben, con límites, teclado en el calendario y rango escrito.
9. Tabla con dos densidades, encabezado fijo, orden, lote, edición en la fila y carga con esqueleto.

**Construidas en el ERP (2026-11-05):** de la 1 a la 8, y «Compacta» de la 9. Detalle y alcance real en ADR-0611.

**Medido en Campos:** el texto da 4,8:1 o más sobre el vidrio en claro y oscuro con vidrio normal, sólido y de contraste.

## Qué reglas toca

Las excepciones quedan en el ADR de este rediseño.

- **ADR-0596 (vidrio «Serena»):** esta pantalla tendría una receta propia. Llevarla a todo el ERP es otra decisión, porque toca todos los módulos.
- **ADR-0169 (paleta):** los fondos usan tonos de arena y taupe. Solo Hilos lleva un hilo rojo, como acento.
- **Letra:** Inter, elegida por Felipe, sería una familia nueva en el ERP, que hoy usa DM Sans y EB Garamond.
- **ADR-0136 (movimiento):** suma una excepción con su lista exacta y su prueba.
- **ADR-0358 (una pieza):** este selector es otra pieza para elegir fechas. Si Felipe lo quiere en más módulos, se vuelve la pieza única; si no, queda como excepción de esta pantalla.
- **Se mantiene:** `<EncabezadoPagina>` con el título en serif y los tokens.

## Lo que falta comprobar

- **Medido** en Chromium a 1440 y 375 px: sin errores de consola ni desborde. Medí el contraste del texto de la pantalla Ganancias sobre el vidrio,
  contra el píxel más desfavorable, en las doce combinaciones de fondo y tema.
- **Sin medir:** la fluidez en el Mac mini de la tienda y el resultado en Safari.
- **Solo Chromium** muestra el borde que desvía; en otro navegador queda el vidrio sin esa curva.
- **Costo:** cada placa lleva `backdrop-filter`. En una tabla o grilla larga no serviría; aquí hay de 4 a 5 placas por pantalla.
- **Pendiente de la base:** ninguna cifra de esta maqueta sale de la base. Falta revisar si las lecturas actuales (`lib/estados-financieros*`)
  ya entregan todas las categorías y la serie de 12 meses.
