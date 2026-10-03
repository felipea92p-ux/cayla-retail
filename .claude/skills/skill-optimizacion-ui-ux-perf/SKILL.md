---
name: skill-optimizacion-ui-ux-perf
description: Diagnostica cuellos de botella de velocidad percibida y carga en el frontend de una pantalla, un módulo o todo el ERP — cascadas de `await`, falta de `Suspense`/esqueletos, JS de cliente excesivo, modales pesados cargados siempre, imágenes sin optimizar, candidatos legítimos a actualización optimista — respetando las reglas del repo (loader global único ADR-0149, nada optimista en dinero/stock). Úsala al construir o revisar una pantalla lenta, antes de dar por terminada una pantalla pesada, o cuando Felipe diga que «se siente lenta».
---

Diagnostica la velocidad percibida de: $ARGUMENTS   (una ruta como `/vender`, un módulo como `inventario`, o `todo`)

**Regla madre:** la velocidad *percibida* se gana con (a) mostrar algo útil pronto y (b) no esperar lo que no hace falta esperar. No se gana
agregando animación ni otro loader. Y **se mide antes de optimizar**: este escáner mide ESTRUCTURA; los milisegundos reales los da
`/skill-evaluacion-observabilidad` (hoy no hay con qué medirlos: dilo). Solo analizas y propones. Fundamento:
`docs/investigacion/2026-10-03-arboles-ux-observabilidad.md`.

## Reglas del repo que esta skill NO puede contradecir

1. **Un solo loader a pantalla completa** (ADR-0149, `components/ui/Espera.tsx`). No propongas otro overlay ni un «Cargando…» suelto; un
   `Suspense` de sección dentro de la pantalla SÍ es válido (esqueleto parcial). Un buscador por URL usa `buscar(href)` de `useBusquedaEnUrl`.
2. **Nada optimista en dinero, stock ni comprobantes.** La venta, el traslado, el ajuste y la nota de crédito son todo-o-nada (Jim Gray): el
   aviso de éxito sale DESPUÉS de que Postgres confirma (ADR-0149, act. 2026-09-21). Optimismo solo en **estado de interfaz**: carrito
   sin confirmar, selección, orden, filtros, «marcado como visto».
3. **Todo modal es `<Modal>`** con su movimiento (ADR-0136): carga diferida con `next/dynamic` *sí*; otra animación de entrada *no*.
4. **Celular obligatorio** en Vender, Cambios y Devoluciones (PL-105): se prueba a 375 px; ahí el JS sobrante pesa más.
5. **Colores, botones, cabeceras**: solo tokens y piezas del sistema (ADR-0169). Esta skill no toca estética.

## Paso 1 — Medir la estructura

```bash
node scripts/rendimiento/ui.mjs --ruta <fragmento>   # una pantalla o módulo
node scripts/rendimiento/ui.mjs --top 25              # el ranking de todo el ERP
```

Banderas por pantalla: `cascada` (≥ 3 `await` seguidos fuera de `Promise.all`; **candidata**) · `sin-streaming` (cascada ≥ 2 y sin `Suspense`) ·
`peso-cliente` (muchas líneas `"use client"` alcanzables, sin contar lo compartido) · `modales-fijos` (≥ 2 modales cargados siempre, 0 `next/dynamic`) ·
`img-cruda` (`<img>` en vez de `next/image`) · `img-sin-sizes` · `pagina-cliente` (el `page.tsx` entero es cliente) · `sin-loading`.
`loading: hereda` **no es problema** (el layout trae el loader global). Todas son pistas: **se confirman leyendo la página**.

## Paso 2 — Confirmar y clasificar (cada hallazgo, leyendo el código)

| Bandera | Cómo se confirma | Cura |
|---|---|---|
| `cascada` | ¿El 2.º `await` usa el resultado del 1.º? Si NO → paralelizable | `Promise.all([...])`; si SÍ, ¿se puede mover una RPC a una sola función SQL que devuelva todo? |
| `sin-streaming` | ¿Qué parte tarda más (la tabla, un resumen)? | `<Suspense fallback={<Esqueleto/>}>` solo en esa parte; la cabecera y las cifras salen primero |
| `modales-fijos` | ¿El modal se ve al cargar? Casi nunca | `next/dynamic(() => import(...))` — el JS del modal viaja cuando se abre |
| `peso-cliente` | ¿Qué parte es solo mostrar (sin clic ni estado)? | Dejarla como Server Component; `"use client"` solo en la hoja que interactúa |
| `img-cruda` | ¿Dónde está en la pantalla? | `next/image` con `sizes`; `priority` solo arriba del pliegue |
| `pagina-cliente` | ¿Por qué el `page.tsx` es cliente? | Pasar la lectura de datos al servidor y dejar el cliente en un hijo |

**Candidatos a optimismo** (`candidatosOptimismo` del JSON): para cada uno, escribe **explícitamente** «esto es estado de interfaz» o descártalo
por la regla 2. Ejemplo válido: agregar/quitar una línea del carrito de Vender (aún no es venta). Inválido: «Confirmar venta».

## Paso 3 — Priorizar por dolor real, no por puntaje

Ordena por: (1) pantallas de **mostrador** (Vender, Cambios, Devoluciones, Caja: la espera se ve y hay clienta delante), (2) pantallas que se
abren todo el día (Existencias, Movimientos), (3) el resto. Una pantalla de configuración con `cascada` no es prioridad.

## Paso 4 — Informe

```
### <ruta> — prioridad <alta|media|baja> (por qué: quién la usa y cuándo)
- Hallazgo (bandera + archivo:línea):
- Confirmado leyendo: sí/no, y qué vi
- Cambio concreto: <el diff en 5–15 líneas>
- Cómo se verifica: <medida antes/después en el navegador a 1280 px y a 375 px; Network → tiempo de la RPC>
- Riesgo: <qué podría romperse: p. ej. un Suspense que oculta un error, un dynamic que retrasa un modal urgente>
```

Cierra con objeción y «lo que no pidió». **Verificar en navegador antes de afirmar mejora** (`preview_start`, panel propio, pestaña propia):
sin captura o medida, es «propuesta», no «mejora».
