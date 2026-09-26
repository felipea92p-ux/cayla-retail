# Spike visual · Rendimiento (2026-09-26)

`rendimiento-spike.html` es autocontenido: el logo va dentro del archivo. Ábrelo en el navegador.
**Datos inventados**: ningún nombre ni cifra es real. **No es una implementación**: no toca la web ni la base. Las
decisiones que dibuja están en el acta [`DECISIONES-2026-09-26-rendimiento.md`](../../datos/DECISIONES-2026-09-26-rendimiento.md)
(D-112 a D-128) y el diseño técnico en [ADR-0219](../../adr/0219-rendimiento-ventas-de-cada-persona.md).

## Qué muestra

| Bloque | Qué responde | Decisión |
|---|---|---|
| Menú lateral | «Rendimiento» es la última entrada, después de Finanzas | D-128 |
| Cabecera (`CabeceraPantalla`) | ¿qué mes y qué tienda estoy viendo? Hay píldoras de mes y, solo para el Admin, de tienda | D-113, D-115 |
| Cifras (`TarjetaCifra`) | ¿cómo va la tienda contra su meta del mes? ¿cuántas vendieron y cuántas tienen «muestra chica»? | D-125, D-115 |
| Dos rankings lado a lado | «Vende más por hora» (soles por hora trabajada) y «Cierra más ventas» (número de ventas). Muestran el número de ventas y las insignias «Encargada», «Muestra chica» y «Sin horas» | D-121, D-116, D-115 |
| «Todas», para el Admin | Un bloque por tienda, cada uno con su meta y sus dos rankings; nunca un ranking mezclado | D-124 |
| Tabla «Todas las cifras» | Todas las cifras, con cuadre de caja y bajada al piso. Se ordena por cualquiera, desde «Ordenar por» o tocando el título de la columna. Cada tienda tiene su fila de total | D-121, D-122 |
| Ficha de una persona | Comparada con su tienda (6 cifras), su evolución en 6 meses, qué vende (categorías y prendas) y sus ventas una por una | D-123 |
| «Corregir quién atendió» | Modal con el movimiento de `<Modal>` (ADR-0136): a quién pasa la venta, el motivo de una lista y el responsable que firma. Después sale el aviso de éxito | D-117 |
| El candado propuesto | La encargada no puede darse una venta (su nombre aparece deshabilitado) ni corregir una venta suya (aparece una ventana que explica por qué). **Es propuesta y espera el ok de Felipe** | D-117, objeción del ADR-0219 |
| Agosto | Vacío honesto: el ERP guarda quién atendió desde el 22-sep; los meses anteriores no se inventan | — |
| Sin acceso | La colaboradora no ve la entrada (y por URL cae en «Sin acceso»); el Líder que no es Admin y no tiene tienda tampoco | D-113 |

## Cómo probarlo

- **Ver como**: el Admin (todas las tiendas), las encargadas de TRU y de AQP, una colaboradora y un Líder que no es Admin.
- **Admin**: toca «Todas», «TRU», «AQP» o «Lima». Lima muestra qué pasa cuando no hay asistencia cargada.
- Toca a cualquier persona, en un ranking o en la tabla, para abrir su ficha. En «Sus ventas», **Corregir quién atendió**.
- Como **encargada de TRU**, abre la ficha de *Carla Vega* (ella misma) y corrige una venta: aparece el candado. En la
  ficha de otra persona, su propio nombre sale deshabilitado.
- **Ficha de Milagros Torres**: es el caso de «acompañar». Vende poco por hora, lleva pocas prendas por venta y da más del
  doble de descuento que su tienda; cada diferencia aparece marcada.
- **Ficha de Andrea Paredes** frente a la de **Lucía Méndez**: una lidera por hora y la otra por número de ventas. Por
  eso hay dos rankings.
- Achica la ventana a menos de 768 px para ver la versión de celular: barra de abajo y la corrección como hoja que sube.

## Lo que el spike decide de forma (y el ERP debe copiar)

- **Los colores de los gráficos son tinta (ella) y taupe (su tienda).**
  - Pasado por el validador de paletas, falla la banda de luminosidad y el croma mínimo: los lee como «grises», porque la
    paleta CAYLA no tiene tonos para distinguir series (verde y ámbar son de estado, ADR-0169).
  - Aun así se separan bien: ΔE 27 con daltonismo (protan) y ΔE 30 con visión normal.
  - Por eso todo gráfico con dos series lleva leyenda, la cifra escrita y dos formas distintas: barra para ella, línea
    con puntos para la tienda.
- **Verde y ámbar solo como estado, siempre con texto.** Una diferencia contra la tienda sale en verde si es buena y en
  ámbar si hay que mirarla, con la frase «▼ 15 % bajo su tienda». Nunca solo con color.
- **Cada tienda se compara con su total, no con un promedio de promedios**: soles de la tienda ÷ horas de la tienda.
- **Las cifras de una persona con «muestra chica» llevan una nota**: sirven para conversar, no para comparar.

## Abierto antes de construir

- **El candado de D-117** (objeción del ADR-0219): Felipe decide. El spike lo muestra encendido.
- **Tienda de la pantalla y sede de la cabecera.** Para el Admin, el spike abre en «Todas» e ignora la sede elegida
  arriba. ¿Así, o abre en la sede de la cabecera?
- **Ficha: «Ver las N en Historial».** Hoy el filtro por vendedora del Historial es solo para líderes: o se abre a la
  encargada, o la ficha lista todas sus ventas por su cuenta.
- **Al comparar, se deja pasar sin marca la diferencia chica**: 8 % en las cifras relativas y 2 puntos en los
  porcentajes. Son umbrales de ejemplo; se ajustan con un mes de datos reales.
- **Antes de dar la pantalla por terminada**, se captura al mismo ancho que este spike y se comparan las dos imágenes,
  como pide la regla de pantallas de Finanzas.
