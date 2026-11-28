# ADR-0716 — Separar sin punto: ningún dato se separa con «·», cada dato va en su pieza

**Fecha:** 2026-11-27. **Estado:** aceptado. Felipe aprobó la regla de once casos para Retail y Dynamic el 2026-11-27, eligió «con ícono»
en la línea de datos y «frase» en la cabecera con cuenta, y eligió Movimientos como primer módulo de muestra en el panel. Los demás
módulos esperan a que Felipe mire la muestra. Solo web: sin migración, sin cambios de RPC, de permisos ni de datos. Es una regla común
de los dos sistemas: en Dynamic es su ADR 0007 (`docs/adr/0007-sin-punto-medio.md` allá) y en el contrato de la familia es la regla de
sistema **S10** (`docs/familia/contrato.json`, versión 5).

## Contexto

Felipe, 2026-11-24, al ver una maqueta de Existencias: el «·» como separador «no se ve bien, considero que hay mejores maneras». La
tienda online lo quitó entero al día siguiente (#2021, con `apps/tienda/lib/sin-punto-medio.test.ts`). En el panel había **2 435 líneas
visibles con «·» en 871 archivos** (medido con el mismo analizador de la prueba: solo texto que el código dibuja, sin comentarios). En
Dynamic se hizo una muestra en Asistencia y, al ver «AQP 7 casos» suelto en Incidencias, Felipe pidió investigar formas mejores para los
dos sistemas antes de seguir.

Se revisaron BBC GEL, GOV.UK, Atlassian, GitHub Primer, Stripe, IBM Carbon, Microsoft Fluent, Shopify Polaris y Apple. **Ninguno
recomienda el «·»: los que resuelven bien este problema separan con estructura, no con un signo.** Y un signo se oye distinto en cada
lector de pantalla: NVDA calla el «·» sin pausa, así que «Ana Torres · TRU · lun 3 nov» suena como una sola tira (pruebas de Deque y
Eleven Ways, 2023); JAWS dice «dot»; el «|» corre la misma suerte. La propuesta completa, con maquetas y fuentes, es el artifact
«Separar sin punto» (https://claude.ai/artifact/WXzKXUXxn8wzt17nuib4aH).

## Decisión

**Antes de separar, preguntar qué relación tienen los datos.** Si se pueden decir en voz alta, van en una frase. Si son atributos
sueltos de una misma cosa, van como piezas con espacio. Si son de distinta clase (un nombre y una cuenta), van en zonas distintas. Un
signo entre ellos solo esconde que nadie tomó esa decisión.

| # | Caso | En lugar del «·» | Ejemplo |
|---|---|---|---|
| 1 | Quién, dónde, cuándo | Frase con la palabra que une («en», «el», «por»); rangos con «de… a…» | «Salida por venta», «entre las 10:04 y las 11:29, por Ana y Luis» |
| 2 | Datos sueltos de una fila | **Línea de datos** (`<LineaDeDatos>`): piezas con espacio y **ícono** (Felipe eligió «con ícono»), rótulo solo para el lector | 📏 M  🎨 Negro  📍 Almacén |
| 3 | Un nombre y una cuenta | Nombre a la izquierda; la cuenta a la derecha **como frase** (Felipe eligió «frase»), lo urgente en rojo profundo (`<CabeceraConCuenta>`) | «Lo que apareció … 5 prendas, todas por explicar» |
| 4 | Un dato con su rótulo | Rótulo arriba y valor abajo (`<ParDato>`); en una línea, «Rótulo: valor» | «Sede: todas» |
| 5 | Un valor con una nota | Paréntesis | «Ajuste a mano (merma)», «30 prendas (2 se anularon)» |
| 6 | Un estado con su tiempo, en una etiqueta | Frase corta | «En pausa hace 12 min» |
| 7 | Una lista armada en código (`join(" · ")`) | «a, b y c» (`listaDicha`, sobre `Intl.ListFormat`) | «80 por traslado y 13 de stock inicial» |
| 8 | Un paso numerado | El número como pieza aparte (`<TituloGrupo paso>`) | «4  Precio y cantidad» |
| 9 | Una celda vacía | «—» (con «sin prendas» para el lector) | — |
| 10 | Un papel que se imprime | Cada dato en su pieza, con espacio | «CAYLA   Trujillo» en la hoja de Ingresos |
| 11 | El título de la pestaña | «\|», el único signo que queda | «Blusa Emma \| CAYLA» |

**Las tres piezas compartidas** (las que piden más de una pantalla y viajan a Dynamic):

- **`<LineaDeDatos datos>`** (`apps/web/components/ui/LineaDeDatos.tsx`), caso 2. Cada dato es `{ icono, rotulo, valor }`: el ícono de
  lucide a 14 px y con su grosor de fábrica («Los íconos», `unificar.md`), `aria-hidden`; el rótulo en `sr-only` («Talla: »); lo vacío no
  se dibuja. Letra de 14 px en el tono secundario; la fila le pone `text-sm` si es su segunda línea de lectura. Es un `span` (vive dentro
  de botones y filas clicables, donde una lista no es válida).
- **`<CabeceraConCuenta cuenta codigo>`** y **`<CuentaEnFrase>`** (`apps/web/components/ui/CabeceraConCuenta.tsx`), caso 3, con el texto
  en `cuentaEnFrase()` (`apps/web/lib/cuenta-en-frase.ts`, puro). No es otro título: es `<TituloSeccion>` con la frase en su lado derecho
  (`dato`). Concuerda con lo que cuenta («todos los casos», «todas las prendas», «los dos», «de prioridad alta» si es uno solo).
- **`listaDicha(elementos, "y" | "o")`** (`apps/web/lib/lista-dicha.ts`), caso 7: la única copia de `Intl.ListFormat("es")` del panel
  (había **20** sueltas en 16 archivos; ahora todas la llaman, y `unirConO` de la tabla viva también). Al lado, **`prendaDicha`**: una
  prenda como la dice la tienda online, «Blusa Emma, negro, talla M».

**Relación con el globito de `TituloSeccion` (ronda 9 de /unificar).** La ronda 9 dice «cuántos hay va pegado al nombre, nunca a la
derecha». Sigue valiendo para un conteo pelado, cuando el nombre ya dice qué se cuenta («Pendientes 3»: el contador de Atlassian y
Primer). El caso 3 es otro: la cuenta necesita palabras porque lo que cuenta no es lo que dice el título, o porque trae su parte urgente.
Esa va dicha a la derecha.

## La muestra: Movimientos (Movimientos, Ingresos y Pérdidas)

Elegida por Felipe el 2026-11-27 entre Movimientos, Caja y Colaboradores: muy vista por las encargadas, chica (56 líneas en 15 archivos)
y con casi todos los casos. Lo que cambió:

- **La fila de un movimiento:** el rótulo dice su detalle entre paréntesis («AJUSTE A MANO (MERMA)», «LLEGADA (RECEPCIÓN)») y la segunda
  línea es la línea de datos: talla, color y dónde, con su ícono. La de varias prendas: cuántas y dónde. El mazo de colgadas: «entre las
  10:04 y las 11:29, por Ana y Luis».
- **Los nombres de los procesos** (`ETIQUETA_PROCESO`, que también leen la historia de la prenda y los filtros): «Ajuste a mano (merma)»,
  «Dañado (se arregló)», «Prenda sin registrar (ingreso)». La dirección se dice en frase: «Salida por venta», «Entrada por traslado
  recibido».
- **Los tipos de la derecha:** «Filtrar por tipo (hoy)», «30 prendas (2 se anularon)», «−35 faltaron y +4 aparecieron», y su ayuda con
  la lista dicha.
- **El cajón:** «Había 3 y ahora hay 4», «Se cobró en caja (Boleta B001-123)», y la prenda como «Negro, talla M».
- **Pérdidas:** las dos listas con `<CabeceraConCuenta>` («Lo que apareció … 5 prendas, todas por explicar»), «Se perdió en TRU (últimos
  30 días)», «Se repite en los últimos 30 días», la prenda en frase y «Más faltan» con la línea de datos (categoría, talla y color).
- **Ingresos:** las notas entre paréntesis, la celda vacía de la matriz con «—», y la hoja que se imprime con cada dato en su pieza.
- **La cabecera de toda pantalla** (`EncabezadoPagina` y `FechaHoraLima`): la sede, el día y el detalle son tres piezas con espacio
  («TRU   VIERNES 27 DE NOVIEMBRE, 12:41»); en el teléfono el día baja a su línea en vez de partirse. Es compartida por todas las pantallas
  y se cambió para todas, como hizo Dynamic con su sobretítulo: el cambio es igual de bueno en cualquiera.

## El freno

`apps/web/lib/sin-punto-medio.test.ts` lee con el analizador de TypeScript lo que el código **dibuja o escribe** (textos entre comillas,
plantillas y texto de JSX, sin comentarios) en las rutas de cada módulo, y falla si aparece «·», `·` o `&middot;`. Es el mismo
detector que el de Dynamic. `MODULOS` **solo crece**: para sumar un módulo se agregan sus carpetas y lo que solo él usa; quitar una ruta
es apagar el freno para esa pantalla, y la prueba también falla si una ruta deja de existir. La salida legítima es declarar la línea:
`// punto-medio-permitido: <por qué>` (el motivo es obligatorio). La misma prueba renderiza las piezas y comprueba cómo suenan.

## Cómo viaja a Dynamic

`components/ui/` es de las carpetas que el vigilante de Dynamic **mira** (no copia): al ver `LineaDeDatos.tsx` y `CabeceraConCuenta.tsx`
nuevos, abre una tarea en su aviso. `docs/familia/contrato.json` **viaja solo**: lleva la regla S10 y, en `aplicacion_pendiente`, qué
tiene que hacer Dynamic (traer las tres piezas con la misma forma; reemplazan a su `linea-de-datos.tsx` y a `cuentaDeCasos`, que ya
tienen la misma forma). Las dos funciones de texto (`lista-dicha.ts`, `cuenta-en-frase.ts`) son puras y sin React. Desde aquí no se
escribe en el repositorio de Dynamic.

## Lo que queda fuera

- **Los comentarios de código y lo que no se ve.**
- **Lo que la base ya guarda con «·»** se lee tal cual; al mostrarlo se dice con coma o en su pieza, con la línea declarada.
- **El resto del panel: 2 380 líneas en unos 850 archivos.** Se limpia módulo por módulo con el OK de Felipe, sumando cada módulo a
  `MODULOS`. Lo compartido que Movimientos usa pero que es de otro módulo (`DetalleVentaModal`, de Ventas) entra con su módulo.

## Alternativas descartadas

- **Cambiar el «·» por otro signo** («|», «—», «/»): se oye igual de mal y sigue sin decir qué relación tienen los datos.
- **Todo con comas:** la primera muestra de Dynamic lo hizo; datos que no forman frase («M, Negro, Almacén») se leen como una frase rota.
- **Un contador en pastilla para el caso 3:** Felipe eligió la frase mirando las dos.
