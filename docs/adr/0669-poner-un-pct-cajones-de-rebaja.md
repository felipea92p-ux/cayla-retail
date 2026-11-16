# ADR-0669 — «Poner un %»: la rebaja de una prenda en un toque, en cajones de % por tienda

**Fecha:** 2026-11-16 · **Estado:** aceptado por Felipe (reglas el 2026-11-16; «Sí, construye» a las 4 actividades). Construye sobre ADR-0655
(Campañas y ofertas).

## Contexto

Las colaboradoras quieren entrar a Campañas y ofertas, escanear una prenda y ponerle un % «para siempre o hasta que deje de estar con esa
oferta», viendo de la manera más rápida qué % ya existen. Hoy eso es: saber qué campaña tiene qué % (no se ve en ninguna parte), entrar a
ella, «Más ▸ Marcar prendas sueltas», buscar, marcar y guardar (unos 7 toques), y hace falta el módulo Insignias. En producción ya lo hacen a
mano con campañas que son un % con prendas marcadas: «Prendas de 10%» (37 tallas, Trujillo), «Para liquidar» (−15 %, 1.199 tallas de 139
modelos, Trujillo), «Top ventas» (−20 %).

## Decisión

Felipe, 2026-11-16:

| Pregunta | Decisión |
|---|---|
| Quién y cuánto | Todo el que ve Campañas y ofertas, hasta 70 % (el tope de toda oferta) |
| A qué | Al escanear se elige «solo esta prenda» (esa talla de ese color) o «todo el modelo» |
| Dónde | En su tienda; un líder puede elegir «todas las tiendas» |
| Cómo | Cajones de %: uno por % y tienda, sin fecha de fin, junto a las campañas con ese % en la tienda. Una prenda en un solo cajón: elegir otro la mueve |

1. **Un cajón ES una campaña con descuento de siempre** (`etiquetas`, sin fechas, sin anunciar en la portada) con sus prendas marcadas a mano
   (`variante_etiquetas`), y `rebaja_cajones` dice cuáles lo son, su % y su tienda. La caja, Apartar, la tienda web, SUNAT y Finanzas ya lo
   cobran y lo cuentan sin cambiar nada; el historial de la prenda anota cada marca.
2. **Lugares de un %**: los cajones y las campañas vigentes con descuento de siempre (hasta 70 %) que rigen en la tienda
   (`fn_rebajas_de_sede`). «Movible» si rige exactamente en esas tiendas: de ahí se saca la prenda al ponerla en otro. Una campaña que rige en
   todas las tiendas no se toca desde una tienda (Arequipa no pierde su % porque Trujillo lo cambió): la caja cobra el mayor y la hoja lo dice.
3. **La pantalla** (Catálogo ▸ Campañas y ofertas, arriba de las campañas): el escáner (`PonerUnPct`, la pistola o el nombre) abre la hoja
   (`HojaRebaja`): qué % tiene hoy y de dónde, «¿A qué?», «¿Cuánto menos?» (los lugares como botones u «Otro %»), el precio que queda, de
   dónde sale, lo que le sigue llegando y si queda bajo el costo (sin mostrar el costo); «Quitar el %». Debajo, «Rebajas de tu tienda»
   (`RebajasDeTienda`): una tarjeta por lugar con cuántas prendas le llegan; tocarla abre sus prendas con «Quitar». Quién lo hace se elige una
   vez por tienda (`useResponsable` con `recordarEn`): cada % queda firmado sin un paso más por escaneo.
4. **Candados en la base**: tope 70 %, tienda donde trabaja, «todas» solo un líder, el módulo, y un candado de transacción para que dos
   personas poniendo % distintos a la misma prenda a la vez no la dejen en dos cajones.

## Alternativas descartadas

- **Una oferta por prenda** (`campana_reglas`): exige fecha de fin y se cruza con el candado de choques.
- **Un precio de rebaja por prenda en una tabla nueva**: la caja, la web y Finanzas no lo conocen; habría que enseñárselo a todas.
- **Sacar la prenda de una campaña de otras tiendas**: cambiaría el precio en una tienda que nadie miró.
- **Responsable en cada escaneo**: un paso más por prenda en una tarea de muchas prendas seguidas.

## Se rompe si

- Una campaña con prendas por CATEGORÍA le da a la prenda un % mayor: no se saca por prenda; la hoja dice «la caja cobra el mayor» y se cambia
  en la campaña.
- Los cajones aparecen también como campañas en la billetera de abajo (lo aceptó Felipe al elegir «cajones»).

## Cómo se verifica

- `pnpm pruebas:rebaja-rapida` (25): cajones, mover, quitar, candados, lecturas y su control.
- `lib/rebaja-rapida-reglas.test.ts` (7): lo que dice la hoja.
- En el navegador, sobre una copia local: escanear, todo el modelo, «Otro %» 20, poner (8 prendas, la caja cobra −20 %), ver el cajón y
  quitar una; escritorio claro y 375 px en oscuro. Dos sesiones a la vez: la prenda queda en un solo cajón.
- Migraciones `20261116182000` y `20261116183000`, sin pegar en producción.
