# 2026-10-12 · Recibir mercadería: tres maquetas para el fardo que manda Compras

- **Qué:** `docs/maquetas/recibir-fardo-2026-10/` — tres caras del mismo proceso (llega el fardo → contar contra lo que dijeron →
  separar conocidas de nuevas → cerrar con causas y quién recibe → etiquetar, colgar y «por crear»), con el mismo modelo debajo:
  **A · Camino** (cuatro pasos, uno a la vez), **B · Mesa de conteo** (un montón por categoría y las bandejas a la vista), **C · Hilo de la
  pistola** (una caja, cada lectura es una línea). Con aviso de Compras (ADR-0362) y sin aviso (WhatsApp), claro y oscuro, escritorio y
  375 px, «▶ Ver cómo se recibe» y «Abrir en» cualquier paso. README con el contrato, lo que falta en la base (`prendas_por_crear`) y 6
  decisiones de Felipe. Sin código del ERP, sin migración.
- **Por qué:** Felipe (2026-10-12): el proceso real —abrir, contar contra lo anunciado, ordenar y etiquetar lo conocido, anotar lo nuevo
  para crearlo después— no cabe en «Llegó mercadería» (ADR-0330), que solo escanea lo que ya existe en el catálogo. Lo nuevo se olvida y
  una diferencia no deja rastro.
- **Cómo:** HTML autocontenido con los tokens de `globals.css`/`tema.css` y las piezas únicas (ADR-0358), movimiento de ADR-0136 (sin
  rebote ni bucle). Recorridas en el navegador integrado con clics reales y capturadas sin ventana (`capturas/`). Trampas: una clase
  `.capa` del montón chocaba con la capa del modal de `_base.css` (prefijar por pieza); `python3 -m http.server` no arranca desde este
  worktree (se sirvió con Node desde el scratchpad); el panel entrega la captura un cuadro atrasado y pausa timers y animaciones en la
  pestaña que no está al frente.
