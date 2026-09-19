# ADR-0107 — Una etiqueta de campaña guarda su descuento y sus categorías; la venta lo lee en un paso aparte

**Fecha:** 2026-09-18
**Estado:** Modelo y pantalla construidos. SQL probado en un Postgres de prueba (17 casos);
la pantalla, en navegador sin base. **NO en producción**: falta pegar
`20260918160000_etiquetas_descuento_y_categorias.sql` (ver «Se rompe si»). Sin efecto en
caja: `registrar_venta` no se tocó.
**Afecta:** `retail.etiquetas` (`descuento_pct`), tabla nueva `retail.etiqueta_categorias`,
RPC nuevo `retail.actualizar_campana_etiqueta`, `EtiquetasLista.tsx` (modal «Configurar
campaña»), `/api/productos/etiquetas`, `/productos/atributos`, aviario (Loro).

## El problema

Felipe pidió que una etiqueta de campaña (Black Friday, Día de la Madre) pudiera llevar un
descuento que el administrador configura y cambia, con fechas y, si quiere, categorías, y que
las prendas etiquetadas lo reciban solas en Vender. Etiquetas ya tenía fechas y estilo, pero
**ningún modal de edición**: las fechas solo se cambiaban por SQL.

## Decisión

DECIDÍ: partir en dos. Este paso **solo guarda** la configuración (`descuento_pct` + tabla
puente `etiqueta_categorias` + modal). Que Vender la cobre es otro paso, con revisión propia,
porque toca `registrar_venta` (dinero).

Reglas que el modelo ya expresa, para que el paso de la venta no tenga que decidirlas:
- **Un solo descuento por prenda: el mayor** entre sus etiquetas vigentes (se resuelve al leer,
  no con una columna de prioridad).
- **Categorías opcionales.** Sin categorías, la etiqueta solo alcanza a las prendas etiquetadas
  a mano (`variante_etiquetas`); con categorías, a todas las de esas categorías. Los dos
  caminos dicen lo mismo («esta variante tiene esta etiqueta»), así que no chocan entre sí: el
  único choque posible es entre etiquetas distintas, y ahí gana el mayor.
- **La campaña no exige código.** `codigos_descuento` sigue aparte: dice *quién* puede
  descontar; la etiqueta dice *qué campaña* rige. Un descuento manual reemplaza al de campaña
  solo si es mayor.

Estados imposibles cerrados en el esquema, no en el código:
- `descuento_pct` fuera de (0, 100] → `etiquetas_descuento_rango`.
- `descuento_pct` sobre una etiqueta no aprobada → `etiquetas_descuento_solo_aprobada`
  (una colaboradora propone etiquetas; no puede proponerlas ya con «100 %»). La policy de
  insert lo dice explícito.
- Campaña guardada a medias → un solo RPC (`actualizar_campana_etiqueta`) actualiza % + fechas +
  categorías en una transacción, solo Líder.

DESCARTÉ: que el navegador calcule el % y lo mande al cobrar (cualquier colaboradora podría
mandar 100 %), y guardar % y categorías en llamadas separadas (una falla a la mitad deja una
campaña con el % nuevo y las categorías viejas).
SE ROMPE SI: (1) se despliega el frontend antes de pegar el SQL — por eso la página pide las
columnas nuevas **solo al abrir la pestaña Etiquetas**, para que Colores/Tallas/Tejidos/Patrones
sigan cargando; la pestaña Etiquetas sí caería. (2) Alguien lee el «20 % de descuento» de la
tarjeta como cobrado: por eso, mientras `DESCUENTO_YA_SE_APLICA` sea `false`, la tarjeta y el
modal dicen que aún no se aplica en Vender.

## Paso de la venta
Construido en ADR-0108 (la caja calcula, la base verifica). Una precisión sobre lo de arriba:
allí se descartó «que el navegador calcule el % y lo mande» — lo que se descartó de verdad es
que la base *confíe* en él; la base verifica cada línea contra la regla.

## Nota original del paso de la venta
Ver BACKLOG. Punto de cuidado ya identificado: la vigencia de las etiquetas se calcula hoy con
`current_date` (UTC) en SQL; pasadas las 7 pm en Lima una campaña que termina hoy dejaría de
aplicarse mientras la tienda sigue abierta (en pantalla ya se corrigió: `hoyLima()`). El
descuento debe usar `(now() at time zone 'America/Lima')::date`.
