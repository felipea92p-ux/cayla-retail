# ADR-0225 · Inicio por rol, en computadora y celular: «Te toca», accesos y «Equipo de hoy»

- **Fecha:** 2026-09-26 · **Estado:** Aceptado y construido (solo web). **Producción:** ninguna migración. Usa
  `fn_actividad` (ADR-0207) y `fn_asesoras_de_turno`, que ya están en producción.
- **Supera en parte:** el spike #389 (`docs/maquetas/inicio-general-spike-2026-09/`, no implementado). Se reabre «el Inicio no
  lleva a módulos», se quitan «Ir a» y «Actividad reciente», y se mantiene que la vendedora ve solo lo suyo.
- **Alcance:**
  - Pantalla: `apps/web/app/(app)/page.tsx`.
  - Reglas: `lib/inicio-avisos.ts` (+ prueba), `lib/inicio-reglas.ts` (queda solo con las cifras) y `lib/inicio.ts`.
  - Filtro: `components/inicio/AjustarInicio.tsx` y `app/actions/inicio.ts`.
  - Spike: `docs/maquetas/inicio-movil-roles-2026-09/`, con demo, spike, README e investigación.
- **Decide:** Felipe, 2026-09-26, en dos rondas de preguntas sobre un demo comparativo. Lo probó en local antes de subirlo.

## Problema

- El Inicio no mostraba las pantallas nuevas: Apartados, Posventa, Compras, Conteo y pedidos no atendidos.
- En el celular, donde las trabajadoras pasan el día, lo accionable quedaba dos pantallas abajo.
- A las 9 a. m. mostraba tres tarjetas vacías («S/ 0 · — · —»).
- «Por atender» pintaba 4 tarjetas en 0 con el mismo peso que una alerta.
- «Actividad reciente» repetía Movimientos sin pedir ninguna decisión.

## Referentes (investigación, README del spike)

Se revisaron Shopify POS, Square, Toast, Dynamics 365 Commerce y Zebra Workcloud. Tienen en común:

- El rol decide la pantalla.
- El contador va en el aviso y abre la lista ya filtrada.
- Lo urgente no se apaga.
- La acción principal queda siempre a mano.
- Ninguno documenta una «actividad reciente» automática en el inicio.

## Decisión

- **D1: un solo orden en todos los tamaños** (opción C de Felipe): cifras del día → «Te toca» → accesos → «Equipo de hoy».
  - Desde `lg`, dos columnas: lo que se decide a la izquierda y la gente a la derecha.
  - En celular se apila.
- **D2: «Te toca» reemplaza «Por atender».**
  - Nueve avisos, cada uno leído SOLO si la cuenta ve su módulo (ADR-0161). Así nunca llevan a «Sin acceso».
  - Cada aviso es un enlace a su pantalla.
  - Orden: urgente (rojo) → por hacer (ámbar) → informativo (pizarra) → sin leer. Lo que está en 0 se junta en una línea
    «Al día».
  - En celular se ven 3 y «Ver N más», pero lo urgente nunca queda detrás del corte.
- **D3: lo urgente no se oculta.**
  - Siempre urgente, con candado y sin interruptor: SUNAT atascado y caja con diferencia.
  - Urgente según el caso: apartado que vence hoy o ya venció, factura de proveedor vencida, y prendas sin regularizar por más de
    2 días.
  - Si se ocultó y se vuelve urgente, sale marcado «Lo ocultaste, pero es urgente».
  - Lo oculto no urgente que tiene algo pendiente se cuenta en una línea: ocultar no es olvidar.
- **D4: filtro personal «Ajustar»** (`<Modal variante="hoja">`).
  - Arranca con lo recomendado para el rol: a la líder, lo informativo (pedidos, conteo) le llega apagado.
  - **Paso 1:** se guarda en una cookie httpOnly por cuenta en ese aparato, vía acción de servidor.
  - **Paso 2 (pendiente):** guardarlo en la base para que siga a la persona en cualquier aparato.
- **D5: accesos rápidos del rol en vez de «Ir a».**
  - Hasta 4, solo de módulos que ve; «Buscar» no pide módulo.
  - «Vender» no está en la fila: va en la cabecera en computadora y fijo abajo en celular. En el almacén el botón fijo es
    «Recibir mercadería».
  - Ese botón es una acción de esta pantalla, no una barra de navegación: **ADR-0206 (cajón ☰) sigue en pie.**
- **D6: «Equipo de hoy» reemplaza «Actividad reciente».**
  - Muestra quién está (`fn_asesoras_de_turno`) y, si la cuenta ve el módulo Actividad, sus ventas del día y su última acción
    (`fn_actividad` desde la medianoche de Lima).
  - Quien firmó algo sin marcar asistencia también sale («Sin marcar asistencia»).
  - La vendedora ve solo nombres: `fn_actividad` exige el módulo Actividad, y el #389 decidió que no ve cifras de sus compañeras.
- **D7: sin ventas todavía, una sola línea útil** (caja abierta o cerrada, meta) en vez de tres tarjetas vacías.

## Lo que queda abierto

- **La cabecera:** usa `<CabeceraPantalla>` (fecha en rojo → saludo → rol y sede), como el spike aprobado. La regla de
  ADR-0220 deja sin decidir la cabecera fuera de Ventas, Inventario y Finanzas: Felipe lo confirma al revisar el PR.
- **Avisos sin lectura todavía:** mercadería por recibir, efectivo sin depositar, cierre de mes, impuestos, órdenes del taller
  atrasadas e insumos bajo mínimo.
- **Cifras propias de Almacén y Taller:** hoy no tienen bloque «Hoy».
- **Paso 2 del filtro:** guardarlo en la base.

## Cómo se verificó

- 25 pruebas nuevas en `inicio-avisos.test.ts`, más las de `inicio-reglas.test.ts`.
- `tsc` y `eslint` en verde.
- Prueba en local contra la base local (servidor del worktree), revisada por Felipe.
- En la base local se aplicó solo la migración de actividad (`20260926090000`, ya en producción) para tener «Equipo de hoy».
