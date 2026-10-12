/* FIUL · app del cliente y panel del coach.
   Sin dependencias: habla con Supabase por su API (Auth + REST).
   La seguridad la ponen las reglas RLS de la base: cada cliente solo
   recibe sus propias filas, aunque alguien modifique este código. */
(function () {
  "use strict";
  const CFG = window.FIUL_CONFIG;
  const APP = document.getElementById("app");
  const NAV = document.getElementById("nav");
  const TOP = document.getElementById("top");
  const SKEY = "fiul.sesion";

  /* ---------- utilidades ---------- */
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const fmt = (v, d = 1) => (v == null || isNaN(v) ? "–" : Number(v).toLocaleString("es-AR", { minimumFractionDigits: d, maximumFractionDigits: d }));
  const sgn = (v, d = 1) => (v > 0 ? "+" : v < 0 ? "−" : "±") + fmt(Math.abs(v), d);
  const store = {
    get(k) { try { return JSON.parse(localStorage.getItem(k) || "null"); } catch (e) { return null; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} },
    del(k) { try { localStorage.removeItem(k); } catch (e) {} },
  };
  // Fecha de hoy en Argentina, "AAAA-MM-DD"
  function hoyISO(offsetDias = 0) {
    const d = new Date(Date.now() + offsetDias * 864e5);
    return new Intl.DateTimeFormat("en-CA", { timeZone: CFG.zonaHoraria, year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
  }
  const DIAS = ["dom", "lun", "mar", "mié", "jue", "vie", "sáb"];
  const diaSemana = (iso) => new Date(iso + "T12:00:00").getDay();
  const fechaCorta = (iso) => { const [, m, d] = String(iso).split("-"); return `${DIAS[diaSemana(iso)]} ${d}/${m}`; };

  /* ---------- sesión y API ---------- */
  let sesion = store.get(SKEY);
  const conf = () => CFG.supabaseKey && !/PEGAR_ACA/.test(CFG.supabaseKey);

  async function authFetch(path, body) {
    const r = await fetch(CFG.supabaseUrl + path, {
      method: "POST",
      headers: { apikey: CFG.supabaseKey, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw Object.assign(new Error(j.error_description || j.msg || j.message || "Error de acceso"), { status: r.status });
    return j;
  }
  function guardarSesion(j) {
    sesion = { access_token: j.access_token, refresh_token: j.refresh_token, expires_at: Math.floor(Date.now() / 1000) + (j.expires_in || 3600), user: j.user };
    store.set(SKEY, sesion);
  }
  async function login(email, password) {
    guardarSesion(await authFetch("/auth/v1/token?grant_type=password", { email, password }));
  }
  let refrescando = null;
  async function refrescar() {
    if (!sesion) throw new Error("sin sesión");
    if (!refrescando) refrescando = authFetch("/auth/v1/token?grant_type=refresh_token", { refresh_token: sesion.refresh_token })
      .then(guardarSesion).finally(() => { refrescando = null; });
    return refrescando;
  }
  async function salir() {
    if (sesion) fetch(CFG.supabaseUrl + "/auth/v1/logout", { method: "POST", headers: { apikey: CFG.supabaseKey, Authorization: "Bearer " + sesion.access_token } }).catch(() => {});
    sesion = null; store.del(SKEY); estado = {}; location.hash = "#/"; render();
  }
  async function api(path, { method = "GET", body, prefer } = {}, reintento = true) {
    if (!sesion) throw new Error("sin sesión");
    if (sesion.expires_at - 60 < Date.now() / 1000) await refrescar();
    const headers = { apikey: CFG.supabaseKey, Authorization: "Bearer " + sesion.access_token };
    if (body !== undefined) headers["Content-Type"] = "application/json";
    if (prefer) headers.Prefer = prefer;
    const r = await fetch(CFG.supabaseUrl + "/rest/v1/" + path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
    if (r.status === 401 && reintento) {
      try { await refrescar(); } catch (e) { salir(); throw e; }
      return api(path, { method, body, prefer }, false);
    }
    if (!r.ok) {
      const j = await r.json().catch(() => ({}));
      throw Object.assign(new Error(j.message || "Error " + r.status), { status: r.status });
    }
    if (r.status === 204) return null;
    const t = await r.text();
    return t ? JSON.parse(t) : null;
  }

  /* ---------- estado ---------- */
  let estado = {}; // { esCoach, cliente, clientes, planes:{id->plan}, ... }

  async function cargarBase() {
    const uid = sesion.user.id;
    const [coach, clientes] = await Promise.all([
      api("coaches?select=user_id"),
      api("clientes?select=*&order=nombre.asc"),
    ]);
    estado.esCoach = coach.length > 0;
    estado.clientes = clientes;
    estado.cliente = clientes.find((c) => c.user_id === uid) || null;
  }
  async function planActivo(clienteId) {
    const r = await api(`planes?select=*&cliente_id=eq.${clienteId}&activo=is.true&limit=1`);
    return r[0] || null;
  }

  /* ---------- navegación ---------- */
  function ruta() {
    const h = location.hash.replace(/^#\/?/, "");
    const p = h.split("/").filter(Boolean);
    return { vista: p[0] || "", id: p[1] ? Number(p[1]) : null };
  }
  function pintarNav(vista, clienteId) {
    TOP.hidden = false;
    const links = [];
    const suf = estado.esCoach && clienteId ? "/" + clienteId : "";
    if (estado.esCoach) links.push(["coach", "Clientes", "#/coach"]);
    if (!estado.esCoach || clienteId) {
      links.push(["hoy", "Hoy", "#/hoy" + suf], ["plan", "Mi plan", "#/plan" + suf], ["informe", "Informe", "#/informe" + suf]);
    }
    NAV.innerHTML = links.map(([k, t, href]) => `<a href="${href}" ${k === vista ? 'aria-current="page"' : ""}>${t}</a>`).join("");
  }

  async function render() {
    if (!conf()) { TOP.hidden = true; APP.innerHTML = `<div class="form"><h2>Falta configurar</h2><p class="lede">Pegá la publishable key de Supabase en <span class="mono">config.js</span>.</p></div>`; return; }
    if (!sesion) { TOP.hidden = true; return vistaLogin(); }
    try {
      if (!estado.clientes) await cargarBase();
      const { vista, id } = ruta();
      if (!estado.esCoach && estado.cliente && !estado.cliente.consentimiento_at) { TOP.hidden = true; return vistaConsentimiento(); }
      if (estado.esCoach) {
        if (!vista || vista === "coach") { pintarNav("coach"); return vistaCoach(); }
        if (!id) { location.hash = "#/coach"; return; }
      } else if (!estado.cliente) {
        TOP.hidden = false; NAV.innerHTML = "";
        APP.innerHTML = `<section class="card"><h2>Tu cuenta todavía no tiene una ficha</h2><p class="lede">Avisale a Juanba: tu ficha tiene que estar cargada con el mismo email con el que entraste (${esc(sesion.user.email)}).</p></section>`;
        return;
      }
      const cliente = estado.esCoach ? estado.clientes.find((c) => c.id === id) : estado.cliente;
      if (!cliente) { APP.innerHTML = `<p class="err">No se encontró ese cliente.</p>`; return; }
      const v = ["hoy", "plan", "informe"].includes(vista) ? vista : "hoy";
      pintarNav(v, estado.esCoach ? cliente.id : null);
      APP.innerHTML = `<p class="muted">Cargando…</p>`;
      if (v === "hoy") return await vistaHoy(cliente);
      if (v === "plan") return await vistaPlan(cliente);
      if (v === "informe") return await vistaInforme(cliente);
    } catch (e) {
      console.error(e);
      APP.innerHTML = `<section class="card"><h2>No se pudo cargar</h2><p class="err">${esc(e.message)}</p><button class="btn sec" type="button" id="retry">Reintentar</button></section>`;
      document.getElementById("retry").addEventListener("click", () => location.reload());
    }
  }
  window.addEventListener("hashchange", render);
  document.getElementById("logout").addEventListener("click", salir);

  function bannerCoach(cliente) {
    return estado.esCoach ? `<div class="banner"><span>Estás viendo la app de <b>${esc(cliente.nombre)}</b> como coach.</span><a href="#/coach">Volver a clientes</a></div>` : "";
  }

  /* ---------- login ---------- */
  function vistaLogin() {
    APP.innerHTML = `
      <form class="form" id="f-login" novalidate>
        <div class="brand" style="font-size:44px">FI<span>Ü</span>L</div>
        <p class="lede">Tu plan, tu registro diario y tu evolución, en un solo lugar.</p>
        <label class="f">Email<input type="email" id="l-email" autocomplete="username" required></label>
        <label class="f">Contraseña<input type="password" id="l-pass" autocomplete="current-password" required></label>
        <button class="btn" type="submit" id="l-btn">Entrar</button>
        <p class="err" id="l-err" role="alert"></p>
        <p class="small muted">¿No tenés cuenta o te olvidaste la contraseña? Escribile a Juanba.</p>
      </form>`;
    document.getElementById("f-login").addEventListener("submit", async (ev) => {
      ev.preventDefault();
      const btn = document.getElementById("l-btn"), err = document.getElementById("l-err");
      btn.disabled = true; err.textContent = "";
      try {
        await login(document.getElementById("l-email").value.trim(), document.getElementById("l-pass").value);
        estado = {}; await render();
      } catch (e) {
        err.textContent = e.status === 400 ? "Email o contraseña incorrectos." : "No se pudo entrar: " + e.message;
        btn.disabled = false;
      }
    });
  }

  /* ---------- consentimiento (Ley 25.326) ---------- */
  function vistaConsentimiento() {
    APP.innerHTML = `
      <section class="card" style="max-width:680px;margin:4vh auto 0">
        <div class="head"><div class="eyebrow">Antes de empezar</div><h2>Consentimiento para el uso de tus datos</h2></div>
        <div class="legal">
          <p><b>Responsable:</b> Coach4Energy (Juan Bautista Pesara Acosta), juanba@coach4energy.com.</p>
          <p><b>Qué datos:</b> datos de contacto, objetivos, mediciones antropométricas (peso, pliegues, perímetros, diámetros y composición corporal), tu plan de alimentación, lo que registrás cada día en la app y, si los compartís, informes de análisis clínicos. Varios de estos son datos de salud.</p>
          <p><b>Para qué:</b> únicamente para tu seguimiento nutricional y de entrenamiento: armar y ajustar tu plan, medir tu evolución y preparar tus informes. No se usan con fines comerciales ni se ceden a terceros.</p>
          <p><b>Quién accede:</b> solo vos y tu coach, bajo secreto profesional. Cada cuenta ve únicamente sus propios datos.</p>
          <p><b>Dónde se guardan:</b> en servidores de Supabase ubicados en São Paulo, Brasil, con acceso cifrado.</p>
          <p><b>Tus derechos:</b> podés pedir en cualquier momento ver, corregir o borrar tus datos, o retirar este consentimiento, escribiendo a juanba@coach4energy.com. La Agencia de Acceso a la Información Pública es el órgano de control de la Ley 25.326.</p>
          <p class="small muted">Versión ${esc(CFG.versionConsentimiento)} · texto en revisión legal.</p>
        </div>
        <label class="check"><input type="checkbox" id="c-ok"><span>Leí el texto y doy mi consentimiento libre, expreso e informado para el tratamiento de mis datos, incluidos los de salud, con esa finalidad.</span></label>
        <div class="row-actions"><button class="btn" type="button" id="c-btn" disabled>Aceptar y continuar</button><button class="linkbtn" type="button" id="c-out">Salir</button></div>
        <p class="err" id="c-err" role="alert"></p>
      </section>`;
    const ok = document.getElementById("c-ok"), btn = document.getElementById("c-btn");
    ok.addEventListener("change", () => (btn.disabled = !ok.checked));
    document.getElementById("c-out").addEventListener("click", salir);
    btn.addEventListener("click", async () => {
      btn.disabled = true;
      try {
        await api("rpc/aceptar_consentimiento", { method: "POST", body: { version: CFG.versionConsentimiento } });
        estado = {}; await render();
      } catch (e) { document.getElementById("c-err").textContent = "No se pudo guardar: " + e.message; btn.disabled = false; }
    });
  }

  /* ---------- HOY: estructura del día + contador ---------- */
  async function vistaHoy(cliente) {
    const plan = await planActivo(cliente.id);
    if (!plan) { APP.innerHTML = bannerCoach(cliente) + `<section class="card"><h2>Todavía no hay un plan activo</h2><p class="lede">Cuando Juanba cargue tu plan, lo vas a ver acá.</p></section>`; return; }
    const B = plan.bloques || {};
    const tipos = plan.tipos_dia || [];
    const cont = B.contador || { metas: { p: 7, h: 9, o: 2 }, botones: [] };
    const fecha = hoyISO();
    const dsem = diaSemana(fecha);
    const kTab = "fiul.tab." + cliente.id;
    let tipo = store.get(kTab + "." + fecha) || (tipos.find((t) => (t.dias || []).includes(dsem)) || tipos[0] || {}).id;

    const hist = await api(`registros_diarios?select=fecha,bloques,porciones_hidratos,aceite_cdas&cliente_id=eq.${cliente.id}&order=fecha.desc&limit=14`);
    const deHoy = hist.find((r) => r.fecha === fecha);
    let st = Object.assign({ p: 0, h: 0, o: 0, log: [] }, (deHoy && deHoy.bloques) || {});
    const soloLectura = estado.esCoach;

    APP.innerHTML = `
      ${bannerCoach(cliente)}
      <div class="head">
        <div class="eyebrow">${esc(fechaCorta(fecha))} · ${esc(plan.nombre)}</div>
        <h1>Hola, ${esc((cliente.nombre || "").split(" ")[0])}.</h1>
      </div>
      <section class="card">
        <div class="head"><div class="eyebrow">Tu contador de hoy</div><h2>Sumá a medida que comés</h2>
          <p class="lede">${soloLectura ? "Vista de coach: el contador es de solo lectura." : "Tocá lo que comiste y las barras se llenan. Se guarda solo y le llega a Juanba."}</p></div>
        <div class="counter"><div class="meters" id="meters"></div><div class="adds" id="adds"></div></div>
        <div class="row-actions">${soloLectura ? "" : '<button class="linkbtn" type="button" id="deshacer">Deshacer el último</button>'}<span class="status" id="sync" role="status"></span></div>
      </section>
      <section class="card">
        <div class="head"><div class="eyebrow">Estructura del día</div><h2>Cuántos bloques en cada comida</h2></div>
        <div class="tabs" role="tablist" id="tabs"></div>
        <div class="key"><span><i style="background:var(--mus)"></i>${esc(cont.etiquetas?.p || "Bloque de proteína")}</span><span><i style="background:var(--bone)"></i>${esc(cont.etiquetas?.h || "Porción de hidratos")}</span></div>
        <div id="timeline"></div>
      </section>
      <section class="card">
        <div class="head"><div class="eyebrow">Últimos 14 días</div><h2>Tu registro</h2></div>
        <div class="tbl" id="hist"></div>
      </section>`;

    const M = [["p", cont.etiquetas?.p || "Bloques de proteína"], ["h", cont.etiquetas?.h || "Porciones de hidratos"], ["o", cont.etiquetas?.o || "Cucharadas de aceite"]];
    function dibujarMetros() {
      document.getElementById("meters").innerHTML = M.map(([k, lab]) => {
        const v = st[k] || 0, g = cont.metas[k] || 0, n = Math.max(g, Math.ceil(v));
        const cells = Array.from({ length: n }, (_, i) => {
          let c = "";
          if (i + 1 <= v) c = i >= g && k !== "p" ? "over" : "on";
          else if (i < v) c = "half";
          return `<span class="cell ${c}"></span>`;
        }).join("");
        return `<div class="meter"><div class="top2"><b>${esc(lab)}</b><span>${fmt(v, v % 1 ? 1 : 0)} / ${g}</span></div><div class="cells ${k}" style="grid-template-columns:repeat(${n},minmax(0,1fr))">${cells}</div></div>`;
      }).join("") + `<p class="small muted" aria-live="polite">${st.log.length ? "Último: " + esc(st.log[st.log.length - 1]) : "Todavía no sumaste nada hoy."}</p>`;
    }
    const adds = document.getElementById("adds");
    adds.innerHTML = (cont.botones || []).map((g, gi) => `<div class="grp"><span>${esc(g.grupo)}</span><div class="chips">${
      g.items.map((it, ii) => `<button class="add" type="button" data-g="${gi}" data-i="${ii}" ${soloLectura ? "disabled" : ""}>+ ${esc(it.n)}</button>`).join("")}</div></div>`).join("");

    let tmr = null;
    const sync = document.getElementById("sync");
    function guardar() {
      clearTimeout(tmr);
      sync.textContent = "Guardando…";
      tmr = setTimeout(async () => {
        try {
          await api("registros_diarios?on_conflict=cliente_id,fecha", {
            method: "POST", prefer: "resolution=merge-duplicates,return=minimal",
            body: { cliente_id: cliente.id, plan_id: plan.id, fecha, bloques: st, porciones_hidratos: st.h, aceite_cdas: st.o },
          });
          sync.textContent = "Guardado.";
          const fila = hist.find((r) => r.fecha === fecha);
          if (fila) fila.bloques = { ...st }; else hist.unshift({ fecha, bloques: { ...st } });
          dibujarHist();
        } catch (e) { sync.textContent = "No se pudo guardar (" + e.message + "). Se reintenta con el próximo toque."; }
      }, 600);
    }
    if (!soloLectura) {
      adds.addEventListener("click", (ev) => {
        const b = ev.target.closest("button.add"); if (!b) return;
        const it = cont.botones[b.dataset.g].items[b.dataset.i];
        const k = cont.botones[b.dataset.g].clave;
        st[k] = Math.round(((st[k] || 0) + (it.q ?? 1)) * 2) / 2;
        st.log = [...st.log, it.n].slice(-40);
        st.ult = [...(st.ult || []), [k, it.q ?? 1]].slice(-40);
        dibujarMetros(); guardar();
      });
      document.getElementById("deshacer").addEventListener("click", () => {
        const u = (st.ult || []).pop(); if (!u) return;
        st[u[0]] = Math.max(0, Math.round((st[u[0]] - u[1]) * 2) / 2);
        st.log.pop(); dibujarMetros(); guardar();
      });
    }

    const tabs = document.getElementById("tabs");
    function dibujarDia() {
      tabs.innerHTML = tipos.map((t) => `<button class="tab" type="button" role="tab" data-k="${esc(t.id)}" aria-selected="${t.id === tipo}">${esc(t.nombre)}</button>`).join("");
      const t = tipos.find((x) => x.id === tipo) || tipos[0];
      if (!t) { document.getElementById("timeline").innerHTML = ""; return; }
      let pb = 0, hb = 0;
      document.getElementById("timeline").innerHTML = t.comidas.map((s) => {
        pb += s.p || 0; hb += s.h || 0;
        return `<div class="slot"><div class="hr">${esc(s.hora)}</div><div class="what"><b>${esc(s.titulo)}</b><span>${esc(s.detalle)}</span></div>
          <div class="blocks" aria-label="${s.p || 0} bloques de proteína y ${s.h || 0} porciones de hidratos">${'<span class="blk"></span>'.repeat(s.p || 0)}${'<span class="blk hc"></span>'.repeat(s.h || 0)}</div></div>`;
      }).join("") + `<div class="slot"><div class="hr">Total</div><div class="what"><b>${pb} bloques · ${hb} porciones de hidratos</b></div><div></div></div>`;
    }
    tabs.addEventListener("click", (ev) => {
      const b = ev.target.closest("button.tab"); if (!b) return;
      tipo = b.dataset.k; store.set(kTab + "." + fecha, tipo); dibujarDia();
    });

    function dibujarHist() {
      const el = document.getElementById("hist");
      if (!hist.length) { el.innerHTML = `<table><tbody><tr><td class="wrap-cell muted">Todavía no hay días registrados. El primero aparece apenas sumes algo.</td></tr></tbody></table>`; return; }
      const gp = cont.metas.p;
      el.innerHTML = `<table><thead><tr><th>Día</th><th>Proteína</th><th>Hidratos</th><th>Aceite</th><th>Estado</th></tr></thead><tbody>` +
        hist.map((r) => {
          const b = r.bloques || {}, p = b.p || 0;
          const cls = p >= gp ? "good" : p >= gp - 1 ? "warn" : "crit", txt = p >= gp ? "Cumplido" : p >= gp - 1 ? "Cerca" : "Incompleto";
          return `<tr><td>${esc(fechaCorta(r.fecha))}</td><td class="num">${fmt(p, p % 1 ? 1 : 0)} / ${gp}</td><td class="num">${fmt(b.h || 0, (b.h || 0) % 1 ? 1 : 0)}</td><td class="num">${fmt(b.o || 0, (b.o || 0) % 1 ? 1 : 0)}</td><td><span class="pill ${cls}">${txt}</span></td></tr>`;
        }).join("") + `</tbody></table>`;
    }
    dibujarMetros(); dibujarDia(); dibujarHist();
  }

  /* ---------- PLAN ---------- */
  async function vistaPlan(cliente) {
    const plan = await planActivo(cliente.id);
    if (!plan) { APP.innerHTML = bannerCoach(cliente) + `<section class="card"><h2>Todavía no hay un plan activo</h2></section>`; return; }
    const B = plan.bloques || {};
    const T = [
      ["Calorías", plan.kcal_objetivo, "kcal", B.notas_metas?.kcal],
      ["Proteína", plan.proteina_objetivo_g, "g", B.notas_metas?.proteina, "var(--mus)"],
      ["Hidratos", plan.carbohidratos_objetivo_g, "g", B.notas_metas?.hidratos, "var(--bone)"],
      ["Grasas", plan.grasas_objetivo_g, "g", B.notas_metas?.grasas, "var(--res)"],
    ];
    const tabla = (cols, filas) => `<div class="tbl"><table><thead><tr>${cols.map((c) => `<th>${esc(c)}</th>`).join("")}</tr></thead><tbody>${filas}</tbody></table></div>`;
    const TAG = { base: "Base", oca: "Ocasional", finde: "Finde, 1 vez" };
    APP.innerHTML = `
      ${bannerCoach(cliente)}
      <div class="head"><div class="eyebrow">${esc(B.fase || "Plan vigente")} · desde ${esc(plan.vigente_desde?.split("-").reverse().join("/"))}</div>
        <h1>${esc(B.titulo || plan.nombre)}${B.titulo_destacado ? `<br><em>${esc(B.titulo_destacado)}</em>` : ""}</h1>
        ${B.bajada ? `<p class="lede">${esc(B.bajada)}</p>` : ""}</div>
      <div class="kpis">${T.map(([l, v, u, s, c]) => `<div class="kpi"><div class="eyebrow">${c ? `<span class="sw" style="background:${c}"></span>` : ""}${l}</div><div class="v">${v ?? "–"}<small>${u}</small></div>${s ? `<div class="d">${esc(s)}</div>` : ""}</div>`).join("")}</div>
      ${B.intercambios_proteina ? `<section class="card"><div class="head"><div class="eyebrow">Intercambios de proteína</div><h2>Qué cuenta como un bloque</h2>${B.nota_intercambios ? `<p class="lede">${esc(B.nota_intercambios)}</p>` : ""}</div>
        ${tabla(["Alimento", "1 bloque", "kcal", "Grasa", "Uso"], B.intercambios_proteina.map((p) => `<tr><td class="wrap-cell">${esc(p.n)}</td><td class="num">${esc(p.cant)}</td><td class="num">${p.kcal}</td><td class="num">${p.g} g</td><td><span class="tag ${esc(p.uso)}">${TAG[p.uso] || esc(p.uso)}</span></td></tr>`).join(""))}</section>` : ""}
      ${B.porciones_hidratos ? `<section class="card"><div class="head"><div class="eyebrow">Hidratos</div><h2>Qué cuenta como una porción</h2></div>
        ${tabla(["Alimento", "1 porción", "kcal"], B.porciones_hidratos.map((h) => `<tr><td class="wrap-cell">${esc(h.n)}</td><td class="num">${esc(h.cant)}</td><td class="num">${h.kcal}</td></tr>`).join(""))}</section>` : ""}
      ${B.textos ? `<section class="card"><div class="grid2">${B.textos.map((t) => `<div class="box"><b>${esc(t.t)}</b><span>${esc(t.d)}</span></div>`).join("")}</div></section>` : ""}
      ${B.reglas ? `<section class="card"><div class="head"><div class="eyebrow">Las reglas de la fase</div><h2>${B.reglas.length} reglas que no se negocian</h2></div>
        <div class="grid2">${B.reglas.map((r, i) => `<div class="box"><b>${i + 1}. ${esc(r.t)}</b><span>${esc(r.d)}</span></div>`).join("")}</div></section>` : ""}
      <footer class="foot">${esc(B.pie || "Este plan no reemplaza una indicación médica.")}</footer>`;
  }

  /* ---------- INFORME de composición ---------- */
  const NS = "http://www.w3.org/2000/svg";
  function el(tag, attrs, parent) { const e = document.createElementNS(NS, tag); for (const k in attrs) { if (k === "text") e.textContent = attrs[k]; else e.setAttribute(k, attrs[k]); } if (parent) parent.appendChild(e); return e; }

  async function vistaInforme(cliente) {
    const M = await api(`mediciones?select=*&cliente_id=eq.${cliente.id}&order=numero.asc`);
    if (!M.length) { APP.innerHTML = bannerCoach(cliente) + `<section class="card"><h2>Todavía no hay mediciones</h2><p class="lede">Tu informe aparece acá después de la primera antropometría.</p></section>`; return; }
    M.forEach((m) => {
      const dt = new Date(m.fecha + "T12:00:00");
      m.lb = m.fecha.slice(8, 10) + "/" + m.fecha.slice(5, 7) + "/" + m.fecha.slice(2, 4);
      m.largo = dt.toLocaleDateString("es-AR", { day: "numeric", month: "long", year: "numeric" });
      m.mus = +m.masa_muscular_kg; m.fat = +m.masa_adiposa_kg; m.w = +m.peso_kg;
      m.am = m.mus ? m.fat / m.mus : null;
      m.cint = m.perimetros_cm?.cintura; m.cad = m.perimetros_cm?.cadera;
      m.s6 = ["triceps", "subescapular", "supraespinal", "abdominal", "muslo_medio", "pantorrilla"].reduce((a, k) => a + (+m.pliegues_mm?.[k] || 0), 0) || null;
    });
    const F = M[0], L = M[M.length - 1], P = M.length > 1 ? M[M.length - 2] : null;
    const K = [
      ["Masa muscular", "mus", "kg", 1, 1, "var(--mus)"], ["Masa adiposa", "fat", "kg", -1, 1, "var(--fat)"],
      ["Cociente adiposo / muscular", "am", "", -1, 3], ["Peso", "w", "kg", 0, 1, "var(--wt)"],
    ];
    const delta = (k, ref, dir, d, u, txt) => {
      if (!ref || ref === L) return "";
      const v = L[k] - ref[k], thr = d === 3 ? 0.005 : 0.25;
      return `<div class="d ${dir && Math.abs(v) >= thr && Math.sign(v) === dir ? "good" : ""}">${sgn(v, d)}${u ? " " + u : ""} ${txt}</div>`;
    };
    APP.innerHTML = `
      ${bannerCoach(cliente)}
      <div class="head"><div class="eyebrow">Composición corporal · ISAK · Kerr 5 masas</div>
        <h1>Medición #${L.numero}<br><em>${esc(L.largo)}</em></h1>
        <p class="lede">${M.length > 1 ? `Comparada con tu primera medición cargada (#${F.numero}, ${esc(F.largo)}) y con la anterior (#${P.numero}, ${esc(P.largo)}).` : "Tu primera medición: la base para comparar las próximas."}</p></div>
      <div class="kpis">${K.map(([lab, k, u, dir, d, c]) => `<div class="kpi"><div class="eyebrow">${c ? `<span class="sw" style="background:${c}"></span>` : ""}${lab}</div><div class="v">${fmt(L[k], d)}${u ? `<small>${u}</small>` : ""}</div>${delta(k, F, dir, d, u, "vs #" + F.numero)}${delta(k, P, dir, d, u, "vs anterior")}</div>`).join("")}</div>
      ${M.length > 1 ? `<section class="card"><div class="head"><div class="eyebrow">La tendencia</div><h2>Cambio acumulado desde la medición #${F.numero}</h2><p class="lede">En kilos, respecto de la primera medición cargada.</p></div>
        <div class="legend"><span><i style="background:var(--mus)"></i>Masa muscular</span><span><i style="background:var(--fat)"></i>Masa adiposa</span><span><i style="background:var(--wt)"></i>Peso</span></div>
        <div class="chart" id="ch-cambio"></div></section>` : ""}
      <section class="card"><div class="head"><div class="eyebrow">De qué estás hecho</div><h2>Fraccionamiento en 5 masas</h2></div>
        <div class="legend"><span><i style="background:var(--mus)"></i>Muscular</span><span><i style="background:var(--fat)"></i>Adiposa</span><span><i style="background:var(--res)"></i>Residual</span><span><i style="background:var(--bone)"></i>Ósea</span><span><i style="background:var(--skin)"></i>Piel</span></div>
        <div class="chart" id="ch-comp"></div></section>
      <section class="card"><div class="head"><div class="eyebrow">Anexo</div><h2>Todos los datos</h2></div><div class="tbl" id="tb-all"></div></section>
      <footer class="foot">Mediciones según protocolo ISAK. Este informe describe composición corporal y no constituye un diagnóstico médico.</footer>`;

    // Cambio acumulado (líneas)
    if (M.length > 1) {
      const host = document.getElementById("ch-cambio"), W = Math.min(900, Math.max(320, host.clientWidth || 900)), H = W < 600 ? 240 : 300, m = { t: 14, r: W < 600 ? 92 : 120, b: 32, l: 34 };
      const svg = el("svg", { viewBox: `0 0 ${W} ${H}`, role: "img", "aria-label": "Cambio acumulado de masa muscular, adiposa y peso" }, host);
      const ser = [["mus", "Músculo", "var(--mus)"], ["fat", "Grasa", "var(--fat)"], ["w", "Peso", "var(--wt)"]];
      const vals = ser.flatMap(([k]) => M.map((p) => p[k] - F[k]));
      let y0 = Math.floor(Math.min(0, ...vals)), y1 = Math.ceil(Math.max(0, ...vals)); if (y1 - y0 < 2) { y0 -= 1; y1 += 1; }
      const x = (i) => m.l + (i / (M.length - 1)) * (W - m.l - m.r), y = (v) => m.t + (1 - (v - y0) / (y1 - y0)) * (H - m.t - m.b);
      for (let v = y0; v <= y1; v++) { el("line", { x1: m.l, x2: W - m.r, y1: y(v), y2: y(v), style: `stroke:${v === 0 ? "var(--axis)" : "var(--grid)"}` }, svg); el("text", { x: m.l - 8, y: y(v) + 4, "text-anchor": "end", text: (v > 0 ? "+" : v < 0 ? "−" : "") + Math.abs(v) }, svg); }
      M.forEach((p, i) => el("text", { x: x(i), y: H - 10, "text-anchor": "middle", text: W < 600 ? p.lb.slice(0, 5) : p.lb }, svg));
      const ends = [];
      ser.forEach(([k, n, c]) => {
        const pts = M.map((p, i) => [x(i), y(p[k] - F[k])]);
        el("path", { d: "M" + pts.map((q) => q.join(",")).join("L"), style: `fill:none;stroke:${c};stroke-width:${k === "w" ? 2 : 2.5};${k === "w" ? "stroke-dasharray:6 5;" : ""}stroke-linejoin:round` }, svg);
        pts.forEach((q, i) => el("circle", { cx: q[0], cy: q[1], r: i === pts.length - 1 ? 5 : 3.5, style: `fill:${c};stroke:var(--surface);stroke-width:2` }, svg));
        ends.push({ y: pts[pts.length - 1][1], t: `${n} ${sgn(L[k] - F[k])}` });
      });
      ends.sort((a, b) => a.y - b.y).forEach((e, i, arr) => { if (i && e.y - arr[i - 1].y < 15) e.y = arr[i - 1].y + 15; el("text", { x: x(M.length - 1) + 10, y: e.y + 4, class: "strong", text: e.t }, svg); });
    }
    // Composición (barras apiladas)
    {
      const comps = [["masa_muscular_kg", "var(--mus)"], ["masa_adiposa_kg", "var(--fat)"], ["masa_residual_kg", "var(--res)"], ["masa_osea_kg", "var(--bone)"], ["masa_piel_kg", "var(--skin)"]];
      const host = document.getElementById("ch-comp"), W = Math.min(900, Math.max(320, host.clientWidth || 900)), rowH = 48, H = M.length * rowH + 10, l = 72, r = 8;
      const svg = el("svg", { viewBox: `0 0 ${W} ${H}`, role: "img", "aria-label": "Composición en kilos por medición" }, host);
      const max = Math.max(...M.map((p) => comps.reduce((a, [k]) => a + (+p[k] || 0), 0)));
      const xs = (v) => (v / max) * (W - l - r);
      M.forEach((p, i) => {
        const cy = 5 + i * rowH + rowH / 2; let acc = 0;
        el("text", { x: l - 10, y: cy - 2, "text-anchor": "end", class: "strong", text: "#" + p.numero }, svg);
        el("text", { x: l - 10, y: cy + 13, "text-anchor": "end", text: fmt(p.w) + " kg" }, svg);
        comps.forEach(([k, c], j) => {
          const v = +p[k] || 0, w = xs(v), x0 = l + xs(acc);
          el("rect", { x: x0 + (j ? 1 : 0), y: cy - 15, width: Math.max(0, w - (j ? 2 : 0)), height: 30, style: `fill:${c}` }, svg);
          if (w > 34) el("text", { x: x0 + w / 2, y: cy + 4, "text-anchor": "middle", text: fmt(v), style: "fill:#fff;font-size:11.5px;font-weight:500" }, svg);
          acc += v;
        });
      });
    }
    // Tabla de datos
    {
      const plie = [["triceps", "Tríceps"], ["subescapular", "Subescapular"], ["supraespinal", "Supraespinal"], ["abdominal", "Abdominal"], ["muslo_medio", "Muslo medio"], ["pantorrilla", "Pantorrilla"]];
      const per = [["brazo_relajado", "Brazo relajado"], ["brazo_flexionado", "Brazo flexionado"], ["cintura", "Cintura mínima"], ["cadera", "Cadera máxima"], ["muslo_medio", "Muslo medio"], ["pantorrilla", "Pantorrilla"]];
      const rows = [
        ["g", "Básicos"], ["Peso (kg)", (p) => p.w, 1], ["Talla (cm)", (p) => +p.talla_cm, 1],
        ["g", "Fraccionamiento 5 masas (kg)"], ["Muscular", (p) => p.mus, 1], ["Adiposa", (p) => p.fat, 1], ["Residual", (p) => +p.masa_residual_kg, 1], ["Ósea", (p) => +p.masa_osea_kg, 1], ["Piel", (p) => +p.masa_piel_kg, 1],
        ["g", "Índices"], ["% muscular", (p) => (100 * p.mus) / p.w, 1], ["% adiposo", (p) => (100 * p.fat) / p.w, 1], ["Cociente adiposo/muscular", (p) => p.am, 3], ["Índice cintura/cadera", (p) => (p.cint && p.cad ? p.cint / p.cad : null), 3],
        ["g", "Pliegues (mm)"], ...plie.map(([k, n]) => [n, (p) => (p.pliegues_mm?.[k] == null ? null : +p.pliegues_mm[k]), 1]), ["Σ6 pliegues", (p) => p.s6, 1],
        ["g", "Perímetros (cm)"], ...per.map(([k, n]) => [n, (p) => (p.perimetros_cm?.[k] == null ? null : +p.perimetros_cm[k]), 1]),
      ];
      document.getElementById("tb-all").innerHTML = `<table><thead><tr><th>Variable</th>${M.map((p) => `<th>#${p.numero} · ${esc(p.lb)}</th>`).join("")}</tr></thead><tbody>` +
        rows.map((r) => r[0] === "g" ? `<tr class="grp-row"><td colspan="${M.length + 1}">${esc(r[1])}</td></tr>` : `<tr><td>${esc(r[0])}</td>${M.map((p) => `<td class="num">${fmt(r[1](p), r[2])}</td>`).join("")}</tr>`).join("") + `</tbody></table>`;
    }
  }

  /* ---------- PANEL DEL COACH ---------- */
  async function vistaCoach() {
    APP.innerHTML = `<p class="muted">Cargando clientes…</p>`;
    const desde = hoyISO(-13);
    const [regs, planes] = await Promise.all([
      api(`registros_diarios?select=cliente_id,fecha,bloques&fecha=gte.${desde}&order=fecha.desc`),
      api(`planes?select=id,cliente_id,nombre,bloques&activo=is.true`),
    ]);
    const dias = Array.from({ length: 14 }, (_, i) => hoyISO(i - 13));
    const filas = estado.clientes.map((c) => {
      const plan = planes.find((p) => p.cliente_id === c.id);
      const meta = plan?.bloques?.contador?.metas?.p ?? 7;
      const rs = regs.filter((r) => r.cliente_id === c.id);
      const porDia = Object.fromEntries(rs.map((r) => [r.fecha, r.bloques?.p || 0]));
      const ult7 = dias.slice(-8, -1), cumplidos = ult7.filter((d) => (porDia[d] ?? -1) >= meta).length, registrados = ult7.filter((d) => d in porDia).length;
      const dots = dias.map((d) => { const v = porDia[d]; const esHoy = d === dias[dias.length - 1]; const cls = v == null ? "" : v >= meta ? "good" : esHoy ? "hoy" : v >= meta - 1 ? "warn" : "crit"; return `<span class="dot ${cls}${esHoy ? " today" : ""}" title="${esc(fechaCorta(d))}: ${v == null ? "sin registro" : fmt(v, v % 1 ? 1 : 0) + " / " + meta}"></span>`; }).join("");
      return { c, plan, cumplidos, registrados, dots, ultimo: rs[0]?.fecha };
    });
    APP.innerHTML = `
      <div class="head"><div class="eyebrow">Panel del coach · ${esc(fechaCorta(hoyISO()))}</div><h1>Clientes</h1>
        <p class="lede">Adherencia de los últimos 14 días: verde = proteína cumplida, amarillo = a 1 bloque, rojo = incompleto, gris = sin registro. El último cuadrado es hoy, todavía en curso.</p></div>
      <section class="card">
        ${filas.length ? `<div class="tbl"><table><thead><tr><th>Cliente</th><th>Plan activo</th><th>Últimos 14 días</th><th>Últimos 7 días cerrados</th><th>Último registro</th><th>Consentimiento</th></tr></thead><tbody>${
          filas.map((f) => `<tr class="link" data-id="${f.c.id}" tabindex="0"><td><b>${esc(f.c.nombre)}</b><br><span class="small muted">${esc(f.c.email)}</span></td>
            <td class="wrap-cell">${f.plan ? esc(f.plan.nombre) : '<span class="muted">sin plan</span>'}</td>
            <td><div class="dots">${f.dots}</div></td>
            <td class="num">${f.cumplidos}/7 <span class="small muted">(${f.registrados} reg.)</span></td>
            <td class="num">${f.ultimo ? esc(fechaCorta(f.ultimo)) : "–"}</td>
            <td>${f.c.consentimiento_at ? '<span class="pill good">Aceptado</span>' : '<span class="pill warn">Pendiente</span>'}</td></tr>`).join("")
        }</tbody></table></div>` : `<p class="lede">Todavía no hay clientes cargados.</p>`}
        <p class="small muted">Para ver el plan, el registro o el informe de un cliente, tocá su fila.</p>
      </section>`;
    APP.querySelectorAll("tr.link").forEach((tr) => {
      const go = () => (location.hash = "#/hoy/" + tr.dataset.id);
      tr.addEventListener("click", go);
      tr.addEventListener("keydown", (e) => { if (e.key === "Enter") go(); });
    });
  }

  render();
})();
