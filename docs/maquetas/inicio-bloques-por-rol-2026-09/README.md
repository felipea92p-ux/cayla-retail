# Inicio: los bloques nuevos por rol (spike, 2026-09-29)

`inicio-bloques.html` es autocontenido: se abre en el navegador (el isotipo va al lado, `cayla-isotipo.png`).
**Todas las cifras y los nombres son inventados.** No es una implementación: no toca `app/(app)/page.tsx`, ni el
menú, ni la base. Sirve para que Felipe decida qué bloques se construyen y en qué orden.

## El pedido (Felipe, 2026-09-29)

Los accesos del Inicio ya salen de lo que hace el rol (rama `claude/accesos-rol-terminal-3e62ba`), pero el Inicio «se
siente pobre». Esta maqueta propone qué sumarle a cada rol. Parte del spike aprobado el 2026-09-26
(`../inicio-movil-roles-2026-09/`): mismo orden (cifras → Te toca → accesos → equipo), mismos tokens (ADR-0169) y
«Vender» fijo en celular (ADR-0206).

## Controles

| Control | Opciones |
|---|---|
| Ver como | Líder · Colaborador · Terminal de almacén · Taller |
| Momento del día | 9:30 a. m., sin ventas (cómo se ve cada bloque vacío) · 5:40 p. m. |
| Lo nuevo | **Marcado** (línea punteada y etiqueta «Nuevo · de dónde sale») · Limpio (cómo quedaría) |
| Lectura de lo nuevo | Bien · **Falla** (cada bloque nuevo cae solo y dice «Lo demás de esta pantalla sí está al día») |

Bajo la computadora, una tabla dice de dónde saldría el dato de cada bloque, si ya existe y cuánto cuesta.

## Qué se le suma a cada rol

| Rol | Bloques nuevos | Dato |
|---|---|---|
| **Líder** | «Ritmo del día» (ventas acumuladas hora por hora, contra el mismo día de la semana pasada) · «Las 3 tiendas hoy» (solo ella) · «Nuevo producto» en los accesos · avisos de efectivo sin depositar, cierre de mes y límite del régimen | La curva amplía la cifra de «Ventas»; las tiendas salen de Rendimiento; los tres avisos están en «sin lectura todavía» del ADR-0225 |
| **Colaborador** | «Tu semana» (7 días contra los mismos días de la semana pasada; solo lo suyo) y una meta individual simple en «Tu día» | Lectura por persona (hoy no existe: ver «Falta decidir»); la meta por persona tampoco existe |
| **Terminal de almacén** (y almacén como sede) | «Hoy en la trastienda»: por recibir, traslados en tránsito, conteo abierto, prendas dañadas · botón fijo «Recibir mercadería» en celular | Cuatro lecturas de solo lectura; hoy esa terminal no ve ninguna cifra |
| **Taller** | «Hoy en el taller»: órdenes por etapa (Corte, Confección, Acabados) · avisos de órdenes atrasadas e insumos bajo el mínimo | `lib/produccion-decisiones.ts` (Resumen de Producción, #231) ya calcula la etapa de cada orden, su entrega y los insumos bajo el mínimo; contar por etapa es una suma |

La terminal del mostrador no aparece: aterriza en `/vender` y nunca ve el Inicio (`aterrizajeDe`). Sus accesos viven en
«Más» del Punto de venta (`lib/vender-accesos.ts`).

## Decisiones de diseño

- **Lo nuevo entra como cifras, a la izquierda.** El orden aprobado no cambia. La columna izquierda del Inicio actual
  termina antes que la derecha (queda un vacío bajo «Te toca»); la curva y «Tu semana» lo llenan, y «Las 3 tiendas hoy»
  equilibra la derecha.
- **Un gráfico solo donde hay una comparación.** Curva de dos series (hoy contra el martes pasado) y barras con una marca por
  el día equivalente de la semana anterior. Una escala por gráfico, nunca dos ejes. Trazo de 2 px, marcas de 8 px con anillo
  del color de la superficie, leyenda siempre presente, una etiqueta directa por serie, tooltip al pasar el mouse y vista
  en tabla. La serie de referencia va punteada y en taupe: se distingue sin depender del color.
- **Tokens de `globals.css`, sin hex nuevos.** Sin rojo fuera de lo urgente. Las etapas del taller son una sola tinta en tres
  pasos de opacidad (una secuencia ordenada, no tres categorías).
- **Cada bloque falla solo** (principio 9): con «Falla» se ve el aviso sin que caiga el resto.
- **Sin ventas todavía, honesto:** ningún bloque dibuja un 0 mudo; la curva muestra solo la referencia y dice «Hoy:
  todavía sin ventas».

## Decididas por Felipe (2026-09-29, tras ver la maqueta)

1. **«Las 3 tiendas hoy»:** solo la líder.
2. **Accesos de la líder:** «Nuevo producto» en lugar de «Apartados» (hecho en `lib/inicio-avisos.ts`). Apartados sigue en «Te toca» y en el menú.
3. **Terminal de almacén:** lleva el botón fijo «Recibir mercadería» en el celular (hecho en `app/(app)/page.tsx`).
4. **Integrante:** ve una **meta individual simple** en «Tu día» (una barra y un porcentaje; en la maqueta, la primera tarjeta). La
   líder ve las ventas de todas y más datos en Rendimiento.

## Falta decidir para construir la meta individual

La meta individual **no existe** en la base: hoy solo hay meta por sede (`ubicaciones.meta_venta_diaria`, `ubicacion_metas_dia`).
Ninguna transcripción local trabaja una meta individual: lo escrito es «todavía no» (D-64 y D-125 del 2026-09-26).

1. **Reabre tres decisiones.** D-64 y D-125 («metas por persona: todavía no») y D-68 («por ahora las colaboradoras no ven ni sus
   propias cifras: esto generaría más caos actualmente», Felipe con el gerente). El acta ya dejaba escrito cuándo retomarlas:
   «el día que las colaboradoras vean sus cifras».
2. **¿Quién la fija y cómo?** D-64 dice «mensual por tienda, el líder la reparte». ¿En partes iguales, por horas trabajadas o la
   escribe la líder persona por persona?
3. **¿Diaria o mensual?** La de la sede es diaria y suma al mes; una meta diaria por persona cambia con turnos y días libres.
4. **Antes hay que corregir «Tus ventas».** Hoy `fn_ventas_del_dia` le devuelve a una colaboradora **todas** las ventas de su
   tienda (verificado en producción el 2026-09-29: filtra por tienda, no por `asesora_id`), así que «Tus ventas» y «Tu ticket»
   muestran el total de la tienda. Una meta individual sobre ese número sería falsa. El acta de Rendimiento ya lo listaba como
   tarea aparte; el comentario de `lib/inicio.ts` («la RPC devuelve solo las suyas») es incorrecto.
5. **En Rendimiento:** ¿qué ve la líder de la meta de cada una (cumplimiento, quién la fijó)? Hoy lo ven los Admin (todas las
   tiendas) y quien tenga un rol con el módulo encendido (su tienda), no solo la líder.
6. **Orden de construcción.** Recomiendo «Hoy en la trastienda» primero (esa terminal no ve hoy ni una cifra). «Tu semana» y la meta
   individual esperan a corregir «Tus ventas» y a decidir los puntos 1 a 3.

## Lo que se respeta

- **ADR-0161:** solo bloques de módulos que el rol ve.
- **ADR-0169:** tokens; el rojo marca solo lo urgente.
- **ADR-0206:** en celular no hay barra inferior; el botón fijo es una acción de esta pantalla.
- **ADR-0225:** orden único en todos los tamaños; los avisos siguen siendo tocables y filtrables.

## Cómo se verificó

Abierta en el navegador integrado con los 4 roles, «9:30 a. m.» y «5:40 p. m.», «Falla» y «Limpio»; tooltip de la curva
comprobado; sin errores en consola. No se probó en un celular real.
