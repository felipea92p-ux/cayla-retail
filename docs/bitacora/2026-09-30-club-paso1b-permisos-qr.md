## 2026-09-30 (Club de clientas, tanda 1b: socia y publicidad por separado, código de socia, QR y la página donde ella confirma)

Qué hice: la migración `20260930200000` (PARTE 1: el WhatsApp de cada tienda) y `20260930200100` (PARTE 2: el club),
sin pegar. En la base:
- socia (`club_desde`, su «sí» de palabra) y publicidad (`publicidad_desde`, solo si ella la pide) quedan separadas, con
  un historial de solo agregar (`club_permisos`) y textos versionados (`club_textos`);
- código de socia `C-0000`;
- cambiar el celular de una socia con publicidad se la quita, con un disparador que lo hace imposible de otra forma;
- el camino B que eligió Felipe: el QR personal abre `/club/[token]`, una página pública de CAYLA donde ella marca una
  casilla sin marcar; la caja y la ficha se actualizan solas. «Llegó su mensaje» queda de respaldo.
En la web, Cobrar y `/clientas` siguen el spike del club (rama `claude/spyke-club-clientas-visual-631f7a`), con el cartel
imprimible y el número de cada tienda en Configuración.

Por qué así: la Ley 32323 solo admite publicidad por iniciativa propia; que ella marque la casilla en su celular es la
prueba más fuerte, y queda en la base con la versión del texto. Varios agentes en paralelo sobre contratos fijados antes
(tipos, reglas y firmas), cada uno con sus archivos.

Felipe se lleva: pegar las dos partes en orden, cada una sola, y fusionar después. El detalle, la verificación y el
recorrido a 375 px van en el PR.
