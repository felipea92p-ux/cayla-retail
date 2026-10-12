## 2026-10-06 (`/chaos`: usar mal el ERP a propósito, pantalla por pantalla — ADR-0356)
Qué hice: la skill `/chaos` con su catálogo de 69 ataques en 8 familias (núcleo fijo + azar con semilla), un detector de 12 invariantes de la
base con foto antes/después y autoprueba, la regla «Caos» en `CLAUDE.md`, el tablero `docs/chaos/README.md` y la casilla del PR; las pruebas
de la parte pura corren en el CI.
Por qué así: un ataque casi nunca tira la pantalla, deja un estado que nadie ve (stock que no cuadra con `movimientos`); por eso se mira la
base después de cada ataque que escribe, solo lo que la base no impide sola, y el propio detector se prueba corrompiendo datos en una
transacción revertida. Dinero, stock, permisos y SUNAT quedan siempre de Felipe.
Qué se rompería sin esto: seguiríamos sabiendo que una pantalla «funciona» sin saber qué pasa con un doble clic, una red cortada o dos cajeras
vendiendo la última prenda, y un descuadre silencioso se descubriría en el conteo del mes.
