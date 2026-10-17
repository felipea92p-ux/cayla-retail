## 🪟 La tienda: esqueletos fieles y paso suave entre vistas (2026-10-17) — rama `claude/tienda-vistas-fdbd9c`, ADR-0445

Sigue a `docs/backlog/2026-10-17-tienda-percepcion-fdbd9c.md` (PR #1165, ya en main). Sin migraciones: solo `apps/tienda`.

### Hecho

- [x] **La cabecera, la franja de anuncios y la de las tiendas no parpadean** al cambiar de página (las del esqueleto son las últimas vistas).
- [x] **Un esqueleto por página, con sus clases**: Inicio (héroe con la campaña), lista (título real), ficha, looks de a tres, un look, «Arma
  el tuyo», Mi perfil, pedidos, bolsa (sus filas o vacía), Recomendaciones; `loading.tsx` nuevos donde la página de antes se quedaba quieta.
- [x] **La ficha llega con la foto, el nombre, el precio y la categoría de la tarjeta tocada**, y su foto grande no se apaga al llegar.
- [x] **Fundido entre vistas** (React 19.3) con la cabecera quieta, y **la foto de la tarjeta vuela a la ficha** (fila 8 de la tabla de mejoras).
- [x] **Las tallas del «Agregar» rápido por `GET /api/tallas`** (antes, una acción en fila con las demás).
- [x] El ancho de la página no se corre al pasar de una corta a una larga (`scrollbar-gutter: stable`).

### Sigue pendiente

- [ ] **Tocar una prenda antes de que llegue su precarga**: Next espera esa precarga para mostrar el esqueleto (hasta 1,3 s con red muy
  lenta, 24 tarjetas precargándose en fila). Mirar si conviene precargar primero lo que está a la vista o al apoyar el dedo
  (`prefetch` de `Link`), midiendo en un celular con 4G de verdad.
- [ ] **De una ficha a otra** («Combínalo con», «Parecidas») y de un look a otro no sale el esqueleto (es la misma carpeta: Next no vuelve a
  mostrar su `loading.tsx`); la ficha de antes se queda hasta que llega la nueva, ahora con el fundido. Si se nota, un `<Suspense key>` por
  prenda dentro de la ficha.
- [ ] **De una lista a otra desde la cabecera** (Lo nuevo → Más vendidos) tampoco hay esqueleto (es la misma página): se funde al llegar,
  pero mientras tanto nada dice que el toque llegó. Un `PendienteDelEnlace` en los enlaces de la cabecera lo resolvería (como los filtros).
- [ ] **Al publicar**: mirar en un iPhone y en un Android que el fundido y la foto que vuela se vean bien (Safari 18+ y Chrome 111+ los
  tienen; sin soporte, se ve como antes) y que `/api/tallas` responda 401 sin sesión.
