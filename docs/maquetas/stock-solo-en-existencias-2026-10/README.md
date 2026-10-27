# Maqueta · El stock solo se cuenta en Existencias (2026-10-27)

**Estado: maqueta para que Felipe elija mirando. Nada construido.** Abrir `index.html` con doble clic (o desde el servidor `maqueta-referentes`). La barra negra de
arriba no es parte del diseño: elige la dirección, la pantalla, cómo nace una variante nueva, el tema (claro/oscuro), el ancho (pleno · 1024 · 375) y la
«Cámara lenta». Todo se puede tocar; nada se guarda. «↻ Repetir» lo reinicia. `?sinmov` apaga todo el movimiento.

## El pedido (Felipe, 2026-10-27)

1. **El ajuste de stock solo se hace desde Existencias.**
2. **Nuevo producto** sigue poniendo las unidades iniciales, pero **solo ahí**: después no se cambian desde Catálogo.
3. **Editar producto** cambia solo **precios, costos e insignias**, y permite **agregar o quitar tallas y colores**.
4. Sin perjudicar a las colaboradoras acostumbradas a ajustar desde Editar. Varias ideas, con maqueta, «sofisticada y full animaciones».

Esto es la **actividad 3 de ADR-0494** («Editar producto queda de solo lectura en stock») con tres cosas nuevas que ese ADR no decía: qué pasa con una
variante que se agrega o se quita en Editar, qué se hace con el responsable y el motivo que hoy se piden en esa pantalla, y cómo llegar sin un golpe.

## Qué se ve en cada pantalla

| Pantalla | Cómo queda |
|---|---|
| **Nuevo producto** | «Unidades de hoy» igual que hoy, con una frase que lo dice: *aquí se ponen una sola vez*. Al «Crear producto», un **sello** («Stock inicial · 21 u. · sellado») se estampa, los candados de cada número se cierran en cascada y la pantalla pasa a Editar con los números ya en candado. |
| **Editar producto** | Pestañas **Precios · Costos · Insignias** (editables, con «Revisar y guardar») y **Unidades** (solo lectura; cambia según la dirección). Se van «Registrar los ajustes como…» y el combo de responsable de la pestaña de stock: eso ahora vive en Existencias. |
| **Agregar color / talla** | La hoja pregunta **«¿Con cuántas unidades nace?»** (o «Nace en cero», según la opción de la barra). Esa es la única ocasión en que se escribe stock aquí: al «Guardar», el número **se sella**. |
| **Quitar color / talla** | Con 0 unidades: **«¿Archivar?»** (nunca se borra; deshacer en el aviso). Con unidades: **no deja**, dice cuántas hay y ofrece «Llevarlo a 0 en Existencias», que abre la planilla con ese color enfocado. Si todavía no estaba guardado, se quita sin rastro. |
| **Existencias** | La planilla del modelo de ADR-0494 (la talla de partida enfocada, «Dónde contaste», «Qué pasó», responsable, un guardado en una llamada). Al guardar, cada talla se sella en verde y «Volver a Editar producto» deja los números rodando hasta su valor nuevo. |

## Las cuatro direcciones (cómo se ve el stock dentro de Editar)

| | La idea | Hábito de hoy conservado* | Toques para contar una talla* |
|---|---|---|---|
| **A · Candado y puerta** | La misma tabla, en el mismo lugar, con candado. Cada número es una puerta: «Contar Blanco · M» te lleva a esa talla en Existencias. | 4 de 5 | 3 |
| **B · El espejo** | «Unidades» es una lectura rica: total, piso, almacén, último conteo y quién, y una barrita piso/almacén bajo cada número. Un botón lleva a contar. | 3 de 5 | 3 |
| **C · El cajón** | Los − y + siguen vivos. Al tocarlos se abre Existencias en un cajón con **tu cambio ya puesto**, y guardas ahí. El cajón se cierra y Editar cuenta hasta el número nuevo. | 5 de 5 | 2 |
| **D · Sin pestaña** | Se va la pestaña. En cada color queda «12 en tienda» y una tira «Ver y contar en Existencias». | 1 de 5 | 3 |

\* Contados en esta maqueta, no medidos en producción. Hoy se hace en 2 toques + elegir motivo y responsable una vez por visita.

## Ganas / Pagas

- **A.** Ganas: nada que reaprender, el número que miraban sigue ahí. Pagas: una ida y vuelta por cada conteo; quien cuenta muchas tallas va y viene.
- **B.** Ganas: lo que se pierde (tocar +) se paga con datos que antes no estaban (dónde está, quién contó). Pagas: «último conteo» y el reparto piso/almacén
  son una lectura nueva en la ficha, y quien quería tocar + tiene que ir al botón.
- **C.** Ganas: el hábito casi intacto y sin cambiar de pantalla. Pagas: es el componente de Existencias montado dentro de Editar (hay que cuidar que
  respete el módulo: quien no ve Existencias no lo abre), es lo que más código nuevo trae y puede hacer creer que se ajusta «en Editar».
- **D.** Ganas: la pantalla más simple y la regla más clara. Pagas: el choque más fuerte; quien abría Editar para contar no encuentra nada.

## Cómo llegar sin perjudicar a nadie: tres olas (aparecen también en la nota de la maqueta)

1. **Aviso (1.ª semana).** Editar sigue igual. Al tocar el stock dice «Desde el lunes 3 se cuenta en Existencias» y ofrece «Probarlo ahora».
2. **Puerta (2.ª semana).** Los − y + abren Existencias con lo tocado: es la idea **C**, usada como puente mientras se aprende.
3. **Candado.** Queda la dirección elegida.

**La recomendación del arquitecto:** **C como puente (ola 2) y A como destino (ola 3)**, y sumarle a A, más adelante, las cifras de B («último conteo»)
si las colaboradoras las piden. D solo cuando ya nadie cuente desde Editar: es la más limpia, pero la que más duele sin la ola previa.

## Reglas que la maqueta propone (y que son de Felipe: tocan stock)

1. **Una variante solo se archiva con 0 unidades.** Hoy `quitarColor` / `quitarTalla` (`lib/matriz-ficha-reglas.ts`) desactivan la variante aunque tenga
   stock: ese stock queda en una variante que ya no se vende y nadie lo ve (principio 2, cero estados inconsistentes). La maqueta lo bloquea y manda a Existencias.
2. **Una variante nueva nace con su stock inicial y se sella al guardar** (opción «Con sus unidades») o **nace en cero** (opción «En cero»). Hoy ya entra
   como stock inicial y trae «Etiquetas de lo que entró»; la recomendación es mantenerlo, porque obligar a pasar por Existencias para una talla recién creada
   es un rodeo, y es la misma regla que Nuevo producto (el stock se escribe una vez, al nacer).
3. **El motivo y el responsable de un ajuste viven solo en Existencias.** Editar ya no los pide para el stock. Para guardar precios, costos e
   insignias sigue pidiendo responsable (ADR-0161), en la hoja de revisión.
4. **La carga inicial cerrada** (Tienda TRU, 18-oct) se respeta: una talla que la tienda nunca tuvo entra por «Encontré unidades» en Existencias.

## Una advertencia de arquitectura

Sacar el − / + de Editar es una regla de **pantalla**, no una cerradura: `ajustar_inventario` es la misma función para Existencias y para Editar, y la base no sabe
desde dónde la llaman. Quien llame la función directamente (o una pantalla vieja en una pestaña sin recargar; el aviso de versión nueva ayuda, ADR-0422) puede
seguir ajustando. Si Felipe quiere una cerradura de verdad, hay que agregar un origen (`p_origen = 'existencias'`) a la función y a `movimientos`, con migración
y las pruebas de Postgres; **no está en esta maqueta ni se decidió**.

## Movimiento («rico, una vez, sin rebote ni bucle», ADR-0136)

El título y el hilo rojo se dibujan; las filas suben en cascada; el grillete de cada candado se cierra una sola vez; la píldora de las pestañas se desliza;
la hoja sube 18 px con su cascada y su velo con desenfoque; el popover crece desde el botón que lo abrió; la fila nueva entra desde la izquierda en ámbar punteado
y al guardar su candado se cierra; la que se archiva sale a la derecha; la isla «Revisar y guardar» sube; el cajón entra desde el borde; la talla de partida
llega con su anillo; cada talla guardada se sella en verde; los números ruedan hasta el valor nuevo; el sello de «Stock inicial» se estampa con su onda. Todo con
`--ease-cayla`, una vez, y se apaga con `prefers-reduced-motion`. Si se construye, el movimiento nuevo (el sello, el candado, el cajón) suma su excepción a ADR-0136.

## Si se construye

- `components/ficha-producto/MatrizStockFicha.tsx` y `useStockFicha.ts`: se retira la edición de stock; la pestaña pasa a lectura (A/B/C) o se va (D).
- Una variante nueva sigue entrando por el camino de stock inicial que ya existe en `ProductoForm.tsx`; la hoja «Agregar color/talla» gana su sello.
- `lib/existencias-ajuste-modelo.ts`: la planilla ya soporta entrar desde un color (`focoColor` es nuevo en la maqueta: hoy entra por una talla).
- Pantallas, modales y guías: Editar producto y sus hojas pasan por `/focus`, `/formidable`, `/guia` (huella de controles) y `/chaos` (guarda precios y estructura).
- ADR nuevo (reservar con `pnpm reservar adr`) que cierre la actividad 3 de ADR-0494 con lo que Felipe elija.

Datos: «Blusa Emma», sus colores y todas las cantidades son inventados. Colores: los tokens de `apps/web/app/globals.css` y `tema.css`.

## Ronda 2 (2026-10-27): A elegida, pestaña «Unidades» y modales rehechos

Felipe eligió **A · Candado y puerta**, pidió que la pestaña se llame **«Unidades»** (como «Unidades de hoy» del alta) y que mejoren los modales de
**agregar color y talla**. La maqueta sigue mostrando B, C y D en la barra, pero el trabajo se concentró en A.

**Los modales (`Agregar color` y `Agregar talla`), ahora en dos pasos con guía de foco (ADR-0284):**
1. **Qué se agrega.** Fichas grandes de lo que falta (el color con su muestra, la talla en serif); lo que la prenda ya tiene va en una línea aparte
   («Ya están en esta prenda: Blanco · Marrón · Negro»), así no se puede duplicar y se ve qué hay. Al elegir, el ✓ se dibuja y la ficha crece.
2. **¿Con cuántas unidades nace?** Una cuadrícula con una caja − N + por talla (o por color, al agregar una talla), «+1 a todas», «En 0» y el total que
   cuenta. Dice a qué lugar entran (el almacén) y que es la única vez que se escribe aquí.
3. **«Así quedará en la tabla».** Una vista previa viva: las demás filas atenuadas y la nueva en ámbar con sus números, que entra desde la izquierda al elegir
   y se reescribe mientras se cuentan las unidades (en una talla nueva, es la columna).
4. **La guía:** los pasos arriba (el ✓ verde y su hilo se llenan), «Sigue aquí» y el halo suave sobre el control que toca, el paso 2 atenuado hasta elegir,
   y al pie «Falta: elige un color» que se toca (destella las fichas) o «Listo: Rojo vino · 3 unidades». Sin rojo: aquí nada es un error.
5. Con la opción «Nace en cero», el paso 2 es una nota y la vista previa muestra ceros.

Pendiente si se construye: `<Modal>` de la hoja (ancho «mediana»), `useGuiaCampos`/`CampoGuiado` en lugar de las clases de la maqueta, y declarar ambos modales
en `lib/guia-de-foco-pantallas.ts` como aplicados.
