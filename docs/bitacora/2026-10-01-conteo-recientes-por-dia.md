## 2026-10-01 (Conteos recientes por día, con filtro Hoy / Ayer / fecha)
Qué hice: «Conteos recientes» se agrupa en bandas por día (la fecha en la banda, la hora de apertura en cada fila) y trae un filtro Todos · Hoy · Ayer · otra fecha con calendario que marca los días con conteos. El filtro vive en la URL (`?dia=`).
Por qué así: la fecha se repetía en cada fila y no había cómo ver un día concreto. Sin SQL nuevo: la página pide 300 conteos (no cuesta más que 20) y una función pura decide qué se dibuja. Hora de apertura y entrada en «Todos», por decisión de Felipe.
Felipe se lleva: solo web, sin migración; 265 archivos de pruebas, `tsc` y eslint en verde; no visto en producción hasta fusionar. Límite: con más de 300 conteos el calendario no llega a los más viejos.
