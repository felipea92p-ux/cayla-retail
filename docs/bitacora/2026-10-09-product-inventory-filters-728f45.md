# 2026-10-09 — Existencias ▸ panel: filtro piso/almacén en «Todas» y foto en grande

- En «Todas», las casillas «En el piso» y «En almacén» (con su ícono y mayúscula) son ahora el filtro de la tabla: tocar una deja en cada celda solo esa mitad, a todo el alto y con el número más grande; tocarla otra vez (o «Ver piso y almacén») vuelve a las dos. Sin filtro, la mitad del almacén va en pizarra para no confundirse con el ámbar de «falta colgar».
- La miniatura de la cabecera abre la foto entera (`components/existencias/FotoAmpliada.tsx`, `<Modal>` del sistema, sin campos); Escape cierra solo la foto y deja el panel abierto.
- Verificado en local a 1280 px (oscuro) y 375 px (claro): filtro, vuelta y foto. Sin migraciones ni reglas de negocio.
