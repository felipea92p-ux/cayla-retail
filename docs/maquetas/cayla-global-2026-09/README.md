# Maqueta · CAYLA Global ▸ Salud del negocio (2026-09-28)

`cayla-global.html` es autocontenido (CSS y JS adentro; solo pide las fuentes a Google Fonts). Ábrelo en el navegador.
Es la vista de toda la empresa que Felipe pidió el 2026-09-28, **solo para cuentas Admin**: no sirve para operar piso ni
almacén, sirve para entender el negocio y decidir. La idea viene de cómo Buffett maneja Berkshire: cada sede es una
empresa que opera sola, y esta vista es «la oficina de Omaha», que mide cuánto rinde el capital de cada una y decide
adónde va la plata. **No es una implementación**: no toca la web ni la base. El diseño técnico va en el ADR-0275, que
se está escribiendo en esta rama.

**Datos inventados**: ninguna cifra ni nombre es real. Las cifras cuadran entre sí para que se puedan revisar: en 12
meses CAYLA vende S/ 1,940,000 y gana S/ 232,000 sobre S/ 748,000 de capital (31 %); el margen es S/ 1,003,000 sobre
S/ 418,000 de stock al costo (S/ 2.40 por cada S/ 1).

## Qué muestra

| Bloque | Qué responde | Decisión |
|---|---|---|
| Selector de sede | «CAYLA Global» va primero, en su propio grupo («Toda la empresa»), antes de las sedes. Solo lo ve el Admin | Felipe 2026-09-28 |
| Menú en CAYLA Global | Solo lo que sirve para decidir: Salud del negocio, Clientas, las seis de Finanzas, Configuración y Actividad. Existencias, Movimientos, Análisis, Traslados y Producción salen en gris bajo «Pronto en la vista global» | Felipe 2026-09-28 |
| Cabecera (`EncabezadoPagina`) | «CAYLA Global · lunes 28 de septiembre», el título «Salud del negocio» y el periodo (Septiembre · Agosto · 12 meses). **Es una propuesta**: en este módulo la cabecera está sin decidir | ADR-0220, propuesta |
| Veredicto en una línea | ¿Está sana CAYLA y qué es lo que más cuesta hoy? Enlaza a esa decisión | Propuesta |
| Cuatro veredictos (`TarjetaCifra` + `Chip`) | ¿Crea valor? (retorno sobre el capital contra el mínimo exigido de 12 %) · ¿Crece? (contra el mismo mes de 2025, partido en tickets × ticket) · ¿Es rentable? (margen después de rebajas; rebajas contra Zara; cuánto deja cada S/ 1 en stock) · ¿Tiene caja? (caja libre del mes; las 6 semanas contra el mínimo; semanas de stock) | Felipe 2026-09-28 |
| Decisiones de esta semana | Qué conviene hacer, ordenado por soles en juego, con un botón por fila. «Armar traslado» abre el modal (ADR-0136) prellenado; al enviar sale el aviso de éxito y la fila queda «Enviado» | Felipe 2026-09-28, ADR-0136 |
| Cada negocio de CAYLA | TRU, AQP, LIM, Empresa y Taller, con total CAYLA: vendió, ganó, capital que usa, cuánto le rinde, caja que generó, semanas de stock y tipo de negocio (Gran · Buen · Pesado). LIM es el «negocio pesado» | Felipe 2026-09-28 |
| El Taller, contra maquilar afuera | El Taller no se mide como tienda: costo por prenda en casa contra la maquila de referencia, ahorro del mes y capacidad usada. El pantalón sale más caro en casa (en rojo profundo) | Felipe 2026-09-28 |
| Nota en hueso | Con qué datos se calcula cada cosa, y que una cifra sin datos dice «sin datos», nunca 0 | Felipe 2026-09-28 |
| Punto de venta en CAYLA Global | Quien entra por un enlace a una pantalla de operación ve «Punto de venta trabaja en una sede» y un botón por tienda | Felipe 2026-09-28 |
| Líder de TRU | No ve CAYLA Global: su selector solo tiene sedes y su menú es el de siempre. Por enlace directo ve «Tu cuenta no tiene CAYLA Global» | ADR-0161 |

## Cómo probarlo

- **Panel «Ver como»** (abajo a la derecha, oscuro, no existe en el ERP): elige **Admin** o **Líder de TRU**.
- **Periodo**: toca Septiembre, Agosto o 12 meses. Cambian las cifras del mes, no las de 12 meses. En Agosto y 12 meses,
  «¿Crece?» dice por qué no se puede comparar (Alegra empieza en septiembre 2025).
- **Armar traslado** (última decisión): mueve la cantidad con − y +. Si TRU queda con menos de 4 semanas, la frase se pone
  en ámbar. Envía y mira el aviso y la fila marcada.
- **Selector de arriba**: elige una sede y el menú vuelve al de siempre; vuelve con «CAYLA Global».
- **«Sin historia de Alegra»**: «¿Crece?» y «¿Crea valor?» quedan vacíos con su razón. También se vacían «Rinde», el tipo
  de negocio y lo que deja cada S/ 1 en stock. Las cifras del mes se suponen presentes: este conmutador solo muestra la
  falta de 12 meses.
- **«Primer día real (28-sep)»**: cómo se verá de verdad hoy. Desaparecen las decisiones por prenda, queda la de capital
  de Lima con totales de Alegra y el Taller dice «sin datos».
- **«Entrar a Punto de venta estando en CAYLA Global»**: el aviso con un botón por tienda.
- Achica la ventana a menos de 768 px: barra de abajo, decisiones apiladas con el botón debajo, la tabla como fichas y el
  modal como hoja que sube. Con «reducir movimiento» del sistema no se mueve nada.

## Lo que la maqueta decide de forma (y el ERP debe copiar)

- **La fila del menú se llama «Salud del negocio»**, no «CAYLA Global». Es la regla de ADR-0220 (el título es la palabra
  del menú) y el nombre que ya usa el código de esta rama. «CAYLA Global» es la vista, igual que una sede: va en el
  selector y en la línea de arriba de la cabecera. Su ícono es un pulso (propuesto): el código de esta rama usa el velocímetro,
  que ya es el de Finanzas ▸ Resumen, y quedarían dos iguales en el mismo menú.
- **Las cifras usan el formato del ERP** (`lib/resumen-formato.ts`): «S/ 23,000» y «S/ 2.40», no «S/ 23.000». El símbolo
  nunca se separa del número.
- **Verde, ámbar y pizarra solo como estado y siempre con texto.** Rojo solo en el pantalón del Taller (un costo que se
  pierde de verdad), aparte del logo, el filete del menú y el foco del teclado. Las decisiones llevan un punto ámbar (empeora si esperas) o pizarra
  (oportunidad).
- **Una fila hecha no se mueve ni desaparece**: queda en su lugar, tachada, con el chip «Enviado» (ADR-0185).
- **Cambiar de periodo no re-anima la pantalla**: solo las cifras que cambian se re-asientan (ADR-0128).

## Abierto antes de construir

1. **El primer día, la mitad del tablero estará vacía.** Las decisiones por prenda (trasladar, pedir, frenar, rebajar,
   marcas) y la tarjeta del Taller necesitan semanas de ventas por prenda en el ERP. TRU y AQP empiezan hoy; LIM y el
   Taller todavía no operan. Por defecto la maqueta se ve llena. **«Primer día real» muestra lo que habrá el 28-sep.**
2. **El capital necesita el valor del stock por sede y por mes.** La nota original decía «ventas, costo y gastos» de
   Alegra; sin el stock valorizado no hay «¿Crea valor?» ni «Capital que usa» para LIM. La nota de la maqueta ya lo pide.
3. **Semanas de stock: 23, no 9.** Con margen de 52 % y S/ 2.40 por cada S/ 1 en stock, el stock rota ~2.2 veces al año
   (unas 23 semanas). Las tres cifras juntas no cuadran con 9 semanas. Se dejó el 2.40 porque aparece en dos lugares.
4. **Umbrales propuestos, a confirmar con Felipe:** mínimo exigido 12 % (bono 6.2 % + riesgo 5.8 %); «Gran negocio» =
   rinde más de 3 veces el mínimo y usa menos de S/ 25 de capital por cada S/ 100 que vende; «Pesado» = rinde menos que
   el mínimo.
5. **Rebajas contra Zara**: la cifra de Zara (15–20) es la parte de las prendas que se venden rebajadas, no la parte de la
   venta que se pierde. El ERP tiene que medir lo mismo (prendas rebajadas ÷ prendas vendidas) para comparar.
6. **Se sumó la fila «Taller»** a «Cada negocio»: solo capital y caja, sin rinde ni tipo. Sin ella, el total no cuadra y
   las telas y máquinas desaparecen del retorno de CAYLA.
7. **«Decisiones de esta semana» y «Para decidir hoy» de Finanzas ▸ Resumen resuelven lo mismo** (ADR-0195). Hay que
   decidir si son una sola lista o dos con reglas distintas.
8. **El traslado que arma el Admin**: ¿TRU lo confirma antes de despacharlo, o sale directo como pendiente de envío?
9. **Actividad y Configuración como filas del menú**: hoy Actividad es un botón de la barra de arriba y Configuración no es
   fila del lateral.
10. **Antes de dar la pantalla por terminada**, se captura al mismo ancho que esta maqueta y se comparan las dos imágenes.
