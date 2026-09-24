# Spike visual · Inicio general y lateral sin «+ Nuevo» (2026-09-24)

`inicio-general-spike.html` — autocontenido, ábrelo en el navegador (necesita `cayla-isotipo.png` al lado).
Datos inventados. **No es una implementación**: no toca `app/(app)/page.tsx`, `AppShell.tsx` ni la base.

## El pedido (Felipe, 2026-09-24)

1. Un Inicio **más general, que no lleve a módulos**: con Roles y accesos (ADR-0161) el menú ya muestra solo lo
   que cada rol ve, así que los accesos «Ir a» (Vender, Caja, Buscar…) y las colas como enlaces duplican el menú y
   pueden mandar a una pantalla que el rol no tiene.
2. **Quitar el botón «+ Nuevo»** del lateral: repite seis entradas que ya están en el menú.

## Qué propone

| Bloque | Pregunta | Cambia respecto de hoy |
|---|---|---|
| Cabecera (`CabeceraPantalla`) | ¿dónde estoy? | Sobretítulo con la fecha; bajada con ubicación y rol |
| **Hoy en {ubicación}** | ¿cómo va? | Tienda: ventas/prendas/meta (líder = tienda; resto = «tus ventas»). Almacén y Taller ahora tienen sus propias cifras en vez de nada |
| **Te toca** | ¿qué me espera? | Reemplaza «Por atender». Solo avisos de módulos que el rol ve. **No son enlaces**: dicen «En el menú: Inventario ▸ Traslados». Lo que está en cero se junta en una línea «Al día» |
| **De turno ahora** | ¿quién está? | Nuevo. Sale de `fn_asesoras_de_turno` (la misma del combo Responsable) |
| Nota hueso | ¿qué puedo hacer? | Nuevo. «Tu rol X te da N módulos, están en el menú» + pastillas no clicables |
| ~~Ir a~~ | — | **Se quita** |
| ~~Actividad reciente~~ | — | **Se quita** (Felipe, 2026-09-24): mezclaba operaciones de módulos que el rol quizá no ve, repetía Movimientos y no pedía ninguna decisión |
| ~~+ Nuevo~~ (lateral y «+» central del celular) | — | **Se quita**. En celular la barra queda en 5 columnas: Inicio + 3 grupos del rol + Más |

## Cómo probarlo

- **Ver como**: líder de tienda, vendedora, almacén, taller y una cuenta sin módulos todavía.
- **Botón «+ Nuevo»**: «Como hoy (tachado)» muestra dónde estaba, para comparar.
- Achicar la ventana a < 768 px muestra la versión de celular.

## Decisiones abiertas antes de construir

- ¿La vendedora ve la **meta de la tienda** (entre todas) o solo lo suyo? El spike la muestra.
- ¿«De turno ahora» se muestra a todos o solo al líder?
- Cifras de Almacén/Taller: necesitan una lectura nueva (`resumen_` de ubicación) si se aprueban.
- La terminal que ve el Punto de venta sigue aterrizando en `/vender` (`aterrizajeDe`), sin cambio.
