# Spike visual · Recibir mercadería (2026-09-19)

> **Estado (2026-09-19): aplicado a `/recibir` — ver `docs/adr/0129-recibir-mercaderia-gestos-de-conteo-y-resumen-previo.md`**
> (incluye la lista de lo que NO se portó; el «Borrador guardado» se quitó a pedido de Felipe). Este HTML queda como referencia visual del diseño aprobado.

`recibir-spike.html` — autocontenido, ábrelo en el navegador. Datos inventados. **No es una implementación ni
reemplaza la pantalla construida (`/recibir`, ADR-0113) ni las maquetas 04–07 / `recibir-envio-2026-09`**: parte de
ellas (mismos tokens, mismos textos, mismas reglas de negocio) y explora qué pasa si el módulo *responde* más.
Cubre **todo el recorrido**: pendientes → envío → conteo → fuera de comprobante y envío interno → notas → resumen →
recibir → éxito → «Recibidas» con vista rápida. La barra de arriba (línea punteada) sirve para juzgarlo:

| Botón | Para qué |
|---|---|
| ↻ Repetir la entrada | Vuelve a jugar la llegada escalonada de la pantalla |
| Movimiento reducido | Simula `prefers-reduced-motion`: mismo estado final, sin viaje |
| Ver como colaborador | Mismo módulo **sin dinero** y sin decidir qué pasa con lo que faltó («Sigue pendiente») |
| Cargar un envío de ejemplo | Salta a un envío de 3 proveedores ya a medio contar |
| Simular escaneo | Lee una etiqueta al azar, como una pistola de códigos |
| ↺ Datos de ejemplo | Restablece todo (la recepción confirmada *sí* cambia las listas, para poder repetir) |

Atajos: **/** enfoca el buscador (o el escáner si ya hay envío) · **Enter** salta a la siguiente prenda · **Esc**
cierra · **↑ ↓** navegan la vista rápida de «Recibidas».

## Qué mejora en UX (no solo «se mueve»)

| Idea | Problema que resuelve | Dónde se portaría |
|---|---|---|
| **«Marcar las N atrasadas»** (lista y estado vacío) y **«La más atrasada»** como atajo | Hoy hay que marcar uno por uno lo que casi siempre se recibe junto | `RecepcionEnvio.tsx` (lista) + `KpisRecibir.tsx` (la tarjeta pasa a ser botón) |
| **Barra de avance por comprobante** en cada fila de la lista | «20 de 110 u.» es texto; la proporción se ve sin leer | fila de la lista, `recibidoCantidad / facturadoCantidad` (ya están) |
| **Guía con validación viva** (`T001-000123`, tilde que se dibuja) | El formato malo se descubre tarde | `CampoTexto` de la guía; regla pura en `envio-reglas.ts` |
| **Escáner con sugerencias y salidas** | Hoy «no encontrado» es un callejón: aquí ofrece *agregar el comprobante que no marcaste* o *anotarlo fuera de comprobante*, y «Deshacer» la última lectura | `escanear` en `RecepcionEnvio.tsx` (la lógica de búsqueda ya existe; falta la salida) |
| **Decisión de faltante en un toque** (píldoras, sin «Guardar») + «Los espero todas» en la barra | El editor con select + Guardar son 3 gestos por fila; con 8 filas faltantes es lo que más cansa | `DecisionFaltanteFila.tsx`; la regla («falta decidir bloquea recibir») **no cambia** |
| **Paso − / +** que aparece al pasar el mouse o enfocar (siempre visible en celular) | El campo numérico pelado no invita; en escritorio molesta si está siempre | `PasoCantidad` ya existe para celular: extenderlo a escritorio |
| **Resumen previo a recibir** («Confirma lo que entra») | Recibir escribe movimientos que ya no se editan (principio 4); hoy un clic los escribe sin verlos juntos | modal nuevo antes de `recibir_envio`; **no toca la RPC** |
| **Barra de totales con medidor** (verde contado · ámbar faltante · gris sin contar) | Seis cifras no dicen «cuánto falta» de un vistazo | `BarraFija` |
| **Éxito que muestra los movimientos** (libro con hilo, +24 Blusa Emma…) | «61 unidades» no dice *qué* entró; enseña la idea de «cada prenda entra como movimiento» | pantalla `ok` de `RecepcionEnvio.tsx` |
| **Borrador guardado** con estado («Guardando… → guardado · 12:54») | Ya estaba en la maqueta y sin construir | `localStorage`; ver ADR-0113 «Sin construir todavía» |
| **Recibidas: vista rápida** (cajón) en vez de modal, con ↑ ↓; envíos plegables; filtros de periodo y resultado | Comparar 5 recepciones = abrir y cerrar 5 modales | `RecepcionesCompraLista.tsx` (mismo patrón que `ProveedorVistaRapida`, ADR-0128) |
| **Colaborador**: no se *renderiza* el dinero (no solo se oculta con opacidad) | Un monto oculto por CSS sigue en el DOM | ya lo hace el servidor (`comprobanteSinMontos`); el spike lo respeta |

## Gramática de movimiento

Reutiliza lo que ya está en `globals.css` con los mismos nombres: `cayla-entrada`, `cayla-revelar`, `cayla-asentar`,
`cayla-velo`, `cayla-hilo-barrido`, `cayla-brillo`, `cayla-pop`, curvas `--ease-cayla` / `--ease-salida`, y el colapso a
1 ms con movimiento reducido. Sin rebote, sin color nuevo, sin sombra, un solo gradiente (el barrido del botón; y el
camino punteado del estado vacío usa un `repeating-linear-gradient` de una línea).

**Gestos de Proveedores que se repiten aquí** (ya aprobados en ADR-0128): FLIP al filtrar, pulgar deslizante en las
pestañas, cifra que cuenta, barras que crecen, destello de «acaba de pasar», despliegue por `grid-template-rows`,
aviso con temporizador, cajón lateral.

**Gestos nuevos de este spike** (prefijo `nv-`; habría que aprobarlos):

| Gesto | Qué hace | Costo de portarlo |
|---|---|---|
| **Cascada de «Todo llegó»** | Las filas del comprobante se llenan una tras otra (50 ms) contando hasta su cifra | ~10 líneas de JS |
| **Destello verde de lectura** + «cinta» en el escáner | Cuando la pistola lee, la fila y el campo lo confirman; el ojo encuentra dónde cayó (`scrollIntoView`) | CSS + 6 líneas |
| **Anillo de avance** que cambia de color al llegar a «Listo para recibir» | El estado del envío se *ve*, no solo se lee | ya existe `anillo-progreso`; falta el cambio de trazo |
| **Chip que se «asienta»** al cambiar de estado (Sin contar → Faltan 4 → Completa, con tilde que se dibuja) | Notar que la línea cambió sin releerla | reutiliza `cayla-asentar` + `check-trazo` |
| **Sello + ondas** en el éxito y **libro de movimientos** con hilo taupe que crece | Cierra el ciclo con una imagen memorable; el hilo es el del Atelier (ADR-0123) | CSS puro |
| **Camino punteado** en «¿Qué llegó?» (el camión va y viene) | El estado vacío deja de ser una caja muerta | CSS puro; se apaga con movimiento reducido |
| **Píldora de decisión** que colapsa la tira al elegir | La fila «se resuelve» sola | `grid-template-rows` |

## Lo que el spike inventa y producción no tiene

- **Resumen previo a recibir** y **«Marcar las atrasadas»**: no existen; son decisiones de producto, no de estilo (ver
  tabla). El resumen es una propuesta; si Felipe prefiere el envío directo, se quita sin afectar lo demás.
- **Borrador guardado** y **miniaturas de prenda por color** (color plano, sin degradado): ya listados como «sin
  construir» en el README de `recibir-envio-2026-09`.
- **Filtros de periodo/resultado en Recibidas** y **cajón** (hoy son buscador, proveedor y dos fechas, y un modal).
- Cifras, proveedores, guías, personas y traslado 0015: inventados. Las cifras de la lista de pendientes parten de las
  de la maqueta de envío.
- La nota de crédito aparece como bloque simple (N.º opcional): la de producción (`NotaCreditoCierre`) tiene más
  campos (IGV, reparto por línea); aquí solo se muestra dónde vive y cuándo aparece.

## Verificado en el navegador

Estado vacío con KPIs contando · marcar comprobantes (flash + chip + avatar que entra) · «Cargar un envío» · escáner
con Enter (suma 1, resalta la fila, «Deshacer») · faltante → píldora → tira que se cierra · «Todo llegó» en cascada ·
traslado con conteo · resumen · confirmar (hilo de carga, éxito con libro de movimientos, las listas se actualizan) ·
Recibidas (KPIs, filtros, envío plegable, fila nueva con destello, cajón con ↑ ↓) · colaborador sin montos · 1024 px
(filas en formato tarjeta) y 375 px (sin scroll horizontal). Sin errores de consola. **No verificado:** tacto real en
un celular y lectura con pistola de códigos física.
