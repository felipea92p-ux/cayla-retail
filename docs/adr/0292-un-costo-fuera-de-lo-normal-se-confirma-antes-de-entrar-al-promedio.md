# ADR-0292 — Un costo fuera de lo normal se confirma antes de entrar al promedio

**Fecha:** 2026-09-30 · **Estado:** construido y probado en local; **las cinco migraciones están sin pegar en producción** al
escribirse esto (ver «Cómo se pega») · **Decide:** Felipe (umbral, el cero, qué pasa con un integrante, el alcance y quién
confirma una factura); Claude (cómo viaja la confirmación) · **Rama:** `claude/costo-validation-cerrar-produccion-fa4c02`
· **Nace de:** `docs/cimientos/2026-09-29-cimiento-09-produccion-taller.md` (EI-7) y el ítem 6 de
`docs/backlog/2026-09-29-top-30-pendientes-erp.md`.

## 1. El problema, primero

`variantes.costo` es el costo promedio ponderado de cada prenda (ADR-0067) y es **uno solo para las tres sedes**. Entra por
cuatro puertas, y ninguna preguntaba «¿este número tiene sentido?»: lo único que se validaba era que no fuera negativo.

Un cero de más —S/ 1.850 tecleado como S/ 18.500— contamina el costo de esa prenda en Trujillo, Arequipa y Lima a la vez. Y
**no tiene arreglo desde la app**: `revertir_produccion` devuelve el stock pero no toca el costo, y el candado de
`20260927190000` impide corregir a mano el costo de una prenda que ya tiene historial. Un cierre mal costeado es permanente.

## 2. Decisión

```
DECIDÍ:    un costo por prenda fuera de una banda se confirma antes de entrar; la regla vive en UNA función pura de la base
           (fn_costo_fuera_de_banda) y cada puerta la llama. La banda es relativa al costo vigente de esa prenda (más de 2× o
           menos de 2/3) más dos límites absolutos (costo cero o costo igual o mayor que el precio de venta).
DESCARTÉ:  (a) «más de 3σ del historial de esa variante o categoría»: costo_historial, producciones y compras tienen 0 filas en
           producción, y con menos de ~10 datos la σ es ruido que un tecleo ya confirmado infla y que esconde el siguiente;
           (b) una banda simétrica 2×/0,5×: deja pasar el 0 % de los errores hacia abajo (ver §3);
           (c) bloquear en vez de pedir confirmación: un costo real puede subir de golpe (tela más cara, media corrida en segundas);
           (d) cruzar contra cotizaciones_maquila: 0 filas y solo cubre un componente de tres.
SE ROMPE SI: la variación real entre corridas es mucho mayor que la supuesta (σ ≈ 0,4 en ln): 1 de cada 5 cierres pediría
           confirmación y se vuelve un clic reflejo; o el costo vigente de una prenda es un costo DECLARADO viejo (por ejemplo
           traído de Alegra), y entonces la alarma es de ruido; o aparece una vía que escribe costo sin pasar por una pantalla de
           tecleo (el cargador masivo del censo de TRU, backlog #5, debe llamar a la regla directamente).
```

## 3. El umbral, con números

No había datos para estimar nada (n = 0), así que el umbral no sale de una σ: sale de una **simulación de errores de tecleo**
(semilla fija, 40.000 casos por tipo de error) y de un supuesto explícito de variación real, a medir cuando haya datos.

**Supuestos míos, no datos:** variación legítima entre corridas σ = 0,25 en ln (≈ ±25 %), y reparto del costo de una corrida
55 % tela, 35 % maquila, 10 % avíos. El error cae en uno de los tres componentes, ponderado por su peso.

| Umbral (sube / baja) | Falsas alarmas por 100 cierres | Tecleos ×10 detectados | Tecleos ÷10 detectados |
|---|---|---|---|
| 2× / 0,5× (simétrico) | 0,6 | 90 % | **0 %** |
| **2× / 0,67× (elegido)** | **~5,5** | 90 % | 55 % |
| 1,5× / 0,67× | ~10 | 100 % | 55 % |

- **Por qué la banda de bajada es más estrecha.** Un error hacia abajo casi no mueve el total: si se divide la tela entre 10, el
  costo por prenda solo cae a ~0,5×; hacia arriba, multiplicarla por 10 lo lleva a ~6×. Con 1/2 la regla no veía ninguno de esos
  errores. El 10 % de los ×10 que no se ve es un error en «avíos», que pesa ~10 % del total y no alcanza a duplicarlo.
- **Sensibilidad.** Con σ = 0,15 las falsas alarmas bajan a ~0,4 por 100 cierres; con σ = 0,40 suben a ~20.
- **Daño de lo que pasa sin alarma.** Como máximo ×2 en el primer cierre, ×1,5 con 60 prendas ya en stock, ×1,17 con 300.
- **Se mide sobre el costo POR PRENDA**, no sobre cada monto: así atrapa también un «100» tecleado en vez de «10» en las buenas
  (ahí el efecto es completo, ×10 o ÷10).
- **Se compara con `>` y `<` estrictos** y sin fracciones (`× 3 < × 2`), así que justo el doble o justo 2/3 pasan.

**Revisión programada:** cuando haya ~10 cierres reales, medir la variación verdadera y ajustar. Consulta de solo lectura:

```sql
-- Qué tan lejos se mueve un costo respecto del anterior, en las entradas de compra y de producción ya registradas.
select count(*) as n,
       round(percentile_cont(0.5) within group (order by abs(ln(costo_unitario_nuevo / costo_anterior)))::numeric, 3) as mediana_ln,
       round((percentile_cont(0.5) within group (order by abs(abs(ln(costo_unitario_nuevo / costo_anterior))
         - (select percentile_cont(0.5) within group (order by abs(ln(costo_unitario_nuevo / costo_anterior)))
            from retail.costo_historial where costo_anterior > 0 and costo_unitario_nuevo > 0))))::numeric, 3) as mad_ln
from retail.costo_historial where costo_anterior > 0 and costo_unitario_nuevo > 0;
```

Con σ ≈ 1,4826 × MAD se compara contra el 0,25 supuesto. Si sale mayor, subir K; si sale menor, se puede apretar.

## 4. Las cuatro puertas

| Puerta | Función | Quién teclea el costo | Contra qué se compara | Quién confirma | Cómo viaja la confirmación |
|---|---|---|---|---|---|
| Cerrar una orden del Taller | `cerrar_produccion` | el líder (al abrir o al cerrar); el integrante cierra sin ver montos | el costo vigente y el precio de cada talla que entra | **solo un líder**; al integrante se le dice, sin cifras, que un líder debe cerrarla | parámetro `p_confirma_costo_atipico` |
| Recibir un lote sin factura | `recibir_lote` | quien recibe (cualquiera, el campo es opcional) | el costo vigente y el precio de la variante | **solo un líder**; al integrante: `costo_atipico_sin_lider` (su salida: recibir sin costo) | `"confirma_costo": true` en la línea |
| Registrar una factura | `registrar_compra` | quien la registra (con el módulo Facturas de compra) | la variante que la línea nombra, o la mediana de las del producto y su precio más bajo | **quien registra**: ya ve los montos y tiene el papel en la mano | `"confirma_costo": true` en la línea |
| Fuera de comprobante de un envío | `recibir_envio` | quien recibe | el costo vigente y el precio de la variante | **solo un líder**; al integrante, como en el lote | `"confirma_costo": true` en el extra |

- Las líneas **de comprobante** al recibir no se vuelven a preguntar: su costo ya se miró al registrar la factura.
- **El cero.** En el cierre del Taller un costo cero cuenta como atípico (ahí significa que nadie tecleó el costo y fijaría la
  prenda en 0 para siempre). En Compras **no**: un costo de 0 es un obsequio, «una decisión explícita, no una omisión» (los
  indicadores de Compras ya lo distinguen de «sin costo»). Por eso `fn_costo_fuera_de_banda` lo llama `sin_costo` pero los caminos
  de Compras no lo preguntan. Un regalo de un envío tampoco (no toca el costo).
- **Constancia.** Cuando se confirma, la nota del documento (orden, lote, factura, envío) lo dice, **sin montos**: los montos
  viven en `costo_historial`, que tiene su propio candado de dinero.

### Cómo viaja la confirmación (la regla que dejó esto)

> Donde hay **una sola cosa** que confirmar (una orden del Taller), va un **parámetro**. Donde hay **varias líneas**, la
> confirmación viaja **en cada línea**.

Con la marca por línea la base acepta exactamente las líneas que el líder vio, no «todo lo que venga». Y no cambia la firma de
`registrar_compra` ni de `recibir_envio`, que ~10 migraciones y 3 pruebas nombran por su firma exacta: agregar un parámetro las
habría roto y habría vuelto no re-pegables esas migraciones. La confirmación de una línea **solo vale si esa línea de verdad
salió atípica**, y el servidor exige el permiso a la cuenta (`fn_es_lider`), no a la marca: un integrante que la mande por la
API directa recibe lo mismo que sin ella.

## 5. Lo que se encontró construyéndolo

1. **Registrar una factura no mueve `variantes.costo`** (eso pasa al recibir), pero fija lo que se le debe al proveedor. Y el
   «total del papel» que manda el formulario **lo calcula el mismo formulario** con las líneas (`totalesCompra`), así que nunca
   atrapaba un tecleo: no era una guarda independiente.
2. **Confirmar un costo mueve el costo vigente.** Tras confirmar 70 una vez, otro cierre a 70 ya cabe en la banda. La regla frena
   **saltos**, no es un techo. Es la propiedad correcta de un promedio, pero hay que saberlo.
3. **`revertir_produccion` no deshace el costo** y el texto de `OrdenCierre.tsx` («si algo sale mal, la orden se puede revertir»)
   era falso para el costo. Se corrigió la frase para el líder; el arreglo de fondo es una tarea aparte (chip
   «Que revertir_produccion también deshaga el costo»).
4. **En el lote, quien recibe puede teclear costo** (el campo no depende de `verMontos`), lo que choca con ADR-0126 («el dinero de
   Compras es solo del líder»). Con esta regla, además, cada rechazo o aceptación le dice a un integrante si su número cae cerca
   del costo vigente: un canal lateral pequeño que le permitiría acotar un costo que el candado le oculta. **Decisión pendiente
   de Felipe** (ver §7).
5. **`registrar_compra` está parchada por ~10 migraciones** y su cuerpo vivo en producción coincide, sin comentarios ni espacios,
   con el de una base que aplicó todas las del repo (se comparó una huella normalizada). Por eso se pudo reescribir entera sin
   pisar un parche solo-producción. Las cuatro huellas de hoy están en §8.
6. **La «ayuda» bajo el costo de `CompraFormV2`** (desde 5 %, `ayudaDeCosto`) es otra cosa: un aviso en vivo, informativo, que no
   bloquea. Conviven: una es el empujón mientras se teclea, la otra es la red final.

## 6. Lo que NO cubre

- **Corregir un costo ya contaminado:** sigue sin existir (ver hallazgo 3). Esta regla previene, no repara.
- **Las líneas de comprobante registradas antes de esta regla:** entran al promedio sin pregunta al recibirse.
- **Cantidades mal tecleadas en Compras:** la regla mira el costo unitario; un «240» en vez de «24» multiplica lo que se debe al
  proveedor pero no el costo por prenda.
- **Un costo dentro de la banda pero equivocado** (1,9×): pasa, con daño acotado (§3).
- **La merma y la mano de obra propia del Taller** (NIC 2): decisiones de costeo aparte (cimiento 9).

## 7. Pendiente de Felipe

- **¿Puede un integrante teclear costo al recibir un lote?** Hoy sí (la pantalla se lo deja). Opciones: dejarlo (y aceptar el canal
  lateral), esconder el campo a quien no ve montos (alineado con ADR-0126), o ignorar en el servidor todo costo de quien no es
  líder. Es un permiso del negocio, no una decisión técnica.
- **Encender Producción para el rol Integrante** (cimiento 9, #1): mientras siga apagado nadie más que un líder cierra órdenes. Al
  encenderlo, toda orden con costo total 0 (nadie tecleó tela, avíos ni maquila y no hubo insumos) solo la podrá cerrar un líder:
  definir antes quién teclea el costo al abrir la orden.

## 8. Cómo se pega en producción (lo hace Felipe: el clasificador me impide pegar)

**Orden: las cinco en una sola corrida del SQL Editor, en este orden.** Las cuatro últimas llaman a la primera; si falta, fallan
en silencio al ejecutarse (plpgsql no valida el cuerpo al crear).

1. `20260930120000_costo_fuera_de_banda.sql` — la regla pura. No cambia ningún comportamiento.
2. `20260930121000_cerrar_produccion_costo_atipico.sql` — **cambia la firma** (5 → 6 parámetros, con valor por defecto; se elimina la vieja).
3. `20260930122000_recibir_lote_costo_atipico.sql`
4. `20260930123000_registrar_compra_costo_atipico.sql`
5. `20260930124000_recibir_envio_costo_atipico.sql`

La web se puede publicar **antes o después**: en el primer intento nunca manda la confirmación, solo en el reintento tras
`costo_atipico`, que una base vieja no levanta. SQL primero + web vieja: una orden o factura de costo normal funciona igual; una
atípica muestra el aviso técnico en vez de la pantalla de confirmación, y no se registra hasta que salga la web.

**Sonda previa (solo lectura).** Huellas normalizadas (sin comentarios ni espacios) de producción el 2026-09-30; si alguna no
coincide, **detenerse**: alguien cambió la función y habría que rehacer la migración desde su cuerpo vivo.

```sql
select p.proname, md5(regexp_replace(regexp_replace(p.prosrc, '--[^\n]*', '', 'g'), '\s+', '', 'g')) as huella
from pg_proc p where p.pronamespace = 'retail'::regnamespace
  and p.proname in ('cerrar_produccion', 'recibir_lote', 'registrar_compra', 'recibir_envio', 'fn_costo_fuera_de_banda')
order by 1;
-- cerrar_produccion  3700e727c531b1fde8295c803e634de0
-- recibir_envio      294b4a1a49467209e63a9183e9e23457
-- recibir_lote       761c51c08fb0216b4dce273c8226823b
-- registrar_compra   5485de9a5487dfe8e12591ea985af4bc
-- fn_costo_fuera_de_banda: no debe existir todavía
```

**Verificación posterior (solo lectura):**

```sql
select proname, pg_get_function_identity_arguments(oid) as firma, proacl::text as acl
from pg_proc where pronamespace = 'retail'::regnamespace
  and proname in ('cerrar_produccion', 'recibir_lote', 'registrar_compra', 'recibir_envio', 'fn_costo_fuera_de_banda') order by 1;
select retail.fn_costo_fuera_de_banda(70, 32, 79.9) as debe_ser_sube;
```

Debe dar `cerrar_produccion` con **una sola** firma de 6 parámetros y `{postgres=X/postgres,authenticated=X/postgres}`;
`recibir_lote`, `registrar_compra` y `recibir_envio` con sus firmas de siempre (6, 15 y 9 parámetros) y el mismo permiso;
`fn_costo_fuera_de_banda` solo con `{postgres=X/postgres}`; y la última consulta, `sube`.

## 9. Cómo se verificó

- **Pruebas SQL** (contra un Postgres desechable con las 374 migraciones, cada caso en su transacción con `ROLLBACK`):
  `costo-fuera-de-banda` (28), `produccion-costo-atipico` (20), `lote-costo-atipico` (23), `factura-costo-atipico` (21) y
  `envio-costo-atipico` (20): todo o nada, líder que confirma, integrante que no puede forzarlo por la API, token idempotente,
  promedio ponderado exacto, constancia sin montos, una sola función, re-pegado dos veces. **Prueba de mutación** en las cinco:
  cada pieza que importa se rompe a propósito y la prueba se pone roja (los únicos mutantes que sobrevivieron eran
  equivalentes y se simplificó el código).
- **Pantallas reales en el navegador**, contra PostgREST y `supabase-js` reales sobre una base privada, con `OrdenCierre`,
  `RecepcionFormV2`, `CompraFormV2` y `RecepcionEnvio`: el aviso aparece con las cifras, «Corregir» lleva el foco a SU línea,
  confirmar reenvía con el mismo token y la marca solo donde corresponde, y el integrante ve su mensaje y no el del líder.
  Se montaron los componentes reales en páginas de prueba temporales (no la ruta completa de la app, que necesita datos de
  Dynamic); no se vieron a 375 px (estas pantallas son de escritorio).
- **Regresión:** toda la batería web y las suites SQL que llaman a estas funciones. Dos cosas cambiaron en pruebas ajenas y
  conviene saberlas:
  - Nueve pruebas registraban facturas, lotes u órdenes con **costos de mentira** sobre una prenda de costo 32 y ahora declaran
    `confirma_costo` (o el parámetro) en sus 15 llamadas: `actor_firma_las_operaciones`, `compras_indicadores`,
    `compras_parte_por_tienda`, `deriva_produccion`, `pagos_compras_endurecimiento`, `quien_en_acciones_pendientes`,
    `frescura_lectura`, `insumos_devolucion` y `candado_dinero_produccion`. **Toda rama que registre facturas o cierre órdenes con
    precios arbitrarios en sus pruebas chocará con esto al fusionarse**: la solución es la misma marca.
  - La prueba de concurrencia exige `p_token` como último parámetro (ADR-0190): por eso `recibir_lote` no lleva parámetro nuevo.

## 10. Dónde verlo

- Regla: `supabase/migrations/20260930120000_costo_fuera_de_banda.sql`. Puertas: `…121000`, `…122000`, `…123000`, `…124000`.
- Web: `apps/web/lib/costo-atipico-reglas.ts` (lee la respuesta de la base y la pone en palabras, una vez para las cuatro
  pantallas), `apps/web/components/AvisoCostoAtipico.tsx` (el aviso compartido), `OrdenCierre.tsx`, `RecepcionFormV2.tsx`,
  `CompraFormV2.tsx`, `RecepcionEnvio.tsx` + `ResumenPrevioEnvio.tsx`, `lib/envio-reglas.ts` (`confirmarExtras`) y las huellas de
  `lib/error-escritura.ts`.
- Pruebas: `scripts/pruebas/{costo_fuera_de_banda,produccion_costo_atipico,lote_costo_atipico,factura_costo_atipico,envio_costo_atipico}.mjs`.
