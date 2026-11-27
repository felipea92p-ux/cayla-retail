# Producción, más clara (2026-11-26)

Maqueta de las pantallas de Producción del Taller, pedida por Felipe al revisar Resumen, Órdenes e Insumos: que cualquier persona
que entre por primera vez las entienda, con buena distribución, solo datos que sirvan y sin punto medio como separador.

Se abre con el servidor `maquetas` de `.claude/launch.json` (usa `../vidrio-base-2026-10/`). En la barra negra:

- **Pantalla:** Resumen, Eficiencia, Nueva orden, Órdenes, Insumos.
- **Hoja de Insumos:** Nueva tela, Nuevo avío, Saldo inicial, Llegó una compra.
- **Distribución del Resumen:** C (solo lo que pide acción, la elegida), A y B (las primeras, con todo lo de hoy reordenado).

Todos los modelos, personas, proveedores y montos son inventados.

## Lo que decidió Felipe (2026-11-26)

| Tema | Decisión |
|---|---|
| Resumen | Versión C: «Qué fabricar primero», «Por resolver» y «Lo demás está en orden». Sin las cifras de dinero arriba |
| Órdenes | La lista sigue ordenada por fecha de entrega, como hoy |
| Nombres | «Para vender» (antes «Lote de producción»), ganancia por prenda en soles (antes margen en %), «Lo que ya tenías» (antes «Saldo inicial») y los del Resumen: «Por resolver», «Hay de sobra», «Llevar a tienda», «Sin ventas todavía», «Nadie la pide» |
| Construcción | Todo en un solo PR |

## Reglas que salen de aquí

1. Cada dato en pantalla responde «qué hago» o «por qué». Lo que solo informa se resume en una línea con su enlace o se saca.
2. Un dato es una pieza: rótulo chico arriba y valor abajo, o una insignia. Nunca «dato · dato · dato».
3. Los encabezados de tabla van con palabras completas («Se venden por semana», no «Ventas/sem.»).
4. Lo que explica va detrás del «?». Los formularios van en pasos numerados y lo opcional, plegado.

## Sin dibujar

- Nueva orden: elegir modelo, crear un modelo nuevo y el paso 3 abierto (fases, tela, fecha y nota).
- Insumos: las pestañas «Avíos» y «Movimientos».
- Hojas: tela por kilo o por rollo, avío sin color, «Ya la pagué», «Todavía no tengo la factura» y los avisos de error.
