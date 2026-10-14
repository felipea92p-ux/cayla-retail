## 🏬 Inicio de la tienda: «Tu piso» (2026-10-13, ADR-0395) — solo web, sin migración; rama `claude/inicio-estado-del-piso-d7a466`

- [x] Sección «Tu piso» en el Inicio de una tienda (no terminal): tarjeta de Frescura y tarjeta del Plan del piso, cada una solo si la cuenta ve su módulo; sin módulo nuevo. Reglas puras con 37 pruebas (`lib/inicio-piso-reglas.ts`), lecturas que nunca lanzan, paso («Cuadrar el piso») dicho una vez.
- [x] Verificado: suite completa (451 archivos), `tsc`, `eslint`, Inicio en el navegador a 1440 y a 375 px en claro y oscuro, `guias:recorrer` del Inicio a 1440 y 375 (10 pasos) y `tema:auditar` del Inicio (0 hallazgos solo en oscuro).
- [ ] **Medir en producción** cuánto tarda la lectura de Frescura en el Inicio (no tiene caché; en una navegación interna el loader global espera la respuesta entera). Con el número: cachear por sede con vida corta o sacarla a una lectura del navegador. No se cacheó a ciegas.
- [ ] **Sin probar con datos reales:** hoy ninguna sede tiene el piso cuadrado, así que las dos tarjetas están en «sin saber». El estado con dato se vio con una página de ensayo de datos de mano (ya borrada). Mirar con una tienda que haya cuadrado su piso.
- [ ] **Sin probar con colaboradoras reales** (las lectoras de la prueba ciega son agentes que representan perfiles).
- [ ] Felipe decide: el lugar (hoy después de «Te toca»), y si «Tu piso» se puede ocultar (hoy «Ajustar» solo gobierna los avisos de «Te toca»).
- [ ] Las frases «faltan días seguidos cobrando con la prenda» y «cuadrar el piso» confundieron a las lectoras. Son de las pantallas de Frescura y del Plan: mejorarlas es un cambio de esas pantallas y de todo el sistema, no de esta sección.
- [ ] «Aproximado» (Frescura, un chip) y «Capacidad provisional» (Plan, una línea) avisan lo mismo con dos formas. Decidir una sola pieza para «¿puedo creer este número?» (ADR-0358).
- [ ] A 375 px, en el paso «Tu piso» de la guía, la tarjeta de la guía tapa la parte baja de la tarjeta del Plan (la sección es alta). Si molesta, dividir el paso en dos anclas (una por tarjeta).
- [ ] Heredado de ADR-0394: `components/ui/IconoModulo.tsx` conserva el mapa de íconos viejo; los íconos nuevos del lateral no están ahí.
