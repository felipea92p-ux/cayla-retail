# 2026-10-30 — El avío deja de ser «un insumo que no es tela» (ADR-0580)

**QUÉ HICE.** Un avío (botón, cierre, hilo, etiqueta, elástico, pretina) se registra ahora en UNA hoja con todos sus colores,
igual que una tela: se elige primero qué clase de avío es, y de esa clase salen solas tres cosas que antes se preguntaban a
ciegas —en qué se cuenta (el hilo, en **conos**), si lleva color, y qué medida lo distingue de otro de su clase (18 L en un
botón, 40 cm en un cierre, título 40 en un hilo)—. El código lo arma la base con las letras de la clase (`HIL-01`), nadie lo
teclea y nadie lo repite. Las clases viven en **Catálogo ▸ Atributos ▸ Avíos**, donde Felipe las corrige sin esperar una
publicación. La hoja vieja, «Nuevo insumo», se retiró.

**POR QUÉ ASÍ.** Porque el sistema no sabía que un botón es un botón, y eso costaba de dos formas que no se ven. Primera: la
medida terminaba escrita dentro del nombre, y medido en producción, «Botón nácar 18mm» y «Botón nácar 18 mm» entraban como DOS
fichas, cada una con su stock, sin un solo error. Ahora la medida es un dato y el candado mira (nombre, tipo, medida): dos
medidas del mismo botón son dos fichas a propósito; la misma medida dos veces, no entra ni escrita distinto. Segunda: la hoja
proponía «unidades» para TODO avío, también para el hilo, que se compra en conos de ~5.000 m — y esa unidad se congela al
primer lote, para siempre. Ahora la clase la propone bien y la hoja avisa, a la vista, que es la única decisión que no se puede
deshacer.

**QUÉ SE ROMPERÍA SIN ESTO.** El primer cono de hilo que alguien ingrese queda medido en «unidades» para siempre: el ERP creería
que hay 2 unidades de hilo cuando hay 10.000 metros, el aviso de «bajo el mínimo» no serviría de nada y la única salida sería
crear otro insumo y abandonar el primero. Y cada botón de dos medidas se duplicaría en el catálogo sin que nada avisara, con el
stock partido entre dos fichas que nadie sabría juntar.

---

**Decidió Felipe (cuatro preguntas, 2026-10-30):** las seis clases más «Otro»; sin unidad de compra con factor por ahora (una
caja de 144 se anota como 144); un avío lo crea **quien opera el Taller**, igual que una tela (el saldo inicial con su costo
sigue siendo del líder); y el color del avío sale de la **misma carta** de colores de las prendas, con «+ Nuevo color».

**Verificado:** base privada con las 981 migraciones, 0 errores; `pnpm pruebas:materiales` **143/143** (24 casos nuevos) y con
tres candados rotos a propósito, tres casos en rojo; las 14 suites de Postgres que tocan insumos, en verde; `tsc`, `knip`,
`eslint` y las 746 suites de la web; y **guardando de verdad en el navegador con login real**: se creó `HIL-01` «Hilo poliéster
título 40» en conos, con sus colores `HIL-01-NEG` y `HIL-01-CRU`, y Actividad lo anotó. Revisado en escritorio, en modo oscuro
y a 375 px.

**El SQL (`20261030144000`) todavía NO está pegado en producción.** Va en dos partes, por separado y en orden; la segunda es la
política de `avio_clases`, sola y al final (ADR-0195). Producción tiene **0 avíos** (consultado en vivo el 30-oct), así que no
hay nada que migrar — pero conviene repetir esa sonda antes de pegar, porque basta un avío cargado por el SQL Editor para que
deje de ser cierto.
