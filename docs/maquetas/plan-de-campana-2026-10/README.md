# Spike visual · Compras ▸ Plan de campaña (2026-10-10)

> **Estado: propuesta, sin decidir.** Nada de esto está en la app. Rediseña la pantalla de
> [ADR-0349](../../adr/0349-plan-de-campana.md) y le suma lo que Felipe pidió el 2026-10-10: exportar, tope de inversión,
> varias campañas y dos formas de llenar el plan para compararlas. El prompt para construirla está en [`PROMPT.md`](PROMPT.md).

`spike.html`: un solo archivo, se abre con doble clic o con el servidor `maquetas` de `.claude/launch.json`
(`http://localhost:8791/plan-de-campana-2026-10/spike.html`). Arriba, una barra punteada con los controles de la maqueta (no es parte del ERP).

## Qué probar

| Gesto | Qué debería pasar |
|---|---|
| Cargar / «Repetir entrada» | La cabecera sube, las cifras cuentan, las barras de rango se dibujan de izquierda a derecha |
| **La barra de cada fila** | De un vistazo: lo verde es lo que **ya hay**, lo negro es lo que **hay que comprar**, la banda clara es el rango **flojo–bueno** y la marca es el **normal**. Sustituye tres números sueltos |
| Selector de campaña (arriba a la derecha) | Cambia entre Diciembre 2026, Día de la Madre y Fiestas Patrias; «+ Nueva campaña» pide nombre y fechas, y avisa qué falta |
| Aviso ámbar «El “Hay hoy” está incompleto» | Dice qué sedes no tienen su stock cargado y que la compra saldría inflada. En la barra, *Stock ▸ Confiable* lo reemplaza por un «✓ Stock confiable» |
| Cifras | «Categorías con plan» con barra de avance (filtra); «Inversión» con la barra contra el tope y «Editar»; «Por llenar primero» lleva al paso a paso |
| Filtros | Buscador, píldoras (Todas · Sin plan · Con plan · Las 10 que más venden · Se agotaron), familia y orden. Las 10 categorías sin ventas ni stock se pliegan en una sola línea |
| **Tabla / Paso a paso** (a la derecha del buscador) | Las dos formas de llenar, para compararlas |
| Clic en una categoría (tabla) | Hoja con la **referencia** (vendiste N en 90 días, hay N en la red por sede), escenarios, precio y costo **precargados del catálogo**, curva de tallas, resultado en vivo con su barra y su efecto sobre el tope |
| «Proponer desde lo vendido» | Rellena flojo / normal / bueno con ×2 · ×3 · ×4,5 de lo que vendes por mes (diciembre triplica un mes promedio, R-19). **El ×2 y el ×4,5 son una propuesta a decidir.** |
| «Guardar y seguir con Cardigans →» | Guarda y pasa a la siguiente que más vende, sin volver a la lista |
| Paso a paso | Una categoría a la vez, de la que más vende a la que menos; avance con puntos; «Saltar por ahora»; al terminar las 10, «Seguir con las demás» |
| Exportar | Vista de la lista de compra por categoría y por talla; «Descargar Excel (CSV)» baja un archivo de verdad; «Imprimir» usa la impresora del navegador |
| Barra: *Momento* «Durante / Después» | Aparece la columna «Lo que pasó» y el rombo de lo vendido sobre la barra; la cifra 4 pasa a «Vendido en la campaña» |

## Qué es simulación

- 45 categorías con cifras inventadas; las 9 primeras copian los «Hay hoy» de la captura de Felipe (259, 241, 128…). Nada se guarda.
- El tope de 12 000 y la cifra de «Finanzas dice 10 500» son de ejemplo. La conexión con Finanzas no existe.
- Las ventas «durante» y «después» son inventadas, pero usan la misma frase que la pantalla real (`fraseDeLoReal`).
- La cuenta de «cuánto comprar» es una copia fiel de `apps/web/lib/plan-compra-reglas.ts` (cuantil crítico, triangular, curva).
- No cubre modo oscuro: en la pantalla real lo hereda de los tokens y se verifica con `tema:auditar`.

## Qué necesita el OK de Felipe en la base (el resto es solo cara)

| Cambio | Toca la base | Por qué |
|---|---|---|
| Barra de rango, filtros, filas plegadas, paso a paso, «Guardar y seguir», cifras y movimiento | **No** | Todo sale de lo que `fn_plan_compra` ya devuelve |
| «Vendiste N en 90 días» y «en 30 días» como referencia | **No** (el de 90 sale de `vendidoPorTalla`) / **sí, pequeño** (el de 30) | La lectura trae 90 días por talla, no 30 |
| Precio y costo precargados del catálogo | **Sí**: ampliar `fn_plan_compra` con el promedio por categoría | Hoy se escriben a mano |
| Stock por sede en la hoja | **Sí**: ampliar la lectura | Hoy solo viene el total de la red |
| Aviso de stock incompleto | **Sí, lectura**: usar `fn_motor_demanda_preparacion` (ya existe, ADR-0346) | Dice qué sedes cuadran y cuáles no |
| Selector y «Nueva campaña» | **Sí**: una RPC nueva para crear una campaña | Hoy solo hay `fn_plan_compra` y `guardar_plan_compra_linea`; «Diciembre 2026» se sembró por SQL |
| Tope de inversión | **Sí**: una columna en `planes_compra` y una RPC | No existe dónde guardarlo |
| «Finanzas dice…» | **Sí, y toca dos módulos** | Falta decidir de qué cuenta sale la cifra |
| Exportar CSV / imprimir | **No** | Se arma en el navegador desde lo que ya se leyó |

## Decisiones que quedan abiertas (son de Felipe)

1. **¿Tabla o Paso a paso?** La maqueta trae las dos. Mi lectura: la tabla para revisar y corregir; el paso a paso para llenar por
   primera vez. Pueden convivir, con el paso a paso como el camino por defecto mientras haya categorías importantes sin plan.
2. **El ×2 / ×3 / ×4,5.** «Normal = 3 meses» sale de R-19; flojo y bueno no tienen dato detrás.
3. **Dos fuentes de verdad para «campaña».** Las fechas del plan viven en `planes_compra`; las de Configuración, en las etiquetas de
   estilo «campaña» de Catálogo ▸ Etiquetas. Antes de «Nueva campaña» conviene decidir si el plan cuelga de la etiqueta (una sola fecha).
4. **Si el tope bloquea o solo avisa.** La maqueta solo avisa (ámbar); un tope que bloquea sería una regla nueva.
