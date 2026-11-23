# Auditoría al milímetro — la escala de letra en todo el ERP · 2026-11-23 · `claude/letra-escala-cerrada`

Medido: 31 pantallas a 1440 × 900 y 5 a 375 × 812 (Vender, Apartados, Cambios, Devoluciones y Existencias), en claro, en un Chrome de
prueba con la sesión del seed, contra el servidor de la rama (`localhost:3010`) y la base local. Cada pantalla se midió dos veces, antes
y después del cambio (ADR-0691), con un barrido propio (tamaño de cada texto, textos cortados, desborde horizontal) y, después, con el
medidor de tipografía del set (`.claude/skills/tipografia/referencia/medir.js`, entero) en siete pantallas.

Resumen: **0 graves · 1 media · 2 leves** · los textos por debajo de 13 px bajaron de 1.012 a 250 (de 6.423) y el cambio dejó 3 textos cortados; ninguna pantalla ganó desborde horizontal.

## Lo que se midió

| Medida | Antes | Después |
|---|---|---|
| Textos por debajo de 13 px, en las 36 vistas | 1.012 | 250 |
| Textos a 15 px (la lectura de antes) | 1.307 | 144 |
| Textos a 16 px (la lectura de ahora) | 169 | 1.332 |
| Textos cortados (`truncate`, `line-clamp`, caja con recorte) | 205 | 208 |
| Vistas con desborde horizontal | 0 | 0 |

El medidor de tipografía, después:

| Pantalla | Lectura bajo 14 px | Etiquetas bajo 11 px | Tamaños distintos |
|---|---|---|---|
| Existencias | 0 | 1 | 6 |
| Compras | 0 | 0 | 5 |
| Rendimiento | 0 | 0 | 7 |
| Finanzas ▸ Resumen | 5 | 0 | 10 |
| Productos | 0 | 0 | 5 |
| Cambios (375 px) | 0 | 0 | 6 |
| Devoluciones (375 px) | 0 | 0 | 6 |

El 2026-11-19, antes del cambio, las mismas pantallas tenían entre 13 y 19 tamaños distintos.

## Hallazgos

| # | Gravedad | Qué | Dónde | Estado |
|---|---|---|---|---|
| 1 | Media | En el menú plegado, «Inventario» y «Apariencia» salían con «…» a 13 px: la fila medía 64 px | `app/estilos/vidrio/marco.css` | **Arreglado**: el margen de los lados bajó de 10 a 6 px |
| 2 | Leve | Un nombre de prenda largo se corta antes («Pantalon Cayla Clasico») | Existencias, tarjeta de prenda (`truncate`) | Abierto: va en la actividad de Inventario |
| 3 | Leve | Dos descripciones de color pasan de las cuatro líneas | Catálogo ▸ Atributos (`line-clamp-4`) | Abierto: va en la actividad de Catálogo, con el recorte de texto |

## Heredado, no de este cambio

- 250 textos siguen por debajo de 13 px. Vienen de hojas de estilo propias de cada módulo, que no tienen puente: Observatorio, los
  gráficos, Plan del piso, Movimientos, Finanzas y la persiana de Caja. Están en el backlog de la rama.
- Las cifras que piden ancho fijo y no lo tienen (36 en Existencias, 62 en Productos): es la actividad siguiente.
- El aviso «1 Issue» del entorno de desarrollo en Existencias es de «barrido del piso», cuya tabla aún no está en la base local.

## Mirado en captura

Existencias, Compras, la hoja de una talla (claro y oscuro), el menú plegado, y Vender, Cambios, Devoluciones y Apartados a 375 px.

## Sin medir

- Las hojas y los estados que solo se abren al guardar o con la caja abierta.
- El modo oscuro con el barrido completo: solo se miró la hoja de una talla. El cambio no toca colores.
- Los medidores de espacio, color, movimiento y textos: el cambio es solo de tamaño de letra.
