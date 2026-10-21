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
- [x] **De una lista a otra desde la cabecera o el menú del celular, el esqueleto al instante** (`components/EnCamino.tsx`): la grilla con
  el título de la que viene a los 30–53 ms, con su fundido, y la raya de la cabecera en la lista tocada. Antes, 1,3 s sin nada (red lenta).

### Sigue pendiente

- [ ] **Tocar una prenda antes de que llegue su precarga** (medido): Next precarga solo lo que está a la vista (5 fichas de 24 al abrir una
  lista, de a 4) y cada tarjeta al entrar a la pantalla; un toque antes de que llegue esperó hasta 1,3 s con red lenta (sin retraso, todas
  listas a los 0,35 s). En producción la cáscara sale de la caché de Vercel: **medirlo en un celular con 4G de verdad** antes de tocarlo.
  Si se nota, la salida está escrita en ADR-0445 («Lo que cuesta no saber»): el esqueleto propio de `EnCamino` también para «de una lista
  a una ficha», con el fundido de Next apagado para ese toque.
- [x] ~~De una ficha a otra y de un look a otro no sale el esqueleto~~: falso, medido. Next sí muestra el de su carpeta (50–90 ms), con
  el fundido y la foto que vuela. El ADR-0445 decía lo contrario y está corregido.
- [ ] **Al publicar**: mirar en un iPhone y en un Android que el fundido y la foto que vuela se vean bien (Safari 18+ y Chrome 111+ los
  tienen; sin soporte, se ve como antes) y que `/api/tallas` responda 401 sin sesión.
