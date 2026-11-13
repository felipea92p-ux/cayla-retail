# Maqueta · Gestión ▸ Rendimiento con superpoderes (2026-11-04)

Cuarta ronda, tras «Haz algo más sofisticado e interactivo con muchas animaciones, ubica la tabla con superpoderes y dale superpoderes igualmente a los componentes que vayas a utilizar».
Una sola pantalla sobre el marco real. Datos inventados; nada guarda.

Abrir `index.html` con la config `maqueta-referentes` del navegador integrado. La barra negra elige rol, caso, tema y ancho, y «Repetir entrada» vuelve a correr la animación de llegada.

## La tabla

Es la elegida: **`TablaViva`, «A · Globo desde la cabecera»** (`../tabla-superpoderes-2026-10/`, `components/ui/TablaViva.tsx`), con su cara copiada. Lleva sus ocho superpoderes:
letra que se lee y «Letra grande», todo al centro, filtrar y ordenar desde la cabecera, lo que ves en una frase con píldoras, cabecera que acompaña al bajar, la fecha que dice cuánto pasó, el total de lo que ves y el vacío que explica.

Suma para Rendimiento:

- Las filas viajan a su nuevo lugar al ordenar o filtrar, y los números cuentan.
- Cada fila se abre en su lugar, con calendario, lo que va bien y su meta.
- Al pasar por un día del gráfico, cada fila dice lo que vendió ese día.
- Con menos de 40 ventas, el ticket avisa «pocas ventas».

## Los superpoderes de las demás piezas

| Pieza | Lo que puede hacer |
|---|---|
| **Gráfico** | Arrastra para elegir días, mueve el tramo o sus bordes, toca un día. Se transforma entre Cada día, Por persona y Sumado. Compara con el mes pasado. «Ver cómo fue» repite el mes día a día en toda la pantalla. |
| **Cifras** | Cuentan. El «?» las voltea y explica la cuenta con los números de ahora. |
| **Si vendemos por día** | Una barra recalcula el cierre y mueve la línea punteada del gráfico. |
| **El equipo** | Las personas y los grupos filtran toda la pantalla al tocarlos. |
| **Buscador** | Entiende personas, «por debajo», «esta semana», «día 10», «del 5 al 12», una tienda, «sumado» y «mes pasado». |
| **Sedes** | Cada una muestra su avance contra su propia meta antes de entrar. Nunca un ranking. |
| **Fila abierta** | El calendario elige días. Su meta se mueve con vista previa del ritmo y del reparto. |
| **Deshacer y descargar** | Vuelve al paso anterior de la vista, y baja justo lo que ves en CSV. |

Pasar por una persona en cualquier pieza la enciende en el gráfico y en la tabla. Atajos: `/` busca, `← →` mueven el tramo, `Esc` quita lo último, `Enter` abre la fila con el foco.

## Reglas que respeta

Reconocer y acompañar, sin dinero (D-65, D-112) · solo encargadas y Admin (D-113) · nunca se mezclan tiendas · sin rojo para juzgar (D-159) · sin meta no se inventa cuánto tocaba · «Adelante / En ritmo / Por debajo» con ±10 puntos (`lecturaDeRitmo`) · Lima sin horarios no lleva esa lectura por persona.

## Lo que simplifica y habría que resolver al construir

- **Lo que tocaba:** aquí se reparte por tiempo transcurrido. El ERP lo reparte por horas programadas.
- **Datos:** por persona y por día hace falta una lectura nueva. `TablaViva` pide que las filas ya estén en el navegador.
- **Cambiar la meta:** aquí se simula. La real pasa por `fijar_meta_persona`, con su motivo.
- **Lo que no está:** contracción y cota prudente, el historial de cambios de meta y la guía interactiva.
- **Piezas nuevas:** el gráfico con selección, la tarjeta que se voltea y el buscador que entiende no existen en el ERP. Si quedan, `/unificar` decide si valen para otras pantallas.
- **Movimiento y colores:** requieren su excepción en ADR-0136 y tokens para los colores por persona.

## Pendiente de decidir

- Acordarlo con Dany: el tablero de vidrio dice que en esta pantalla solo cambiaba el material (`docs/vidrio/README.md`).

## Lo que se decidió

Felipe la eligió el 2026-11-04: «Listo, me gusta ese estilo». Se construyó en `components/rendimiento/` (ADR-0610).
