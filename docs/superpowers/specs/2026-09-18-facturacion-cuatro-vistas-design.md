# Facturación en cuatro vistas — diseño

**Fecha:** 2026-09-18 · **Estado:** aprobado por Felipe el 2026-09-19 («Va»). El look (maqueta v8), la estructura (cinco secciones) y la secuencia con Atelier (opción 1) ya estaban aprobados.
**Rama:** `claude/billing-design-analysis-ee464b` · **ADR:** [0121](../../adr/0121-facturacion-en-cuatro-vistas-con-una-isla-de-vidrio.md) (nació como 0113; ver el §11)
**Siguiente paso:** ejecutar el plan, `docs/superpowers/plans/2026-09-19-facturacion-cuatro-vistas-r0-r1.md` (R0 y R1 al detalle; R2 a R4 como fases).

## 1. Qué se construye y por qué

Hoy `/vender/facturacion` es una sola página larga (ventas de hoy, proformas y comprobantes apilados) más una ruta suelta para los códigos de descuento. Se parte en **cuatro vistas** bajo un layout común —Resumen, Proformas, Comprobantes y Códigos de descuento— y se le da un lenguaje visual propio: vidrio con color de estado. Lo que arregla:

- La pregunta real del líder —«¿qué me falta enviar a SUNAT?»— no tiene lugar. El chip «Pendiente de enviar» está en Ventas de hoy y el botón *Transmitir* dos secciones más abajo, en otra tabla del mes.
- Alcance mezclado: el título dice «Septiembre 2026», pero Ventas de hoy nunca obedece al mes.
- Frágil: cinco consultas en un `Promise.all` con `exigir`; si una cae, no se ve ninguna vista.
- Cifras que no dicen la verdad: «Monto facturado» suma todos los estados y los comprobantes de prueba (BACKLOG 2026-09-16); «Pendientes de enviar» mezcla `pendiente` y `enviado`; una proforma vencida sigue contando como vigente porque nadie escribe `vencida`.
- Nada avisa que ninguna tienda tiene serie `nota_credito` (BACKLOG): la primera devolución sobre una venta facturada fallará.
- `TarjetaIndicador` soporta comparativo y sparkline y esta pantalla no los usa; `VenderNav.tsx` es código huérfano.

## 2. Decisiones ya tomadas

| Tema | Decisión |
|---|---|
| Look | La maqueta v8, con los valores transcritos en el §7. Fondo plano; tarjetas de vidrio con borde izquierdo de 3 px y un color de estado que se difumina hacia la derecha (Sutil); pestañas de vidrio con píldora negra; botones compactos. |
| Estructura | Cuatro rutas bajo un layout (§4), con el estado del mes solo donde aplica. |
| Secuencia con Atelier | **Opción 1**: se construye sobre lo de Atelier (ADR-0106, rama `interface-recommendations-8ce365`, sin mergear). R1 no depende de nada; R2 a R4 esperan a que Atelier entre a `main`. |
| Ajustes respecto al diseño presentado | (a) **`BotonCompacto` nuevo**, en vez de una variante de `Boton`: `Boton` es compartido y su tipografía en versalitas es otra, así que no se toca. (b) **Los importes usan `soles()`** («S/ 950.00», con separador de miles): `CifraAnimada` ya lo usa y así la tarjeta y la tabla no muestran dos formatos. (c) **Una cuarta tarjeta «Vencidas»** en Proformas, para que el estado derivado se vea. (d) **Una franja de proformas de una línea** en Resumen (no estaba en la maqueta; es la recomendación del análisis, para no duplicar la pestaña). |
| Defaults revocables | «Monto facturado» = aceptados en producción; «Convertir» sigue disponible en una proforma vencida (la base no lo impide y cambiarlo es decisión de negocio; el chip «Vencida» avisa); el hilo solo en Resumen (Comprobantes usa chip y botones). |

## 3. Fuera de alcance

- Emitir comprobante desde la fila de una venta sin comprobante (pospuesto el 16-sep; el modal extraído lo abarata, pero no entra).
- Columna «Productos» en proformas: hoy guardan un solo ítem genérico «Venta»; exige rehacer «Nueva proforma» con prendas.
- Contador en el menú lateral y actualización «en vivo» por polling: dependen de piezas de otras ramas (`AppShell.tsx`, `useCajaEnVivo`).
- Búsqueda de comprobantes sin límite de mes (reutilizaría `parsearComprobante`).
- Consultar el estado de un comprobante `enviado`: hoy no existe camino (solo «Consultar» para bajas). Es integración con Lucode y se confirma con Felipe antes.
- Cambios de esquema, RPC o RLS. Única excepción condicionada: R0 puede abrir un ítem sobre `fn_ventas_del_dia` (§12); su migración pide el OK de Felipe.
- Llevar el vidrio a otros módulos (incluida `TarjetaKpi` de Caja), modo oscuro, y el `EncabezadoPagina` de Atelier (título de 46 px; aquí se queda el de 24 px aprobado).

## 4. Arquitectura

### 4.1 Rutas y layout

```
apps/web/app/(app)/vender/facturacion/
  layout.tsx            (servidor) auth de líder · conteos · series y ubicaciones para los modales · <FacturacionShell>
  page.tsx              Resumen
  proformas/page.tsx
  comprobantes/page.tsx
  descuentos/page.tsx   (se mueve desde app/(app)/vender/descuentos/page.tsx)
  error.tsx             (cliente) error de vista con «Reintentar»; la cabecera y las pestañas siguen
next.config.ts          redirects(): /vender/descuentos → /vender/facturacion/descuentos (permanent: false, como los demás alias)
```

- `AppShell.tsx` no cambia. La ruta activa se resuelve por el prefijo más largo (`/vender/facturacion` gana a `/vender`) y `SIN_TOPE_DE_ANCHO` ya incluye `/vender`.
- `VenderNav.tsx` (nadie lo importa) se borra en R1.
- El layout no vuelve a ejecutarse al navegar entre hijas, así que el chequeo de líder vive también en cada `page.tsx` (`exigirLider()` → `redirect("/")`). Las tres capas se mantienen: pantalla, RPC y RLS.
- `router.refresh()` (que ya llaman Transmitir, emitir y convertir) vuelve a pedir layout y página: los contadores y las tarjetas se actualizan solos.

### 4.2 Datos por vista

| Vista | Lecturas (servidor) | Si falla |
|---|---|---|
| Layout | `getConteosFacturacion()`: comprobantes por enviar (`pendiente` + `rechazado`, **sin filtro de mes**), rechazados, el más antiguo por enviar, y las proformas vigentes (monto, por vencer, vencidas). Además `getSeriesComprobantes()` y `getUbicaciones()` para los modales. | `tolerar`: sin contador; el modal de emitir avisa que no cargaron las series y no deja emitir. |
| Resumen | `getVentasDeHoy()`; `getComprobantesMes(inicioHoy, inicioMañana)`; `getVendidoHastaEstaHora(7)` | Ventas y comprobantes con `exigir`. El comparativo con `tolerar`: sin comparativo, nunca uno inventado. |
| Proformas | `getProformasMes(desde, hasta)` | `exigir` |
| Comprobantes | `getComprobantesMes(desde, hasta)` | `exigir` |
| Descuentos | `getCodigosDescuento()` | `exigir` |

La regla para elegir es la del repo (`lib/resultado.ts`): `exigir` donde un número equivocado es una decisión equivocada, `tolerar` en lo secundario.

- **El mes** (`?m=`) solo existe en Proformas y Comprobantes (`SelectorMesFacturacion`, cliente; las pestañas conservan `?m=` al ir entre esas dos). Resumen es «hoy» y Códigos no tiene mes.
- **Búsqueda:** el campo de la cabecera filtra en el cliente las filas ya cargadas de la vista activa, por un contexto del shell (`useFacturacionBusqueda`). Se limpia al cambiar de vista. La regla `coincide(fila, texto)` es una función pura con prueba.
- **Enlace venta ↔ comprobante** en Resumen: `fn_ventas_del_dia` devuelve `comprobante_texto` («B004-000011»), no el id. Se cruza contra los comprobantes de hoy por ese mismo texto (`serie-` + número a 6 dígitos, la misma fórmula del RPC) con la función pura `enlazarVentasConComprobantes`. Sin migración.
- **`useSearchParams`** en clientes del layout va dentro de `<Suspense>`.

### 4.3 Modales globales (molde de ADR-0043)

`FacturacionShell` (cliente) es el padre con estado: guarda qué modal está abierto (`emitir`, `proforma` o ninguno), la búsqueda y las acciones. Los botones de la cabecera y los de cada vista los abren; los modales se dibujan una sola vez.

- Se extraen `EmitirComprobanteModal` (de `ComprobantesPanel.tsx`, 893 líneas) y `NuevaProformaModal` (de `ProformasPanel.tsx`) **sin cambiar su lógica**: token de idempotencia, cálculo del IGV, RPC. Los modales de serie, anular, liberar y convertir siguen dentro de sus paneles.
- Transmitir se extrae a un hook (`lib/useTransmitir.ts`) que usan la fila del Resumen y la tabla de Comprobantes: una sola implementación de `POST /api/lucode/emitir` + aviso + `router.refresh()`.

## 5. Componentes

| Pieza | Estado |
|---|---|
| `Chip`, `Tabla`/`Encabezado`/`fila`, `Modal`, `Hilo` (de `campos.tsx`), `avisar`, `ConsultaDocumento`, `Ayuda` | Se reutilizan sin cambios. `celda()` trunca, así que las celdas multilínea del Resumen llevan sus propias clases. |
| `CodigosDescuentoPanel` | Se reutiliza dentro de la pestaña; se quita el «← Facturación». |
| `ComprobantesPanel`, `ProformasPanel` | Cambian: extracción de modales, tarjetas nuevas, chips y botones compactos, definiciones del §9. |
| `TarjetaKpiVidrio`, `BotonCompacto`, `HiloComprobante` | Nuevos, en `components/ui/`. |
| `FacturacionShell`, `FacturacionCabecera`, `FacturacionPestanas`, `SelectorMesFacturacion`, `ActividadDeHoy`, `ResumenProformas` | Nuevos, en `components/`. |
| `lib/facturacion-reglas.ts`, `lib/ventas-comparativo.ts`, `lib/useTransmitir.ts` | Nuevos. |
| `lib/proformas-reglas.ts`, `lib/comprobantes.ts` | Cambian: `vencida`; conteos. |
| `globals.css`, `next.config.ts` | Cambian: un bloque «isla de vidrio»; un redirect. |
| `VenderNav.tsx`, `app/(app)/vender/descuentos/page.tsx` | Se eliminan (el segundo se mueve). |
| De Atelier, cuando entre a `main`: `CifraAnimada`, `FechaHoraLima`, `anim-sube`, `check-trazo`, `hilo-dibuja` | Se reutilizan. |

Contratos de los nuevos:

- **`TarjetaKpiVidrio({ etiqueta, valor, tono, icono, indice?, contexto?, children? })`.** `tono` es `"verde"`, `"ambar"`, `"rojo"` o `"taupe"`. `valor` es un nodo (`font-display text-3xl tabular-nums`; recibe una `CifraAnimada` o texto). `contexto` va en `text-xs text-tinta/65`. `children` es la visualización (sparkline, eje, barras, progreso). `indice` escalona la entrada. La luz especular sigue al cursor escribiendo `--mx` y `--my` sobre su propio nodo con una ref, sin re-render.
- **`HiloComprobante({ estado, entorno, transmitiendo? })`.** `estado` es un `EstadoComprobante` o `"sin_comprobante"`. Tiene `role="img"` y un `aria-label` que dice el estado en palabras. Etapas: venta, número reservado, enviado a SUNAT, aceptado. La tabla estado → nodos está en el §9.
- **`BotonCompacto({ variante, icono?, cargando?, ...button })`.** `variante` es `"primario"`, `"vidrio"`, `"fila"` o `"fila-alerta"`.
- **`FacturacionPestanas({ conteos })`.** Un `<nav aria-label>` con `Link`s: la URL es la fuente de verdad y la activa lleva `aria-current="page"`. La píldora se desliza midiendo el DOM y guardando la posición en variables CSS (en la primera pintura, sin transición). Contadores: «Comprobantes» en ámbar, o en rojo si hay rechazados; «Proformas» neutro.

## 6. Reglas puras y sus pruebas

En `lib/facturacion-reglas.ts` (vitest, con el reloj como parámetro, como `marcarPorVencer`):

1. `enlazarVentasConComprobantes(ventas, comprobantes)`: cruza por `serie-número(6)`; una venta sin comprobante queda con `null`; un comprobante manual sin venta no aparece en Actividad.
2. `etapasDelHilo(estado, entorno)`: cada uno de los seis estados, en prueba y en producción, produce sus nodos y tramos (§9).
3. `tonoVendidoHoy(hoy, referencia)` y `tonoPorEnviar({ pendientes, rechazados })`.
4. `comparativoHastaEstaHora(hoy, referencia)`, con salida `{ texto, positivo }` o `null`; con referencia 0 o nula no hay porcentaje.
5. `antiguedad(iso, ahora)`: «hace instantes», «hace 12 min», «hace 6 h 42 min», «hace 3 d»; nunca negativa.
6. `seriesFaltantes(series, ubicaciones)`: tiendas × {boleta, factura, nota_credito}; el Taller y los almacenes no emiten.
7. `resumenMontos(comprobantes)`: facturado (aceptado + producción, sin baja en trámite), por enviar y de prueba.
8. `marcarPorVencer` ampliada con `vencida` (`estado === "vigente"` y `vence_at` ya pasó). `porVencer` sigue siendo solo de las vigentes que aún no vencieron.
9. `coincide(fila, texto)`: sin tildes ni mayúsculas, por número, cliente, producto y vendedor.
10. `ventanaHastaEstaHora(ahora, diasAtras)` en `lib/ventas-comparativo.ts`: prueba con una venta de las 7:30 pm de Lima cuyo UTC ya es el día siguiente, el mismo caso que ADR-0110.

## 7. Diseño visual: la isla de vidrio (valores aprobados)

Las variables y clases viven bajo `.tema-vidrio` (raíz del layout), **no en `:root`**; generalizarlo sería mover variables. Solo tokens del sistema: el vidrio no agrega ningún color. `@property --kc` para que el color de una tarjeta se deslice.

- **Fondo:** plano, `--color-crema`. Sin cuadrícula, sin luces, sin regla graduada, sin hilo rojo bajo el título.
- **Tarjeta KPI:**
  - Radio 16 px; padding 18 px (16 abajo).
  - Borde `1px solid var(--color-sand)` y **izquierdo de 3 px en `--kc`**.
  - Fondo `linear-gradient(180deg, rgb(255 255 255 / .72), rgb(251 248 242 / .42))`, realce interior `inset 0 1px 0 rgb(255 255 255 / .95)` y `backdrop-filter: blur(18px) saturate(1.2)`.
  - **Sin sombra en reposo** (ADR-0012). Al pasar el mouse: el contenedor sube 2 px y toma `--shadow-md`.
  - Difuminado (Sutil): `::before` con `linear-gradient(90deg, color-mix(in srgb, var(--kc) 14%, transparent) 0%, transparent 62%)`.
  - Luz especular: `::after` con `radial-gradient(240px 170px at var(--mx) var(--my), rgb(255 255 255 / .85), transparent 68%)`.
  - Tipografía: etiqueta `label-cayla text-[11px] text-tinta/65`; valor `font-display text-3xl` (30 px); contexto `text-xs text-tinta/65` (13 px); comparativo en `text-verde` semibold; icono de 15 px, trazo 1.75, color `--kc`.
  - Tonos: `--kc` es `--color-verde`, `--color-ambar`, `--color-rojo` o `--color-taupe`.
- **Visualizaciones:** sparkline del acumulado por hora (hoy, `tinta` al 85 % y 1.8 px; semana pasada, punteada al 35 %); eje de ventas de 10 h a 18 h con un punto por venta; barras del ticket con línea de promedio; barra de progreso de 6 px en verde.
- **Pestañas:** contenedor con padding 4 px, radio 14 px, fondo `rgb(255 255 255 / .45)`, borde `1px solid rgb(26 26 24 / .09)` y `blur(22px)`. Píldora `bg-tinta` de radio 10 px con sombra `0 8px 18px -10px rgb(26 26 24 / .75)`. Etiquetas de 14 px en minúscula (400; 600 la activa), `tinta`, y `crema` en la activa. Padding 8 × 15 px. Contadores de 10.5 px semibold.
- **Botones:** los de la cabecera miden 36 px, con padding 0 14 px, radio 10 px, 13 px peso 500 en minúscula e icono de 15 px. `primario` es `bg-tinta text-crema`. `vidrio` lleva fondo `rgb(255 255 255 / .58)`, borde `rgb(26 26 24 / .12)` y `blur(18px)`. Al pasar el mouse suben 1 px con una sombra suave. Los de fila miden 30 px, radio 8 px, 12.5 px, borde `tinta/28`, y el hover rellena de `tinta`. `fila-alerta` lleva borde y texto en `rojo-profundo` y rellena de rojo al pasar el mouse.
- **Cabecera:** eyebrow `label-cayla text-[11px] text-tinta/65` «Vender»; `h1` `font-display text-2xl`; línea viva `text-xs text-tinta/65` con un punto verde que late (2.8 s), la fecha y hora (`FechaHoraLima`) y «actualizado hace X s»; buscador sin caja con `Hilo` de `campos.tsx`, de 36 px.
- **Tabla «Actividad de hoy»:**
  - Contenedor `card-cayla`; encabezado `label-cayla text-[11px] text-tinta/55`; filas `px-5 py-3`; divisor `tinta/10`; hover `tinta/[0.025]`.
  - Columnas: hora + tienda · productos (15 px) con cliente y vendedor debajo (13 px) · pago (cuadrito con `--color-metodo-*` + nombre) · total (`font-display text-lg`) · comprobante (número; el hilo y el `Chip` en una línea; la antigüedad o el motivo debajo; el botón de fila a la derecha).
  - Cabecera de la tarjeta: eyebrow «Ventas de hoy», título `font-display text-xl` «Actividad de hoy», enlace «Ver comprobantes →».
  - Leyenda del hilo al pie, en `text-xs`.
- **Franja de proformas** (Resumen): una fila `card-cayla` con «1 vigente · S/ 7,000.00 · 0 por vencer» y «Ver proformas →».
- **Responsive:** desde 980 px, cuatro tarjetas; por debajo, dos. Por debajo de 640 px la tabla pasa a tarjetas apiladas (el patrón `sm:hidden` de los paneles actuales) y el buscador ocupa el ancho.
- **Accesibilidad:** el estado nunca va solo en color (chip con texto y `aria-label` del hilo); foco visible con el estilo del sistema (`outline-rojo/60`); la píldora es decorativa (`aria-hidden`); los contadores tienen texto.

## 8. Movimiento

Todo responde a una acción o a un dato que cambia. La temporización de la entrada es la de Atelier (`anim-sube`, 850 ms escalonado), no la de la maqueta (380 ms), para que todo Ventas se mueva igual.

- **Se reutiliza:**
  - `anim-sube`: entrada de la cabecera, las tarjetas y la tabla.
  - `CifraAnimada`: primer pintado de «Vendido hoy» (`soles`), «Ventas» (`entero`) y «Ticket promedio» (`soles`). Sube desde 0 **cada vez que cambia el valor**, así que no se usa en «Por enviar».
  - `check-trazo`: el tilde del último nodo del hilo.
  - `hilo-dibuja`: los tramos cosidos en el primer pintado.
  - `anim-asentar`: la cifra de «Por enviar» cuando cambia.
  - `Hilo` de `campos.tsx`: el buscador.
  - `cayla-hilo-barrido`: el tramo del hilo mientras se transmite.
- **Nuevo, en la isla:**
  - La píldora entre pestañas (transición de transformación y ancho, 450 ms, `--ease-cayla`).
  - El color de la tarjeta que se desliza (`--kc`, 800 ms).
  - La luz especular que sigue al cursor.
  - El avance de un tramo del hilo al cambiar de estado (transición de `scaleX`, 600 ms).
  - El anillo pulsante del nodo «enviado, esperando a SUNAT».
- **Excepciones a «nada se anima solo al entrar»** (ADR-0011), aprobadas con el diseño y de menos de 1 s: el trazado del sparkline y las barras, el de los hilos y el conteo de las cifras en el primer pintado. **Solo en el primer pintado de la navegación:** `router.refresh()` no las repite, porque los componentes cliente conservan su estado y las filas tienen `key` estable (`venta_id`). El cambio de estado de una fila se anima con transiciones, no con un remontaje.
- **`prefers-reduced-motion`:** las de Atelier ya se colapsan a 1 ms; las de la isla, igual. Las animaciones infinitas (latido del punto, anillo pulsante, barrido) se apagan.
- **Compatibilidad:** sin `@property` el color de la tarjeta cambia de golpe; sin `backdrop-filter` la tarjeta queda translúcida sin desenfoque. Ninguno rompe la lectura. El desenfoque se limita a las cuatro tarjetas y al contenedor de pestañas.

## 9. Definiciones de negocio

**Tarjetas de Resumen** (tono entre paréntesis):

- **Vendido hoy** (verde si va por encima de la referencia; ámbar si por debajo; taupe si no hay referencia): la suma de `total` de las filas de `fn_ventas_del_dia`. Es la definición de ADR-0110: lo cobrado en el mostrador (`venta_items.subtotal`), con IGV, sin ventas anuladas. La referencia es **el mismo día de la semana pasada, hasta la misma hora de Lima**, con la misma medida (suma de `venta_items.subtotal` de ventas `completada` dentro de la ventana). Texto: «+12% vs. mismo día de la semana pasada a esta hora (S/ 848.00)». Si la referencia es 0: «Sin ventas a esta hora la semana pasada». Si la lectura falla: sin comparativo. No se compara contra «ayer»: un día parcial contra un día entero pinta un rojo sin sentido, y un lunes contra un domingo no es comparable en una tienda.
- **Ventas** (taupe): el número de filas, con el mismo comparativo en cantidad.
- **Por enviar a SUNAT** (rojo si hay rechazados; ámbar si hay pendientes; verde si no queda nada): comprobantes `pendiente` + `rechazado` de cualquier tipo (boletas, facturas y las notas de crédito que ya emiten las devoluciones, ADR-0100), **sin filtro de mes**. Contexto: «la más antigua: hace 6 h 42 min», «N rechazados» en rojo y «Todo al día» cuando es cero. La barra de progreso es de hoy: «hoy: N de M enviados» (`enviado` o `aceptado` sobre los comprobantes de hoy que no son `anulado` ni `no_emitido`).
- **Ticket promedio** (taupe): total ÷ ventas; «—» si no hay ventas.

**Tarjetas de Comprobantes** (mes):

- Emitidos este mes (taupe): los comprobantes del mes, con «N de prueba».
- **Monto facturado** (taupe): la suma de los `aceptado` con `entorno_transmision = 'produccion'`, sin baja en trámite. Los de prueba y los por enviar se rotulan aparte en el contexto. Es la pregunta abierta desde el 16-sep; se toma este default.
- Por enviar (global; como en Resumen) y Rechazados (global; rojo si hay).

**Tarjetas de Proformas:** Vigentes (sin las vencidas), Monto en proformas (solo vigentes que no vencieron), Por vencer 48 h (ámbar si hay) y **Vencidas** (ámbar si hay).

**Hilo del comprobante** (nodos: venta · número · SUNAT · aceptado):

| Estado | Nodos | Chip y texto |
|---|---|---|
| Sin comprobante | venta ✓, número punteado ámbar | «Sin comprobante» (ámbar) |
| `pendiente` | ✓ ✓, SUNAT punteado ámbar, aceptado vacío | «Pendiente de enviar» + antigüedad; botón *Transmitir* |
| `enviado` | ✓ ✓, SUNAT ámbar con anillo pulsante | «Enviado a SUNAT» + «Esperando respuesta» |
| `aceptado`, producción | ✓ ✓ ✓ ✓ (tilde trazado) | «Aceptado»; botón *Ver PDF* si hay `pdfUrl` |
| `aceptado`, **prueba** | ✓ ✓ y los dos últimos en `tinta/40` con borde punteado, nunca en verde | «Aceptado · prueba» con borde punteado (ADR-0015: el color solo no puede distinguirlos) |
| `rechazado` | ✓ ✓, SUNAT ✕ rojo | «Rechazado» + `motivo_rechazo` en `rojo-profundo`; botón *Reintentar* |
| `anulado` / `no_emitido` | nodos apagados (`tinta/25`) | «Anulado» / «No emitido» (chip apagado) |

«Anulación en trámite» (aceptado con `anulacion_solicitada_at`) conserva su chip ámbar actual sobre el hilo del aceptado. Las etiquetas y tonos de los chips siguen siendo `ESTADO_ETIQUETA` y `ESTADO_ESTILO` de `comprobantes-reglas.ts`.

**Serie faltante:** una franja en Comprobantes avisa por tienda cuando falta una serie de boleta, factura o nota de crédito («faltan 3 series: nota de crédito en TRU, AQP y LIM») y enlaza al modal «Registrar serie». Sin faltantes, se resume en una línea.

**Proformas:** el orden pasa a vigente por vencer, vigente, vencida, convertida y anulada. La base no cambia: `vencida` es un estado derivado, como `porVencer`.

## 10. Entrega por rebanadas

Cada una termina con tipos, lint y pruebas en verde, y verificada en el navegador. Nada se pushea sin sincronizar `main` antes.

**R0 — Preparación (sin código de producto).**
- Verificar contra producción, solo lectura: (a) que `retail.ventas.estado` existe; (b) la definición viva de `fn_ventas_del_dia` (¿excluye anuladas?, ¿una sola sobrecarga?); (c) qué series hay en `series_comprobantes`.
- Confirmar el estado de Atelier y de `panel-comercial` en `main`.
- Reglas de decisión: si falta `ventas.estado`, el comparativo queda oculto por `tolerar` y se anota en BACKLOG. Si la RPC incluye anuladas, **R2 no se cierra** hasta que se excluyan o se etiqueten (migración con OK de Felipe).
- Hecho con este spec: la fila en `SESIONES-ACTIVAS` y el ADR-0121.

**R1 — Estructura (sin Atelier).**
- Entra: layout, shell, pestañas, cabecera (sin la línea de fecha ni el buscador: llegan con las vistas que los usan), `BotonCompacto`, los dos modales extraídos, las cuatro rutas, el redirect, `error.tsx`, `exigirLider`, el bloque de la isla en `globals.css`, y el borrado de `VenderNav.tsx`. Los paneles actuales se muestran tal cual.
- Aceptación: (1) las cuatro URLs cargan y el lateral marca «Facturación»; (2) atrás y adelante entre pestañas; (3) `/vender/descuentos` redirige (307); (4) los contadores coinciden con la base y se ocultan si su consulta falla (simulado); (5) un error en una vista no tumba la cabecera; (6) «Emitir comprobante» y «Nueva proforma» abren su modal desde cualquier pestaña y la emisión conserva su token; (7) el mes se conserva entre Proformas y Comprobantes; (8) un integrante es redirigido; (9) con Tab se llega a las pestañas y el foco se ve.
- **Cómo lo verificas tú:** abre las cuatro URLs, prueba atrás y adelante, entra a `/vender/descuentos` y comprueba que te lleva a la nueva, y emite una boleta de prueba desde la cabecera estando en Proformas.

**R2 — Resumen (requiere Atelier en `main`).**
- Entra: tarjetas, `ActividadDeHoy`, `HiloComprobante`, `useTransmitir`, comparativos, franja de proformas, línea viva, leyenda, y el buscador de la cabecera con `useFacturacionBusqueda` y `coincide` (filtra las filas del Resumen).
- Aceptación: las cifras de las tarjetas coinciden con las filas; el comparativo usa la misma medida en ambos lados; *Transmitir* en una fila (sandbox) hace avanzar el hilo, cambia el chip y baja el contador con el color de la tarjeta; un rechazo la pone en rojo con su motivo; un aceptado de prueba se ve distinto de uno real; sin ventas hoy hay un estado vacío con texto; con movimiento reducido se ve el resultado sin el viaje.

**R3 — Comprobantes y Proformas.**
- Entra: tarjetas nuevas con las definiciones del §9, chips y botones compactos, la franja de series faltantes, `vencida` y la búsqueda local.
- Aceptación: «Monto facturado» solo suma aceptados de producción; se ve qué series faltan; una proforma vencida no cuenta como vigente y se ve como tal; la tabla y las tarjetas móviles muestran lo mismo.

**R4 — Códigos y cierre.**
- Entra: la pestaña Códigos con su búsqueda, la pasada de responsive, accesibilidad y movimiento reducido, y la documentación del §14.

**Punto de decisión.** Si al terminar R1 Atelier no está en `main`, se para y se le pregunta a Felipe: esperar, apoyarse en la rama de Atelier, o duplicar lo mínimo.

## 11. Coordinación con otras sesiones

- **Atelier** (`interface-recommendations-8ce365`): aporta `CifraAnimada`, `FechaHoraLima`, `anim-sube`, `hilo-dibuja` y `check-trazo`. Su ADR-0106 choca con el 0106 de «colores», ya en `main`, y esa sesión debe renumerarlo. Este spec depende de esos nombres: si cambian al renumerar o mergear, se ajusta aquí.
- **`panel-comercial`** (`origin/claude/panel-comercial`, ADR-0110, sin mergear ni aplicar): decidió que la suma de lo vendido vive en SQL. Aquí se usa su misma definición de «venta». Cuando `fn_comercial_*` esté en producción, «Vendido hoy» y su referencia pasan a salir de ahí (una sola fuente). Antes de esa fecha hay tres cifras de «lo vendido» en el repo (pagos, ítems y la RPC de Caja): esta pantalla usa la de ítems en ambos lados del comparativo.
- **Ventas visual** (`ventas-visual-redesign-240e2b`): toca `lib/caja.ts`, `panel-serie.ts` y `globals.css`. Aquí solo se importa `panel-serie.ts`, sin modificarlo, y el bloque CSS va aparte. Se sincroniza `main` antes de tocar `globals.css`.
- **Paleta de método de pago** (`--color-metodo-*`, cambio pendiente de mergear en otra rama): se usan solo los tokens, nunca hex.
- **ADR:** 0121. Nació como 0113, pero el 2026-09-19 otras dos ramas (`panel-calidad` e `inventory-view-ux-analysis`) ya lo reclamaban, `main` tiene el 0114 y el 0116, hay ramas con 0117 a 0120 y el 0115 lo dejó libre la sesión de Caja para quien tenga que moverse. Se toma el 0121, que ese día no usaba ninguna rama. Se re-verifica antes de cualquier push.

## 12. Riesgos y qué se rompe si…

- **Producción no coincide con el repo.** Si falta `ventas.estado`, el comparativo falla y queda oculto (`tolerar`). Si `fn_ventas_del_dia` incluye anuladas, «Vendido hoy» las suma. Por eso existe R0 y su regla de decisión.
- **Se compara contra una medida distinta.** El comparativo de Caja suma `venta_pagos.monto`, no `venta_items.subtotal`. Aquí ambos lados usan la misma medida y hay una prueba de la ventana horaria.
- **Se transmite contra producción en una prueba.** El desarrollo usa el sandbox de Lucode (`LUCODE_ENTORNO`); se comprueba la variable antes de cada prueba de Transmitir.
- **Atelier tarda o cambia de nombres.** Punto de decisión tras R1 (§10).
- **Contadores viejos tras navegar.** `router.refresh()` vuelve a pedir el layout; se comprueba en R1.
- **Rendimiento del vidrio en las tablets de las tiendas.** El desenfoque se limita a cinco elementos; si se nota, se baja `blur` por variable, sin tocar componentes.
- **Conflictos en `globals.css`.** Se sincroniza `main` antes y el bloque es autocontenido.

## 13. Verificación

- `pnpm typecheck`, `pnpm lint` y `pnpm test` en cada rebanada.
- Navegador con la sesión de Felipe, con el panel visible (un panel oculto pinta en blanco y frena las animaciones), o una ruta temporal bajo `/login` con los componentes reales y datos de ejemplo, a 1620 px y a 1024 px. Incluye la matriz de estados del hilo (los seis estados, en prueba y en producción).
- Lo que no se pueda comprobar sin datos reales se dice explícitamente en el cierre de la rebanada.

## 14. Documentación al cierre

- ADR-0121 ajustado con lo aprendido.
- `docs/ARQUITECTURA.md`: las rutas y componentes nuevos, y de paso la línea que aún dice que Nubefact está «planeado» (es Lucode).
- `docs/datos/modulos/08-facturacion-sunat.md`: el hueco de las proformas `vencida` y el de `nota_debito`, ya vencidos.
- BACKLOG (una sección por rebanada, con los pendientes de §3), BITÁCORA (tres líneas por cierre) y `SESIONES-ACTIVAS`.
