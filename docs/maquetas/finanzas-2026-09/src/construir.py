#!/usr/bin/env python3
"""Une src/*.css + src/*.js en un solo HTML autocontenido: ../finanzas-spike.html"""
import os
d=os.path.dirname(os.path.abspath(__file__))
rd=lambda f: open(os.path.join(d,f),encoding='utf-8').read()
vistas=['vista-resumen.js','vista-gastos.js','vista-dinero.js','vista-reportes.js','vista-impuestos.js','vista-cierre.js','vista-config.js','vista-caja.js']
js='\n'.join(rd(f) for f in ['datos.js','marco.js']+[v for v in vistas if os.path.exists(os.path.join(d,v))]+['acciones.js'])
css=rd('base.css')+'\n'+rd('finanzas.css')
html=rd('plantilla.html').replace('/*CSS*/',css).replace('/*JS*/',js)
open(os.path.join(d,'..','finanzas-spike.html'),'w',encoding='utf-8').write(html)
print('ok',len(html))
