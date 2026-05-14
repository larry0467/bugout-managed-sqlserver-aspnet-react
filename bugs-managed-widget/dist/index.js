import { jsxs as n, Fragment as Pe, jsx as t } from "react/jsx-runtime";
import { useRef as v, useState as p, useCallback as ne, useEffect as be } from "react";
const st = "bom-draft", M = "chunks";
let ie = null;
function ye() {
  return ie || (ie = new Promise((_, x) => {
    const u = indexedDB.open(st, 1);
    u.onupgradeneeded = () => u.result.createObjectStore(M, { autoIncrement: !0 }), u.onsuccess = () => _(u.result), u.onerror = () => {
      ie = null, x(u.error);
    };
  })), ie;
}
function at(_) {
  ye().then((x) => {
    x.transaction(M, "readwrite").objectStore(M).add(_);
  }).catch(() => {
  });
}
function lt() {
  return ye().then(
    (_) => new Promise((x) => {
      const u = _.transaction(M, "readonly").objectStore(M).getAll();
      u.onsuccess = () => x(u.result), u.onerror = () => x([]);
    })
  ).catch(() => []);
}
function se() {
  ye().then((_) => {
    _.transaction(M, "readwrite").objectStore(M).clear();
  }).catch(() => {
  });
}
const ct = [
  { value: "BUG", label: "Bug Report" },
  { value: "FEATURE_REQUEST", label: "Feature Request" },
  { value: "QUESTION", label: "Question" }
], dt = [
  { value: "LOW", label: "Low" },
  { value: "MEDIUM", label: "Medium" },
  { value: "HIGH", label: "High" },
  { value: "CRITICAL", label: "Critical" }
], ft = (_) => {
  const {
    apiKey: x,
    apiUrl: u,
    userEmail: Fe,
    userName: Ne,
    theme: He = "dark",
    position: Xe = "bottom-right",
    orbSize: Ye = 24,
    // Bug Out's identity is amber/orange ("we caught a bug" — warm, high contrast).
    // Hosts can override; if they do, we treat [0]=core, [1]=ring.
    orbColors: g = ["#fbbf24", "#fb923c"],
    // Tenant context
    tenantId: ve,
    tenantName: xe,
    databaseName: we,
    appVersion: ke,
    environment: Se,
    onApiReady: H,
    hideOrb: qe = !1
  } = _, Ve = v(
    `bom-orb-${Math.random().toString(36).slice(2, 9)}`
  ), [X, b] = p(!1), [W, Re] = p(!1), [Ge, Y] = p(!1), [C, L] = p(null), [Ke, q] = p(!1), [Je, O] = p(!1), [ae, _e] = p(""), [V, Te] = p("BUG"), [ze, Ce] = p("MEDIUM"), [le, Me] = p(""), [Oe, Be] = p(""), [$, ce] = p(!1), [Qe, de] = p(!1), [Ee, G] = p(""), [Ze, et] = p(!1), [K, Ue] = p(null), [Ie, D] = p(null), [J, We] = p(null), [j, Q] = p(!1), [Z, pe] = p([]), [tt, ue] = p([]), fe = ne((e) => {
    e.length !== 0 && (pe((o) => [...o, ...e]), ue((o) => [
      ...o,
      ...e.map((r) => r.type.startsWith("image/") ? URL.createObjectURL(r) : null)
    ]));
  }, []), ot = ne((e) => {
    pe((o) => o.filter((r, a) => a !== e)), ue((o) => {
      const r = o[e];
      return r && URL.revokeObjectURL(r), o.filter((a, s) => s !== e);
    });
  }, []), [Le, A] = p(null), [B, $e] = p(() => ({
    top: 24,
    left: typeof window < "u" ? Math.max(24, window.innerWidth - 280) : 24
  })), w = v(null), ee = v(null), E = v([]), U = v(null), he = v([]), me = v(null), te = v(null), P = v(null), f = v([]), h = v([]);
  be(() => {
    H == null || H({ open: () => b(!0), close: () => b(!1) });
  }, [H]), be(() => {
    lt().then((e) => {
      if (e.length === 0) return;
      const o = new Blob(e, { type: "video/webm" });
      E.current = e, L(o), A(URL.createObjectURL(o)), q(!0), O(!0);
    });
  }, []), be(() => {
    if (et(/Android|iPhone|iPad|iPod/i.test(navigator.userAgent)), !P.current) {
      const i = document.createElement("style");
      i.textContent = `
        @keyframes bom-fade-in {
          from { opacity: 0; transform: translateY(10px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes bom-pulse {
          0%   { box-shadow: 0 0 0 0 rgba(229,57,53,0.6); }
          70%  { box-shadow: 0 0 0 8px rgba(229,57,53,0); }
          100% { box-shadow: 0 0 0 0 rgba(229,57,53,0); }
        }
        @keyframes bom-orb-spin {
          from { transform: rotate(0deg); }
          to   { transform: rotate(360deg); }
        }
        @keyframes bom-orb-core {
          0%, 100% { transform: scale(1);    opacity: 0.92; }
          50%      { transform: scale(1.06); opacity: 1;    }
        }
        @keyframes bom-orb-halo {
          0%, 100% { opacity: 0.85; }
          50%      { opacity: 1;    }
        }
        @keyframes bom-orb-scan {
          0%   { transform: translateY(-60%); opacity: 0;   }
          20%  { opacity: 0.9; }
          80%  { opacity: 0.9; }
          100% { transform: translateY(60%);  opacity: 0;   }
        }
        .bom-orb-wrap {
          position: fixed;
          z-index: 999999;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          background: transparent;
          border: 0;
          padding: 0;
          cursor: pointer;
          outline: none;
        }
        .bom-orb-wrap:focus-visible {
          box-shadow: 0 0 0 3px rgba(251, 191, 36, 0.55);
          border-radius: 50%;
        }
        .bom-orb {
          position: relative;
          width: 100%;
          height: 100%;
          border-radius: 50%;
          filter:
            drop-shadow(0 0 2px var(--bom-halo))
            drop-shadow(0 0 12px var(--bom-halo))
            drop-shadow(0 0 28px var(--bom-halo));
          transition: filter 220ms ease-out;
        }
        .bom-orb-wrap:hover .bom-orb {
          filter:
            drop-shadow(0 0 3px var(--bom-halo))
            drop-shadow(0 0 18px var(--bom-halo))
            drop-shadow(0 0 36px var(--bom-halo));
        }
        .bom-orb__svg { display: block; width: 100%; height: 100%; }
        .bom-orb__halo {
          animation: bom-orb-halo var(--bom-pulse, 4s) ease-in-out infinite;
          transform-origin: 50% 50%;
        }
        .bom-orb__core {
          transform-origin: 50% 50%;
          animation: bom-orb-core var(--bom-pulse, 4s) ease-in-out infinite;
        }
        .bom-orb__spin-cw {
          transform-origin: 50% 50%;
          animation: bom-orb-spin var(--bom-spin, 18s) linear infinite;
        }
        .bom-orb__spin-ccw {
          transform-origin: 50% 50%;
          animation: bom-orb-spin var(--bom-spin, 18s) linear infinite reverse;
        }
        .bom-orb__spin-cw-fast {
          transform-origin: 50% 50%;
          animation: bom-orb-spin calc(var(--bom-spin, 18s) / 3) linear infinite;
        }
        .bom-orb-wrap:hover .bom-orb__spin-cw,
        .bom-orb-wrap:hover .bom-orb__spin-ccw {
          animation-duration: calc(var(--bom-spin, 18s) / 2);
        }
        .bom-orb-wrap:hover .bom-orb__core,
        .bom-orb-wrap:hover .bom-orb__halo {
          animation-duration: calc(var(--bom-pulse, 4s) / 1.6);
        }
        .bom-orb__scan {
          position: absolute;
          inset: 8% 18%;
          border-radius: 50%;
          pointer-events: none;
          background: linear-gradient(
            to bottom,
            transparent 0%,
            rgba(255, 247, 220, 0) 40%,
            rgba(255, 247, 220, 0.22) 50%,
            rgba(255, 247, 220, 0) 60%,
            transparent 100%
          );
          mix-blend-mode: screen;
          animation: bom-orb-scan calc(var(--bom-pulse, 4s) * 1.4) ease-in-out infinite;
        }
        @media (prefers-reduced-motion: reduce) {
          .bom-orb__spin-cw,
          .bom-orb__spin-ccw,
          .bom-orb__spin-cw-fast,
          .bom-orb__core,
          .bom-orb__halo,
          .bom-orb__scan { animation: none !important; }
        }
      `, document.head.appendChild(i), P.current = i;
    }
    const e = console.error;
    console.error = (...i) => {
      f.current.push({
        type: "console.error",
        message: i.map((l) => typeof l == "object" ? JSON.stringify(l) : String(l)).join(" "),
        timestamp: (/* @__PURE__ */ new Date()).toISOString()
      }), f.current.length > 50 && f.current.shift(), e.apply(console, i);
    };
    const o = (i) => {
      f.current.push({
        type: "window.onerror",
        message: i.message,
        source: i.filename,
        line: i.lineno,
        col: i.colno,
        timestamp: (/* @__PURE__ */ new Date()).toISOString()
      }), f.current.length > 50 && f.current.shift();
    };
    window.addEventListener("error", o);
    const r = (i) => {
      var l;
      f.current.push({
        type: "unhandledrejection",
        message: ((l = i.reason) == null ? void 0 : l.message) || String(i.reason),
        timestamp: (/* @__PURE__ */ new Date()).toISOString()
      }), f.current.length > 50 && f.current.shift();
    };
    window.addEventListener("unhandledrejection", r);
    const a = window.fetch;
    window.fetch = async (...i) => {
      var c;
      const l = typeof i[0] == "string" ? i[0] : i[0].url, T = (((c = i[1]) == null ? void 0 : c.method) || "GET").toUpperCase();
      try {
        const m = await a.apply(window, i);
        return !m.ok && !l.includes(u) && (h.current.push({
          method: T,
          url: l,
          status: m.status,
          statusText: m.statusText,
          timestamp: (/* @__PURE__ */ new Date()).toISOString()
        }), h.current.length > 30 && h.current.shift()), m;
      } catch (m) {
        throw l.includes(u) || (h.current.push({
          method: T,
          url: l,
          status: 0,
          statusText: m.message || "Network Error",
          timestamp: (/* @__PURE__ */ new Date()).toISOString()
        }), h.current.length > 30 && h.current.shift()), m;
      }
    };
    const s = XMLHttpRequest.prototype.open, d = XMLHttpRequest.prototype.send;
    return XMLHttpRequest.prototype.open = function(i, l, ...T) {
      return this._bomMethod = i, this._bomUrl = String(l), s.apply(this, [i, l, ...T]);
    }, XMLHttpRequest.prototype.send = function(...i) {
      return this.addEventListener("loadend", () => {
        var l;
        this.status >= 400 && !((l = this._bomUrl) != null && l.includes(u)) && (h.current.push({
          method: this._bomMethod || "GET",
          url: this._bomUrl || "",
          status: this.status,
          statusText: this.statusText,
          timestamp: (/* @__PURE__ */ new Date()).toISOString()
        }), h.current.length > 30 && h.current.shift());
      }), d.apply(this, i);
    }, () => {
      P.current && (document.head.removeChild(P.current), P.current = null), console.error = e, window.removeEventListener("error", o), window.removeEventListener("unhandledrejection", r), window.fetch = a, XMLHttpRequest.prototype.open = s, XMLHttpRequest.prototype.send = d;
    };
  }, [u]);
  const I = He === "dark", oe = I ? "#1a1a2e" : "#ffffff", k = I ? "#e0e0e0" : "#333333", y = I ? "#333" : "#ddd", F = I ? "#16213e" : "#f5f5f5", rt = Xe === "bottom-left" ? { bottom: 24, left: 24 } : { bottom: 24, right: 24 }, ge = ne(async () => {
    try {
      const e = await navigator.mediaDevices.getDisplayMedia({
        // 'monitor' hints Chrome/Edge to pre-select "Entire Screen" in the picker.
        video: { displaySurface: "monitor" },
        // Passing only systemAudio:'include' — extra constraints alongside it
        // cause Chrome to silently ignore the pre-check.
        audio: { systemAudio: "include" }
      });
      let o = null;
      try {
        o = await navigator.mediaDevices.getUserMedia({ audio: !0, video: !1 });
      } catch {
      }
      me.current = o;
      const r = ((o == null ? void 0 : o.getAudioTracks().length) ?? 0) > 0, a = e.getAudioTracks().length > 0;
      if (!r && !a) {
        e.getTracks().forEach((c) => c.stop()), o == null || o.getTracks().forEach((c) => c.stop()), Y(!0), b(!1);
        return;
      }
      const s = r ? o.getAudioTracks() : e.getAudioTracks(), d = new MediaStream([...e.getVideoTracks(), ...s]), i = new MediaRecorder(d, {
        mimeType: MediaRecorder.isTypeSupported("video/webm;codecs=vp9") ? "video/webm;codecs=vp9" : "video/webm"
      });
      he.current = [], E.current.length === 0 && se(), i.ondataavailable = (c) => {
        c.data.size > 0 && (he.current.push(c.data), at(c.data));
      }, i.onstop = () => {
        var R;
        const c = [...E.current, ...he.current], m = new Blob(c, { type: "video/webm" });
        E.current = [], se(), L(m), A((z) => (z && URL.revokeObjectURL(z), URL.createObjectURL(m))), q(!1), O(!1), e.getTracks().forEach((z) => z.stop()), (R = me.current) == null || R.getTracks().forEach((z) => z.stop()), me.current = null;
      }, i.start(1e3), U.current = i;
      const l = () => {
        var c;
        ((c = U.current) == null ? void 0 : c.state) === "recording" && U.current.requestData();
      };
      window.addEventListener("beforeunload", l), ee.current = l, Re(!0), b(!1);
      const T = window.SpeechRecognition || window.webkitSpeechRecognition;
      if (T) {
        const c = new T();
        c.continuous = !0, c.interimResults = !0, c.lang = "en-US";
        let m = "";
        c.onresult = (R) => {
          let z = "";
          for (let N = R.resultIndex; N < R.results.length; N++)
            R.results[N].isFinal ? m += R.results[N][0].transcript + " " : z += R.results[N][0].transcript;
          _e(m + z);
        }, c.onerror = () => {
        }, c.start(), te.current = c;
      }
    } catch (e) {
      console.error("Failed to start recording:", e);
    }
  }, []), De = ne(() => {
    ee.current && (window.removeEventListener("beforeunload", ee.current), ee.current = null), U.current && U.current.state !== "inactive" && U.current.stop(), te.current && (te.current.stop(), te.current = null), Re(!1), b(!0);
  }, []), re = () => {
    Me(""), Be(""), Te("BUG"), Ce("MEDIUM"), _e(""), L(null), A((e) => (e && URL.revokeObjectURL(e), null)), Ue(null), pe([]), ue((e) => (e.forEach((o) => {
      o && URL.revokeObjectURL(o);
    }), [])), G(""), de(!1), D(null), We(null), Q(!1), q(!1), O(!1), Y(!1), E.current = [], se();
  }, nt = async () => {
    if (!le.trim()) {
      G("Title is required");
      return;
    }
    ce(!0), G("");
    try {
      const e = {
        title: le.trim(),
        description: Oe.trim(),
        ticketType: V,
        priority: ze,
        submittedBy: Fe || Ne || "Anonymous",
        currentPageUrl: window.location.href,
        currentPageName: document.title,
        browserInfo: navigator.userAgent,
        screenWidth: window.innerWidth,
        screenHeight: window.innerHeight,
        transcript: ae || null,
        consoleErrors: f.current.length > 0 ? JSON.stringify(f.current) : null,
        networkErrors: h.current.length > 0 ? JSON.stringify(h.current) : null
      };
      ve && (e.tenantId = ve), xe && (e.tenantName = xe), we && (e.databaseName = we), ke && (e.applicationVersion = ke), Se && (e.environment = Se);
      const o = await fetch(`${u}/tickets`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-BOM-API-Key": x
        },
        body: JSON.stringify(e)
      });
      if (!o.ok) throw new Error("Failed to submit ticket");
      const r = await o.json();
      if (Z.length > 0 && r.id)
        for (const s of Z)
          try {
            const d = new FormData();
            d.append("file", s, s.name || "screenshot.png");
            const i = await fetch(`${u}/tickets/${r.id}/attachments/widget`, {
              method: "POST",
              headers: { "X-BOM-API-Key": x },
              body: d
            });
            i.ok || console.warn(`[Bug Out] Screenshot upload failed (${i.status}) for ticket ${r.id}`);
          } catch (d) {
            console.warn("[Bug Out] Screenshot upload network error:", d);
          }
      const a = C || K;
      if (We(r.id), a && r.id) {
        const s = await Ae(r.id, a);
        if (s) {
          D(s), ce(!1);
          return;
        }
      }
      de(!0), setTimeout(() => {
        b(!1), re();
      }, 2e3);
    } catch (e) {
      G(e.message || "Failed to submit");
    } finally {
      ce(!1);
    }
  }, je = 200 * 1024 * 1024, Ae = async (e, o) => {
    if (o.size > je)
      return `Recording is ${(o.size / 1024 / 1024).toFixed(1)} MB — exceeds the ${je / 1024 / 1024} MB upload limit. Stop the recording sooner next time.`;
    Q(!0);
    let r = null;
    for (let a = 1; a <= 3; a++) {
      try {
        const s = new FormData();
        s.append("file", o, "recording.webm");
        const d = await fetch(`${u}/tickets/${e}/video`, {
          method: "POST",
          headers: { "X-BOM-API-Key": x },
          body: s
        });
        if (d.ok)
          return Q(!1), null;
        if (d.status >= 400 && d.status < 500 && d.status !== 408 && d.status !== 429) {
          const i = await d.text().catch(() => "");
          r = `Server rejected upload (${d.status}): ${i || d.statusText}`;
          break;
        }
        r = `Upload failed (${d.status}). Retrying…`;
      } catch (s) {
        r = s != null && s.message ? `Network error: ${s.message}. Retrying…` : "Network error. Retrying…";
      }
      a < 3 && await new Promise((s) => setTimeout(s, 1e3 * Math.pow(2, a - 1)));
    }
    return Q(!1), r || "Video upload failed after 3 attempts.";
  }, it = async () => {
    if (!J) return;
    const e = C || K;
    if (!e) return;
    D(null);
    const o = await Ae(J, e);
    o ? D(o) : (de(!0), setTimeout(() => {
      b(!1), re();
    }, 2e3));
  }, S = {
    padding: "8px 16px",
    border: "none",
    borderRadius: 6,
    cursor: "pointer",
    fontSize: 14,
    fontWeight: 600,
    transition: "opacity 0.2s"
  };
  return /* @__PURE__ */ n(Pe, { children: [
    !qe && (() => {
      const e = Ye * 2, o = g[0], r = g[1], a = `${o}8c`, s = Ve.current;
      return /* @__PURE__ */ t(
        "button",
        {
          type: "button",
          role: "button",
          "aria-label": "Report a bug",
          title: "Report a bug or request a feature",
          onClick: () => {
            X || re(), b(!X);
          },
          className: "bom-orb-wrap",
          style: {
            ...rt,
            width: e,
            height: e,
            "--bom-core": o,
            "--bom-ring": r,
            "--bom-halo": a,
            "--bom-spin": "18s",
            "--bom-pulse": "4s"
          },
          children: /* @__PURE__ */ n("span", { className: "bom-orb", children: [
            /* @__PURE__ */ n(
              "svg",
              {
                viewBox: "0 0 100 100",
                width: e,
                height: e,
                "aria-hidden": "true",
                className: "bom-orb__svg",
                children: [
                  /* @__PURE__ */ n("defs", { children: [
                    /* @__PURE__ */ n("radialGradient", { id: `${s}-core`, cx: "50%", cy: "50%", r: "50%", children: [
                      /* @__PURE__ */ t("stop", { offset: "0%", stopColor: o, stopOpacity: "1" }),
                      /* @__PURE__ */ t("stop", { offset: "55%", stopColor: o, stopOpacity: "0.55" }),
                      /* @__PURE__ */ t("stop", { offset: "100%", stopColor: "#1a0f00", stopOpacity: "0" })
                    ] }),
                    /* @__PURE__ */ n("radialGradient", { id: `${s}-iris`, cx: "50%", cy: "50%", r: "50%", children: [
                      /* @__PURE__ */ t("stop", { offset: "0%", stopColor: "#fff7dc", stopOpacity: "0.95" }),
                      /* @__PURE__ */ t("stop", { offset: "40%", stopColor: o, stopOpacity: "0.7" }),
                      /* @__PURE__ */ t("stop", { offset: "100%", stopColor: o, stopOpacity: "0" })
                    ] })
                  ] }),
                  /* @__PURE__ */ t(
                    "circle",
                    {
                      cx: "50",
                      cy: "50",
                      r: "48",
                      fill: `url(#${s}-core)`,
                      className: "bom-orb__halo"
                    }
                  ),
                  /* @__PURE__ */ n("g", { className: "bom-orb__spin-cw", children: [
                    /* @__PURE__ */ t(
                      "circle",
                      {
                        cx: "50",
                        cy: "50",
                        r: "44",
                        fill: "none",
                        stroke: r,
                        strokeOpacity: "0.55",
                        strokeWidth: "0.5"
                      }
                    ),
                    Array.from({ length: 36 }).map((d, i) => {
                      const l = i * 10 * Math.PI / 180, T = 50 + Math.cos(l) * 41, c = 50 + Math.sin(l) * 41, m = 50 + Math.cos(l) * (i % 3 === 0 ? 44 : 43), R = 50 + Math.sin(l) * (i % 3 === 0 ? 44 : 43);
                      return /* @__PURE__ */ t(
                        "line",
                        {
                          x1: T,
                          y1: c,
                          x2: m,
                          y2: R,
                          stroke: r,
                          strokeOpacity: i % 3 === 0 ? 0.8 : 0.35,
                          strokeWidth: "0.8"
                        },
                        i
                      );
                    })
                  ] }),
                  /* @__PURE__ */ n("g", { className: "bom-orb__spin-ccw", children: [
                    /* @__PURE__ */ t(
                      "circle",
                      {
                        cx: "50",
                        cy: "50",
                        r: "36",
                        fill: "none",
                        stroke: r,
                        strokeOpacity: "0.18",
                        strokeWidth: "0.5"
                      }
                    ),
                    /* @__PURE__ */ t(
                      "circle",
                      {
                        cx: "50",
                        cy: "50",
                        r: "36",
                        fill: "none",
                        stroke: r,
                        strokeOpacity: "0.85",
                        strokeWidth: "1.4",
                        strokeDasharray: "42 30 18 36 24 32",
                        strokeLinecap: "round"
                      }
                    )
                  ] }),
                  /* @__PURE__ */ t("g", { className: "bom-orb__spin-cw-fast", children: /* @__PURE__ */ t(
                    "circle",
                    {
                      cx: "50",
                      cy: "50",
                      r: "28",
                      fill: "none",
                      stroke: o,
                      strokeOpacity: "0.7",
                      strokeWidth: "0.9",
                      strokeDasharray: "2 4"
                    }
                  ) }),
                  /* @__PURE__ */ t(
                    "circle",
                    {
                      cx: "50",
                      cy: "50",
                      r: "20",
                      fill: `url(#${s}-iris)`,
                      className: "bom-orb__core"
                    }
                  ),
                  /* @__PURE__ */ n("g", { stroke: "#1a0f00", strokeOpacity: "0.55", strokeLinecap: "round", children: [
                    /* @__PURE__ */ t("line", { x1: "50", y1: "42", x2: "50", y2: "42", strokeWidth: "3.4" }),
                    /* @__PURE__ */ t("line", { x1: "50", y1: "48", x2: "50", y2: "58", strokeWidth: "2.4" })
                  ] }),
                  /* @__PURE__ */ t("line", { x1: "50", y1: "6", x2: "50", y2: "14", stroke: r, strokeOpacity: "0.7", strokeWidth: "0.6" }),
                  /* @__PURE__ */ t("line", { x1: "50", y1: "86", x2: "50", y2: "94", stroke: r, strokeOpacity: "0.7", strokeWidth: "0.6" }),
                  /* @__PURE__ */ t("line", { x1: "6", y1: "50", x2: "14", y2: "50", stroke: r, strokeOpacity: "0.7", strokeWidth: "0.6" }),
                  /* @__PURE__ */ t("line", { x1: "86", y1: "50", x2: "94", y2: "50", stroke: r, strokeOpacity: "0.7", strokeWidth: "0.6" })
                ]
              }
            ),
            /* @__PURE__ */ t("span", { className: "bom-orb__scan" })
          ] })
        }
      );
    })(),
    Ge && /* @__PURE__ */ t(
      "div",
      {
        style: {
          position: "fixed",
          inset: 0,
          background: "rgba(0,0,0,0.65)",
          zIndex: 1e6,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          animation: "bom-fade-in 0.2s ease-out"
        },
        children: /* @__PURE__ */ n("div", { style: {
          background: oe,
          color: k,
          borderRadius: 12,
          padding: 28,
          width: "90%",
          maxWidth: 420,
          boxShadow: "0 20px 60px rgba(0,0,0,0.4)",
          fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
          textAlign: "center"
        }, children: [
          /* @__PURE__ */ t("div", { style: { fontSize: 40, marginBottom: 12 }, children: "🔇" }),
          /* @__PURE__ */ t("h3", { style: { margin: "0 0 10px", fontSize: 18, fontWeight: 700 }, children: "No audio detected" }),
          /* @__PURE__ */ n("p", { style: { margin: "0 0 18px", fontSize: 14, opacity: 0.75, lineHeight: 1.5 }, children: [
            "Your recording would have no sound. In the screen picker, enable the",
            /* @__PURE__ */ t("strong", { children: ' "Also share system audio"' }),
            " toggle before clicking Share."
          ] }),
          /* @__PURE__ */ n("div", { style: { display: "flex", gap: 10, justifyContent: "center" }, children: [
            /* @__PURE__ */ t(
              "div",
              {
                onClick: () => {
                  Y(!1), ge();
                },
                style: {
                  ...S,
                  background: `linear-gradient(135deg, ${g[0]}, ${g[1]})`,
                  color: "#fff",
                  cursor: "pointer"
                },
                children: "Try again"
              }
            ),
            /* @__PURE__ */ t(
              "div",
              {
                onClick: () => {
                  Y(!1), b(!0);
                },
                style: { ...S, background: "transparent", color: k, border: `1px solid ${y}`, cursor: "pointer" },
                children: "Skip audio"
              }
            )
          ] })
        ] })
      }
    ),
    X && /* @__PURE__ */ t(
      "div",
      {
        style: {
          position: "fixed",
          inset: 0,
          background: "rgba(0,0,0,0.5)",
          zIndex: 1e6,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          animation: "bom-fade-in 0.2s ease-out"
        },
        onClick: (e) => {
          e.target === e.currentTarget && b(!1);
        },
        children: /* @__PURE__ */ t(
          "div",
          {
            style: {
              background: oe,
              color: k,
              borderRadius: 12,
              padding: 24,
              width: "90%",
              maxWidth: 520,
              maxHeight: "85vh",
              overflowY: "auto",
              boxShadow: "0 20px 60px rgba(0,0,0,0.3)",
              fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
            },
            children: Qe ? /* @__PURE__ */ n("div", { style: { textAlign: "center", padding: 40 }, children: [
              /* @__PURE__ */ t("div", { style: { fontSize: 48, marginBottom: 16 }, children: "✓" }),
              /* @__PURE__ */ t("h3", { style: { margin: 0, fontSize: 20 }, children: "Submitted!" }),
              /* @__PURE__ */ t("p", { style: { opacity: 0.7, marginTop: 8 }, children: "Thank you for your feedback." })
            ] }) : /* @__PURE__ */ n(Pe, { children: [
              /* @__PURE__ */ n("div", { style: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }, children: [
                /* @__PURE__ */ t("h3", { style: { margin: 0, fontSize: 18, fontWeight: 700 }, children: "Report an Issue" }),
                /* @__PURE__ */ t(
                  "div",
                  {
                    onClick: () => b(!1),
                    style: { cursor: "pointer", fontSize: 20, opacity: 0.6, padding: "0 4px" },
                    children: "✕"
                  }
                )
              ] }),
              /* @__PURE__ */ n("div", { style: { marginBottom: 14 }, children: [
                /* @__PURE__ */ t("label", { style: { display: "block", marginBottom: 4, fontSize: 13, fontWeight: 600, opacity: 0.8 }, children: "Type" }),
                /* @__PURE__ */ t("div", { style: { display: "flex", gap: 8 }, children: ct.map((e) => /* @__PURE__ */ t(
                  "div",
                  {
                    onClick: () => Te(e.value),
                    style: {
                      flex: 1,
                      padding: "8px 4px",
                      textAlign: "center",
                      borderRadius: 6,
                      border: `2px solid ${V === e.value ? g[0] : y}`,
                      background: V === e.value ? `${g[0]}22` : "transparent",
                      cursor: "pointer",
                      fontSize: 12,
                      fontWeight: V === e.value ? 700 : 400
                    },
                    children: e.label
                  },
                  e.value
                )) })
              ] }),
              /* @__PURE__ */ n("div", { style: { marginBottom: 14 }, children: [
                /* @__PURE__ */ t("label", { style: { display: "block", marginBottom: 4, fontSize: 13, fontWeight: 600, opacity: 0.8 }, children: "Priority" }),
                /* @__PURE__ */ t(
                  "select",
                  {
                    value: ze,
                    onChange: (e) => Ce(e.target.value),
                    style: {
                      width: "100%",
                      padding: "8px 12px",
                      borderRadius: 6,
                      border: `1px solid ${y}`,
                      background: F,
                      color: k,
                      fontSize: 14,
                      outline: "none"
                    },
                    children: dt.map((e) => /* @__PURE__ */ t("option", { value: e.value, children: e.label }, e.value))
                  }
                )
              ] }),
              /* @__PURE__ */ n("div", { style: { marginBottom: 14 }, children: [
                /* @__PURE__ */ n("label", { style: { display: "block", marginBottom: 4, fontSize: 13, fontWeight: 600, opacity: 0.8 }, children: [
                  "Title ",
                  /* @__PURE__ */ t("span", { style: { color: "#e53935" }, children: "*" })
                ] }),
                /* @__PURE__ */ t(
                  "input",
                  {
                    type: "text",
                    value: le,
                    onChange: (e) => Me(e.target.value),
                    placeholder: "Brief summary of the issue",
                    maxLength: 500,
                    style: {
                      width: "100%",
                      padding: "8px 12px",
                      borderRadius: 6,
                      border: `1px solid ${y}`,
                      background: F,
                      color: k,
                      fontSize: 14,
                      outline: "none",
                      boxSizing: "border-box"
                    }
                  }
                )
              ] }),
              /* @__PURE__ */ n("div", { style: { marginBottom: 14 }, children: [
                /* @__PURE__ */ t("label", { style: { display: "block", marginBottom: 4, fontSize: 13, fontWeight: 600, opacity: 0.8 }, children: "Description" }),
                /* @__PURE__ */ t(
                  "textarea",
                  {
                    value: Oe,
                    onChange: (e) => Be(e.target.value),
                    onPaste: (e) => {
                      var a;
                      const r = Array.from(((a = e.clipboardData) == null ? void 0 : a.items) || []).filter((s) => s.kind === "file" && s.type.startsWith("image/")).map((s) => s.getAsFile()).filter((s) => s != null);
                      r.length > 0 && (e.preventDefault(), fe(r));
                    },
                    placeholder: "Describe the issue in detail... (you can paste a screenshot here)",
                    rows: 3,
                    style: {
                      width: "100%",
                      padding: "8px 12px",
                      borderRadius: 6,
                      border: `1px solid ${y}`,
                      background: F,
                      color: k,
                      fontSize: 14,
                      outline: "none",
                      resize: "vertical",
                      boxSizing: "border-box",
                      fontFamily: "inherit"
                    }
                  }
                )
              ] }),
              /* @__PURE__ */ n("div", { style: { marginBottom: 14 }, children: [
                /* @__PURE__ */ t("label", { style: { display: "block", marginBottom: 4, fontSize: 13, fontWeight: 600, opacity: 0.8 }, children: "Files" }),
                /* @__PURE__ */ n(
                  "div",
                  {
                    onDragOver: (e) => {
                      e.preventDefault(), e.stopPropagation();
                    },
                    onDrop: (e) => {
                      var r;
                      e.preventDefault();
                      const o = Array.from(((r = e.dataTransfer) == null ? void 0 : r.files) || []);
                      o.length && fe(o);
                    },
                    style: {
                      border: `1px dashed ${y}`,
                      borderRadius: 6,
                      padding: 14,
                      background: F,
                      fontSize: 12,
                      opacity: 0.95,
                      textAlign: "center",
                      minHeight: 70
                    },
                    children: [
                      /* @__PURE__ */ n("div", { style: { display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", justifyContent: "center" }, children: [
                        /* @__PURE__ */ n("label", { style: { ...S, background: "#444", color: "#fff", padding: "4px 10px", fontSize: 12, cursor: "pointer" }, children: [
                          "Choose files",
                          /* @__PURE__ */ t(
                            "input",
                            {
                              type: "file",
                              accept: "*/*",
                              multiple: !0,
                              onChange: (e) => {
                                const o = Array.from(e.target.files || []);
                                o.length && fe(o), e.target.value = "";
                              },
                              style: { display: "none" }
                            }
                          )
                        ] }),
                        /* @__PURE__ */ t("span", { style: { opacity: 0.7 }, children: "or drag & drop / paste images here — any file type" })
                      ] }),
                      Z.length > 0 && /* @__PURE__ */ t("div", { style: { display: "flex", gap: 6, marginTop: 10, flexWrap: "wrap", justifyContent: "center" }, children: Z.map((e, o) => {
                        const r = tt[o];
                        return /* @__PURE__ */ n("div", { style: { position: "relative" }, children: [
                          r ? /* @__PURE__ */ t(
                            "img",
                            {
                              src: r,
                              alt: e.name || `file-${o + 1}`,
                              title: e.name,
                              style: {
                                width: 64,
                                height: 64,
                                objectFit: "cover",
                                borderRadius: 4,
                                border: `1px solid ${y}`
                              }
                            }
                          ) : /* @__PURE__ */ n(
                            "div",
                            {
                              title: e.name,
                              style: {
                                width: 90,
                                height: 64,
                                borderRadius: 4,
                                border: `1px solid ${y}`,
                                background: "#0d1117",
                                color: "#9ca3af",
                                display: "flex",
                                flexDirection: "column",
                                alignItems: "center",
                                justifyContent: "center",
                                padding: "0 4px",
                                fontSize: 10,
                                overflow: "hidden",
                                textOverflow: "ellipsis"
                              },
                              children: [
                                /* @__PURE__ */ t("div", { style: { fontSize: 18, lineHeight: 1 }, children: "📎" }),
                                /* @__PURE__ */ t("div", { style: {
                                  maxWidth: 78,
                                  overflow: "hidden",
                                  whiteSpace: "nowrap",
                                  textOverflow: "ellipsis",
                                  marginTop: 4
                                }, children: e.name || "file" })
                              ]
                            }
                          ),
                          /* @__PURE__ */ t(
                            "div",
                            {
                              onClick: () => ot(o),
                              style: {
                                position: "absolute",
                                top: -6,
                                right: -6,
                                width: 18,
                                height: 18,
                                borderRadius: 9,
                                background: "#e53935",
                                color: "#fff",
                                fontSize: 12,
                                lineHeight: "18px",
                                textAlign: "center",
                                cursor: "pointer",
                                userSelect: "none"
                              },
                              title: "Remove",
                              children: "×"
                            }
                          )
                        ] }, o);
                      }) })
                    ]
                  }
                )
              ] }),
              /* @__PURE__ */ n("div", { style: { marginBottom: 14 }, children: [
                /* @__PURE__ */ t("label", { style: { display: "block", marginBottom: 4, fontSize: 13, fontWeight: 600, opacity: 0.8 }, children: "Screen Recording" }),
                Ze ? /* @__PURE__ */ n("div", { children: [
                  /* @__PURE__ */ t(
                    "input",
                    {
                      type: "file",
                      accept: "video/*",
                      onChange: (e) => {
                        var o;
                        return Ue(((o = e.target.files) == null ? void 0 : o[0]) || null);
                      },
                      style: { fontSize: 13 }
                    }
                  ),
                  K && /* @__PURE__ */ t("span", { style: { fontSize: 12, opacity: 0.7, marginLeft: 8 }, children: K.name })
                ] }) : /* @__PURE__ */ n("div", { style: { display: "flex", gap: 8, alignItems: "center" }, children: [
                  !W && !C && /* @__PURE__ */ t(
                    "div",
                    {
                      onClick: ge,
                      style: {
                        ...S,
                        background: `linear-gradient(135deg, ${g[0]}, ${g[1]})`,
                        color: "#fff"
                      },
                      children: "Start Recording"
                    }
                  ),
                  W && /* @__PURE__ */ t(
                    "div",
                    {
                      onClick: De,
                      style: { ...S, background: "#e53935", color: "#fff" },
                      children: "Stop Recording"
                    }
                  ),
                  Ke && /* @__PURE__ */ t("div", { style: {
                    fontSize: 12,
                    color: "#fb923c",
                    background: "rgba(251,146,60,0.12)",
                    border: "1px solid rgba(251,146,60,0.35)",
                    borderRadius: 6,
                    padding: "5px 10px",
                    marginBottom: 4
                  }, children: "Recording recovered after page reload — your video is intact." }),
                  C && /* @__PURE__ */ n("div", { style: { display: "flex", alignItems: "center", gap: 8 }, children: [
                    /* @__PURE__ */ n("span", { style: { fontSize: 12, opacity: 0.7 }, children: [
                      (C.size / 1024 / 1024).toFixed(1),
                      " MB"
                    ] }),
                    /* @__PURE__ */ t(
                      "div",
                      {
                        onClick: () => {
                          L(null), A((e) => (e && URL.revokeObjectURL(e), null));
                        },
                        style: { ...S, background: "#666", color: "#fff", padding: "4px 10px", fontSize: 12 },
                        children: "Remove"
                      }
                    )
                  ] }),
                  W && /* @__PURE__ */ t("span", { style: { fontSize: 12, color: "#e53935", fontWeight: 600 }, children: "Recording..." })
                ] })
              ] }),
              Le && /* @__PURE__ */ n("div", { style: { marginBottom: 14 }, children: [
                /* @__PURE__ */ t("label", { style: { display: "block", marginBottom: 6, fontSize: 13, fontWeight: 600, opacity: 0.8 }, children: "Preview" }),
                /* @__PURE__ */ t(
                  "video",
                  {
                    src: Le,
                    controls: !0,
                    style: {
                      width: "100%",
                      borderRadius: 8,
                      border: `1px solid ${y}`,
                      background: "#000",
                      maxHeight: 220,
                      display: "block"
                    }
                  }
                ),
                /* @__PURE__ */ t("div", { style: { fontSize: 11, opacity: 0.5, marginTop: 4 }, children: "Make sure your audio is audible before submitting." })
              ] }),
              ae && /* @__PURE__ */ n("div", { style: { marginBottom: 14 }, children: [
                /* @__PURE__ */ t("label", { style: { display: "block", marginBottom: 4, fontSize: 13, fontWeight: 600, opacity: 0.8 }, children: "Voice Transcript" }),
                /* @__PURE__ */ t(
                  "div",
                  {
                    style: {
                      padding: "8px 12px",
                      borderRadius: 6,
                      background: F,
                      border: `1px solid ${y}`,
                      fontSize: 13,
                      maxHeight: 80,
                      overflowY: "auto",
                      opacity: 0.8
                    },
                    children: ae
                  }
                )
              ] }),
              (f.current.length > 0 || h.current.length > 0) && /* @__PURE__ */ n("div", { style: {
                marginBottom: 14,
                padding: "6px 12px",
                borderRadius: 6,
                background: I ? "#2a1a1a" : "#fff3f0",
                border: `1px solid ${I ? "#4a2020" : "#ffccc7"}`,
                fontSize: 12,
                opacity: 0.8
              }, children: [
                f.current.length > 0 && /* @__PURE__ */ n("span", { children: [
                  f.current.length,
                  " console error(s) captured"
                ] }),
                f.current.length > 0 && h.current.length > 0 && " | ",
                h.current.length > 0 && /* @__PURE__ */ n("span", { children: [
                  h.current.length,
                  " network error(s) captured"
                ] }),
                /* @__PURE__ */ t("span", { style: { display: "block", marginTop: 2, opacity: 0.7 }, children: "These will be included in your report automatically." })
              ] }),
              Ee && /* @__PURE__ */ t("div", { style: { color: "#e53935", fontSize: 13, marginBottom: 10 }, children: Ee }),
              Ie && J && /* @__PURE__ */ n("div", { style: {
                background: "rgba(229, 57, 53, 0.12)",
                border: "1px solid rgba(229, 57, 53, 0.45)",
                color: "#ffb4ad",
                padding: "10px 12px",
                borderRadius: 6,
                fontSize: 13,
                marginBottom: 10
              }, children: [
                /* @__PURE__ */ n("div", { style: { fontWeight: 600, marginBottom: 4, color: "#ff6b66" }, children: [
                  "Ticket #",
                  J,
                  " was saved — but the video upload failed."
                ] }),
                /* @__PURE__ */ t("div", { style: { marginBottom: 8 }, children: Ie }),
                /* @__PURE__ */ n("div", { style: { display: "flex", gap: 8 }, children: [
                  /* @__PURE__ */ t(
                    "div",
                    {
                      onClick: j ? void 0 : it,
                      style: {
                        ...S,
                        background: j ? "#666" : `linear-gradient(135deg, ${g[0]}, ${g[1]})`,
                        color: "#fff",
                        padding: "5px 12px",
                        fontSize: 12,
                        opacity: j ? 0.6 : 1,
                        cursor: j ? "not-allowed" : "pointer"
                      },
                      children: j ? "Retrying…" : "Retry video upload"
                    }
                  ),
                  /* @__PURE__ */ t(
                    "div",
                    {
                      onClick: () => {
                        D(null), b(!1), re();
                      },
                      style: {
                        ...S,
                        background: "transparent",
                        color: k,
                        border: `1px solid ${y}`,
                        padding: "5px 12px",
                        fontSize: 12
                      },
                      children: "Skip & close"
                    }
                  )
                ] })
              ] }),
              /* @__PURE__ */ n("div", { style: { display: "flex", gap: 8, justifyContent: "flex-end" }, children: [
                /* @__PURE__ */ t(
                  "div",
                  {
                    onClick: () => b(!1),
                    style: {
                      ...S,
                      background: "transparent",
                      color: k,
                      border: `1px solid ${y}`
                    },
                    children: "Cancel"
                  }
                ),
                /* @__PURE__ */ t(
                  "div",
                  {
                    onClick: $ ? void 0 : nt,
                    style: {
                      ...S,
                      background: $ ? "#666" : `linear-gradient(135deg, ${g[0]}, ${g[1]})`,
                      color: "#fff",
                      opacity: $ ? 0.6 : 1,
                      cursor: $ ? "not-allowed" : "pointer"
                    },
                    children: $ ? "Submitting..." : "Submit"
                  }
                )
              ] }),
              /* @__PURE__ */ t("div", { style: { marginTop: 14, fontSize: 11, opacity: 0.4, textAlign: "center" }, children: "Page URL, browser info, screen size, and console errors will be captured automatically." })
            ] })
          }
        )
      }
    ),
    W && /* @__PURE__ */ n(
      "div",
      {
        onMouseDown: (e) => {
          if (e.target.closest("[data-bom-stop]")) return;
          e.preventDefault(), w.current = {
            x: e.clientX - B.left,
            y: e.clientY - B.top
          };
          const o = (a) => {
            w.current && $e({
              left: Math.max(0, Math.min(window.innerWidth - 240, a.clientX - w.current.x)),
              top: Math.max(0, Math.min(window.innerHeight - 50, a.clientY - w.current.y))
            });
          }, r = () => {
            w.current = null, document.removeEventListener("mousemove", o), document.removeEventListener("mouseup", r);
          };
          document.addEventListener("mousemove", o), document.addEventListener("mouseup", r);
        },
        onTouchStart: (e) => {
          if (e.target.closest("[data-bom-stop]")) return;
          const o = e.touches[0];
          w.current = {
            x: o.clientX - B.left,
            y: o.clientY - B.top
          };
          const r = (s) => {
            if (!w.current) return;
            s.preventDefault();
            const d = s.touches[0];
            $e({
              left: Math.max(0, Math.min(window.innerWidth - 240, d.clientX - w.current.x)),
              top: Math.max(0, Math.min(window.innerHeight - 50, d.clientY - w.current.y))
            });
          }, a = () => {
            w.current = null, document.removeEventListener("touchmove", r), document.removeEventListener("touchend", a);
          };
          document.addEventListener("touchmove", r, { passive: !1 }), document.addEventListener("touchend", a);
        },
        style: {
          position: "fixed",
          top: B.top,
          left: B.left,
          zIndex: 1000001,
          display: "flex",
          alignItems: "center",
          gap: 10,
          padding: "8px 12px",
          background: oe,
          color: k,
          borderRadius: 999,
          border: `1px solid ${y}`,
          boxShadow: "0 8px 24px rgba(0,0,0,0.35)",
          fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
          fontSize: 13,
          userSelect: "none",
          cursor: "grab",
          touchAction: "none"
        },
        children: [
          /* @__PURE__ */ t("span", { style: { opacity: 0.45, fontSize: 14, lineHeight: 1, pointerEvents: "none" }, children: "☰" }),
          /* @__PURE__ */ t(
            "span",
            {
              style: {
                display: "inline-block",
                width: 10,
                height: 10,
                borderRadius: "50%",
                background: "#e53935",
                boxShadow: "0 0 0 0 rgba(229,57,53,0.6)",
                animation: "bom-pulse 1.4s ease-out infinite",
                pointerEvents: "none"
              }
            }
          ),
          /* @__PURE__ */ t("span", { style: { fontWeight: 600, pointerEvents: "none" }, children: "Recording" }),
          /* @__PURE__ */ t(
            "div",
            {
              "data-bom-stop": "true",
              onClick: De,
              style: {
                cursor: "pointer",
                background: "#e53935",
                color: "#fff",
                borderRadius: 999,
                padding: "6px 14px",
                fontSize: 12,
                fontWeight: 700,
                letterSpacing: 0.3
              },
              children: "STOP"
            }
          )
        ]
      }
    ),
    Je && !W && !X && C && /* @__PURE__ */ n("div", { style: {
      position: "fixed",
      bottom: 80,
      right: 24,
      zIndex: 1000001,
      display: "flex",
      alignItems: "center",
      gap: 8,
      padding: "10px 14px",
      background: oe,
      color: k,
      borderRadius: 999,
      border: "1px solid rgba(251,146,60,0.5)",
      boxShadow: "0 8px 24px rgba(0,0,0,0.35)",
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
      fontSize: 13,
      userSelect: "none"
    }, children: [
      /* @__PURE__ */ t("span", { style: { fontSize: 16 }, children: "🎥" }),
      /* @__PURE__ */ n("span", { style: { fontWeight: 600, color: "#fb923c" }, children: [
        "Recovered (",
        (C.size / 1024 / 1024).toFixed(1),
        " MB)"
      ] }),
      /* @__PURE__ */ t(
        "div",
        {
          onClick: () => {
            O(!1), ge();
          },
          style: { cursor: "pointer", background: `linear-gradient(135deg, ${g[0]}, ${g[1]})`, color: "#fff", borderRadius: 999, padding: "5px 12px", fontSize: 12, fontWeight: 700 },
          children: "Continue"
        }
      ),
      /* @__PURE__ */ t(
        "div",
        {
          onClick: () => {
            O(!1), b(!0);
          },
          style: { cursor: "pointer", background: "#22c55e", color: "#fff", borderRadius: 999, padding: "5px 12px", fontSize: 12, fontWeight: 700 },
          children: "Submit"
        }
      ),
      /* @__PURE__ */ t(
        "div",
        {
          onClick: () => {
            O(!1), q(!1), L(null), A((e) => (e && URL.revokeObjectURL(e), null)), E.current = [], se();
          },
          style: { cursor: "pointer", opacity: 0.5, fontSize: 12, padding: "5px 8px" },
          children: "✕"
        }
      )
    ] })
  ] });
};
export {
  ft as BugOutManagedWidget,
  ft as BugsManagedWidget
};
