## 2026-10-27 — Insignias: «Editar» reemplaza a «Dibujo» y también corrige el nombre

- Qué: en cada pase de Catálogo ▸ Insignias el botón «Dibujo» pasó a «Editar» y vive a la derecha del estado («Vigente»). La hoja (`EditarEtiquetaModal`, antes `CambiarDibujoModal`) corrige el nombre de la campaña o insignia además de cambiar su dibujo.
- Cómo: sin cambios de base ni de API. El nombre va por el `PATCH nombre` que ya existía; el dibujo, por `fijar_icono_etiqueta`. Solo se escribe lo que cambió; si el nombre queda y el dibujo falla, la hoja sigue abierta para reintentar. Lógica pura en `lib/editar-etiqueta.ts` (un espacio de más no cuenta como corrección; una tilde sí).
- Verificado: tipos, pruebas de guías/unificar/sugerir/tema, knip y eslint; en el navegador local se corrigió «Dia del perro» → «Día del perro» (aviso y tarjeta al día) y se devolvió el dato.
