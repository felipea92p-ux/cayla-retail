# ADR-0344 · Existencias: un icono por tarjeta, atajos de filtro, sonido al confirmar y «Colgar primero»

- **Fecha:** 2026-10-05 · **Estado:** construido en la rama `claude/practical-wiles-573af6` (6 commits, uno por actividad). **Solo web, sin
  migración y sin tocar producción.** Verificado: `tsc`, ESLint y las 356 archivos de prueba de `apps/web` en verde (156 066 pruebas), y las
  piezas nuevas dibujadas con datos inventados en el navegador (tarjeta, ventana de acciones, atajos, «Colgar primero» y la tabla de la ventana de
  colgar). **No se probó con sesión real ni con datos de producción** (ver «Lo que no se verificó»).
- **Pedido:** Felipe, 2026-10-05, tras una serie de maquetas de Existencias («táctil y rápida»): llevar la maqueta al sistema, con sonido al
  confirmar, sin «Practicar» y con el movimiento de CAYLA (sin «Expresivo»).
- **Maqueta:** `docs/maquetas/existencias-tactil-2026-10/index.html` (también publicada como artefacto). Es la referencia visual; el sistema manda
  en los nombres (ver «El nombre»).
- **Complementa:** ADR-0331 (la cara de Existencias), ADR-0326 (la barra de filtros), ADR-0328 (inventario por olas), ADR-0136 (movimiento),
  ADR-0231 (la ventana no sugiere cuántas colgar). **Respeta:** ADR-0339 (PR #808, abierto): «Colgar en el piso» es el único nombre.

## El nombre (un choque que hubo que resolver)

La maqueta decía «Reponer» y «Retirar del piso» (el glosario «Lenguaje de tienda CAYLA», 2026-10-05). El PR #808 —la decisión de Felipe del
2026-10-04, ADR-0339— retira «Reponer» para esta acción, fija **«Colgar en el piso»**, deja **«Subir a almacén»** como está y protege el nombre
con una prueba que rompe el build si reaparece uno retirado. Se preguntó cuál valía y Felipe eligió **«Colgar en el piso»**. Todo lo construido
lo usa: la acción de la tarjeta, el botón de la ventana («Colgar N prendas»), «Colgar primero» y la inversa «Subir a almacén». «Enviar a otra sede»
no choca con nada. La maqueta conserva sus nombres de glosario y lo dice arriba.

## Decisiones

**1. Un icono por tarjeta y una ventana hacia arriba** (`components/existencias/AccionesTarjeta.tsx`, `lib/existencias-acciones.ts`).
DECIDÍ: la tarjeta muestra UN icono —la acción que le toca (colgar, en ámbar; sin nada que colgar, «⋯»)— y al pasar el mouse o enfocar con el
teclado se abre hacia arriba una ventana con TODAS las acciones y su nombre, la del icono incluida y resaltada: Colgar en el piso · Subir a almacén ·
Enviar a otra sede · Ajustar stock · Reportar dañada · Ver detalle. En tablet un «⋯» al lado la abre con un toque. Una acción sin permiso no se dibuja;
una que se puede pero hoy no tiene con qué se ve apagada y dice por qué. Se abre con CSS (`group-hover`, `focus-within`), no con estado.
DESCARTÉ: dejar el botón con texto «Reponer» más el menú «⋯» de la esquina, porque eran dos controles para lo mismo y el texto no cabía en
`btn-chico` con el nombre nuevo (más largo); y mostrar los tres iconos siempre, porque en 8 tarjetas son 24 botones iguales y ninguno dice cuál conviene.
SE ROMPE SI: una integrante con mouse no sabe que hay más acciones escondidas (el icono solo no lo dice). Si pasa en la prueba con alguien sin
capacitación, vuelve un indicador mínimo; no se puso porque se pidió menos elementos.

**2. Sin indicador de estado en la tarjeta.**
DECIDÍ: se quitó la pastilla «3 tallas por colgar»: las etiquetas ámbar del riel ya lo dicen. Sigue dicha para el lector de pantalla
(`EstadoParaLector`). La cifra que trae a la persona desde «Para hoy» sigue arriba, en la línea del conteo («6 prendas · 15 tallas por colgar»).
DESCARTÉ: dejarla, porque repetía lo que ya se ve. Esto toca la actualización (c) de ADR-0331 («la suma de las pastillas es la cifra de Para hoy»):
la suma ahora se comprueba con la línea del conteo y las etiquetas ámbar, no con una pastilla por tarjeta.
SE ROMPE SI: alguien necesitaba contar las pastillas para creerle al número de «Para hoy». La línea del conteo sigue ahí para eso.

**3. Atajos de filtro bajo el buscador** (`components/existencias/FiltrosRapidos.tsx`, `lib/existencias-rapidos.ts`).
DECIDÍ: cinco botones —Todo · Por colgar · Sin stock atrás · Apartadas · Dañadas— que escriben los mismos filtros «Hoy» y «Condición» del panel,
con las mismas cifras. Se ven solo con iconos (nombre y cifra al pasar el mouse) o con texto; el gusto se guarda por equipo
(`lib/preferencia-local.ts`). El escáner pasa a ser un icono junto al buscador. Los nombres son los de la píldora (`TEXTO_HOY`), no unos propios.
DESCARTÉ: reemplazar el panel «Filtros» de ADR-0326 (la estructura de Productos fue decisión de Felipe) y una fila de filtros nueva con otra
lógica: dos fuentes de verdad para lo mismo. Un atajo es UNA elección: elegir uno quita el «Hoy» y la «Condición» que hubiera; con «Mantener», o
un «Hoy» más una «Condición», ningún botón se enciende (no se afirma lo que no es). Una prueba exige que cada atajo, escrito en la URL y leído de
nuevo, se encienda a sí mismo y a ningún otro.
SE ROMPE SI: alguien usa solo iconos y no distingue «Sin stock atrás» de «Dañadas». El interruptor y el nombre al pasar el mouse lo cubren, pero en
tablet no hay mouse.

**4. Sonido al confirmar** (`lib/sonido-confirmar.ts`, `components/BotonSonidoConfirmar.tsx`).
DECIDÍ: al colgar en el piso, subir a almacén, ajustar o reportar una dañada suena una campanita corta (dos tonos que suben) y vibra, en el mismo
instante del aviso verde. Se apaga por equipo con un icono en la barra de Existencias; de fábrica suena, como se pidió. Mismo motor de audio que el
bip de la pistola (`reproducirPatron` en `sonido-conteo.ts`), sin duplicarlo. Al encenderlo suena una vez: la persona oye cómo es y el navegador
ya deja sonar.
DESCARTÉ: guardarlo en la cuenta o en la base (una boutique con música baja no quiere campanitas: lo decide el lugar, no la persona) y sonar en
todo `avisar.exito` de la app (alcance que nadie pidió).
SE ROMPE SI: un navegador no deja sonar hasta el primer toque: la primera confirmación puede quedar muda. No pierde nada; es una comodidad.

**5. «Colgar primero»** (`components/existencias/ColgarPrimero.tsx`, `lib/existencias-colgar-primero.ts`).
DECIDÍ: sobre la lista de tarjetas, sin filtros ni búsqueda (o solo «Por colgar»), las tres prendas de TODA la sede que más conviene colgar, **en el
orden de la lista del día del motor del piso** (el mismo de «Para hoy» y del Inicio de Almacén), con el aro de cuántas semanas dura lo que hay al Ritmo
reciente. Respeta las dos decisiones de Felipe del ritmo (2026-09-25): con pocas jornadas NO dice una tasa y cero ventas NO dice «nunca vende»; en
esos casos la fila lo cuenta («Poco tiempo en el piso para medir…», «Sin ventas esta semana») y no dibuja aro. Con el piso sin cuadrar no muestra nada.
DESCARTÉ: el orden de la maqueta (ventas por semana × tallas que faltan): sería un SEGUNDO orden de «qué colgar» y la misma prenda saldría primera
en una pantalla y tercera en otra.
SE ROMPE SI: el motor del piso cambia su criterio de la lista del día: «Colgar primero» lo sigue solo, que es lo que se quiere.

**6. La ventana de colgar dice qué falta, llena con un toque y avisa lo que casi no hay** (`ReponerPrendaModal.tsx`, `MatrizMover.tsx`,
`lib/reponer-prenda-reglas.ts`).
DECIDÍ: la frase «Faltan en el piso: Azul marino 26, 28 · Celeste 30.» con un punto ámbar en esas casillas; los atajos «Lo que falta en el piso · N»
(1 de cada una), «Todo el almacén» y «Vaciar»; y una franja por cada talla que casi no hay aquí y otra sede sí tiene (y no viene en camino). Todo sale
de la decisión del motor (`hoyDeTalla`).
DESCARTÉ: abrir la tabla ya llena, como hace la maqueta de referencia («Ya las marqué abajo»): ADR-0231 pide que arranque en 0 y que la cifra la
ponga quien tiene la prenda en la mano. Los atajos llenan solo cuando la persona los toca, con el mismo 1 por talla con que Existencias manda a
colgar lo marcado (`lineasParaBajar`, ADR-0237).
SE ROMPE SI: alguien toca «Todo el almacén» sin mirar y cuelga lo que no cabe en el piso. El tope de la capacidad (ADR-0329) todavía no se pregunta
aquí.

## Segunda vuelta (2026-10-05, tarde): «debería verse como la maqueta»

Felipe vio la primera entrega publicada y pidió que Existencias se vea como la maqueta. Eligió, sobre cuatro preguntas:

**7. La tarjeta de la maqueta** (`ExistenciasTarjetas.tsx`, `lib/inventario-v2.ts`).
DECIDÍ: foto (o su categoría sobre su color), nombre, marca · categoría, **precio de catálogo**, colores de 20 px con el nombre del que se ve, las tallas como
**botones** con «N piso» (por colgar en ámbar, sin nada con borde punteado; tocarla abre el cajón de esa talla) y el icono único con sus acciones. Los guardados
se dicen en la línea del color y al pasar el mouse por la talla. El precio llega con la lectura de stock (`variantes.precio` en el `select`; opcional en la fila).
DESCARTÉ: dejar el riel de etiquetas de ADR-0331, que Felipe aprobó el 2026-10-04: lo reemplaza porque pidió «como en la maqueta».
SE ROMPE SI: alguien necesitaba ver las guardadas de cada talla sin pasar el mouse: ahora solo está la suma por color.

**8. «Para hoy» sale de la primera pantalla; queda el botón «Pendientes».**
DECIDÍ: la pantalla arranca con la barra y las tarjetas. Las tareas (cuadrar el piso, ventas sin registrar, dañadas, apartados vencidos, traslados) siguen en una
ventana que abre el botón «Pendientes · N».
DESCARTÉ: quitarlas del todo, que fue lo que se pidió: «Regularizar» (ADR-0330 lo sacó de la cabecera) y «Decidir» las dañadas no tendrían ninguna entrada desde
Existencias, y las ventas sin registrar tienen plazo (15-oct). Es una desviación del pedido; se deshace borrando el botón.
SE ROMPE SI: nadie toca «Pendientes» y una venta sin registrar se vence: el aviso del Inicio sigue, pero ya no hay tarea visible en Existencias.

**9. «Se acaban» y «Sin ventas»** (dos opciones nuevas de «Condición», `lib/existencias-filtros.ts`).
DECIDÍ: «Se acaban» = algo colgado que dura una semana o menos al Ritmo reciente medido (`DIAS_SE_ACABA`); «Sin ventas» = colgada, con jornadas suficientes y ninguna
venta esta semana. Salen en el panel «Condición» y como los «Recomendados» de la fila de atajos. Con pocas jornadas no se afirma nada.
DESCARTÉ: «sin ventas en 30 días» (el motor lee 14; Frescura calcula 30) y decir «nunca vende» (decisión de Felipe del 2026-09-25).
SE ROMPE SI: «sin ventas esta semana» se lee como «esta prenda no sirve»: son pocas jornadas de evidencia.

**10. «Prioridad | A–Z»** junto a los atajos (mismo estado que «Ordenar por», que sigue con sus otros órdenes). **«Colgar primero» no se esconde con el piso sin cuadrar:**
dice «Aparece cuando se cuadre el piso de esta sede», para que su ausencia no se lea como una falla.

## Lo que NO se construyó (y por qué)

- **El panel guiado paso a paso de la maqueta** (cajón o hoja con las acciones como flujos de pocos toques). Hoy cada acción tiene su ventana y el
  cajón de la prenda existe; reemplazarlos es una actividad aparte y choca con la sesión de rediseño por olas (ADR-0328, `InventarioPanel.tsx`).
- **«Pedir a otra sede» desde la franja «casi no hay»:** la ventana existe (`PedirAOtraSedeModal`), pero abrirla encima de otra ventana no se resolvió.
  Hoy la franja informa y la acción sigue en Traslados.
- **«Practicar», el modo «Expresivo» y el aro «Hoy: N de M»** de la maqueta: Felipe pidió quitar los dos primeros; el aro no se pidió y contaría un
  clic, no el trabajo, mientras el piso de TRU no esté cuadrado.
- **Atajos de teclado (1–7, flechas) y la lectura de pistola en cualquier lado:** la pistola ya funciona con el buscador (`onEnter`); los demás
  atajos quedan pendientes.

## Choques con ramas abiertas

- **#808 (ADR-0339):** renombra `ReponerPrendaModal.tsx` → `BajarPrendaModal.tsx`, `reponer-prenda-reglas.ts` → `bajar-prenda-reglas.ts` y toca
  `ExistenciasTarjetas.tsx`, `InventarioPanel.tsx`, `MatrizMover.tsx` y `SubirAAlmacenModal.tsx`. Mis cambios en esos archivos van a pedir una
  resolución a mano (los textos ya coinciden con los suyos). Mis identificadores nuevos evitan los de su lista retirada.
- **#807 (Existencias en el celular, «Hacer…»):** toca `ExistenciasTarjetas.tsx`, `FiltrosExistencias.tsx` e `InventarioPanel.tsx`. El segundo en
  fusionarse resuelve; las dos ramas cambian la cabecera de la tarjeta y la fila de filtros.

## Lo que no se verificó

- **Con sesión y datos reales.** Se dibujaron las piezas con una página temporal de datos inventados (no va al repo); la pantalla `/inventario`
  completa, con el motor del piso y el ritmo de verdad, no se abrió (el login lo inicia Felipe).
- **El celular a 375 px.** Existencias no está en la lista de pantallas de celular obligatorio, pero la fila de atajos, el icono y la ventana
  hacia arriba conviene mirarlos allí; la ventana se abre con el «⋯».
- **Sonido y vibración** en un dispositivo real; solo se probó que el patrón suena distinto del bip de la pistola.

## Tercera vuelta (2026-10-05): la pantalla igual a la maqueta

11. **Sin herramientas de más.** La cabecera pierde su fila de botones (Recibir, Contar, Trasladar y Apartados siguen en el lateral; Cuadrar el piso, en «Pendientes»); con tarjetas no hay «Copiar enlace» ni segundo «Ordenar por» (queda «Prioridad | A–Z»); «Ver detalle» es un icono. La ventana de la tarjeta lleva solo Colgar en el piso, Subir a almacén y Enviar a otra sede.
12. **El panel de la talla reemplaza al cajón** (`components/existencias/PanelTalla.tsx`, lógica en `lib/existencias-panel-talla.ts`): vistas Esta talla / Todas / Ficha, color y talla para cambiar sin salir, cuatro cifras, frase de diagnóstico, ritmo, otras sedes y siete acciones con lo que dicen debajo. En este corte cada acción abre la ventana que ya existía; **Apartar** (se hace en Vender) y **Pedir a otra sede** (no existe en la base) se dibujan apagadas. Los pasos guiados dentro del panel quedan para el siguiente corte.
