# Spike visual · Loader general de navegación (2026-09-21)

`cargando-general-spike.html` — autocontenido (necesita `cayla-isotipo.png` al lado). **No es una implementación**: no toca `AppShell.tsx`.

**Problema.** Al elegir una opción del menú no se ve nada hasta que Next monta `app/(app)/loading.tsx`, que hoy es un «Cargando…» de 11 px. Con la base lenta parece que el clic no se registró.
Solo Compras y Recibir tienen esqueleto propio; el resto del ERP cae en ese texto suelto.

## Tres capas, cada una entra solo si la espera lo pide

| Cuándo | Qué se ve | Para qué |
|---|---|---|
| 0 ms | Hilo rojo bajo la cabecera + la fila del menú cambia su icono por un arco | Respuesta al clic. Si la carga es rápida, es lo único que aparece (cero parpadeo). |
| 250 ms | La pantalla pasa a la silueta (título, 4 cifras, tabla) + señal «Cargando X» | Que se lea «se está armando», y que nada salte al llegar. |
| 4 s | «Está tardando más de lo normal…» | Que nadie dude de si se colgó (igual que el aviso de sede). |

Variantes de la señal del paso 2: **1** solo hilo · **2** silueta + línea con arco · **3** silueta + tarjeta central (isotipo, como el aviso de sede pero sin velo).

## Decisión propuesta
Variante **2**. La 3 le da a navegar el mismo peso que a *cambiar de sede*, y no son lo mismo: cambiar de sede puede dejarte leyendo cifras de otra tienda (por eso bloquea); navegar no arriesga nada.
El aviso de sede se queda como está.

## Cómo llevarlo al ERP
- `NavProgreso` (cliente, en `AppShell`): el hilo, disparado por clics en `<a>` internos y apagado al cambiar `pathname`.
- `loading.tsx` de `(app)`: la silueta genérica + la línea «Cargando…» con el aviso de 4 s (reutiliza `Esqueleto.tsx`).
- Fila del menú «tomada» con `useLinkStatus` (Next 16).

## Qué se construyó (2026-09-21, ADR-0149)
Felipe pidió que el loader **cubra toda la pantalla, lateral incluido**, y que aparezca también al guardar. Por eso se construyó la versión «tarjeta» (variante 3) a pantalla completa y no la variante 2 recomendada arriba, con la misma pieza para navegar, guardar y cambiar de sede. El hilo superior y la fila «tomada» del menú quedaron fuera.
