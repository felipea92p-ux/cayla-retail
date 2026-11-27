# ADR-0698 — Las esquinas salen de una escala: cuatro radios, y concéntricas

- **Fecha:** 2026-11-23 · **Estado:** construido en la rama `claude/esquinas-cuatro-radios` (actividad 8 de la lista de `/construir` de
  las ocho mejoras de estética). Sin migraciones ni base: entra al fusionar y publicar la web. Número reservado con `pnpm reservar adr`.
- **Pidió:** Felipe, 2026-11-19, al ver la lámina `docs/maquetas/ocho-mejoras-2026-11/` («Quiero las 8»). La mejora 7 de esa lámina era
  «una escala cerrada de letra y de esquinas»; la letra fue ADR-0691 y esta es la otra mitad. En la lista aprobada: «8 · Esquinas: cuatro
  radios, y concéntricas».
- **Sigue a:** ADR-0012 (las esquinas dejan de ser rectas y se redondean desde tokens), ADR-0596 (el vidrio «Serena» y sus radios por
  pieza), el contrato de familia v4 con CAYLA Dynamic (`docs/familia/contrato.json`, radios por función y P10: una sola esquina de
  tarjeta, 22 px) y ADR-0691 (el mismo método: una escala, un candado y la deuda que solo baja).

## El problema

Había dos escalas conviviendo y, además, cientos de esquinas que no pasaban por ninguna. Los tokens decían 4 · 8 · 12 · 16 · 20 «para lo
que aún no es vidrio» y 14 · 22 · 28 · 32 para las piezas de vidrio; y al lado, radios escritos a mano de 5, 7, 9, 10, 11, 13, 18, 24,
26, 30 y 34 px. Dos piezas que hacen lo mismo salían con esquinas distintas, y una pieza dentro de otra podía ser más redonda que su
contenedor: se ve «pellizcada».

Medido el 2026-11-23 en 56 vistas del ERP local (47 a 1440 px y 9 a 375 px), leyendo la esquina que de verdad se pinta en cada pieza:

| Qué | Dato |
|---|---|
| Medidas de esquina distintas, sin contar píldoras ni círculos | 20 |
| Por pantalla | 6 de mediana, hasta 12 |
| Esquinas escritas a mano en el código | 659 en 145 archivos |
| Esquinas de una pieza pegada al borde de otra y más redonda de lo que su contenedor deja | 83 (48 de ellas, la foto de cada tarjeta de Existencias) |

## Las decisiones

### 1. En una pantalla, cuatro esquinas; lo que flota conserva las del contrato

DECIDÍ: las esquinas salen de una escala que vive en el `@theme` de `apps/web/app/globals.css`.

| px | Utilidad | En una hoja de estilos | Para qué |
|---|---|---|---|
| 6 | `rounded-sm` | `var(--radius-sm)` | lo chico: una casilla, una tecla, una celda (era 4) |
| 10 | `rounded-md` | `var(--radius-md)` | lo que vive dentro de otra pieza: la miniatura, la fila que se toca, la opción de una lista (era 8) |
| 14 | `rounded-campo` | `var(--radius-campo)` | un control: el campo, el combo, una opción grande, una nota |
| 22 | `rounded-tarjeta` | `var(--radius-tarjeta)` | una tarjeta, una tabla, un bloque |

Lo que flota trae la suya y una pantalla no la escribe: el cajón (28) y la hoja (32); en el celular las dos van a 26, y también la isla
de abajo. La píldora y el círculo no son un radio. Por debajo de 4 px no hay esquina: es el remate de un trazo (la punta de una barra,
el cuadrito de una leyenda de 10 px, el resaltado de una palabra), y no se vigila.

PORQUE:
- **14, 22, 28 y 32 ya estaban decididos y no son solo nuestros.** Son los radios por función del contrato de familia con Dynamic, y los
  de la hoja y el cajón los eligió Felipe mirando (ADR-0596). La lámina proponía 6 · 10 · 16 · 24 sobre una sola pantalla; llevar el ERP a
  16 y 24 habría cambiado todas las piezas de vidrio y el contrato. De la lámina quedan los dos chicos, 6 y 10, que el contrato no tenía.
- **La segunda escala (4 · 8 · 12 · 16 · 20) era la que el propio contrato llama «radios anteriores».** Se cierra en vez de convivir.
- **Con 6 · 10 · 14 · 22 lo concéntrico sale solo** (decisión 2). Con 4 · 8 no: 14 − 4 y 22 − 12 dan 10, que no estaba.

### 2. Concéntricas: adentro es afuera menos la separación

DECIDÍ: una pieza pegada al borde de otra (a 12 px o menos) lleva el radio de afuera menos la separación, y ninguna pieza es más redonda
que su contenedor. Cada escalón es otro menos 4 u 8 px (22 → 14 → 6, 22 → 10, 14 → 10) y el espacio del ERP va en múltiplos de 4, así que
casi siempre la cuenta cae en un escalón. Cuando no cae, se escribe la cuenta: `calc(var(--radius-tarjeta) - 9px)`.

Hecho en esta entrega: la foto y la tira de tallas de la tarjeta Vitrina de Existencias (22 − 9), la placa de quien entró dentro del menú
(28 − 12, y su botón 28 − 20), la fila abierta de Insumos (22 − 6), los avisos dentro del centro de avisos (22 − 12 = 10), las filas del
Historial de ventas dentro de su placa (22 − 8 = 14), los botones del paso de cantidad dentro de su caja (14 − 3) y las esquinas del
marco de los tres visores de cámara, que van por fuera (28 + 3).

PORQUE: es lo que la lámina mostraba con un dibujo («la de adentro es la de afuera menos el relleno»), y una regla que solo dijera «usa
la escala» no lo arregla: dos escalones bien elegidos pueden quedar pellizcados igual.

### 3. Los nombres de Tailwind apuntan a la escala; no se renombraron 620 usos

DECIDÍ: `--radius-lg` vale lo que `--radius-md` (10; era 12), `--radius-xl` lo que `--radius-campo` (14; era 16) y `--radius-2xl` lo que
`--radius-tarjeta` (22; era 20). `rounded` a secas, que en Tailwind son 4 px fijos y no sale de ningún token, pasó a `rounded-sm` en sus
187 usos, y el candado no lo deja volver.

PORQUE:
- Se midió con qué tamaño de pieza se pinta cada utilidad antes de elegir. `rounded-xl` se pintaba a 16 px en piezas de 40 a 63 px de
  alto la mitad de las veces: a 22 se habrían vuelto cápsulas. `rounded-lg` vive sobre todo en cuadros de 32 a 40 px (un ícono, una
  miniatura): a 14 quedaban casi redondos. `rounded-2xl` solo aparecía en piezas de 64 px o más.
- Renombrar los 620 usos no cambia nada a la vista y choca con los PR abiertos de otras sesiones. Si un día se quiere un solo nombre por
  escalón, es un cambio mecánico y sin riesgo: los valores ya son iguales.
- Lo que sí se tocó uso por uso son las piezas cuya función pedía otro escalón: `.card-cayla` de base y las tarjetas de Categorías y
  Atributos (16 → 22, la esquina de tarjeta de P10), `.kpi-vidrio`, los paneles de Editar producto.

### 4. Un candado: un archivo nuevo nace con la escala y la deuda solo baja

DECIDÍ: `apps/web/tema/esquina-suelta.mjs` es la única definición de «esquina suelta» (`rounded-[9px]`, `border-radius: 9px`,
`borderRadius: 9`, `rounded` a secas, `rounded-3xl`), con su prueba `lib/esquina-suelta.test.ts`, su lista
`lib/esquina-suelta-archivos.ts` y dos comandos: `pnpm --filter web tema:esquinas` (qué queda y a qué escalón iría) y
`tema:esquinas:registro`. Lo derivado no es suelto (`var()`, `calc()`), y una línea legítima lo dice: `esquina-fija: <por qué>`.
Es la misma forma que el candado de la letra, para que quien conozca uno conozca el otro.

### 5. Las piezas de diseño propio no se tocaron: decide Felipe

DECIDÍ: quedan como deuda declarada, sin mover, las esquinas de las piezas que Felipe eligió mirando una maqueta o una pantalla: Estados
financieros, los pases de Traslados, el Observatorio, Análisis, Rendimiento, El telar, Recibir «B», la página pública del club, la
etiqueta que se llena, el Inicio de almacén, Tienda web, la vista rápida de producto, Ajustar stock, las insignias y los sellos, Fusionar,
las vitrinas de Configuración, las guías, la persiana de Caja, Mi perfil y el aviso de cierre. Son 419 esquinas en 50 archivos; con las
15 del cobro de Vender, la deuda declarada queda en 434.

PORQUE: es el mismo criterio de P10 (2026-11-05), que dejó esas piezas fuera de la esquina única de tarjeta: «Felipe dice si se
unifica». Las utilidades (`rounded-md`, `rounded-xl`…) que usan esas pantallas sí siguen a la escala, porque son del sistema.

Dos salvedades:
- **La tarjeta Vitrina de Existencias sí se tocó** (20 → 22), aunque es de diseño propio (ADR-0589). Era el caso más visible de esquina
  pellizcada (48 en una pantalla) y la salida con menos cambio era esta: con la tarjeta a 22, la foto queda concéntrica a 13 (estaba en
  14). Lo que la hace «Vitrina» es su sombra y su forma de mostrar la prenda, no esos 2 px.
- **El cobro de Vender tampoco se tocó**, pero por otra razón: para verlo hace falta abrir una caja, que es escribir en la base local
  compartida. Lo que no se puede mirar no se cambia.

## Lo que cambia a la vista

Poco, y en todas partes a la vez: es un cambio de 2 a 6 px por pieza. Las teclas y las casillas chicas son un poco más suaves (4 → 6);
las miniaturas y los botones de ícono, también (8 → 10); las notas y los avisos pasan de 18 a 14, como los campos; las tarjetas de
Categorías y de Atributos pasan de 16 a 22, como las demás tarjetas; lo que flota (los globos, la lista de un combo, el centro de avisos,
el aviso de la esquina) pasa de 20 o 24 a 22.

## Verificado y no verificado

Las cifras de la medición, las capturas y lo que no se pudo ver están en `docs/milimetro/auditorias/2026-11-23-esquinas-cuatro-radios.md`.

## Dynamic

- **No viaja nada solo:** `vidrio/recetas.css` y `docs/familia/contrato.json` no cambiaron, y los cuatro radios del contrato tampoco.
- **Queda como tarea allá** (se mira `apps/web/app/estilos/vidrio/` y `components/ui/`): las notas y los avisos a 14; la lista de un combo,
  los globos y el aviso de la esquina a 22; la placa de quien entró y su botón, concéntricos con el menú; `rounded` a secas → `rounded-sm`
  en las piezas de `components/ui/`. Y, si Dynamic quiere la misma escala, sus dos chicos: 6 y 10.
- **Una nota del contrato quedó vieja:** `radios_anteriores` dice que Retail conserva 8 · 16 · 20 como tokens. Ya no. No se corrigió aquí
  porque el contrato viaja solo a Dynamic: se corrige con la próxima versión del contrato, cuando Felipe la abra.
