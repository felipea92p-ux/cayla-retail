# 2026-10-29 · Recibir mercadería «B», siete piezas vivas (rama servidor-recepcion-mercaderia-1612f4)

- **Qué:** Felipe eligió en la maqueta `docs/maquetas/recibir-b-2026-10/` las piezas de Recibir y se llevaron al ERP sin cambiar qué hace
  ningún botón: Trayecto (cabecera y tabla), acordeón de categorías, Dial con el número que se toca para escribirlo, totales que ruedan,
  podio por categoría, Vitrina como cara de cada prenda (con la matriz adentro) y sello de lacre (ADR-0575). Sin migración ni RPC.
- **Verificado:** vitest de las cinco reglas nuevas y de guías, unificar, tema, hover y sin foto; tsc, eslint y knip; en el navegador local con
  ENV-002668 (contar, escribir el número, Escape, cerrar, precio desde la Vitrina a «Todas») y ENV-003035 (cerrado), a 375, 1280, 1440 y 1920 px
  en claro y oscuro; `guias:recorrer` de las dos pantallas en escritorio y a 375 px oscuro; `tema:auditar` 0 hallazgos.
- **Formidable y chaos (misma tarde):** Formidable 6,3 → **7,2** tras los 3 cambios (`02b2ef6fe`: el Dial a la vista, el precio que se encuentra, cada cosa una
  vez), verificados con una segunda ciega (5 clics, 0 vueltas atrás). Chaos (semilla 2910): 0 violaciones nuevas en la base; resistieron el doble clic en
  «Cerrar el envío», la red cortada y los montos hostiles; queda abierto, de antes y de Felipe, que dos personas que suman «+» a la vez pierden una prenda.
