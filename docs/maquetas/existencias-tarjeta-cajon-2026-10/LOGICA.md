# Existencias: tarjeta compacta y cajón de la talla — lógica y funcionamiento

Maqueta del 2026-10-07. Probar: `prototipo.html` (mismo directorio). Láminas de opciones: `index.html`.
Datos del prototipo: nombres tomados de la captura de Felipe (base local); cantidades, sedes, apartados y dañadas **inventados**.

Este documento es el contrato para implementar. **No cambia ninguna regla de negocio ni la base**: cambia cómo se ven y
dónde se tocan cosas que ya existen. Donde el prototipo simplifica una regla real, se dice cuál manda en el código.

---

## 1. La tarjeta (una por modelo, se ve un color a la vez)

### Qué muestra
| Parte | Contenido | Fuente en el código |
|---|---|---|
| Cabecera | Foto 40×46 (o `MosaicoPrenda`), nombre, precio | igual que hoy |
| Línea 2 | Puntos de color (16 px, área de toque 26 px) + nombre del color + insignias «N dañada(s)» / «N apartada(s)» si las hay en ese color | `PrendaAgrupada.danado`, `.apartado` |
| Tabla | Una columna por talla; dos filas: **En el piso** y **Almacén** (libres) | `pisoDisponible`, `almacenDisponible` |
| Pie | Botón de la acción que toca + «Más ⌄» | §1.3 |

Sede que no separa piso y almacén: una sola fila, «Disponibles».

### 1.1 Estado de cada talla (pinta la celda)
| Estado | Cuándo (prototipo) | Cómo se ve | En el código manda |
|---|---|---|---|
| Por colgar | piso libre = 0 y almacén libre ≥ 1 | celda «En el piso» en ámbar | `estadoTalla(f) === "por_colgar"` (usa el motor del piso: una talla de los extremos puede no pedirse) |
| Se acabó | libres = 0 | **la columna entera en rojo suave** (cabecera, piso y almacén); el pie de la tarjeta dice «Se acabó: L» | `estadoTalla(f) === "sin_stock"` |
| Normal | lo demás | número en tinta; un 0 tenue | — |

### 1.2 Dónde se toca y qué abre
| Toque | Resultado |
|---|---|
| Cualquier parte de la tarjeta (foto, nombre, precio, espacio en blanco, filas) | Abre el cajón en «Esta talla», en la **talla de entrada**: la primera por colgar → si no, la primera «no hay aquí» → si no, la primera talla |
| Encabezado o celda de una talla | Abre el cajón **listo para colgar** ese color y esa talla (paso «Colgar», 1 de fábrica). Si esa talla no tiene nada en almacén: abre «Esta talla» (si se acabó, «Pedir a otra sede» va primera) |
| Punto de color | **No abre**: cambia el color de la tarjeta (tabla, foto e insignias) |
| Botón de acción | Abre el cajón **ya en el paso** de esa acción |
| «Más ⌄» | Abre un menú (con clic, no al pasar el mouse) |
| Enter con la tarjeta enfocada | Igual que un clic en la tarjeta |

Implementación: el `<article>` lleva el `onClick`; los botones de adentro (color, talla, acción, Más) hacen `stopPropagation`.
La tarjeta es enfocable (`tabIndex={0}`, `role="button"` no: lleva botones adentro; se usa `aria-label` + Enter).

### 1.3 El botón de la tarjeta (en este orden)
| # | Si, en el color que se ve… | Botón | Al tocar |
|---|---|---|---|
| 1 | alguna talla está por colgar | **Colgar en el piso** (ámbar), «· N tallas» si son varias | **siempre** «Colgar varias» (la tabla), aunque falte una sola talla |
| 2 | alguna talla se acabó | **«Se acabó: L»** (texto rojo, no es botón). Ya no hay botón «Pedir talla X» | — (Pedir vive en «Más» y en el cajón) |
| 3 | nada que hacer | **✓ Todo en el piso** (texto verde, no es botón) | — |

Con un filtro «Hoy» o «Condición» puesto se mantiene lo de hoy (`marcaDelFiltro`): marca de las tallas que cumplen y «Ver».

### 1.4 Menú «Más»
Subir a almacén · Enviar a otra sede · **Pedir a otra sede** (si alguna talla se acabó y otra sede la tiene) · Ajustar stock · Ver ficha. Una opción que hoy no se puede hacer se ve apagada con su
motivo («No hay nada colgado», «No hay nada en almacén»). Solo se dibujan las que el rol permite (`puedeReponer`, `puedeEnviar`,
`puedeAjustar`). Reemplaza al icono de la percha + ventana al pasar el mouse (`AccionesTarjeta`).

---

## 2. El cajón (panel de la talla)

Sale por la derecha (440 px; en celular, hoja desde abajo). Bloquea la pantalla de atrás (velo); se cierra con ✕, Escape o
tocando el velo. Si hay un paso a medias con algo cambiado, primero pregunta «¿Salir sin guardar?» (igual que hoy,
`useSalidaSinGuardar`). Dos pestañas: **Esta talla** y **Todas**. «Ficha» deja de ser pestaña: es el enlace «Ver ficha» al pie.

### 2.1 Esta talla
1. Colores y tallas para cambiar sin salir (talla ámbar = por colgar; punteada = no hay aquí; negra = la que se ve).
2. **Número grande** = piso + almacén + apartadas + dañadas de esa talla en esta sede, con una insignia (tabla 2.2).
3. **Cuatro casillas**: en el piso · en almacén · apartadas · dañadas.
   - En 0: apagadas (borde punteado). Excepción: **piso en 0 con algo en almacén** va en ámbar (es lo que falta).
   - Apartadas > 0 y dañadas > 0 se tocan (flecha ›): abren la lista de esa talla (hoy `onVerApartadas`, `onVerDanadas`).
4. **Lista de acciones** (tabla 2.3). La que toca sube primera y va teñida; las que no se pueden quedan en su lugar, apagadas,
   con el motivo. Cada fila muestra su número de teclado.
5. Pie: «Ver ficha» y «¿Cómo se vende?» (despliega el ritmo y el código, hoy siempre visibles).

### 2.2 Insignia junto al número (primera que se cumple)
| # | Si… | Insignia | Tono |
|---|---|---|---|
| 1 | hay unidades en camino | «N en camino» | pizarra |
| 2 | por colgar | «Cuelga N» (N = lo que falta para el requisito del piso; de fábrica 1) | ámbar |
| 3 | se acabó y otra sede tiene | «Se acabó · Sede tiene N» | rojo |
| 4 | se acabó en todas las sedes | «Se acabó en todas las sedes» | rojo |
| 5 | queda 1 libre y otra sede tiene | «Queda 1 · Sede tiene N» | pizarra |
| 6 | lo demás | «Todo bien» | verde |

Reemplaza las tres filas «¿Hay? / ¿Colgar? / ¿Pedir?»; las frases salen de la misma lógica (`queTocaConLaTalla`), solo que
se muestra una.

### 2.3 Acciones de la talla
| Acción | Se puede si… | Si no, dice | Qué hace |
|---|---|---|---|
| Colgar en el piso | almacén libre ≥ 1 | No hay nada en almacén | paso: cantidad (1…almacén) → piso + N, almacén − N |
| Subir a almacén | piso libre ≥ 1 | No hay nada colgado | paso: cantidad → piso − N, almacén + N |
| Apartar para un cliente | libres ≥ 1 | No queda ninguna libre | va a Vender ▸ Apartar con la talla puesta (`hrefApartarDesdeTicket`) |
| Enviar a otra sede | almacén libre ≥ 1 | Solo se envía lo del almacén | paso: sede + cantidad → traslado en camino |
| Pedir a otra sede | **solo aparece** si libres ≤ 1, otra sede tiene y no hay nada en camino | — | paso: sede (preelegida la que más tiene) + cantidad |
| Ajustar stock | siempre (si el rol puede) | — | paso: lugar (piso / almacén / dañadas) + número real + motivo |

Orden: la sugerida primero (Colgar si está por colgar; Pedir si no hay aquí), luego el orden de la tabla. Teclas 1–9 =
número de la fila. Los permisos son los de hoy (`accionesDeTalla`): una acción que el rol no tiene no se dibuja.

### 2.4 Todas
- Número grande del **modelo** (todos los colores) + insignia «N por colgar» o «Todo en el piso».
- Las mismas cuatro casillas, sumadas.
- **Tabla de barras (opción B, elegida por Felipe 2026-10-07; las otras dos en `todas-opciones.html`)**: cabecera = tallas,
  izquierda = colores. Cada celda es un botón partido en dos: **arriba, en el piso** (fondo verde suave, percha y número) y
  **abajo, en almacén** (caja y número; un 0 tenue). Piso en 0 con algo en almacén: la mitad de arriba en ámbar. **Se acabó: la
  celda entera roja**, «Se acabó». Marco negro = la talla que estabas viendo. Leyenda de una línea arriba de la tabla. Tocar una
  celda → «Esta talla» en esa talla.
- Acciones: **Colgar varias tallas y colores** (dice cuáles; paso de §2.5 bis) y Enviar.

### 2.5 Los pasos (dentro del cajón)
- Arriba «‹ Volver a la talla». Título, una línea de contexto (prenda · color · talla).
- Cantidad con − / + (no deja pasar del máximo ni bajar de 1) y **antes → después** de piso y almacén.
- El botón principal dice lo que va a hacer («Colgar 2», «Enviar 1 a Trujillo»). Apagado mientras falte algo, y debajo
  «Falta: …» (regla de la guía de foco, ADR-0284).
- Al guardar: vuelve a «Esta talla» con «✓ colgaste 2» arriba, y la tarjeta de atrás se actualiza.
- Teclado: Enter confirma (si el botón está activo y el foco no está en otro botón); Escape vuelve (pregunta si hay cambios).

### 2.5 a Colgar en el piso / Subir a almacén (una talla)
- Título + un chip con el color y la talla («● Beige · Talla L»).
- Una pregunta: «¿Cuántas sacas del almacén?» (o «¿Cuántas descuelgas?»), con − n + y el atajo «Todas (N)» si hay más de una;
  debajo, «Hay N en almacén».
- «Así va a quedar»: dos cajas, origen y destino, con el número **después** en grande y «antes N» chico; entre ellas, lo que viaja
  («1 →»). El destino va en verde. Nada de «0 → 1» ni «de 2».
- Botón: «Colgar 1 en el piso» / «Subir 1 a almacén».

### 2.5 bis Colgar varias (tabla de cantidades, como la de Nuevo producto ▸ cantidades)
- El cajón se ensancha (660 px; en celular la tabla se desliza de lado dentro de su caja).
- **Cabecera: las tallas. Izquierda: los colores**, cada fila con la franja de su color (como `MatrizCantidades`). Columna y fila
  **Total**; la fila Total queda abajo solo si hay más de un color, la columna solo si hay más de una talla.
- Cada celda con algo en almacén lleva una caja − [n] + y debajo dos líneas: «falta en el piso» o «ya hay N colgada(s)», y «N en almacén». **Nunca pasa de N ni baja de 0**:
  lo tipeado de más se recorta a N.
- **Celda sin nada en almacén: inhabilitada** (rayada, «—», sin caja) y dice lo que hay en el piso o «no hay».
- Celda «falta en el piso» (por colgar): caja en ámbar y «falta · hay N».
- Viene llena con **1 en cada talla que falta en el piso** y 0 en el resto. Barra arriba: «Llenar todas con [n]» (cada celda hasta su
  N), «Solo lo que falta (N)» (vuelve a lo sugerido: 1 en cada talla SIN NINGUNA colgada; las que ya tienen colgada quedan en 0) y «Vaciar».
- Botón: «Colgar N prendas · M tallas»; apagado con «Falta: al menos una cantidad» si todo está en 0.
- Guarda **un solo movimiento por celda** con cantidad > 0 (la RPC de hoy de colgar varias); al terminar, vuelve a la talla con «✓».

### 2.6 Teclado del cajón
← → talla · ↑ ↓ color · 1–9 acción · Escape cierra (o sale del paso). Las flechas siguen la regla de los cajones
(`useFlechasDelCajon`, ADR-0128).

---

## 3. Qué NO cambia
- Las RPC y lo que guardan cada acción (`FlujoTalla`), el responsable, los permisos y el motor del piso.
- Los filtros, la búsqueda, la pistola y «Para hoy».
- Lo que se cuenta como libre: lo apartado y lo dañado no se cuelgan, no se suben ni se envían.

## 4. Qué se toca al implementar (estimado)
| Archivo | Cambio |
|---|---|
| `components/ExistenciasTarjetas.tsx` | tarjeta compacta: tabla piso/almacén, clic en toda la tarjeta, insignias dañada/apartada, pie nuevo |
| `components/existencias/AccionesTarjeta.tsx` | pasa a «botón con nombre + Más ⌄ con clic»; se va el icono solo y la ventana al pasar el mouse |
| `lib/existencias-acciones.ts` (+ prueba) | la acción de la tarjeta por color (§1.3), opciones de «Más» con motivo |
| `components/existencias/FlujoTalla.tsx` | «Colgar varias» como tabla de cantidades tallas × colores (reutilizar el estilo de `alta-producto/MatrizCantidades`) |
| `components/existencias/PanelTalla.tsx` | cuatro casillas con piso ámbar, insignia única, lista de acciones con apagadas en su lugar, «Ficha» como enlace, «¿Cómo se vende?» plegado, «Todas» con tablas por color |
| `lib/existencias-panel-talla.ts` (+ prueba) | `insigniaDeTalla` (§2.2), orden y apagado de `accionesDeTalla` |
| `lib/guia-de-foco-pantallas.ts` | sin cambio de estado (los pasos ya traen su guía); revisar |

Verificación: pruebas de `lib`, `/focus`, `/formidable`, `tema:auditar` (claro y oscuro), 375 px y captura al mismo ancho que esta
maqueta.

## 5. Pendiente de Felipe
1. ¿«Pedir a otra sede» solo cuando queda 1 o ninguna (como hoy), o siempre que otra sede tenga?
2. Con varios colores por colgar, el botón de la tarjeta habla **del color que se ve** (prototipo). Hoy «Colgar» abre el modelo
   entero. ¿Por color o por modelo?
3. ¿«Ver ficha» en el menú «Más» de la tarjeta, o solo en el cajón?

## 6. Sobre el rojo
La guía de colores (ADR-0169) reserva `rojo` como acento, «máx. 2 por pantalla». Felipe pidió (2026-10-07) que la talla agotada
se vea en rojo: se usa **rojo suave** (12 % sobre el papel) y el texto en `rojo`, solo para «se acabó». En una lista con muchas
agotadas habrá más de dos: es una excepción a decidir y anotar en el ADR al implementar.
