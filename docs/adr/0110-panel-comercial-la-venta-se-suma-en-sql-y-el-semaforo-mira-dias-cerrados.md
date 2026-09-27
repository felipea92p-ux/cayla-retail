# ADR-0110 — Panel comercial: la venta se suma en SQL y el semáforo mira días cerrados

**Fecha:** 2026-09-18
**Estado:** Construido y verificado en la parte que no depende de la base real (ver "Qué está y qué no está
verificado"). **La migración NO está en producción** — la pega Felipe, y tiene dos prerequisitos.
**Afecta:** `supabase/migrations/20260918191000_panel_comercial.sql` (tres funciones de solo lectura),
`apps/web/lib/comercial.ts`, `comercial-reglas.ts`, `components/PanelComercialVista.tsx`,
`app/(app)/comercial/`, y una entrada nueva "Comercial" (solo líder) en `AppShell.tsx`.
**Relacionado:** ADR-0109 (los estados financieros; este panel es la mitad "gestión comercial" del mismo
plan, no un estado contable), ADR-0108 (el candado sobre `ventas` protege la fuente de estos números).

## Contexto

Felipe pidió ver cómo va cada tienda: ventas de hoy, semana y mes, ticket promedio, unidades por ticket,
ventas por hora, ventas por colaboradora y todo contra su meta. En `main` ya existían las piezas sueltas
(la meta diaria en `ubicaciones.meta_venta_diaria`, el gráfico de ventas por hora de Caja) pero ninguna
pantalla que compare tiendas ni fuente única de "cuánto se vendió".

## Decisión

**DECIDÍ:**
1. **La suma vive en tres funciones SQL, no en el navegador ni en el servidor de la app**
   (`fn_comercial_sedes`, `fn_comercial_horas`, `fn_comercial_colaboradoras`). La pantalla solo pinta. Así dos
   pantallas nunca pueden decir cifras distintas de lo vendido, y el cálculo se prueba sin levantar la app.
2. **Qué es una "venta":** lo cobrado en el mostrador (`venta_items.subtotal`), CON IGV, sin ventas anuladas,
   igual que el cierre de caja. Las **devoluciones aprobadas se muestran aparte**, fechadas el día en que se
   aprobaron, y el panel no las resta solo. La diferencia de un cambio no cuenta como venta.
3. **Todo en hora de Lima.** Los límites de día, semana (lunes a hoy) y mes se calculan con
   `at time zone 'America/Lima'`, y la hora del gráfico igual.
4. **El semáforo contra meta NO mira lo vendido hoy.** Compara el ritmo del mes hasta el **cierre de ayer**
   contra lo que prometían las metas diarias de esos días. "Bajo su ritmo" por debajo del 85%, "sobre su
   ritmo" desde el 100%. Lo de hoy se muestra como dato, sin juicio.
5. **Excepciones primero:** una tarjeta por tienda, todas visibles, la más atrasada arriba. Cada estado lleva
   texto además de color.
6. **Solo tiendas** (`tipo = 'tienda'` y activas). El Taller y los almacenes no venden al público.
7. **Solo líder, en dos capas:** cada función falla con un mensaje claro si quien llama no es líder
   (`fn_es_lider()`), y la página además redirige. La redirección es cortesía, el candado real es el SQL.

**DESCARTÉ:**
- **Comparar lo vendido hoy contra la meta diaria para el semáforo.** A las 11 am toda tienda lleva una
  fracción de su meta; el panel estaría en alerta cada mañana y una alerta que salta siempre deja de mirarse.
- **Sumar en TypeScript sobre las filas crudas** (el patrón de `getSeriesVentasCaja`). Trae miles de filas
  al servidor, y la fórmula de "cuánto se vendió" acaba repetida en cada pantalla. Además agrupa por hora con
  `new Date(...).getHours()`, que usa la zona del servidor (ver "Lo que salió a la luz").
- **Restar las devoluciones automáticamente.** Es una decisión de qué significa "venta neta" que toca la
  contabilidad (ADR-0109). Mostrarlas aparte no tapa nada y no compromete esa decisión.
- **Un selector de tienda.** Esconde justo lo que se quiere ver: que una tienda va distinto a otra.
- **Un índice sobre `ventas.created_at` ahora.** Hoy son ≈ 35 tickets al día y un mes son ≈ 1.100 filas; a 3
  años (≈ 51 mil tickets, ADR-0109) sigue siendo un recorrido de decenas de miles de filas. Se crea cuando una
  llamada pase de ~200 ms, midiendo.

**SE ROMPE SI:**
- La migración no está aplicada en la base a la que apunta la app: la pantalla muestra el error de Postgres
  (por diseño usa `exigir()`: prefiere no mostrar nada antes que mostrar "S/0 en ventas" con cara de
  normalidad). **Orden de despliegue: primero el SQL, después el código.**
- **Faltan dos prerequisitos en producción**, y ninguno da error al crear la función (plpgsql valida el
  cuerpo recién al ejecutarla): `ubicaciones.meta_venta_diaria` (`20260918100000`) y `ventas.estado`
  (`20260916172645_anular_venta`, que la auditoría del 17-sep marcó como no aplicada). Sin ellos la pantalla
  falla al abrir. `docs/datos/VERIFICAR-PRODUCCION-2026-09-18.sql` (rama del candado) ya pregunta por los dos.
- Aparece un estado de venta nuevo (p. ej. `en_proceso`) y nadie decide si cuenta.
- La meta diaria es una sola cifra por día: un sábado vale como un martes. Con metas por día de la semana, el
  semáforo debe cambiar (ver pendientes).

## Estados imposibles (Lamport)

| Estado imposible | Se impide con |
|---|---|
| Un no-líder lee las ventas de todas las tiendas | `fn_es_lider()` dentro de cada función + `revoke ... from public` + `grant` solo a `authenticated` |
| Un ticket de 5 líneas contado como 5 tickets | agregación en dos pasos (por venta, luego por tienda); probado con un ticket de 2 líneas |
| Una venta de las 7:30 pm de Lima contada como del día siguiente | límites con `at time zone 'America/Lima'`; probado con una venta cuyo UTC ya es el día siguiente |
| Un ritmo inventado el día 1 del mes | `ritmoDelMes` devuelve "sin días cerrados", no una cifra |
| Una alerta por meta cero o nula | meta ≤ 0 se trata como "sin meta" (evita dividir por cero) |

## Qué está y qué no está verificado

**Verificado (con evidencia):**
- `scripts/pruebas/panel_comercial_aislado.sql`: 22 verificaciones contra un Postgres desechable (sin Supabase
  ni Docker), con datos que cruzan medianoche de Lima, una semana que empieza en el mes anterior, una venta
  anulada, el Taller, una tienda inactiva y una venta sin colaboradora. **Tres mutaciones del SQL** (zona
  horaria UTC, contar líneas como tickets, contar anuladas) **hacen fallar la prueba**: la prueba detecta lo
  que dice detectar.
- `lib/comercial-reglas.test.ts`: 30 pruebas de las reglas (ritmo, bordes de 85% y 100%, proyección, orden,
  consolidado, horas). Suite completa: 578 en verde. `tsc` y `eslint` en 0 errores.
- Pantalla verificada en navegador con datos inventados (escritorio y celular, sin scroll horizontal de
  página); las cifras de la pantalla coinciden con el cálculo a mano.

**NO verificado:**
- **La integración con el esquema real.** La prueba aislada usa tablas mínimas con los nombres y tipos de las
  migraciones y un `fn_es_lider()` de mentira. No prueba RLS, ni la `fn_es_lider` verdadera, ni el
  `fn_nombres_personas` real, ni la página autenticada contra el stack local (Docker no respondía). Hay que
  abrir `/comercial` como líder contra el stack local antes de pegar en producción.
- Los datos de la pantalla en el navegador son inventados; no se vio con ventas reales.

## Lo que salió a la luz

`getSeriesVentasCaja` (`lib/caja.ts`) agrupa las ventas por hora con `new Date(created_at).getHours()`. Esa
llamada usa la zona horaria de quien ejecuta el código: en tu Mac es Lima, en Vercel es UTC (cinco horas de
diferencia). Si el gráfico de Caja se calcula en el servidor, en producción cada barra estaría desplazada
cinco horas. **No verificado en producción**; se ve solo desplegado. Queda anotado en BACKLOG.

## Cómo se deshace

```sql
drop function retail.fn_comercial_sedes(date);
drop function retail.fn_comercial_horas(date);
drop function retail.fn_comercial_colaboradoras(date);
```

Sin pérdida de datos: solo lectura, no crea tablas ni toca filas.

## Pendiente

- Abrir `/comercial` contra el stack local con Docker arriba, como líder y como colaboradora (debe redirigir).
- Aplicar en producción, en este orden: `20260916172645` y `20260918100000` si faltan, luego `20260918191000`.
- Metas por día de la semana (hoy es una cifra plana) y comparativo contra el mismo día de la semana anterior.
- Decidir con Felipe los umbrales 85% / 100% cuando haya meses reales.
- Si Felipe quiere una "venta neta", decidir con el contador cómo restar devoluciones (ADR-0109).
