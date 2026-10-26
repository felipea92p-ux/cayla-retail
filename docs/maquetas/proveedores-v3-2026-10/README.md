# Proveedores v3 · ranking + lo que no se ve (2026-10-26)

> **Descartada por Felipe el mismo día:** «No me gusta ninguna, elabora 3 más que sean innovadoras y visuales». La cuarta ronda está en
> `../proveedores-v4-2026-10/`. La investigación de esta carpeta (`INVESTIGACION.md`) sigue valiendo.

Tercera ronda. Felipe, sobre la segunda: «hay partes con espacio desaprovechado de forma innecesaria y los colores están mal utilizados,
tengo muchos proveedores, mostrarlos en forma de mosaico es un error tremendo, tal vez hacer un ranking que se pueda filtrar por prendas
compradas y por dinero y a la derecha las cosas que no se ven a simple vista o las necesarias. Investiga cómo sería la forma más óptima».

**Primero se investigó** (`INVESTIGACION.md`, con fuentes). En corto:
- **Barras, no área:** para comparar muchos, el largo se lee mejor que el área (Cleveland y McGill; treemaps contra barras, Heer y
  Bostock y «Raising the Bars»). Felipe tenía razón con el mosaico.
- **La tabla:** una sola columna con barra, ordenada por lo que importa, con búsqueda y orden.
- **El color:** solo para la excepción, y nunca solo: con forma y palabra (Few, Oracle «manejo por excepción», guías de daltonismo).
- **La derecha:** una cola de excepciones ordenada por urgencia, cada una con su número, a quién le toca y qué hacer.
- **Las medidas:** son las de retail, vendido (sell-through) y semanas de stock, las mismas que ya calcula `proveedor-ritmo-reglas.ts`.

## Lo común a las tres

- **El ranking ocupa el lado ancho**, ordenado por cuánto le compras. El botón grande **Prendas compradas / Dinero gastado** cambia la
  medida y el orden; el dinero lleva «≈» cuando el costo viene de la carga inicial.
- **Una barra neutra por fila:** el largo es cuánto le compraste y lo de tinta, lo que ya vendiste. Sin color.
- **El color está solo en la marca del ritmo**, siempre con forma y palabra:
  - **●** verde «Repón»: lo que queda se acaba en 6 semanas o menos.
  - **■** pizarra «A su ritmo».
  - **▲** ámbar «Frena»: 16 semanas o más.
  - **○** «Poco para medir»: menos de 20 compradas.
  - **✕** rojo: deuda vencida, lo único que pide actuar hoy.
- **Filtros con su cuenta** (Repón 7 · A su ritmo 13 · Frena 10 · Poco para medir 22 · Con deuda vencida 4) y un buscador por proveedor o
  marca. Se ven 20 y «Ver los 32 que faltan». El Taller va aparte.
- **A la derecha, fija al bajar: «Lo que no se ve a simple vista»,** con un resumen (prendas compradas, vendido, lo que les debes) y tres
  bloques por urgencia. Cada número es grande y lleva a quién le toca.
  - **Para hoy:** lo vencido y las entregas atrasadas.
  - **Antes de volver a comprar:** a quién frenar, la plata parada, el margen bajo y el costo por confirmar.
  - **Oportunidades:** a quién reponer, la talla que se acaba (dato nuevo) y la sede donde está todo (dato nuevo).

  «Ver en el ranking» filtra la lista; tocar un nombre lo busca.
- **Los datos:** 52 proveedores con la cola larga de verdad. Los 11 del ADR-0502 son los casos reales (Lasak, Anqori, Deyner, Jacard…) y 41 son
  inventados con semilla fija (`datos-mas.js`). Tallas y sedes siguen marcadas «Dato nuevo · en construcción».

## Las tres direcciones

### A · Tabla
La tabla completa: puesto, proveedor, la barra, vendido, «lo que queda se vende en», margen y lo que le debes. Cada encabezado ordena.
**Al tocar una fila se abre ahí mismo** con qué hacer, sus tallas, sus sedes y su plata.
- **Gana:** todo a la vista en una fila y sin cambiar de pantalla. Es lo más denso y lo más parecido a una tabla de trabajo.
- **Paga:** con siete columnas es la más cargada a 1440 px; en el teléfono se queda solo con lo esencial (nombre, barra y semanas).

### B · Concentración
Arriba del ranking, **a quién le compras de verdad**: una barra por cada uno de los 52, de mayor a menor, con la curva acumulada y la
frase «52 % de lo que compras es de tus 10 primeros proveedores; con 22 llegas al 80 %». El ranking es más corto (puesto, barra, semanas
y deuda). **Al tocar un proveedor, su detalle reemplaza la columna derecha** (lista y detalle), y el proveedor se marca en la curva.
- **Gana:** responde «a quién le compro más» para todos a la vez, no solo para los primeros 20, y el detalle no tapa la lista.
- **Paga:** mientras miras un proveedor no ves las excepciones (hay que volver). La curva acumulada es un concepto más que aprender.

### C · Compraste y vendiste
Cada fila tiene **dos puntos en la misma escala**: lo vendido (lleno) y lo comprado (vacío). El tramo entre los dos es lo que sigue en tus
tiendas. Con una escala común arriba, se compara entre proveedores dónde está la mercadería que no sale. Las filas también se abren.
- **Gana:** se ve el hueco, lo que no se vendió, en tamaño real y comparable entre todos (Lasak: 6 contra 183).
- **Paga:** es menos habitual que una barra. Cuando los dos puntos están muy juntos se dice en texto («69 de 94»).

## Lo que no entra en esta ronda

- **La ficha de un proveedor:** se rediseña después de elegir la lista, con las mismas reglas.
- **Sin cambios:** las reglas y los umbrales son los de `comun.js`, los mismos de `apps/web/lib`.

Revisadas en el navegador a 1440 y 1920 px, en claro y oscuro, y a 375 px sin desborde horizontal. Movimiento de una sola vez (filas en
cascada, barras que crecen, la curva que se dibuja), apagado con `prefers-reduced-motion`.
