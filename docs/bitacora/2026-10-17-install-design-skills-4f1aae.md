## 2026-10-17 (Skills de diseño de afuera: se consultan, no mandan)
Qué hice: instalé por usuario (`~/.claude/skills/`, fuera del repo) `vercel-react-native-skills` y `ui-ux-pro-max` (`frontend-design`
ya estaba desde el 25-jul), le corregí a `ui-ux-pro-max` la ruta de su buscador (apuntaba a `${CLAUDE_PLUGIN_ROOT}`, que solo existe
instalada como plugin) y escribí en CLAUDE.md la regla «Skills de diseño de afuera»: se consultan, nunca mandan sobre los tokens ni las
piezas decididas del ERP, y nunca crean `design-system/…/MASTER.md`. Al pedir el rediseño completo de la tienda, Felipe le dio
identidad visual propia: en `apps/tienda` las skills sí proponen paleta y letras, como 2 o 3 maquetas que él elige mirando.
Por qué así: las dos skills de diseño se activan en casi cualquier tarea de interfaz y empujan a elegir paleta, fuentes y estilo propios;
en CAYLA eso ya está decidido (ADR-0169, ADR-0358, ADR-0136), y su `--persist` crearía una segunda fuente de verdad del diseño.
Felipe se lleva: las tres skills disponibles en su Mac sin cambiarle nada al equipo, y la regla escrita para que ninguna sesión las deje
mandar. React Native queda sin uso hasta que haya una app nativa (hoy no hay ni una línea de React Native ni Expo en el repo).
