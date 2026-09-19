# ADR-0130 — El menú lateral se pliega a una columna de íconos

- **Fecha:** 2026-09-19
- **Estado:** Aceptado. **Producción:** ninguna migración ni RPC; es solo pantalla y una cookie.
- **Decide:** Felipe (pidió el spike visual y luego «apliquemos ese diseño, animaciones, efectos»). Arquitectura: este documento.
- **Diseño:** `docs/maquetas/menu-lateral-spike-2026-09/` (spike interactivo; queda como referencia del diseño aprobado).

## Contexto

El lateral ocupaba 17rem fijos. En una ventana de 1440 px el panel de contenido quedaba en ~1088 px, y las pantallas
que ya deciden su diseño por el ancho del PANEL (Recibir `@4xl/@5xl`, Proveedores, ADR-0128/0129) lo pagaban.
Los grupos (Catálogo, Compras, Ventas, Inventario) ya se colapsaban en línea; lo que faltaba era poder replegar el
menú entero.

## Decisiones

**D1 — Plegado = 4.75rem (76 px), y los íconos no se mueven.** 76 = 12 + 16 + 20 + 16 + 12: el ícono queda en el mismo
x (28 px) expandido y plegado; solo se apagan las etiquetas. Plegar no cambia el mapa mental. El panel gana ~196 px.

**D2 — UNA sola fuente de verdad del ancho.** `[data-lateral="plegado"] { --spacing-lateral: 4.75rem }` en
`globals.css`, con `data-lateral` puesto en el contenedor de `AppShell`. El `<aside>`, la cabecera, el `<main>` y las
dos barras fijas que usaban `left-lateral` (`BarraFija`, el pie del Punto de Venta) leen ese token: ninguna se toca
para saber cuánto mide el menú; solo se les agregó `transition-[left]` para que acompañen la animación.

**D3 — La preferencia vive en una COOKIE (`cayla_lateral`), no en localStorage ni en la base.** El layout del servidor
(`app/(app)/layout.tsx`) la lee y pasa `lateralPlegado` a `AppShell`, así la primera pintura sale con el ancho
correcto. Con localStorage el servidor pinta 17rem y el navegador salta a 4.75rem al hidratar — un parpadeo en cada
carga. No va a `personas`: es una preferencia de pantalla de esta máquina, no un dato del negocio. Módulo:
`lib/lateral-cookie.ts`.

**D4 — Plegado, un grupo abre un cajón flotante (`CajonGrupo`).** Al pasar el mouse 120 ms (el foco no se mueve) o al
hacer clic/Enter (el foco entra a la primera hija). Es un MENÚ, no un diálogo — mismo criterio que `MenuNuevo`:
flechas, Inicio/Fin, Espacio; Tab y Escape lo cierran y devuelven el foco a la cabecera. Cierra con 260 ms de
gracia para poder cruzar del lateral al cajón. Los ítems sueltos (y «Nuevo», y el perfil) muestran su nombre en una
etiqueta flotante. Ambas viven FUERA del `<aside>`, porque el aside recorta (`overflow-hidden`).

**D5 — El riel no cambia de regla.** Plegado, los grupos cuentan como cerrados: la cabecera representa a la ruta
activa, igual que ya hacía con un grupo cerrado. El riel sigue caminando sobre las filas VISIBLES.

**D6 — Las hijas de un grupo se despliegan por `grid-template-rows: 0fr → 1fr`** (`.lateral-hijos`), siempre
montadas, con `inert` cerradas, con 30 ms de escalón por fila. Reemplaza el `anim-revelar` por montaje y el estado
`gruposTocados` (que existía solo para no animar la carga inicial: con transiciones no hace falta). Consecuencia
para el riel: las filas ya no llevan `gap` sino margen propio, para que un grupo cerrado no deje huecos.

**D7 — La insignia «por atender» se posa sobre la esquina del ícono** cuando está plegado (`InsigniaFila`), con un
anillo del color del fondo. Sigue siendo ámbar (el rojo es del riel).

**D8 — Atajo `[` y botón en la cabecera** (solo escritorio; en celular no hay lateral, hay pestañas). El atajo no se
dispara escribiendo en un campo, con un modificador, ni con un diálogo o «Nuevo» abiertos.

## Lo que NO se portó del spike

- **«Asomar al pasar el mouse»** (el lateral plegado se abre encima del contenido). Pedía un segundo ajuste y un
  botón donde encenderlo, y hace que el menú «se mueva solo». Se recomendó dejarlo apagado por defecto; sin dónde
  activarlo, no se construyó. Si se quiere: un estado `asomando` en `AppShell`, 250 ms de mouse quieto y
  `data-lateral` en «abierto» solo para el aside (no para `<main>`).
- El desplegable de hijas del spike (cajón) usa el alto estimado (`16 + 34 + n × 44`) para no salirse por abajo;
  si algún día un grupo tiene muchas hijas, medirlo.

## Cómo verificar

Con sesión de líder: botón de la cabecera o `[` pliega y expande (panel +196 px); recargar conserva el estado sin
parpadeo; plegado, pasar el mouse por Inventario abre el cajón con la ruta activa marcada, Escape devuelve el foco;
un colaborador ve las mismas mecánicas con menos filas; en celular el lateral y el botón no existen.
