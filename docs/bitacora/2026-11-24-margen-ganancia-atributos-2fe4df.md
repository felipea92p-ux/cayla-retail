## 2026-11-24 (El margen objetivo de cada prenda: una base del Admin más lo que la prenda tiene — ADR-0700)
Qué hice: el ERP ya no mide toda prenda con un mismo número. Cada una tiene su **margen objetivo**: la base que fija el Admin en
Configuración ▸ Precios (recomendada 37 %: TRU paga su tienda desde 36.9 % y AQP tienda + oficina desde 36.2 %, gastos de octubre) más
lo que suma cada casilla de la prenda (+3 % de fábrica): «Nadie la tiene», «En tendencia», «Tela que se nota» (llega marcada por una lista
de tejidos) y «Marca que el cliente conoce» (sale sola de una lista de marcas). «La vieron más cara afuera» no suma: pone el techo del
sugerido en el .90 justo debajo. Las casillas se marcan al comprar («Compré ropa»), pasan a la prenda al recibirla y se corrigen en
Catálogo (Nuevo y Editar producto). Con ellas: el ámbar del margen (Recibir, Nuevo y Editar producto, la lista de Productos, «Compré
ropa») mide contra ese objetivo; el «Sugerido S/ …» sale de él; y la propuesta de la IA nunca baja de él.
Por qué así: Felipe quería subir el margen por el valor de la prenda (lo nuevo, lo distinto, lo que está de moda), no a ojo. Se guarda
qué se marcó, para que dentro de 3 a 6 meses las ventas digan si cada +3 % se sostiene (es una hipótesis, no un dato). El ámbar de antes
(«no aguanta una rebaja de 35 %», ≈ 48 %) pintaba casi todo de ámbar con la base de hoy, y la lista de Productos medía con otra cuenta
(resta con IGV adentro, ámbar en 45 %): la misma prenda decía dos márgenes.
Felipe se lleva: Configuración ▸ Precios (base, cuánto suma cada casilla y las dos listas); en cada prenda, «¿Qué tiene esta prenda?».

## 2026-11-24 («Editar orden» ya no borra lo que anotó quien compró)
Qué hice: «Editar orden» del escritorio borraba las líneas y las volvía a escribir sin el precio sugerido, la prenda del catálogo, «a la
espera de precio», las casillas ni el precio visto afuera. Ahora la pantalla los devuelve y la base los vuelve a revisar al escribirlos
(`20261124181000`). En producción ninguna de las 42 órdenes con sugerido estaba todavía en la ventana en que se puede editar (sin
comprobante ni envío): no llegó a pasar.
Por qué así: la línea que se edita lleva lo suyo; emparejar por posición habría pasado lo de una prenda a otra al quitar una línea.
Cómo se verifica: `pnpm pruebas:editar-orden-conserva` (23; con la función de antes fallan 7) y probado en la pantalla, editando una orden
de prueba (anulada después).

## 2026-11-24 (Cómo se verifica todo lo de hoy)
Pruebas de base: `pruebas:reglas-de-precio` (38), `pruebas:compra-con-rasgos` (18), `pruebas:recibir-con-rasgos` (14),
`pruebas:editar-orden-conserva` (23), `pruebas:rasgos-en-catalogo` (18); y `orden_compra_sugerido` (25) con su S4 midiendo su propio
parche. Web: la suite entera en verde, con pruebas que cruzan la lista de Productos con la ficha talla por talla. En el navegador:
Configuración ▸ Precios, «Compré ropa» a 375 px, Nuevo producto (lino → «Tela que se nota» sola; costo S/ 30.90 → «Sugerido S/ 60.90»,
objetivo 40 %), Editar producto (dos casillas → su talla de S/ 10 pasa a ámbar, «sube a S/ 11.90») y la lista de Productos a 1440 y 375
px. Nada está en producción: las seis migraciones esperan el OK de Felipe. La IA no se probó en vivo (cuesta por consulta).

## 2026-11-24 (Las casillas como lista del Admin)
QUÉ HICE: las casillas de «¿Qué tiene esta prenda?» dejaron de estar fijas en el código: son una lista que el Admin edita en Configuración ▸
Precios (agregar, renombrar, cuánto suma, apagar). Nacen seis: las cuatro de antes más «Detalle de diseño» y «Acabado y confección».
POR QUÉ ASÍ: con columnas fijas, cada casilla nueva era una migración a ocho funciones; ahora es una fila. Las prendas guardan códigos, y la
base exige que existan y que una casilla nunca se borre (se apaga y vuelve).
QUÉ SE ROMPERÍA SIN ESTO: borrar una casilla dejaría prendas con un código huérfano que nadie sabe leer, y apagarla le quitaría la marca a
cada prenda que se guarde sin verla. Solo en local: la migración `20261124201000` espera el OK de Felipe.
