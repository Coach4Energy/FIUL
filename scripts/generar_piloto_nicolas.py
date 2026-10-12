"""
FIUL · Genera 02_piloto_nicolas.sql: ficha de Nicolás, su plan hiperproteico
por bloques (vigente desde 02/10/2026) y sus mediciones #8 a #12.
Fuente: los informes "Nicolás · Plan Hiperproteico" y "Nicolás · Recomposición 2026".

Uso: python generar_piloto_nicolas.py <salida.sql>
"""
import json, sys

EMAIL = "EMAIL_DE_NICOLAS"  # reemplazar por el email real antes de correr el SQL

tipos_dia = [
    {"id": "lm", "nombre": "Lunes y miércoles", "dias": [1, 3], "comidas": [
        {"hora": "07:00", "titulo": "Desayuno + creatina", "detalle": "Jugo de naranja con 5 g de creatina, revuelto, tostadas, café o mate.", "p": 2, "h": 2},
        {"hora": "12:30", "titulo": "Almuerzo", "detalle": "Proteína magra, medio plato de verdura, hidrato.", "p": 2, "h": 2},
        {"hora": "16:00", "titulo": "Merienda", "detalle": "Yogur APIS Life o FuXion, y fruta.", "p": 1, "h": 2},
        {"hora": "19:30", "titulo": "Cena", "detalle": "Proteína magra, verduras, hidrato.", "p": 2, "h": 2}]},
    {"id": "mj", "nombre": "Martes y jueves (entreno)", "dias": [2, 4], "comidas": [
        {"hora": "07:00", "titulo": "Pre-entreno + creatina", "detalle": "Jugo de naranja con 5 g de creatina, café.", "p": 0, "h": 1},
        {"hora": "10:00", "titulo": "Post-entreno", "detalle": "Revuelto, tostadas con Finlandia Light.", "p": 2, "h": 1},
        {"hora": "13:00", "titulo": "Almuerzo", "detalle": "Proteína magra, medio plato de verdura, hidrato.", "p": 2, "h": 2},
        {"hora": "16:00", "titulo": "Merienda", "detalle": "Yogur APIS Life o FuXion, y fruta.", "p": 1, "h": 2},
        {"hora": "19:30", "titulo": "Cena", "detalle": "Proteína magra, verduras, hidrato.", "p": 2, "h": 2}]},
    {"id": "vie", "nombre": "Viernes (tenis 9–10 h)", "dias": [5], "comidas": [
        {"hora": "07:30", "titulo": "Desayuno + creatina", "detalle": "Jugo de naranja con 5 g de creatina, 2 tostadas, revuelto 1 huevo + 4 claras. Liviano: entrás a la cancha 90 minutos después.", "p": 1, "h": 2},
        {"hora": "09:00", "titulo": "Tenis", "detalle": "Agua durante el partido. Si hace calor, sumá sales de rehidratación.", "p": 0, "h": 0},
        {"hora": "10:15", "titulo": "Post-tenis", "detalle": "FuXion BioPro+ Sport con agua y 1 fruta.", "p": 1, "h": 1},
        {"hora": "13:00", "titulo": "Almuerzo", "detalle": "Proteína magra, medio plato de verdura, hidrato.", "p": 2, "h": 2},
        {"hora": "16:30", "titulo": "Merienda", "detalle": "Yogur APIS Life y fruta.", "p": 1, "h": 2},
        {"hora": "19:30", "titulo": "Cena", "detalle": "Proteína magra, verduras, hidrato.", "p": 2, "h": 2}]},
    {"id": "fds", "nombre": "Fin de semana", "dias": [0, 6], "comidas": [
        {"hora": "09:00", "titulo": "Desayuno + creatina", "detalle": "Igual que en la semana; podés pasarlo a media mañana.", "p": 2, "h": 2},
        {"hora": "14:00", "titulo": "Almuerzo", "detalle": "Asado o pastas con estrategia (ver Mi plan).", "p": 2, "h": 2},
        {"hora": "17:00", "titulo": "Merienda", "detalle": "Opcional si el almuerzo fue tarde: FuXion + fruta.", "p": 1, "h": 1},
        {"hora": "20:30", "titulo": "Cena", "detalle": "Proteína magra, verduras, hidrato.", "p": 2, "h": 2}]},
]

prot = [
    ["Pechuga de pollo", "81 g", 133, 3, "base"], ["Peceto, nalga o cuadrada", "85 g", 135, 4, "base"],
    ["Bola de lomo o lomo", "90 g", 165, 7, "base"], ["Carré de cerdo", "93 g", 168, 7, "base"],
    ["Pescado blanco (merluza, brótola, lenguado)", "106 g", 123, 2, "base"], ["Salmón rosado", "102 g", 156, 5, "base"],
    ["Atún al natural, escurrido", "129 g (≈1 lata)", 111, 1, "base"], ["Revuelto hiper-magro (1 huevo + 4 claras)", "1 porción", 176, 7, "base"],
    ["FuXion BioPro+ Sport", "31 g (≈1¼ scoop)", 117, 1, "base"], ["Yogur griego APIS Life (~¾ pote de 300 g)", "217 g", 125, 1, "base"],
    ["Pata-muslo sin piel", "103 g", 180, 8, "oca"], ["Vacío", "91 g", 183, 8, "oca"], ["Carne picada especial", "96 g", 208, 11, "oca"],
    ["Huevos enteros", "3 unidades (≈23 g prot.)", 279, 19, "oca"], ["Entraña", "96 g", 211, 12, "finde"], ["Asado de tira", "98 g", 299, 22, "finde"],
]
hc = [
    ["Pan integral Cero&Cero", "2 rebanadas (50 g)", 114], ["Jugo de naranja exprimido", "1 vaso (250 ml)", 113],
    ["Fruta de densidad media (manzana, pera, naranja, kiwi)", "180 g", 97], ["Fruta de densidad alta (mango, banana, higo)", "132 g", 98],
    ["Arroz integral", "115 g", 117], ["Fideos", "81 g", 128], ["Papa con piel, al horno", "118 g", 110],
    ["Boniato (batata)", "124 g", 107], ["Lentejas (+10 g prot.)", "111 g", 141], ["Choclo", "119 g", 114],
]

bloques = {
    "fase": "Fase de déficit · octubre → diciembre 2026",
    "titulo": "Bajar a 105 kg", "titulo_destacado": "sin soltar músculo.",
    "bajada": "Este plan no es un menú fijo. Es un sistema: cada comida tiene una cantidad de bloques de proteína y de porciones de hidratos, y vos elegís con qué los completás. Si cumplís los bloques, cumpliste el plan.",
    "notas_metas": {"kcal": "~2200–2300 en descanso · ~2400 con entreno", "proteina": "7 bloques de 25 g + el resto del día",
                    "hidratos": "8–9 porciones de ~25 g", "grasas": "incluye 30 g de aceite de oliva"},
    "contador": {
        "metas": {"p": 7, "h": 9, "o": 2},
        "etiquetas": {"p": "Bloques de proteína (25 g)", "h": "Porciones de hidratos (~25 g)", "o": "Cucharadas de aceite (15 g)"},
        "botones": [
            {"grupo": "Proteína (1 bloque)", "clave": "p", "items": [{"n": n} for n in
                ["Pechuga 81 g", "Pescado 106 g", "Atún 1 lata", "Carne magra 85 g", "Revuelto 1+4", "FuXion 1¼ scoop", "Yogur APIS Life", "Ocasional"]]},
            {"grupo": "Hidratos (1 porción)", "clave": "h", "items": [{"n": n} for n in
                ["2 tostadas", "Jugo", "Fruta", "Arroz / fideos", "Papa / batata", "Lentejas", "Choclo"]]},
            {"grupo": "Grasas", "clave": "o", "items": [{"n": "1 cda. aceite", "q": 1}, {"n": "½ cda. aceite", "q": 0.5}]},
        ],
    },
    "nota_intercambios": "Cada línea aporta unos 25 g de proteína. Pesos en cocido. Las opciones “base” son para todos los días; las “ocasionales” traen más grasa, así que máximo una por día.",
    "intercambios_proteina": [{"n": a, "cant": b, "kcal": c, "g": d, "uso": e} for a, b, c, d, e in prot],
    "porciones_hidratos": [{"n": a, "cant": b, "kcal": c} for a, b, c in hc],
    "textos": [
        {"t": "Grasas: con medida", "d": "Hasta 30 g de aceite de oliva extra virgen por día, unas 2 cucharadas soperas, medidas con cuchara. Además: ½ palta (50 g) o 1 cucharada de Finlandia Light (15 g) por día. Afuera: crema, manteca, salsas con crema y frituras."},
        {"t": "Verduras: libres", "d": "Medio plato en almuerzo y cena. Hojas, tomate, zapallito, zucchini, brócoli, espárragos, zanahoria, zapallo. Papa, batata y choclo no son verdura: cuentan como hidratos."},
        {"t": "Asado", "d": "Una porción de corte graso (asado de tira, vacío o entraña: unos 100 g cocidos) y el resto de la proteína en cortes magros. Ensalada grande, sin pan, sin achuras ni morcilla. Esa comida no lleva aceite extra."},
        {"t": "Pastas", "d": "2 porciones de fideos (160 g cocidos) con salsa de tomate y 2 bloques de proteína magra adentro. Sin crema ni manteca. Ensalada al costado."},
    ],
    "reglas": [
        {"t": "Proteína primero.", "d": "Cada comida principal arranca por los bloques. Si algo se queda afuera, que no sea la proteína."},
        {"t": "Magro por defecto.", "d": "Pechuga en vez de pata-muslo: 3,6 g contra 7,8 g de grasa cada 100 g cocidos. Bola de lomo, peceto o nalga en vez de cortes grasos."},
        {"t": "Aceite medido.", "d": "Hasta 30 g por día, con cuchara. Cero grasas ocultas en las preparaciones."},
        {"t": "Medio plato verde.", "d": "En almuerzo y cena. Volumen y saciedad sin calorías."},
        {"t": "Fruta con medida.", "d": "Hasta 3 frutas chicas por día, entre 300 y 350 g en total, y como máximo una de densidad alta. Suman unas 2 porciones de hidratos: contalas en el contador."},
        {"t": "Tostada y jugo con creatina se quedan.", "d": "La tostada te sostiene la cabeza a la mañana; la creatina (5 g) va todos los días."},
        {"t": "Un pesaje por semana.", "d": "En ayunas, mismo día y misma hora. La tendencia importa más que un número suelto."},
    ],
    "pie": "Plan basado en la medición #12 (02/10/2026). Valores de la base C4E y, para los alimentos que no estaban, USDA FoodData Central (pesos en cocido) y rótulos de producto. Este plan no reemplaza una indicación médica.",
}

# Mediciones #8 a #12 (kg, mm, cm)
M = [
    (8, "2026-01-30", 106.0, 25.1, 50.9, 14.4, 11.1, 4.6, (14, 21, 14, 20, 15, 10), (34.8, 36.4, 30.8, 112.5, 101.9, 111.5, 68.0, 61.3, 43.2)),
    (9, "2026-03-20", 108.3, 25.2, 52.3, 15.1, 11.1, 4.7, (16, 22, 14, 19, 12, 10), (35.8, 36.0, 31.1, 113.0, 104.0, 114.0, 68.0, 61.5, 43.3)),
    (10, "2026-05-08", 106.5, 24.3, 51.7, 15.0, 10.9, 4.5, (15.5, 22, 13.5, 19, 12, 10), (35.2, 36.2, 31.0, 115.0, 105.5, 114.6, 69.0, 61.2, 42.6)),
    (11, "2026-07-10", 108.1, 24.5, 53.2, 14.9, 10.9, 4.6, (15.5, 22, 14, 18, 15, 8), (35.8, 36.1, 31.5, 114.7, 104.5, 112.5, 70.5, 61.5, 43.5)),
    (12, "2026-10-02", 107.9, 25.2, 52.2, 15.0, 10.9, 4.6, (15.5, 22.5, 14, 18, 16, 9.5), (35.9, 36.9, 31.3, 113.7, 104.6, 114.5, 69.5, 61.2, 43.4)),
]
PL = ["triceps", "subescapular", "supraespinal", "abdominal", "muslo_medio", "pantorrilla"]
PE = ["brazo_relajado", "brazo_flexionado", "antebrazo", "torax", "cintura", "cadera", "muslo_maximo", "muslo_medio", "pantorrilla"]

q = lambda o: "$j$" + json.dumps(o, ensure_ascii=False) + "$j$::jsonb"
out = [
    "-- FIUL · Piloto: Nicolás Purita (ficha, plan vigente y mediciones #8 a #12)",
    "-- ANTES DE CORRER: reemplazar EMAIL_DE_NICOLAS por su email real (una sola vez, en la línea de abajo).",
    "-- Si se corre dos veces, falla sin duplicar nada.",
    "do $do$",
    "declare",
    f"  v_email text := '{EMAIL}';",
    "  v_id bigint;",
    "begin",
    "  if position('@' in v_email) = 0 then raise exception 'Falta reemplazar EMAIL_DE_NICOLAS por el email real'; end if;",
    "  insert into public.clientes (nombre, email, fecha_alta, objetivo, fase_actual, servicio)",
    "  values ('Nicolás Purita', v_email, '2026-10-02', 'Recomposición corporal: 105 kg sin perder músculo (largo plazo 100 kg)', 'Déficit oct–dic 2026', 'Piloto')",
    "  returning id into v_id;",
    "  insert into public.planes (cliente_id, nombre, kcal_objetivo, proteina_objetivo_g, carbohidratos_objetivo_g, grasas_objetivo_g, tipos_dia, bloques, vigente_desde, vigente_hasta)",
    f"  values (v_id, 'Plan hiperproteico por bloques', 2400, 200, 230, 70, {q(tipos_dia)}, {q(bloques)}, '2026-10-02', '2026-12-31');",
]
for n, f, w, fat, mus, res, bone, skin, pl, pe in M:
    out.append(
        "  insert into public.mediciones (cliente_id, fecha, numero, peso_kg, talla_cm, pliegues_mm, perimetros_cm, "
        "masa_adiposa_kg, masa_muscular_kg, masa_residual_kg, masa_osea_kg, masa_piel_kg)\n"
        f"  values (v_id, '{f}', {n}, {w}, 182.6, {q(dict(zip(PL, pl)))}, {q(dict(zip(PE, pe)))}, {fat}, {mus}, {res}, {bone}, {skin});")
out += ["end", "$do$;", "", "-- Control: tiene que devolver 1 plan activo y 5 mediciones.",
        "select c.nombre, c.email,",
        "       (select count(*) from public.planes p where p.cliente_id = c.id and p.activo) as planes_activos,",
        "       (select count(*) from public.mediciones m where m.cliente_id = c.id) as mediciones",
        "from public.clientes c where c.nombre = 'Nicolás Purita';"]
open(sys.argv[1], "w", encoding="utf-8").write("\n".join(out) + "\n")
print("ok", sys.argv[1])
