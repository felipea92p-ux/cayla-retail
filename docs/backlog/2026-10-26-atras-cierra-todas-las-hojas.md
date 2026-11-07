## «Atrás» cierra la hoja de arriba (ADR-0528) — lo que queda
- [ ] El menú lateral del teléfono (`AppShell`) no es `<Modal>` ni `<Cajon>`: con el menú abierto, «atrás» navega en vez de cerrarlo. Sumarlo a la pila (`useAtrasCierraLaHoja(abierto, cerrar)`) si Felipe lo quiere igual.
- [ ] Una hoja con páginas propias (vista rápida de Productos ▸ Historial): «atrás» cierra la hoja entera, no vuelve a su primera página. Decidir si debe volver un paso.
- [ ] Probarlo en un iPhone real (gesto desde el borde de Safari): en local se simuló con `history.back()`.
