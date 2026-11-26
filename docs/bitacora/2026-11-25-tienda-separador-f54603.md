# 2026-11-25 · La tienda sin «·» entre datos

- **Qué:** Felipe pidió evitar «a toda costa» el punto medio como separador en la tienda online. Se cambiaron ~50 textos de `apps/tienda`: los datos distintos van en piezas propias (pie legal, código y total del pedido, «Salida 03» y su precio, color y precio en «Arma tu look») y los que comparten línea, en una frase («Negro, talla M», «Pedido W-0012 en Trujillo», «3 prendas por S/ 120.00», «Pagado y listo para recoger»). Los títulos de pestaña usan «|».
- **Cómo:** `lib/detalle-dicho.ts` arma «color, talla, tienda» como frase para pedidos, Club y avisos; `lib/sin-punto-medio.test.ts` falla si vuelve un «·» fuera de un comentario.
- **Falta:** verlo en el navegador (escritorio y 375 px) con un banco de la tienda; el ERP (`apps/web`) sigue usando «·» y cambiarlo allá es otra decisión.
