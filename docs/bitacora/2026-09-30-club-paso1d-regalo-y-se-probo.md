## 2026-09-30 (Club de clientas, tanda 1d: «se la probó y no la llevó» en Cobrar; «es para regalo» no va)

Qué hice:
- **Base.** `pedidos_no_atendidos` guarda dos señales en la misma tabla: `motivo`, donde todo lo de antes queda «buscó y no
  había», y una `razon` que solo existe con «se la probó». `registrar_pedido_no_atendido` las recibe al final, con los
  defaults de hoy. Son dos partes: el `alter` solo y después la función, como la 1c.
- **Cobrar.** Al quitar una prenda del ticket aparece la pregunta del spike: «¿Se la probó y no la llevó?», con cuatro
  razones y «No anotar». Tocar una razón la anota para Compras, firmada por el responsable.
- **Merge.** Traje la pantalla del cumpleaños de la 1c: conviven sin conflictos.
- **Lo que saqué.** Saqué entera la marca «es para regalo»: la columna de `venta_items`, la ficha que la leía y el salto
  en `deducirTallas`.

Por qué así: una sola tabla responde la pregunta de Compras («¿qué querían y no se llevaron?»), y «Llegó tu talla» no debe
avisarle a nadie de una prenda que se probó y no quiso: eso quedó escrito en la base. La marca de regalo salió porque Felipe
decidió seguir el spike aprobado, que no la lleva. Un regalo cuenta para la talla deducida, y lo corrige la talla que ella
dice en su ficha (preferencias, tanda 1f).

Felipe se lleva:
- pegar las dos partes después de las de la 1c;
- fusionar después de pegar;
- la captura a 375 px de la pregunta (PL-105);
- para verlo: en Vender, quita una prenda, toca «Precio» y mírala en `/pedidos-no-atendidos`.
