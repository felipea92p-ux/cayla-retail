## 2026-09-30 (Club de clientas, tanda 1d: «es para regalo» y «se la probó y no la llevó», fase A)

Qué hice: la migración `20260930240000`. `pedidos_no_atendidos` guarda ahora dos señales en la misma tabla: `motivo` (todo lo
de antes queda «buscó y no había») y una `razon` que solo existe con «se la probó». `registrar_pedido_no_atendido` las
recibe al final, con los defaults de hoy. Sumé `venta_items.es_regalo`, que `fn_clienta_compras` devuelve y que
`deducirTallas` salta. En la web: la lista de Pedidos no atendidos muestra el motivo, la ficha dice «· regalo», e Inicio y
Análisis siguen contando solo los pedidos de talla. Falta la fase B: que `registrar_venta` guarde la marca. Espera a que la
1c tenga su migración.

Por qué así: una sola tabla responde la pregunta de Compras («¿qué querían y no se llevaron?»). «Llegó tu talla» no debe
avisarle a nadie de una prenda que se probó y no quiso, y eso quedó escrito en la base. Los candados están en el esquema,
no solo en la función. Y la lógica de Cobrar que todavía no tiene pantalla no se escribió como función (ADR-0234).

Felipe se lleva: pegar este archivo después de los de la 1c, y fusionar después de pegar. Para verlo, anota «no había»
desde el modal de talla y ábrelo en `/pedidos-no-atendidos`. La marca de regalo solo se verá cuando Cobrar la mande
(fase B + pantalla).
