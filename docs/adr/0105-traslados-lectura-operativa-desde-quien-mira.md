# ADR-0105 — Traslados: se lee por lo que le toca a quien mira, con una sola regla y sin estado nuevo en la base

**Fecha:** 2026-09-18
**Estado:** Listo para revisar en PR. **Sin migración, sin cambios en las RPC: no hay nada que desplegar en
Supabase de producción.** Verificado en solo lectura contra producción (proyecto `cayla-dynamic`, schema `retail`,
2026-09-18): tiene las 28 columnas que esta pantalla lee, las dos llaves foráneas del embed
(`transferencias_ubicacion_{origen,destino}_id_fkey`), las 6 funciones con las firmas esperadas y SELECT sobre
`producto_fotos` para `authenticated`. Verificado además con las reglas reales contra los 35 traslados de prueba de la
base local y con 3, 12 y 50 traslados ficticios en el navegador.
**Afecta:** `apps/web/lib/{traslados-reglas,traslados,producto-fotos-reglas}.ts`;
`components/{TrasladosPanel,TrasladosAtencion,TrasladosResumen,TrasladosFiltros,TrasladosLista,
TrasladoEstado,TrasladoLlegada,TrasladoMiniaturas,TrasladoDetallePanel,AppShell,InventarioNav}.tsx`,
`components/ui/{Insignia,TarjetaCifra}.tsx`; rutas `/inventario/traslados` y `/inventario/traslados/[id]`;
layouts `(app)/layout.tsx` e `inventario/layout.tsx` (contador del menú). **No cambia ninguna regla de
stock, recepción, diferencia, cierre ni auditoría.**

## Contexto

La pantalla decía «En tránsito» para dos cosas con acciones opuestas: el bulto que ya debería estar en
la tienda (hay que contarlo) y el que todavía viaja en bus (no hay nada que hacer). «En camino 0» convivía
con dos filas «En tránsito»; «Atrasado» se ponía rojo al minuto siguiente de una hora que quien envía
escribe «aproximadamente»; y las tarjetas contaban documentos, no prendas. Felipe pidió rediseñarla para el
encargado de inventario (referencia visual adjunta): una franja «Atención hoy» solo cuando algo le toca de
verdad, cuatro indicadores que filtran, buscador, y estado/acción con formas distintas.

## Decisiones

**1. La situación de un traslado se DERIVA (estado + sedes + hora estimada + `confirmado_en` + ahora +
si soy líder); no se agrega un estado «llegó».**
DECIDÍ: `situacionTraslado()` en `traslados-reglas.ts` → `requiere_recepcion` (ya debió llegar, o ya
empezaron a registrarlo), `requiere_revision` (diferencia y soy líder del destino), `en_camino_entrante`,
`en_camino_saliente`, `con_diferencia` (espera a otro), `cerrado`. Una sola función alimenta la franja, las
tarjetas, los chips, la tabla, el contador del menú y el detalle.
DESCARTÉ: un estado nuevo «llegó a la tienda» en la base — separaría «el bus se demoró» de «no lo he
contado», pero es modelo de datos nuevo, un clic más para cada colaborador y otra RPC a producción, para un
problema que la hora estimada ya resuelve casi siempre.
SE ROMPE SI: quien envía escribe una hora estimada absurda (nada la valida, ni se puede cambiar después): un
bulto «a tiempo» que ya llegó no aparece en «Acción hoy» hasta que pase la hora. La salida real es
«reprogramar llegada» + un candado en la base, no más lógica en la pantalla.

**2. Un solo «ahora», fijado en el servidor.**
DECIDÍ: `page.tsx` calcula `ahoraIso` y lo pasa hacia abajo; ningún componente mira el reloj. El HTML del
servidor y el del navegador dicen lo mismo («hace 1 h»), y las fechas se arman a mano (`diaHora`,
`haceTexto`) en hora de Lima, sin depender de la versión de ICU. Como «ya debió llegar» depende del reloj y no
de la base, la pantalla se pide sola cada minuto mientras está a la vista (y al volver a la pestaña tras 30 s),
y hay un botón «Actualizar».
DESCARTÉ: dejarla como foto del momento de carga («recarga para ver lo último», como Existencias) — para una
pantalla cuyo valor es «qué te toca AHORA», una foto de hace tres horas es la mentira que el rediseño quería
evitar.
SE ROMPE SI: 40 tiendas con la pantalla abierta todo el día — una lectura por minuto por pestaña. Con 3
tiendas y un taller es despreciable (medido: consultas de decenas de filas).

**3. El contador del menú usa la MISMA regla, y es total.**
DECIDÍ: `getTrasladosPorAtender(ubicacionId, esLider)` (`cache()` por request, devuelve `number | null`, nunca
lanza) se pide en los dos layouts y llega a `AppShell` e `InventarioNav` como prop opcional. Insignia ámbar (el
rojo es «acento sagrado, máx. 2 por pantalla»). En la cabecera «Inventario» cuando el grupo está cerrado y sobre
el ícono «Inventario» en celular: si solo estuviera en la fila «Traslados» casi nunca se vería.
DESCARTÉ: consultar desde el navegador en cada cambio de ruta (un viaje por clic y otro camino de datos que el
repo no usa) y `unstable_cache` (quedaría viejo tras confirmar: las escrituras van directo del navegador a
Supabase).
SE ROMPE SI: navegas solo con `<Link>` mientras llega un traslado — los layouts no se re-renderizan y el número
del lateral queda tan viejo como el último render completo (se corrige con el refresco de la pantalla de
Traslados y con `router.refresh()` tras confirmar). Si la consulta falla, el menú sale sin número: el layout no
tiene `error.tsx` propio y una excepción ahí dejaría sin pantalla hasta a Vender y Caja.

**4. Miniaturas: solo fotos reales, del color exacto o generales — nunca de otro color.**
DECIDÍ: `fotoDeVariante()` (color de la variante → foto general del producto → nada), una segunda consulta por
lote tolerante a fallo, y **nada** (ni marcador) cuando no hay foto: hoy ~80 % de las filas no tendrán.
DESCARTÉ: la regla de `fn_resumen_variantes` (cae a cualquier foto principal): al recibir se cuenta por color y
una blusa Verde con la foto de la Blanca hace dudar. Hay cuatro criterios distintos de «foto de una variante»
en el repo; este es el quinto a propósito y se debería unificar en un cambio aparte.
SE ROMPE SI: las fotos (se suben sin redimensionar, hasta 5 MB) se sirven a un celular con datos: una miniatura
de 32 px baja el original.

## Verificación (lo que se hizo y lo que no)

Revisión adversarial con 5 dimensiones y 2 escépticos por hallazgo: encontró y se corrigió un error de
priorización (el orden de «Revisar ahora» contaba la antigüedad del envío, no la espera), la tarjeta «Por recibir
hoy» que filtraba otra cosa que la que contaba, y varios de accesibilidad/responsive (medidos en el navegador: el
chip «REQUIERE CONFIRMACIÓN» mide 187 px y el botón «CONFIRMAR RECEPCIÓN» 184 — el diseño de referencia no los
contemplaba). Las reglas reales dieron **exactamente** el cálculo independiente en SQL para tres perspectivas.
Suite: 29 archivos / 443 tests, `tsc` y `eslint` sin errores.

## Pendiente (no lo decide el código)

- **Drift repo ≠ producción (NO es un hueco en producción):** en producción `authenticated` solo tiene SELECT sobre
  `retail.transferencias` y `retail.transferencia_items` (verificado en solo lectura el 2026-09-18: las policies
  `transferencias_insert/update` existen, pero sin el GRANT no se puede escribir). Ese `REVOKE` vive solo en producción,
  no en ninguna migración del repo, así que la base local —y cualquier base nueva creada desde las migraciones— SÍ deja
  a `authenticated` hacer UPDATE/INSERT/DELETE directo (un integrante podría cerrar un traslado por la API sin crear
  `movimientos`). Salida: llevar el `revoke` al repo como migración (en producción sería un no-op). Antes hay que
  confirmar que ningún script local escribe directo en esas tablas.
- **Regla de diferencias:** hoy una sola prenda distinta congela TODAS las de ese traslado fuera del stock hasta
  que un líder cierra, y la caja rechaza vender lo que el stock no tiene. Alternativa: que entren las líneas que
  coinciden. Y quién recibe el aviso de revisión: la RPC deja cerrar a cualquier líder; la pantalla avisa al líder
  de la sede que recibió.
- **Verificar con sesión iniciada** (en local: `/login`, usuario líder y usuario integrante de TRU).
