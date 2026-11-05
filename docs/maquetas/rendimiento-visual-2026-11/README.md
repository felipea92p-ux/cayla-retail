# Maqueta · Gestión ▸ Rendimiento, segunda ronda (2026-11-04)

Nació de descartar `../rendimiento-interactivo-2026-11/`: «No me gusta ninguna, crea algo más visual e interactivo». Aquí no hay tarjetas apiladas: **el dibujo es la pantalla**. Datos inventados; nada guarda. Las reglas son las del ERP.

Abrir `index.html` con la config `maqueta-referentes`. La barra negra elige escena, rol, caso, tema y ancho.

| Escena | La idea | Para jugar |
|---|---|---|
| **I · La rueda** (recomendada) | Un anillo por persona que se cierra al llegar a su meta; afuera, las ventas de cada hora o día. | Girar la manija rebobina el día o el mes; pasar por un anillo cambia lo que dice el centro. |
| **II · El salón** | Cada persona es una burbuja. | Cinco miradas (juntas, contra lo que tocaba, por hora, ticket, ventas) que las hacen volar; se arrastran y dejan rastro al reproducir. |
| **III · El perchero** | Cada prenda vendida cuelga del riel de quien la vendió, en su color, hacia su meta. | Las prendas se abren al pasar el mouse; se filtra por tipo o color para ver quién vende qué. |

Las tres comparten el **retrato** de cada persona, que se abre como un círculo desde donde tocaste, y **Ver en tabla**, con la tabla, los rankings y los cambios de meta. Todas repiten su historia al entrar y con «Ver cómo fue».

## Si se elige una

- Hacen falta lecturas nuevas: ventas por persona y por hora o día, y prendas vendidas por persona. El retrato es la `fn_rendimiento_persona` ya prevista en ADR-0219.
- Los colores por persona serían tokens nuevos. Paleta validada: en claro todo pasa, con un CVD de 6,5 (permitido porque siempre van iniciales o nombre); en oscuro todo pasa.
- Cada movimiento entra como excepción en ADR-0136. La física no rebota, pero las burbujas se mueven solas hasta asentarse.
- El tablero de vidrio dice que el plan de esta pantalla es de Dany y que solo cambiaba el material: falta acordarlo.

## Lo que se decidió

Descartadas el 2026-11-04: «No me gusta ninguna, haz 3 más, con gráficos entendibles y amigables, con full animaciones». Sigue en `../rendimiento-graficos-2026-11/`.
