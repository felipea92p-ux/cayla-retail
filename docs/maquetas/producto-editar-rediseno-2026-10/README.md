# Spike visual · Rediseño de Editar producto (2026-10-02)

**Estado: 3 maquetas para que Felipe elija. Nada construido todavía — `ProductoForm.tsx` sigue siendo la pantalla real.**

Pedido de Felipe con una captura de CMS-0013: la ficha de editar se ve pobre y desordenada al lado de Nuevo producto, y a la
derecha queda un espacio sin usar. Esto no es una idea nueva — es la **pregunta 3, sin responder**, del spike que construyó
[ADR-0257](../../adr/0257-editar-producto-guarda-en-dos-tiempos-barra-de-cambios-y-hoja.md):

> *«Sin el panel derecho la ficha ganaría todo el ancho; el spike la limita a 1080 px. Es una decisión abierta.»*
> — [`producto-guardar-cambios-2026-09/README.md`](../producto-guardar-cambios-2026-09/README.md)

Ese ADR quitó el panel derecho de Editar producto porque **era el único lugar donde se guardaba** (combo Responsable + botón
que quedaba gris sin decir por qué) — y eso causaba el bug real que reportó Felipe: una colaboradora apagaba una talla y no
sabía si había quedado guardado. La solución fue mover el guardado a la barra fija de abajo + la hoja «Revisa y guarda»
(`BarraDeCambios.tsx`, `ConfirmarCambios.tsx`). **Esa parte no se toca.** Lo que quedó sin resolver es solo qué hacer con el
ancho que el panel dejó libre — y las tres maquetas de aquí son tres respuestas distintas a esa pregunta.

## La regla que las tres respetan

**El panel derecho nunca lleva un botón de guardar.** Las tres reusan el mismo grid de ancho que ya usa Nuevo producto
(`lg:grid-cols-[minmax(0,1fr)_340px]`, `components/alta-producto/FichaPrevia.tsx`) para que editar y crear se vean como el
mismo sistema (ADR-0169), pero el contenido de la derecha es **siempre de solo lectura o de navegación** — nunca repite
«Revisar y guardar». Guardar sigue siendo únicamente la barra de abajo. Las tres también reorganizan la columna izquierda en
tarjetas con numeración y estado (✓ / en foco / pendiente), al estilo `PasoAlta` del alta — hoy `ProductoForm.tsx` es una
sola tarjeta larga por sección sin esa jerarquía, que es buena parte de por qué “se ve desordenado”.

Todo usa los tokens reales de `apps/web/app/globals.css` (ADR-0169), el sistema de movimiento de ADR-0136 (cascada al entrar,
`--ease-cayla`, nunca en bucle salvo lo opcional) y la guía de foco de ADR-0284 (`apps/web/app/estilos/alta-guia.css`). Los
datos de «Blusa Alba CMS-0013» son inventados para que se vea con contenido real.

**Cómo verlas:** `index.html` junta las tres en una sola página con pestañas arriba (A / B / C) para alternar sin salir —
es la que conviene abrir primero. `a-espejo.html`, `b-taller.html` y `c-acompanante.html` son las mismas tres maquetas
sueltas, por si se quiere abrir una sola con doble clic sin las otras dos. Arriba de cada una hay
una barra punteada (no es parte de la pantalla) con: enlaces a las otras dos, el ancho (Escritorio / Tablet 820 / Celular 390,
que colapsa el panel derecho como corresponde) y **«✎ Simular 2 cambios»**, que dispara los mismos movimientos que vería una
colaboradora editando de verdad: una talla que se apaga, la foto de Vino que se completa, la barra de abajo que sube, y el
riel de la derecha reaccionando — para juzgar el movimiento, no solo la foto fija.

---

## A · Ficha espejo — `a-espejo.html`

La más conservadora: el panel derecho es **el mismo tipo de tarjeta que `FichaPrevia.tsx`** (foto, código, nombre,
categoría·marca·tejido, Variantes y Hoy en tienda) más el contenido de `TiraFicha.tsx` («Para completar esta ficha») elevado
a una lista vertical con las marcas de ADR-0284 (✓ / ahora / falta). Es fija, no cambia con el scroll. Abajo, un «espejo»
ámbar de «N cambios sin guardar» (solo lectura: un clic baja y resalta la barra real, nunca la reemplaza).

- **A favor:** el salto más chico desde lo que existe hoy; quien ya usa Nuevo producto reconoce el panel de inmediato.
- **En contra:** repite casi el mismo dato que ya se ve arriba del todo en el encabezado (nombre, código); en una ficha con
  pocos colores el panel se siente un poco vacío.

## B · Panel del taller — `b-taller.html`

El panel derecho deja de ser un resumen de texto y pasa a ser la **identidad visual en vivo**: la foto grande por color
(se cruza con una transición suave al cambiar de swatch, igual que `FotosPorColor.tsx`) y, debajo, **barras de stock por
talla de ESE color** (`fn_variantes_estado` / `VariantesFicha.tsx`) que crecen animadas y se pintan en ámbar si el stock es
bajo. Pasar el mouse por una fila de la matriz de variantes (izquierda) también actualiza el panel — así se ve el efecto de
lo que se está tocando sin bajar la vista.

- **A favor:** es el más **útil de verdad** en el piso — quien revisa precios o stock ve la foto y el nivel de cada talla sin
  cambiar de pantalla; resuelve de paso el hueco de «Vino sin foto» de forma visual, no solo con una línea de texto.
- **En contra:** es el que más construcción pide (la foto y el stock tienen que sincronizarse con `VariantesFicha`, hoy
  piezas separadas); en una prenda con una sola variante el panel de stock se ve corto.

**Elegida por Felipe (2026-10-02).** Se sumaron tres piezas, las tres ya reales en el repo — ninguna inventada para la
maqueta:

1. **Cambiar precio o costo en bloque** (`components/ficha-producto/CambiarEnBloque.tsx`, ya en producción): «Cambiar
   [Precio|Costo] de [Todas | Color: Negro | Talla: S] a [monto] · Aplicar», arriba de la matriz. Responde «se me ingresó
   mal el precio/costo de toda la prenda» desde un solo lugar, sin ir celda por celda.
2. **Ajustar stock por talla sin salir de la ficha** (`components/ficha-producto/AjusteDeStock.tsx` →
   `AjustarInventarioModal`): un lápiz junto a cada número de stock (en la matriz y en el panel del taller) abre un ajuste
   con motivo — **inmediato y aparte de «Revisar y guardar»**, porque el stock es un snapshot derivado de `movimientos`
   (principio 4) y no un borrador que se pueda deshacer.
3. **«+ Agregar color» avisa que nace sin stock** (`NACEN_SIN_UNIDADES`, `lib/variantes-ficha-reglas.ts`): una variante
   nueva arranca en 0 a propósito — el stock real entra por un movimiento, nunca escrito a mano — y la maqueta ahora hace
   el siguiente paso obvio con un banner y un botón «Ajustar stock», en vez de dejar que se descubra solo.

**A propósito NO hay un cuarto campo «Stock» en la barra de cambiar en bloque.** Fue lo primero que pidió Felipe, pero
«poner el mismo número de stock en todas las variantes elegidas» no tiene el mismo sentido que precio o costo —cada talla
legítimamente trae una cantidad distinta— y, más importante, **todo movimiento de stock tiene que pasar por `movimientos`
(principio 4, append-only)**: un campo de texto que pisa el número directamente reabriría exactamente el hueco que el
sistema ya cierra a propósito (ADR-0270, decisión 9, con la excepción del 2026-09-29 que trajo el ajuste a la ficha —
pero siempre por la misma ventana de Inventario, nunca por un campo nuevo).

**Segunda vuelta (2026-10-02, la misma tarde).** Felipe probó el punto 2 de arriba (lápiz → ventana flotante con un
delta que arrancaba en 0) y marcó dos problemas reales con una captura de Nuevo producto: (1) el clic sobre la celda
entera para «desactivar» una talla se opacaba sin decir si se había desactivado, borrado u ocultado — ambiguo; (2) el
delta en 0 se leía como «no hay nada», cuando el número real podía ser 4. Se rehizo con el mismo stepper que ya usa
Nuevo producto (`MatrizCantidades.tsx`, −/N/+, el número ES el stock de hoy, nunca arranca en 0) en cada celda —
también en el panel del taller, junto a cada barra—, con fila y columna «Total» como en la captura. Se quitó el clic
ambiguo sobre la celda entera y la ventana flotante del lápiz: el motivo del ajuste (Conteo físico, Corrección de
ingreso, Merma, Traslado recibido) ahora es un solo selector arriba de la matriz, para toda la visita, no un
formulario por cada toque de +/−. Subir una cantidad es, además, una prenda más sin etiquetar — pero el aviso NO lo ofrece en el momento
(Felipe, misma tarde: «debe salir luego de guardar los cambios, no antes»): cada +/- junta la talla y el color en una
cuenta de la visita, y recién al confirmar «Revisar y guardar» sale un único aviso consolidado —«Blusa Alba guardado ·
2 prendas nuevas sin etiquetar (Crudo · S, Vino · M)»— con «Imprimir etiquetas», el mismo patrón que ya usa el aviso de
éxito al corregir color o talla (`avisar.exito({accion:{texto:'Imprimir etiquetas',…}})`, `ProductoForm.tsx`). El
ajuste en sí sigue siendo instantáneo (principio 4); lo que se demora es solo el recordatorio, para no interrumpir con
un aviso por cada clic mientras la persona todavía está corrigiendo cantidades.

## C · Riel que acompaña — `c-acompanante.html`

El panel derecho **cambia de contenido solo**, según qué sección estás mirando (scroll-spy con `IntersectionObserver`):
Producto → tarjeta de identidad; Fotos → una grilla chica con el hueco marcado; Variantes → el resumen de stock por color con
su precio. Un indicador de 3 puntos a la derecha del todo marca en cuál estás y lleva directo con un clic. El «espejo» de
cambios sin guardar vive arriba del riel, siempre visible pase lo que pase abajo.

- **A favor:** es el que más aprovecha el espacio con MENOS scroll — nunca hay contenido del panel que no aplique a lo que
  se está editando; es también el más vistoso de los tres (pedido explícito de Felipe).
- **En contra:** el más nuevo de los tres patrones — el ERP no tiene hoy ningún panel que cambie de contenido con el scroll,
  así que es el que más se aparta de un componente existente; necesita probarse con `prefers-reduced-motion` y con lector de
  pantalla antes de construirse (el cambio de modo tendría que anunciarse con cuidado).

---

## Lo que recomiendo, y por qué

**B (Panel del taller)**, con el riel de C como una idea a rescatar *después*: ADR-0284 ya estableció que el estándar de esta
pantalla es que la persona nunca tenga que adivinar — y B es el único de los tres que convierte el espacio libre en algo que
**responde directamente** la razón real para abrir esta ficha en el piso (¿qué foto falta?, ¿cuánto stock queda de esta
talla?), en vez de repetir datos que ya están a la vista. A es el camino más barato si se prefiere construir ya; C es el más
sofisticado pero construye sobre un patrón que no existe todavía en el repo (ningún riel cambia con el scroll hoy), así que
le pondría una fecha después de B, no antes.

## Qué falta decidir (para Felipe)

1. **¿Cuál construir?** — o una combinación (p. ej. B con los puntos de navegación de C).
2. **¿El ancho pasa de 1080 px a todo el ancho en las tres, o solo cuando hay panel?** Las tres maquetas usan el ancho
   completo con el grid de 340 px; sin elegir ninguna, la pregunta 3 de ADR-0257 seguiría abierta.
3. **Una vez elegida, correr `/focus`** sobre el componente real: `TiraFicha.tsx` y `ProductoForm.tsx` ya están en
   `aplicada` en `lib/guia-de-foco-pantallas.ts` (son el modelo citado en ADR-0284) — el rediseño tiene que CONSERVAR esa
   guía, no solo el layout. Ahora mismo no hay nada que `/focus` pueda escanear porque no se tocó código real; se vuelve a
   invocar recién al implementar.
4. ¿Se lleva el mismo tratamiento (tarjetas numeradas + panel derecho) a **Nuevo producto** para que ambas pantallas
   terminen siendo literalmente el mismo componente de layout, o Nuevo producto se queda como está?

## Lo que esto NO cambia

- El guardado sigue siendo `BarraDeCambios` + `ConfirmarCambios` (ADR-0257) — ninguna maqueta agrega un botón de guardar en
  el panel derecho.
- Ningún campo, validación ni regla de negocio cambia — es solo distribución visual y movimiento.
- `VariantesFicha.tsx`, `FotosPorColor.tsx` y el resto de la lógica de `lib/variantes-ficha-reglas.ts` siguen siendo la
  fuente de verdad; las maquetas B y C solo proponen DÓNDE mostrar un reflejo de esos datos, no cómo se calculan.
