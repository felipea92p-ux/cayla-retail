# ADR-0300 — El descuento de campaña es exacto: el % sobre el precio, al céntimo

**Fecha:** 2026-10-01 · **Estado:** construido y probado en local; migración `20261001150000_campana_descuento_exacto.sql`
**SIN PEGAR en producción** (espera el OK de Felipe, y va en la misma ventana que publicar la web: ver §6) · **Decide:**
Felipe · **Reemplaza:** ADR-0182 (el precio de campaña bajaba al .90) · **Rama:** `claude/discount-review-ae10ca`

## 1. El problema, primero

Felipe creó «Luna» (S/ 39.00) con «Para liquidar 20 %» e imprimió su etiqueta: decía **«−20 %»** y **S/ 30.90**. Pero
39.00 − 20 % = 31.20. La regla de ADR-0182 bajaba el precio rebajado al .90 de abajo, así que se descontaban S/ 8.10, que
es **20.8 %**. Dos daños, en sus palabras: *«si descuentas más me perjudica, y además la etiqueta miente»*.

ADR-0182 suponía precios de lista terminados en .90 (sus ejemplos: 89.90, 79.90, 159.80); con ellos el exceso era de 1 o 2
céntimos. **La premisa no se cumple:** en producción (consulta de solo lectura, 2026-10-01), 42 de 272 variantes (15 %)
terminan en .00 —S/ 22, 39, 65, 75, 99 y 119—, y ahí el exceso llega a casi un sol:

| Precio | Campaña | Con el .90 se cobraba | Descuento real | Exacto se cobra |
|---|---|---|---|---|
| S/ 22.00 | 10 % | 18.90 | **14.1 %** | 19.80 |
| S/ 22.00 | 20 % | 16.90 | 23.2 % | 17.60 |
| S/ 39.00 | 20 % | 30.90 | 20.8 % | 31.20 |
| S/ 99.00 | 20 % | 78.90 | 20.3 % | 79.20 |
| S/ 89.90 | 20 % | 71.90 | 20.02 % | 71.92 |

En la revisión, Claude dio por buena la diferencia citando ADR-0182. Era un error: ese ADR aceptó «hasta casi un sol de más»
pensando en precios .90, y nadie había visto el caso de un precio redondo con su «−20 %» impreso al lado.

## 2. Decisión

```
DECIDÍ:    el descuento de una campaña es round(precio × % / 100, 2): el céntimo más cercano a la cuenta exacta, y en el empate
           de medio céntimo, el de arriba (lo que hace round() de Postgres con un numeric positivo). Una sola cuenta en la caja
           para la campaña y para el % manual (descuentoUnitarioPorPorcentaje, en enteros), y su gemela en la base
           (fn_descuento_campana), que las tres funciones que cobran o guardan con campaña llaman por su nombre.
DESCARTÉ:  (a) dejar el .90 y arreglar solo el papel (sin «−20 %», o con el % real): la etiqueta dejaría de mentir, pero CAYLA
           seguiría pagando hasta casi un sol por prenda, que es justo lo que Felipe rechazó;
           (b) el .90 solo cuando el precio de lista ya termina en .90: un caso aparte en la regla (dos reglas para la misma
           cuenta) y aun así no es exacto (89.90 con 20 % daría 71.90, no 71.92);
           (c) truncar siempre hacia abajo al céntimo («nunca un céntimo de más»): el error deja de ser de ±0,5 céntimo y pasa
           a ser de hasta 1 céntimo, siempre en contra de la clienta, y el papel diría «−25 %» dando 24.97 %. El céntimo más
           cercano es la mejor aproximación posible a la cuenta exacta, y es lo que ya hacían el % manual y round() de la base;
           (d) dejar el % manual en coma flotante: medido el 2026-10-01, Math.round(n × 100) / 100 se equivoca en 10 758 de
           5 940 000 combinaciones de precio y % (S/ 19.90 con 25 % = 4.975 daba 4.97). Eran dos cuentas para lo mismo y una
           estaba mal.
SE ROMPE SI: la base y la web no cambian juntas mientras rige una campaña (el 2026-10-01 rigen 2 sobre 13 variantes): con la
           base nueva y la caja vieja, cada venta con campaña se rechaza con venta_campana_monto_no_coincide; al revés, con
           venta_campana_omitida. También si una venta sin conexión hecha con la caja vieja se sincroniza después del cambio,
           o si alguien vuelve a escribir la cuenta DENTRO de registrar_venta, separar_prendas o editar_separacion en vez de
           llamar a fn_descuento_campana (lo vigilan la validación de la migración y pruebas:campana-redondeo, escenario 5).
```

**La matemática, en una frase:** la caja calcula `floor((céntimos × diezmilésimas_de_% + 500 000) / 1 000 000)` en enteros
de JS (cabe de sobra: S/ 99 999.99 × 100 % = 10¹³ < 2⁵³) y la base hace `round(precio × pct / 100, 2)` en `numeric`
exacto; los dos son «el céntimo más cercano, empate hacia arriba», y se comprobó que dan lo mismo en 210 080 casos.

## 3. Qué cambió

- **Base** (`20261001150000_campana_descuento_exacto.sql`): solo el cuerpo de `retail.fn_descuento_campana`, con su misma
  firma. `registrar_venta`, `separar_prendas` y `editar_separacion` la llaman por su nombre y cambian solas. Se verificó en
  producción (solo lectura) que nada más depende de ella: 0 índices, 0 checks, 0 vistas y 0 columnas generadas (un índice
  sobre una función `immutable` que cambia de resultado quedaría corrupto). La migración aborta todo si una de las tres
  funciones dejó de llamarla o si no cumple 13 ejemplos.
- **Web** (`lib/vender-reglas.ts`): `descuentoUnitarioPorPorcentaje` hace la cuenta exacta en enteros, y `descuentoDeCampana`
  es esa misma función. Lo usan la caja, los apartados (`ApartarVista`), las proformas al cobrar, la etiqueta de precio
  (`armarEtiquetas`) y el aviso «quedaría bajo costo» (`prendasBajoCosto`): todo cambia a la vez, sin tocar cada pantalla.
- **El papel:** el «−20 %» no cambia de lugar ni de forma; ahora es verdad. El ticket de la caja sigue mostrando el % de la
  campaña (`porcentajeVisible`).
- **Pruebas:** `vender-reglas.test.ts` (12 ejemplos, la equivalencia campaña = % manual, y una propiedad contra la cuenta
  exacta hecha aparte con BigInt en 154 296 combinaciones); `etiqueta-precio-reglas.test.ts` (la etiqueta de Luna:
  31.20, y descuento ÷ precio = % ÷ 100 en enteros); `etiqueta-campana`, `proforma-al-carrito`; y
  `scripts/pruebas/campana_redondeo.mjs` contra Postgres (se conserva el nombre para no tocar el CI).

## 4. Cómo se verificó (2026-10-01)

- Suite web completa: 289 archivos, 154 433 pruebas en verde; `tsc` y eslint en verde.
- Postgres desechable con las 394 migraciones del repo (incluida esta) y el seed:
  - `pruebas:campana-redondeo` **9/9**: la venta acepta 15.98 exacto (79.90 → 63.92), rechaza el 16.00 del .90 y un 15.96;
    un manual igual a la campaña no la reemplaza; `separar_prendas` acepta 15.98 y rechaza 16.00; la migración se pega dos
    veces.
  - **Control:** con la regla del .90 repuesta en esa base, la misma prueba da **3/9** (falla donde debe); con la
    migración, 9/9 otra vez.
  - Regresión: `registrar-venta` 28/28, `separaciones` 78/78, `apartar-stock` 46/46, `venta-contrato-ampliado` 13/13.
  - **Paridad caja ↔ base:** 210 080 combinaciones (precios de S/ 0.01 a 600.00, con todos los .00/.50/.90 y los empates;
    26 porcentajes de 0.01 a 100): **0 diferencias**.
- Producción, solo lectura: 0 ventas y 0 separaciones con campaña hasta hoy (nadie recibió un descuento del .90, no hay
  historia que corregir); `fn_descuento_campana` con la huella de ADR-0182 (`569f5547b94e7edb538df910cf7e1c6f`).

## 5. Lo que queda

- `registrar_venta` y `separar_prendas` aceptan ±1 céntimo de diferencia con la regla (`> 0.011`), porque la caja vieja
  calculaba en coma flotante. Con las dos cuentas en aritmética exacta esa holgura ya no hace falta, pero cerrarla es tocar
  `registrar_venta`, la función más parchada del repo: queda anotado en el backlog, no se hace aquí.

## 6. Para pegar en producción (con el OK de Felipe)

1. **Fuera del horario de tienda.** Confirmar que ninguna caja tiene ventas sin conexión por sincronizar.
2. Confirmar la huella: `select md5(pg_get_functiondef('retail.fn_descuento_campana(numeric,numeric)'::regprocedure));` =
   `569f5547b94e7edb538df910cf7e1c6f`. Si es otra, alguien la cambió: parar y mirar.
3. Pegar `20261001150000_campana_descuento_exacto.sql` tal cual (una sola parte: no toca tablas ni políticas; su bloque
   final aborta todo si algo no quedó bien).
4. Verificar: `select retail.fn_descuento_campana(39, 20)` = 7.80 y `select retail.fn_descuento_campana(89.90, 20)` = 17.98.
5. **En la misma ventana**, fusionar el PR (publica la web).
6. Antes de abrir, recargar Vender (F5) en cada caja: una pestaña abierta desde antes sigue con la cuenta vieja y su venta
   con campaña se rechazaría.
