# ADR-0057 — "Venta" agrupa Punto de Venta/Caja/Cambios/Devoluciones/Facturación en un desplegable del lateral

**Fecha:** 2026-09-15
**Estado:** Aplicado en el worktree `redesign-venta-module-801c9b`, sin pushear.
**Afecta:** `apps/web/components/AppShell.tsx` únicamente — sin esquema, sin RPC, sin rutas nuevas.

## Contexto

Felipe pidió agrupar Punto de Venta, Cambios, Devoluciones, Caja y Facturación bajo un
módulo colapsable "Venta" en el lateral. Cambios y Devoluciones se habían agregado al
menú ESE MISMO DÍA (sesión de la mañana, ver BITÁCORA) porque antes nadie las
encontraba — colapsarlas por defecto las habría vuelto a esconder.

El lateral ya tenía un mecanismo de grupos con título (`grupos`, de ADR-0014), pero de
un solo nivel: cada fila era un `Item` plano, y el riel rojo que marca la activa se
posiciona con `índice_del_array × 56px` — aritmética pura, sin medir el DOM. Meter una
cabecera colapsable rompe esa aritmética si no se resuelve con cuidado: cualquier fila
DEBAJO del grupo cambia de posición real en pantalla según si "Venta" está abierto o
cerrado.

## Decisión

1. **El riel sigue sin medir el DOM.** En vez de `items: Item[]`, `GrupoLateral` aplana
   cabecera + hijas (solo si `ventaAbierto`) en un array de "filas visibles" en cada
   render, y el riel se posiciona por el índice DENTRO de ese array aplanado — nunca por
   el índice del array de datos original. Con el grupo cerrado, cada fila de abajo sigue
   estando exactamente `PASO_FILA` más arriba que con el grupo abierto (la diferencia es
   `N × PASO_FILA`, con N = hijas visibles: 5 para un Líder, 4 sin Facturación). Misma
   invariante de ADR-0014 ("el riel y las filas leen los mismos dos números"), aplicada a
   un árbol en vez de una lista.
2. **Colapsado + ruta activa adentro = la cabecera hace de sustituto.** Si "Venta" está
   cerrado y la ruta activa es una de sus hijas, el riel se queda en la fila "Venta"
   (única representación visible de esa ruta). Al abrir, el riel salta a la hija exacta.
3. **Entrar por otra vía nunca deja una pantalla escondida.** Si la ruta activa es una
   hija del grupo, se fuerza `ventaAbierto = true` — ajustado durante el RENDER
   (comparando contra el valor del render anterior), no en un `useEffect`: el linter del
   repo ya exige este patrón (`react-hooks/set-state-in-effect`, mismo motivo que el
   búfer de animación del ticket, ADR-0044) y de paso evita animar la revelación cuando
   alguien entra directo a `/cambios` — ahí nunca "se abrió", ya nace abierto.
4. **Arranca expandido** (decisión de Felipe, preguntada explícitamente): un grupo
   colapsado por defecto habría vuelto a esconder Cambios/Devoluciones el mismo día que
   se hicieron visibles.
5. **"Vender" pasa a "Punto de Venta"** en la etiqueta (decisión de Felipe) — coincide
   con los nombres que el código ya usa por dentro desde ADR-0043 (`PuntoDeVenta.tsx`,
   `PuntoDeVentaTicket.tsx`). Como el objeto se reusa en la pestaña de celular
   (`columnas`), el texto cambia ahí también; el ÍCONO de celular no cambia (sigue el
   carrito) — evita un cambio visual no pedido en una estructura aparte que nadie tocó.
6. **Facturación se queda líder-only**, ahora condicionada dentro de `grupoVenta.hijos`
   en vez del array de nivel superior — mismo `esLider ? [...] : []` de siempre, solo
   reubicado. Verificado en navegador como Felipe (ve las 5) y como Micaela (ve 4, sin
   Facturación).
7. **Fuera de alcance a propósito:** la barra de celular (5 columnas fijas) y el panel
   "+ Nuevo" no se tocan — son estructuras separadas en el mismo archivo y nada de lo
   pedido las involucra.

## Alternativas descartadas

- **Un segundo riel deslizante para las hijas.** Visualmente más vistoso, pero duplica la
  geometría de ADR-0014 para un solo grupo — la complejidad no se paga. Las hijas activas
  usan el mismo acento fijo (no deslizante) que ya usan las filas de "+ Nuevo": reutiliza,
  no inventa.
- **"Códigos de descuento" (`/vender/descuentos`) como 6to ítem del grupo.** Felipe
  prefirió dejarlo como está (accesible solo desde dentro de Facturación) — se preguntó
  explícitamente, no se asumió.
- **Animar también el colapso (salida) de las hijas**, no solo la revelación.
  `anim-revelar-salida` ya existe en `globals.css`, pero animar una salida antes de
  desmontar pide coordinar el unmount (temporizador o una librería de transición) —
  desproporcionado para un cambio bounded. El colapso es instantáneo; solo la apertura
  tiene el guiño de `anim-revelar` escalonado (mismo patrón de `MenuNuevo`).

## Consecuencias

- `tsc`, `eslint` y los 239 tests existentes en verde — ninguno tocaba `AppShell.tsx`.
  Verificado en navegador: expandir/colapsar con clic, navegación directa a `/cambios`
  con el grupo previamente colapsado (auto-abre), vista de Felipe (líder, 5 hijas) y de
  Micaela (colaboradora, 4 hijas, sin Facturación), riel sin saltos en ambos estados,
  barra de celular intacta.
- **Se rompe si** alguien agrega un SEGUNDO grupo colapsable reusando
  `ventaAbierto`/`ventaTocado` tal cual — son estado específico de UN grupo, no genérico.
  Un segundo grupo colapsable pide generalizar antes a un `Set<string>` de grupos
  abiertos, no copiar este patrón dos veces.
- Hallazgo de paso, sin relación con este cambio: como Micaela, `/` (Inicio) respondió
  "No se pudo leer los movimientos: invalid response from upstream server" — coincide con
  que `supabase status` reporta el pooler local detenido en esta máquina; no reproducido
  como Felipe, no investigado más a fondo (infraestructura local, no código).
