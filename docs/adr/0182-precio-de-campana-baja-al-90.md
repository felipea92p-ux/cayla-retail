# ADR-0182 — El precio de campaña se redondea hacia abajo a .90: una sola regla, en la caja y en la base

**Fecha:** 2026-09-23 · **Estado:** migración `20260923174100_campana_redondea_a_90.sql` **PEGADA EN PRODUCCIÓN el
2026-09-23** con OK de Felipe y verificada (sección «Pegada en producción»). **La web se publicó el mismo día a las 12:16
(Lima)**, cuando Felipe fusionó el PR #351: base y caja ya calculan igual. Antes de activar la primera campaña, recargar
Vender (F5) en cada caja: una pestaña abierta desde antes sigue con el código viejo y esa venta se rechazaría. · **Cambia:** el monto del descuento de campaña
de ADR-0108 (la caja calcula y la base verifica: eso sigue igual). · **Es el paso 3 de** ADR-0180: la etiqueta con descuento
(paso 2) espera a este cambio.

## El problema

Al diseñar la etiqueta de precio con descuento (ADR-0180), Felipe pidió que el precio rebajado sea un precio «de tienda»:
«Precio normal S/ 89.90, ahora S/ 71.90», no «S/ 71.92». Pero el papel no puede decir un precio que la caja no cobra. Si
solo se redondeara en la etiqueta, la clienta vería S/ 71.90 y pagaría S/ 71.92. El redondeo tiene que ser del cobro.

## Decisión (Felipe, 2026-09-23: «Redondear a .90 hacia abajo»)

**El precio rebajado es el X.90 más alto que no pasa de `precio × (100 − %) / 100`.** El descuento es la diferencia.

| Precio | Campaña | Cuenta exacta | Se cobra | Descuento |
|---|---|---|---|---|
| S/ 89.90 | 20 % | 71.92 | **71.90** | 18.00 |
| S/ 79.90 | 30 % | 55.93 | **55.90** | 24.00 |
| S/ 95.80 | 25 % | 71.85 | **70.90** | 24.90 — siempre hacia abajo, aunque falten 5 céntimos |
| S/ 159.80 | 50 % | 79.90 | **79.90** | 79.90 — ya es .90, no baja |
| S/ 100.00 | 20 % | 80.00 | **79.90** | 20.10 |

Bordes: un rebajado de menos de S/ 0.90 no se redondea, porque no hay un .90 por debajo. 100 % regala la prenda, y 0 % o
un % vacío no descuenta. El % se toma con 2 decimales (la columna es `numeric(5,2)`).

**Consecuencias que Felipe acepta:**
- El descuento real queda hasta casi un sol por encima del %.
- El ticket de la caja muestra el % de la campaña («−25 %»), no la cuenta monto ÷ precio («−26 %»).

## Dónde vive (una sola regla, dos lenguajes, verificadas iguales)

- **Base:** `retail.fn_descuento_campana(precio, pct)`, inmutable. `registrar_venta` la usa en sus 2 cuentas (que la caja
  no omita la campaña y que un manual la supere; el monto de una línea «campaña»), y `separar_prendas` en las suyas (lo que
  verifica y lo que guarda en `separacion_items`). Verificado en producción: son las **únicas** funciones vivas que
  calculan un descuento de campaña.
- **Web:** `descuentoDeCampana` (`lib/vender-reglas.ts`), en enteros (diezmilésimas de céntimo). Con coma flotante, un
  71.8999… en vez de 71.90 bajaría el precio un sol entero. La usan:
  - la caja (`conDescuentoDeCampana`, `descuentoResultante`, `conCampanas`, y por ellas las proformas al cobrar);
  - Separaciones (`ApartarVista.tsx`, que antes tenía su propia fórmula);
  - el aviso «quedaría bajo costo» al configurar una campaña (`prendasBajoCosto`), que ahora mira el precio que de
    verdad se cobra.
- **Cómo se parchea la base:** igual que 20260922224300 y 20260923161700, con `pg_temp.reemplazar` sobre la definición
  viva, sin reescribirla. Cada ancla tiene que aparecer exactamente las veces esperadas o se aborta todo. Es
  re-ejecutable, y compone con «prendas sin registrar» (ADR-0179), que parchea otras líneas de `registrar_venta`.

**DESCARTÉ:**
- Redondear solo en la etiqueta: el papel diría un precio y la caja cobraría otro.
- Guardar el precio de campaña en una columna: es un dato derivado, y sería otra fuente de verdad que se desfasa al
  cambiar el precio o el %.
- Una verificación «tolerante» que acepte el monto viejo y el nuevo: serían dos reglas para siempre. No hace falta
  porque hoy no hay campañas vigentes (ver abajo).

**SE ROMPE SI:**
1. **La base y la web no cambian juntas mientras hay una campaña vigente.** Con base nueva y caja vieja, la caja manda
   15.98 y la base espera 16.00: `venta_campana_omitida`. Al revés da `venta_campana_monto_no_coincide`. Cualquiera de
   los dos rechaza **cada venta con campaña**. El 2026-09-23 no había ninguna vigente (3 demos terminadas en julio y
   agosto) y no había ninguna separación: pegar y publicar el mismo día.
2. Alguien reescribe `registrar_venta` o `separar_prendas` copiando un archivo viejo en vez de parchear: vuelve la
   fórmula sin redondear. Lo detecta `pnpm pruebas:campana-redondeo` en CI (el trabajo de Postgres).

## Cómo se verificó (2026-09-23)

- **Web:** 13 ejemplos más los bordes en `vender-reglas.test.ts`, y una propiedad sobre miles de combinaciones: el precio
  siempre termina en .90, nunca pasa la cuenta exacta y nunca baja más de un sol. Las pruebas existentes de campaña se
  actualizaron a propósito (S/ 100 con 20 % ahora descuenta 20.10). Suite completa: 118 archivos, 24.265 pruebas.
  `typecheck` y `eslint` en verde.
- **Caja contra base, al céntimo:** 29.187 combinaciones (precios de 0.50 a 400.10 × 27 porcentajes) calculadas en
  Postgres con la migración dentro de una transacción revertida y comparadas con `descuentoDeCampana`: **0 diferencias**.
- **`pnpm pruebas:campana-redondeo`** (nuevo, en CI): 7/7 con `APLICAR_ANTES`. Sin la migración falla como debe.
  - `registrar_venta` acepta 79.90 − 16.00 = 63.90.
  - Rechaza el 15.98 de una caja vieja.
  - Un manual igual a la campaña no la reemplaza.
  - `separar_prendas` acepta y guarda 16.00, y rechaza 15.98.
  - La migración aplicada dos veces deja la regla 2 veces, no 4.
- **Base armada desde cero** (CI, `db reset`): la última redefinición completa de `registrar_venta` (`20260922150000`)
  trae 1 + 1 anclas, la de `separar_prendas` (`20260923090000`) trae 2, y ningún parche posterior las toca.
- **Producción, solo lectura:**
  - Anclas 1/1/2 y una sola versión de cada función.
  - Huellas md5 de hoy: `registrar_venta` `b21b03c63f24e5c9d5eafea68874d722`, `separar_prendas`
    `f508fa222a1ae377a7392569c966ce19`.
  - 0 campañas vigentes y 0 separaciones.

## Pegada en producción (2026-09-23, OK de Felipe: «Pega en producción»)

1. **Antes:**
   - Huellas iguales a las de arriba, una sola versión de cada función, permisos solo para `authenticated`.
   - `fn_descuento_campana` no existía.
   - 0 campañas vigentes y 0 separaciones.
   - La versión local de las dos funciones era **idéntica** a la de producción (misma huella): las pruebas 7/7 corrieron
     sobre exactamente lo que se iba a parchear.
2. **Ensayo en producción:** toda la migración en una transacción que terminaba a propósito con un error.
   - La validación pasó.
   - Después, producción seguía intacta (huellas originales, sin la función nueva).
   - Las huellas que habría dejado coincidían con las de aplicarla en local.
3. **Pegado** en una sola transacción, con el bloque final que abortaba todo si algo no quedaba bien.
4. **Después:**
   - Huellas nuevas: `fn_descuento_campana` `569f5547b94e7edb538df910cf7e1c6f`, `registrar_venta`
     `0ba0cd4da8108a31cbfc8f6623fc5a25`, `separar_prendas` `32a9fa750248ca2dc8fee6981ac08c9a` (iguales a las locales).
   - Cada una usa la regla 2 veces, y no queda ninguna fórmula vieja.
   - Conservan `security definer`, su `search_path` y sus permisos (`authenticated` sí, `anon` no).
   - Los ejemplos dan 18.00 / 24.90 / 24.00 / 20.10.
   - Siguen 0 campañas vigentes: ninguna venta se afectó.
5. **Falta:**
   - ~~Publicar la web~~ — hecho el 2026-09-23 a las 12:16 (PR #351).
   - ~~Refrescar el diccionario~~ — el volcado de producción ya trae `fn_descuento_campana` (`50b944cd`).

## Para pegar en producción (la lista que se siguió)

1. Confirmar que no hay campaña vigente:
   `select count(*) from retail.campanas_vigentes();` (si hay, hacerlo fuera del horario de tienda).
2. Confirmar que las huellas siguen siendo las de arriba. Si otra migración ya parcheó la función, las anclas igual se
   comprueban solas.
3. Pegar el archivo tal cual: ya lleva `retail.` y su bloque final aborta todo si algo no quedó bien.
4. Verificar:
   - `select retail.fn_descuento_campana(89.90, 20)` = 18.00.
   - Las dos funciones contienen `retail.fn_descuento_campana(` 2 veces cada una.
   - Sus huellas cambiaron.
5. Publicar la web (fusionar el PR) en la misma ventana.
