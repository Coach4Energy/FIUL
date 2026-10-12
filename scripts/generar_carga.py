"""
FIUL · Etapa 1 · Genera el SQL de carga de `alimentos` a partir de la
planilla de revisión. Solo pasan las filas con Validado = "Sí".

Uso:  python generar_carga.py "Revision alimentos FIUL.xlsx" 02_carga_alimentos.sql
"""
import sys, datetime
import openpyxl

COLS = ["proveedor", "categoria", "nombre", "porcion_g", "porcion_descripcion", "porcion_fija", "estado",
        "kcal", "proteina_g", "carbohidratos_g", "grasas_g", "fibra_g", "sodio_mg", "calcio_mg", "hierro_mg",
        "vit_a_ug", "vit_c_mg", "vit_b6_mg", "vit_b12_ug", "precio_ars", "grupo_ais", "activo",
        "fuente", "fuente_detalle", "validado"]
BOOL = {"porcion_fija", "activo"}


def sql(v, k):
    if k in BOOL:
        return "true" if v == "Sí" else "false"
    if v is None or (isinstance(v, str) and v.strip() == ""):
        return "null"
    if isinstance(v, (int, float)):
        return repr(float(v))
    return "'" + str(v).strip().replace("'", "''") + "'"


def main(entrada, salida):
    ws = openpyxl.load_workbook(entrada, data_only=True)["Alimentos"]
    ok, saltadas, errores = [], 0, []
    for i, r in enumerate(ws.iter_rows(min_row=2, values_only=True), start=2):
        f = dict(zip(COLS, r[:len(COLS)]))
        if (f["validado"] or "").strip() != "Sí":
            saltadas += 1; continue
        if not f["fuente_detalle"]:
            errores.append(f"Fila {i} ({f['nombre']}): validada pero sin detalle de fuente."); continue
        if "a confirmar" in str(f["porcion_descripcion"] or "") or (f["porcion_g"] is None and not f["porcion_descripcion"]):
            errores.append(f"Fila {i} ({f['nombre']}): validada pero la porción sigue 'a confirmar'."); continue
        ok.append(f)
    if errores:
        print("\n".join(errores)); sys.exit(1)

    campos = [c for c in COLS if c != "validado"]
    lineas = [f"-- Carga de alimentos validados · generado {datetime.datetime.now():%d/%m/%Y %H:%M}",
              f"-- {len(ok)} filas validadas; {saltadas} pendientes quedaron afuera.",
              "-- Si un alimento ya existe (mismo proveedor y nombre) se actualizan sus valores.", ""]
    for f in ok:
        vals = ", ".join(sql(f[c], c) for c in campos)
        upd = ", ".join(f"{c} = excluded.{c}" for c in campos if c not in ("proveedor", "nombre"))
        lineas.append(f"insert into public.alimentos ({', '.join(campos)})\nvalues ({vals})\n"
                      f"on conflict (proveedor, nombre) do update set {upd}, fecha_carga = current_date;\n")
    open(salida, "w", encoding="utf-8").write("\n".join(lineas))
    print(f"{len(ok)} filas → {salida} ({saltadas} sin validar)")


if __name__ == "__main__":
    main(*sys.argv[1:3])
