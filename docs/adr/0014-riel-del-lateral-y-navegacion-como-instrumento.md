# ADR-0014 — El riel del lateral: la navegación como un solo instrumento

**Fecha:** 2026-09-09
**Estado:** Aplicado
**Alcance:** `components/AppShell.tsx`, `app/globals.css` (token `--spacing-lateral`),
`components/ui/campos.tsx` (se exporta `Hilo`). Cero cambios de ruta, de datos y de RLS.

## Contexto

Felipe: *"el menú lateral se ve muy chico y muy hacia arriba, aparte que muy junto.
Quiero que sea más futurista y elegante, usa las animaciones y el diseño UI
establecido, pero también haz algo innovador"*. Y el cierre: *"solo serán cambios
estéticos"*.

Las tres quejas eran medibles, no de gusto:

| Queja | Qué había |
|---|---|
| "muy chico" | lateral de 224px, íconos de 18px, filas de 39px de alto |
| "muy junto" | 2px de aire entre filas (`space-y-0.5`) |
| "muy hacia arriba" | los 6 ítems ocupaban 250px arriba y dejaban ~380px de vacío muerto abajo |

Debajo de eso había algo más de fondo: **el lateral era el último rincón de la app
que seguía hablando la gramática de julio.** Desde ADR-0011 todo el sistema marca
"dónde estás" con el *hilo vivo* — 1px rojo que se dibuja, se desliza, responde. El
lateral seguía marcándolo con un bloque `bg-sand` plano que aparece y desaparece,
igual que en la primera versión. No era un lateral feo: era un lateral de otra época
del mismo sistema.

## Decisión

### 1. El marcador es UN riel que viaja, no seis luces que se prenden

El indicador de la sección activa deja de ser una propiedad de cada fila y pasa a ser
**una sola pieza que se desliza** entre filas (`translateY`, 300ms, `--ease-cayla`).
No es un dispositivo nuevo: es exactamente el indicador del `Segmentado` de
`campos.tsx` — que ya se desliza en horizontal — puesto de canto, con la misma forma
(2px × 20px, redondeado) que la marca de "opción elegida" del desplegable. Dos piezas
que ya existían, unidas.

Ese es el "futurista" pedido, y sigue la doctrina de ADR-0011: **el futurismo viene
del comportamiento, no de la decoración.** Cero colores nuevos, cero glow, cero
gradiente. Al hacer clic en Finanzas desde Inicio, lo que se ve es una sola marca
recorriendo la columna — el menú se lee como un instrumento con una aguja, no como
seis botones independientes.

**Lo innovador (y propio de esta pantalla): la marca fantasma.** Al pasar el mouse
por una fila apagada aparece el mismo riel en gris (`tinta/30`), en el sitio exacto
donde va a quedar el rojo si sueltas el clic. Se lee "estás acá / irías allá". No es
un efecto de hover aparte: es el riel mostrando su próximo destino.

Las pestañas del celular reciben el mismo riel acostado, deslizándose entre las 5
columnas.

### 2. Geometría: dos números, no cuatro clases

`ALTO_FILA = 48` y `AIRE_FILA = 8`, en constantes de las que leen **tanto la fila como
el riel**. Es la razón por la que no hace falta medir el DOM: el desplazamiento del
riel es `índice × (48+8)` y no puede desalinearse. Medir en `useLayoutEffect` habría
sido más "correcto" y habría traído un riel que salta al cargar.

Cada grupo lleva su propio riel, por lo mismo: un riel único para toda la columna
obligaría a medir el alto real de los títulos de grupo.

### 3. Respiro y estructura

- Ancho 224 → **272px**, desde un token nuevo: `--spacing-lateral`. Antes eran tres
  números sueltos (`w-56`, `left-56`, `ml-56`) más un cuarto **desalineado** en el
  panel "+ Nuevo" (`left-60`) — por eso ese panel abría 16px corrido del borde.
- Filas 39 → 48px de alto, aire 2 → 8px, íconos 18 → 20px.
- **Dos grupos: "Operación" y "Dirección".** El corte no es decorativo: Operación es
  lo que se toca con una clienta enfrente; Dirección es lo que se mira sentada. Y
  coincide exactamente con lo que solo ve el Líder, así que a una Encargada el
  segundo grupo no le aparece vacío — no le aparece. Con un solo grupo el título se
  oculta: sería una etiqueta para todo el menú, justo el ruido que se estaba sacando.
- **Un eje de íconos a 28px** (isotipo, íconos del menú, disco de la persona) y **uno
  de superficies a 12px** (botón "+ Nuevo" y las placas de las filas). Antes había
  tres márgenes izquierdos distintos (16, 20, 28).
- El vacío de abajo se cierra con la firma de la marca y un bloque de persona con
  disco de iniciales, para que el lateral tenga piso en vez de aire colgando.

### 4. Cabecera translúcida

`bg-crema/85` + `backdrop-blur-md` en la cabecera y en la barra del celular. **Solo
ahí**, y no como efecto: son los dos únicos elementos por debajo de los cuales pasa
contenido al hacer scroll. Sobre el lateral no pasa nada, así que el lateral es opaco.

### 5. Funcionalidad que venía pendiente

- `Escape` cierra el panel "+ Nuevo" (pendiente del BACKLOG desde ADR-0003) y el foco
  vuelve al botón que lo abrió.
- El foco entra al panel al abrirse: se monta al final del árbol, así que sin eso el
  tabulador recorría toda la app antes de llegar a las opciones.
- `aria-current="page"` en la sección activa (escritorio y celular).
- El buscador global usa el `Hilo` de `campos.tsx` en vez de su propio
  `focus-within:border-rojo`, que hacía lo mismo pero apareciendo de golpe. `Hilo` se
  exporta por eso: tenerlo definido dos veces era garantía de que un día se movieran
  por separado.

## Consecuencias

- El brandbook decía "máx. 2 rojos por pantalla". El lateral usa exactamente uno: el
  riel. El ícono activo es tinta, no rojo — el rojo se reserva para el movimiento.
- La firma "Donde el estilo transforma." quedó en `tinta/65` y **no** en `text-taupe`:
  taupe sobre crema da **3.39:1** y reprueba AA. La misma frase en `/mas` y `/login`
  sigue en taupe y sigue reprobando — anotado en BACKLOG, no se tocó en esta sesión.
- La marca fantasma solo se monta en filas apagadas: en la activa sería un segundo
  marcador compitiendo con el riel en el mismo píxel.
- El panel "+ Nuevo" sigue sin ser un `Modal` de Radix (no atrapa el foco). Es un menú
  anclado, no un diálogo; con `Escape`, clic afuera y devolución de foco cubre el 95%
  de lo que faltaba. Si algún día crece, ahí sí corresponde `role="menu"` completo.
- Verificado en navegador sobre ruta de prueba temporal (borrada al cerrar): riel
  deslizándose en los 6 destinos, marca fantasma en hover, vista de Encargada sin
  grupo "Dirección" ni título, `Escape` + devolución de foco, riel del celular, y
  contraste medido sobre el DOM renderizado. `tsc`, `eslint`, 51 tests y `next build`
  en verde.
