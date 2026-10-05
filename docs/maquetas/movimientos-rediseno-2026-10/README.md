# Movimientos · rediseño · tres maquetas (2026-10-05)

Felipe pidió «rediseñar el módulo de Movimientos para que sea más entendible, que se diferencie por algo más notorio si es una
venta, una colgada en piso o una subida de almacén» (palabras que luego fijó: **«Colgada en piso»** y **«Guardada en almacén»**). Estas son **tres maquetas navegables y animadas** de la misma pantalla
(`/inventario/movimientos`). Datos inventados: un lunes en la Tienda TRU (26 operaciones, 17 de hoy). Nada toca `apps/web`.

Para verlas: `index.html` (o el servidor `maquetas` de `.claude/launch.json`, puerto 8791). También abren con doble clic.
Cada una tiene arriba, en la barra oscura que no existe en el ERP, **Escritorio / Celular** (el marco de celular responde con
*container queries*, igual que una ventana de 375 px de verdad) y **Repetir animaciones**. `?vista=celular` abre directo en celular.

> **Elegida por Felipe (2026-10-05): la A · Ruta**, con los siete botones de tipo en una columna a la derecha (fija mientras
> se baja por la lista; en celular o en ancho angosto pasan arriba como una fila que se desliza). B y C quedan como referencia.

## El problema que resuelven

Hoy, según `docs/pantallas/inventario-movimientos.md`, una venta, una bajada al piso y un retiro del piso se leen casi igual:
fila gris, número, un chip chico. Se distinguen leyendo el texto. Las tres maquetas parten de un **idioma común** y difieren en
*dónde* lo ponen.

### El idioma común (`comun.css` / `comun.js`)

Cada tipo de movimiento es **un color + un ícono propio + un movimiento + un camino de dónde a dónde**. Nunca solo color:

| Tipo | Color (token) | Ícono y su movimiento (una vez, al entrar o al pasar el mouse) | Camino |
|---|---|---|---|
| Venta | verde | la bolsa sube y su asa se dibuja | Piso → Cliente |
| **Colgada en piso** | ámbar | el perchero se mece colgado de su riel | Almacén → Piso |
| **Guardada en almacén** | pizarra | la tapa de la caja se levanta y la flecha sube | Piso → Almacén |
| Llegada | verde oliva (verde + un toque de ámbar) | el paquete cae y se asienta | Proveedor / otra sede → Almacén |
| Traslado enviado | tinta | el camión entra desde la izquierda | Almacén → otra sede |
| Devolución · Cambio | rojo | la flecha de vuelta se dibuja / dos flechas se cruzan | Cliente → Piso |
| Ajuste a mano · Conteo | taupe, **sello con borde punteado** | las perillas se deslizan / el visto se dibuja | un solo lugar |

El borde punteado del ajuste dice «sin documento detrás» (ADR-0234, ajustes en bruto): es lo único del módulo que no tiene
boleta, guía ni traslado, y ahora se ve distinto.

## Las tres opciones

### A · Ruta — `a-ruta.html`
La lista de hoy, pero cada fila es una tarjeta con su sello de color, su ícono animado y el trayecto con una prenda que viaja.
Arriba, **siete botones grandes** (en vez de las píldoras grises) que cuentan hacia arriba, muestran las prendas y filtran. El
día lleva un «código de barras» de colores (una franja por operación; tocar una te lleva a ella). Las colgadas del día se juntan
en un **mazo** que se abre en abanico (es `plegarBajadas` de ADR-0241, con más cara). Tocar una fila la despliega; «Abrir la
ficha» abre el cajón.
**Cuesta:** poco. Mismos datos, misma lista; cambia `FilaMovimiento`, `FiltrosMovimientos` y el cajón.

### B · Tres carriles — `b-carriles.html`
El día corre de arriba abajo por un hilo de horas, y cada movimiento cuelga del carril que le toca: **Salió de la tienda · Se
movió dentro · Entró**. Una línea del color del tipo une la hora con su tarjeta (como un mapa de metro). Se reconoce **por la
posición antes de leer una palabra**. Arriba, una barra apilada con el balance del día; tocar un carril lo ensancha y deja los
otros como fichas (en celular, lo filtra). Las colgadas y las guardadas llevan un esquema de **dos niveles** (Almacén arriba, Piso
abajo) con una prenda que baja o sube.
**Cuesta:** medio. Cambia cómo se agrupa y se lee la lista (nuevo componente de carriles; la paginación por cursor sigue igual).

### C · Plano vivo — `c-plano.html`
La tienda dibujada como un plano (Almacén, Piso, el Cliente, el Proveedor, otras sedes). Cada movimiento es **una prenda que
viaja por su camino**: ámbar baja de Almacén a Piso, pizarra sube, rojo sale a la puerta. Los caminos engrosan con la ropa que
pasa, los cuartos cuentan sus prendas, el perchero del piso se mece al llegar una colgada. **Se puede reproducir el día** (o
arrastrar el deslizador a cualquier hora). Tocar un camino, un cuarto o un tipo filtra «lo que va pasando» debajo. En celular el
plano se vuelve vertical.
**Cuesta:** alto. Es una pantalla nueva (plano SVG + reproductor) que convive con la lista; los datos son los mismos pero hay que
decidir de dónde saca el día completo: `fn_movimientos` pagina de a 50 y el plano necesita todas las operaciones del día (las cifras por proceso ya salen de `fn_movimientos_resumen_procesos`).

## Cómo salen estos tipos de lo que ya existe (sin migración)

Todo sale de campos que `fn_movimientos` ya devuelve (`lib/movimientos-reglas.ts`):

- **Venta** = `motivo = 'venta'`. **Llegada** = `recepcion`, `traslado_entrada`, `carga_inicial`, `produccion`, `ingreso_regularizado`.
- **Colgada en piso** = `categoria = 'interno'` con el par `almacen_tienda → piso_venta` (`INTERNO_POR_PAR`, hoy «Bajada al piso»).
- **Guardada en almacén** = el par `piso_venta → almacen_tienda` (hoy «Retiro del piso»).
- **Traslado enviado** = `traslado_salida` (`traslado_anulado` es la vuelta). **Devolución · Cambio** = `devolucion`, `cambio`, `anulacion_venta`.
- **Ajuste** = `categoria = 'ajuste'` (conteo, conteo físico, merma, «encontré prendas», hallazgo, otro); `respaldoDeAjuste` ya dice si hay conteo detrás.

## Qué respetan (y qué pide decisión)

- **Colores solo de tokens (y mezclas de ellos con `color-mix`)** (`globals.css`); los únicos hex sueltos son los colores de las prendas inventadas, que en el ERP vienen de la base.
- **ADR-0136:** `--ease-cayla`, sin rebote, cada animación corre **una vez** al entrar o al pasar el mouse, todo se apaga con
  `prefers-reduced-motion`; el cajón usa la misma forma que `<Modal>` (velo con desenfoque → hoja → cascada de 55 ms).
- **Fuera de la regla, a decisión de Felipe** (la regla dice que la hoja con movimiento rico es una excepción por decisión suya,
  como la vista rápida de producto): el perchero que **se mece** (péndulo, como el cartel de ADR-0301); y en la opción C, **toda la
  reproducción** (prendas que viajan, contadores que ruedan). Ninguna queda en bucle; si se elige, va su actualización de ADR-0136.
- **Celular:** las tres tienen su vista de 375 px (Movimientos no está en la lista obligatoria de PL-105, pero se verificó).
- **Cabecera:** `EncabezadoPagina` de ADR-0220, sin cambios.
- Falta, a propósito: la pestaña **Pérdidas** que construye la sesión de «Inventario por olas» (ADR-0328); entra como una pestaña
  más sobre cualquiera de las tres. No se dibujaron apartados ni cuarentena.

## Decisiones de Felipe (2026-10-05)

1. **Las palabras, para todo el sistema:** **«Colgada en piso»** (almacén → piso) y **«Guardada en almacén»** (piso → almacén). Reemplazan
   «Bajada al piso» y «Retiro del piso» de ADR-0234 (`INTERNO_POR_PAR`, `ETIQUETA_PROCESO`) y quien las nombre en pantalla,
   etiquetas, filtros, Actividad y exportaciones. Plurales: «Colgadas en piso», «Guardadas en almacén».
2. **Elegida: la A · Ruta**, con los siete botones en columna a la derecha.
3. **Colores separados:** colgada ámbar, guardada pizarra, traslado enviado tinta (cambia `tonoCategoria`).
4. **Paleta más CAYLA:** los sellos pasaron de relleno sólido a una base suave del color del tipo (15 % sobre papel), con el ícono en
   el color y un aro fino; los fondos de fila y de tarjeta bajaron a 7 %. Solo tokens de `globals.css`.
5. Las animaciones se quedan como están.
6. **Venta en verde** (algo positivo) y **llegada en otra tonalidad de verde** (`--verde-2` = verde con un toque de ámbar, sin hex nuevo).
   Con eso el rojo queda para devolución y cambio (plata que vuelve).

