import { jsxs as n, Fragment as P, jsx as e } from "react/jsx-runtime";
import { useRef as f, useState as p, useEffect as _e, useCallback as ce } from "react";
const Me = [
  { value: "BUG", label: "Bug Report" },
  { value: "FEATURE_REQUEST", label: "Feature Request" },
  { value: "QUESTION", label: "Question" }
], Oe = [
  { value: "LOW", label: "Low" },
  { value: "MEDIUM", label: "Medium" },
  { value: "HIGH", label: "High" },
  { value: "CRITICAL", label: "Critical" }
], Ce = (de) => {
  const {
    apiKey: H,
    apiUrl: y,
    userEmail: pe,
    userName: ue,
    theme: me = "dark",
    position: be = "bottom-right",
    orbSize: fe = 24,
    // Bug Out's identity is amber/orange ("we caught a bug" — warm, distinct
    // from Jarvis blue/red so users can tell the orbs apart at a glance).
    // Hosts can override; if they do, we treat [0]=core, [1]=ring.
    orbColors: b = ["#fbbf24", "#fb923c"],
    // Tenant context
    tenantId: j,
    tenantName: A,
    databaseName: X,
    appVersion: q,
    environment: Y
  } = de, he = f(
    `bom-orb-${Math.random().toString(36).slice(2, 9)}`
  ), [$, h] = p(!1), [M, G] = p(!1), [O, L] = p(null), [U, V] = p(""), [T, J] = p("BUG"), [K, Q] = p("MEDIUM"), [D, Z] = p(""), [ee, te] = p(""), [k, oe] = p(!1), [ge, re] = p(!1), [ne, z] = p(""), [ye, we] = p(!1), [N, ie] = p(null), [C, xe] = p(() => ({
    top: 24,
    left: typeof window < "u" ? Math.max(24, window.innerWidth - 280) : 24
  })), S = f(null), I = f(null), F = f([]), B = f(null), R = f(null), c = f([]), d = f([]);
  _e(() => {
    if (we(/Android|iPhone|iPad|iPod/i.test(navigator.userAgent)), !R.current) {
      const o = document.createElement("style");
      o.textContent = `
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
      `, document.head.appendChild(o), R.current = o;
    }
    const t = console.error;
    console.error = (...o) => {
      c.current.push({
        type: "console.error",
        message: o.map((r) => typeof r == "object" ? JSON.stringify(r) : String(r)).join(" "),
        timestamp: (/* @__PURE__ */ new Date()).toISOString()
      }), c.current.length > 50 && c.current.shift(), t.apply(console, o);
    };
    const i = (o) => {
      c.current.push({
        type: "window.onerror",
        message: o.message,
        source: o.filename,
        line: o.lineno,
        col: o.colno,
        timestamp: (/* @__PURE__ */ new Date()).toISOString()
      }), c.current.length > 50 && c.current.shift();
    };
    window.addEventListener("error", i);
    const a = (o) => {
      var r;
      c.current.push({
        type: "unhandledrejection",
        message: ((r = o.reason) == null ? void 0 : r.message) || String(o.reason),
        timestamp: (/* @__PURE__ */ new Date()).toISOString()
      }), c.current.length > 50 && c.current.shift();
    };
    window.addEventListener("unhandledrejection", a);
    const s = window.fetch;
    window.fetch = async (...o) => {
      var W;
      const r = typeof o[0] == "string" ? o[0] : o[0].url, v = (((W = o[1]) == null ? void 0 : W.method) || "GET").toUpperCase();
      try {
        const m = await s.apply(window, o);
        return !m.ok && !r.includes(y) && (d.current.push({
          method: v,
          url: r,
          status: m.status,
          statusText: m.statusText,
          timestamp: (/* @__PURE__ */ new Date()).toISOString()
        }), d.current.length > 30 && d.current.shift()), m;
      } catch (m) {
        throw r.includes(y) || (d.current.push({
          method: v,
          url: r,
          status: 0,
          statusText: m.message || "Network Error",
          timestamp: (/* @__PURE__ */ new Date()).toISOString()
        }), d.current.length > 30 && d.current.shift()), m;
      }
    };
    const l = XMLHttpRequest.prototype.open, u = XMLHttpRequest.prototype.send;
    return XMLHttpRequest.prototype.open = function(o, r, ...v) {
      return this._bomMethod = o, this._bomUrl = String(r), l.apply(this, [o, r, ...v]);
    }, XMLHttpRequest.prototype.send = function(...o) {
      return this.addEventListener("loadend", () => {
        var r;
        this.status >= 400 && !((r = this._bomUrl) != null && r.includes(y)) && (d.current.push({
          method: this._bomMethod || "GET",
          url: this._bomUrl || "",
          status: this.status,
          statusText: this.statusText,
          timestamp: (/* @__PURE__ */ new Date()).toISOString()
        }), d.current.length > 30 && d.current.shift());
      }), u.apply(this, o);
    }, () => {
      R.current && (document.head.removeChild(R.current), R.current = null), console.error = t, window.removeEventListener("error", i), window.removeEventListener("unhandledrejection", a), window.fetch = s, XMLHttpRequest.prototype.open = l, XMLHttpRequest.prototype.send = u;
    };
  }, [y]);
  const w = me === "dark", se = w ? "#1a1a2e" : "#ffffff", x = w ? "#e0e0e0" : "#333333", g = w ? "#333" : "#ddd", E = w ? "#16213e" : "#f5f5f5", ve = be === "bottom-left" ? { bottom: 24, left: 24 } : { bottom: 24, right: 24 }, ke = ce(async () => {
    try {
      const t = await navigator.mediaDevices.getDisplayMedia({
        video: !0,
        audio: !0
      }), i = new MediaRecorder(t, {
        mimeType: MediaRecorder.isTypeSupported("video/webm;codecs=vp9") ? "video/webm;codecs=vp9" : "video/webm"
      });
      F.current = [], i.ondataavailable = (s) => {
        s.data.size > 0 && F.current.push(s.data);
      }, i.onstop = () => {
        const s = new Blob(F.current, { type: "video/webm" });
        L(s), t.getTracks().forEach((l) => l.stop());
      }, i.start(1e3), I.current = i, G(!0), h(!1);
      const a = window.SpeechRecognition || window.webkitSpeechRecognition;
      if (a) {
        const s = new a();
        s.continuous = !0, s.interimResults = !0, s.lang = "en-US";
        let l = "";
        s.onresult = (u) => {
          let o = "";
          for (let r = u.resultIndex; r < u.results.length; r++)
            u.results[r].isFinal ? l += u.results[r][0].transcript + " " : o += u.results[r][0].transcript;
          V(l + o);
        }, s.onerror = () => {
        }, s.start(), B.current = s;
      }
    } catch (t) {
      console.error("Failed to start recording:", t);
    }
  }, []), ae = ce(() => {
    I.current && I.current.state !== "inactive" && I.current.stop(), B.current && (B.current.stop(), B.current = null), G(!1), h(!0);
  }, []), le = () => {
    Z(""), te(""), J("BUG"), Q("MEDIUM"), V(""), L(null), ie(null), z(""), re(!1);
  }, Se = async () => {
    if (!D.trim()) {
      z("Title is required");
      return;
    }
    oe(!0), z("");
    try {
      const t = {
        title: D.trim(),
        description: ee.trim(),
        ticketType: T,
        priority: K,
        submittedBy: pe || ue || "Anonymous",
        currentPageUrl: window.location.href,
        currentPageName: document.title,
        browserInfo: navigator.userAgent,
        screenWidth: window.innerWidth,
        screenHeight: window.innerHeight,
        transcript: U || null,
        consoleErrors: c.current.length > 0 ? JSON.stringify(c.current) : null,
        networkErrors: d.current.length > 0 ? JSON.stringify(d.current) : null
      };
      j && (t.tenantId = j), A && (t.tenantName = A), X && (t.databaseName = X), q && (t.applicationVersion = q), Y && (t.environment = Y);
      const i = await fetch(`${y}/tickets`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-BOM-API-Key": H
        },
        body: JSON.stringify(t)
      });
      if (!i.ok) throw new Error("Failed to submit ticket");
      const a = await i.json(), s = O || N;
      if (s && a.id)
        try {
          const l = new FormData();
          l.append("file", s, "recording.webm");
          const u = await fetch(`${y}/tickets/${a.id}/video`, {
            method: "POST",
            headers: { "X-BOM-API-Key": H },
            body: l
          });
          u.ok || console.warn(`[Bug Out] Video upload failed (${u.status}) for ticket ${a.id}`);
        } catch (l) {
          console.warn("[Bug Out] Video upload network error:", l);
        }
      re(!0), setTimeout(() => {
        h(!1), le();
      }, 2e3);
    } catch (t) {
      z(t.message || "Failed to submit");
    } finally {
      oe(!1);
    }
  }, _ = {
    padding: "8px 16px",
    border: "none",
    borderRadius: 6,
    cursor: "pointer",
    fontSize: 14,
    fontWeight: 600,
    transition: "opacity 0.2s"
  };
  return /* @__PURE__ */ n(P, { children: [
    (() => {
      const t = fe * 2, i = b[0], a = b[1], s = `${i}8c`, l = he.current;
      return /* @__PURE__ */ e(
        "button",
        {
          type: "button",
          role: "button",
          "aria-label": "Report a bug",
          title: "Report a bug or request a feature",
          onClick: () => {
            $ || le(), h(!$);
          },
          className: "bom-orb-wrap",
          style: {
            ...ve,
            width: t,
            height: t,
            "--bom-core": i,
            "--bom-ring": a,
            "--bom-halo": s,
            "--bom-spin": "18s",
            "--bom-pulse": "4s"
          },
          children: /* @__PURE__ */ n("span", { className: "bom-orb", children: [
            /* @__PURE__ */ n(
              "svg",
              {
                viewBox: "0 0 100 100",
                width: t,
                height: t,
                "aria-hidden": "true",
                className: "bom-orb__svg",
                children: [
                  /* @__PURE__ */ n("defs", { children: [
                    /* @__PURE__ */ n("radialGradient", { id: `${l}-core`, cx: "50%", cy: "50%", r: "50%", children: [
                      /* @__PURE__ */ e("stop", { offset: "0%", stopColor: i, stopOpacity: "1" }),
                      /* @__PURE__ */ e("stop", { offset: "55%", stopColor: i, stopOpacity: "0.55" }),
                      /* @__PURE__ */ e("stop", { offset: "100%", stopColor: "#1a0f00", stopOpacity: "0" })
                    ] }),
                    /* @__PURE__ */ n("radialGradient", { id: `${l}-iris`, cx: "50%", cy: "50%", r: "50%", children: [
                      /* @__PURE__ */ e("stop", { offset: "0%", stopColor: "#fff7dc", stopOpacity: "0.95" }),
                      /* @__PURE__ */ e("stop", { offset: "40%", stopColor: i, stopOpacity: "0.7" }),
                      /* @__PURE__ */ e("stop", { offset: "100%", stopColor: i, stopOpacity: "0" })
                    ] })
                  ] }),
                  /* @__PURE__ */ e(
                    "circle",
                    {
                      cx: "50",
                      cy: "50",
                      r: "48",
                      fill: `url(#${l}-core)`,
                      className: "bom-orb__halo"
                    }
                  ),
                  /* @__PURE__ */ n("g", { className: "bom-orb__spin-cw", children: [
                    /* @__PURE__ */ e(
                      "circle",
                      {
                        cx: "50",
                        cy: "50",
                        r: "44",
                        fill: "none",
                        stroke: a,
                        strokeOpacity: "0.55",
                        strokeWidth: "0.5"
                      }
                    ),
                    Array.from({ length: 36 }).map((u, o) => {
                      const r = o * 10 * Math.PI / 180, v = 50 + Math.cos(r) * 41, W = 50 + Math.sin(r) * 41, m = 50 + Math.cos(r) * (o % 3 === 0 ? 44 : 43), Re = 50 + Math.sin(r) * (o % 3 === 0 ? 44 : 43);
                      return /* @__PURE__ */ e(
                        "line",
                        {
                          x1: v,
                          y1: W,
                          x2: m,
                          y2: Re,
                          stroke: a,
                          strokeOpacity: o % 3 === 0 ? 0.8 : 0.35,
                          strokeWidth: "0.8"
                        },
                        o
                      );
                    })
                  ] }),
                  /* @__PURE__ */ n("g", { className: "bom-orb__spin-ccw", children: [
                    /* @__PURE__ */ e(
                      "circle",
                      {
                        cx: "50",
                        cy: "50",
                        r: "36",
                        fill: "none",
                        stroke: a,
                        strokeOpacity: "0.18",
                        strokeWidth: "0.5"
                      }
                    ),
                    /* @__PURE__ */ e(
                      "circle",
                      {
                        cx: "50",
                        cy: "50",
                        r: "36",
                        fill: "none",
                        stroke: a,
                        strokeOpacity: "0.85",
                        strokeWidth: "1.4",
                        strokeDasharray: "42 30 18 36 24 32",
                        strokeLinecap: "round"
                      }
                    )
                  ] }),
                  /* @__PURE__ */ e("g", { className: "bom-orb__spin-cw-fast", children: /* @__PURE__ */ e(
                    "circle",
                    {
                      cx: "50",
                      cy: "50",
                      r: "28",
                      fill: "none",
                      stroke: i,
                      strokeOpacity: "0.7",
                      strokeWidth: "0.9",
                      strokeDasharray: "2 4"
                    }
                  ) }),
                  /* @__PURE__ */ e(
                    "circle",
                    {
                      cx: "50",
                      cy: "50",
                      r: "20",
                      fill: `url(#${l}-iris)`,
                      className: "bom-orb__core"
                    }
                  ),
                  /* @__PURE__ */ n("g", { stroke: "#1a0f00", strokeOpacity: "0.55", strokeLinecap: "round", children: [
                    /* @__PURE__ */ e("line", { x1: "50", y1: "42", x2: "50", y2: "42", strokeWidth: "3.4" }),
                    /* @__PURE__ */ e("line", { x1: "50", y1: "48", x2: "50", y2: "58", strokeWidth: "2.4" })
                  ] }),
                  /* @__PURE__ */ e("line", { x1: "50", y1: "6", x2: "50", y2: "14", stroke: a, strokeOpacity: "0.7", strokeWidth: "0.6" }),
                  /* @__PURE__ */ e("line", { x1: "50", y1: "86", x2: "50", y2: "94", stroke: a, strokeOpacity: "0.7", strokeWidth: "0.6" }),
                  /* @__PURE__ */ e("line", { x1: "6", y1: "50", x2: "14", y2: "50", stroke: a, strokeOpacity: "0.7", strokeWidth: "0.6" }),
                  /* @__PURE__ */ e("line", { x1: "86", y1: "50", x2: "94", y2: "50", stroke: a, strokeOpacity: "0.7", strokeWidth: "0.6" })
                ]
              }
            ),
            /* @__PURE__ */ e("span", { className: "bom-orb__scan" })
          ] })
        }
      );
    })(),
    $ && /* @__PURE__ */ e(
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
        onClick: (t) => {
          t.target === t.currentTarget && h(!1);
        },
        children: /* @__PURE__ */ e(
          "div",
          {
            style: {
              background: se,
              color: x,
              borderRadius: 12,
              padding: 24,
              width: "90%",
              maxWidth: 520,
              maxHeight: "85vh",
              overflowY: "auto",
              boxShadow: "0 20px 60px rgba(0,0,0,0.3)",
              fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
            },
            children: ge ? /* @__PURE__ */ n("div", { style: { textAlign: "center", padding: 40 }, children: [
              /* @__PURE__ */ e("div", { style: { fontSize: 48, marginBottom: 16 }, children: "✓" }),
              /* @__PURE__ */ e("h3", { style: { margin: 0, fontSize: 20 }, children: "Submitted!" }),
              /* @__PURE__ */ e("p", { style: { opacity: 0.7, marginTop: 8 }, children: "Thank you for your feedback." })
            ] }) : /* @__PURE__ */ n(P, { children: [
              /* @__PURE__ */ n("div", { style: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }, children: [
                /* @__PURE__ */ e("h3", { style: { margin: 0, fontSize: 18, fontWeight: 700 }, children: "Report an Issue" }),
                /* @__PURE__ */ e(
                  "div",
                  {
                    onClick: () => h(!1),
                    style: { cursor: "pointer", fontSize: 20, opacity: 0.6, padding: "0 4px" },
                    children: "✕"
                  }
                )
              ] }),
              /* @__PURE__ */ n("div", { style: { marginBottom: 14 }, children: [
                /* @__PURE__ */ e("label", { style: { display: "block", marginBottom: 4, fontSize: 13, fontWeight: 600, opacity: 0.8 }, children: "Type" }),
                /* @__PURE__ */ e("div", { style: { display: "flex", gap: 8 }, children: Me.map((t) => /* @__PURE__ */ e(
                  "div",
                  {
                    onClick: () => J(t.value),
                    style: {
                      flex: 1,
                      padding: "8px 4px",
                      textAlign: "center",
                      borderRadius: 6,
                      border: `2px solid ${T === t.value ? b[0] : g}`,
                      background: T === t.value ? `${b[0]}22` : "transparent",
                      cursor: "pointer",
                      fontSize: 12,
                      fontWeight: T === t.value ? 700 : 400
                    },
                    children: t.label
                  },
                  t.value
                )) })
              ] }),
              /* @__PURE__ */ n("div", { style: { marginBottom: 14 }, children: [
                /* @__PURE__ */ e("label", { style: { display: "block", marginBottom: 4, fontSize: 13, fontWeight: 600, opacity: 0.8 }, children: "Priority" }),
                /* @__PURE__ */ e(
                  "select",
                  {
                    value: K,
                    onChange: (t) => Q(t.target.value),
                    style: {
                      width: "100%",
                      padding: "8px 12px",
                      borderRadius: 6,
                      border: `1px solid ${g}`,
                      background: E,
                      color: x,
                      fontSize: 14,
                      outline: "none"
                    },
                    children: Oe.map((t) => /* @__PURE__ */ e("option", { value: t.value, children: t.label }, t.value))
                  }
                )
              ] }),
              /* @__PURE__ */ n("div", { style: { marginBottom: 14 }, children: [
                /* @__PURE__ */ n("label", { style: { display: "block", marginBottom: 4, fontSize: 13, fontWeight: 600, opacity: 0.8 }, children: [
                  "Title ",
                  /* @__PURE__ */ e("span", { style: { color: "#e53935" }, children: "*" })
                ] }),
                /* @__PURE__ */ e(
                  "input",
                  {
                    type: "text",
                    value: D,
                    onChange: (t) => Z(t.target.value),
                    placeholder: "Brief summary of the issue",
                    maxLength: 500,
                    style: {
                      width: "100%",
                      padding: "8px 12px",
                      borderRadius: 6,
                      border: `1px solid ${g}`,
                      background: E,
                      color: x,
                      fontSize: 14,
                      outline: "none",
                      boxSizing: "border-box"
                    }
                  }
                )
              ] }),
              /* @__PURE__ */ n("div", { style: { marginBottom: 14 }, children: [
                /* @__PURE__ */ e("label", { style: { display: "block", marginBottom: 4, fontSize: 13, fontWeight: 600, opacity: 0.8 }, children: "Description" }),
                /* @__PURE__ */ e(
                  "textarea",
                  {
                    value: ee,
                    onChange: (t) => te(t.target.value),
                    placeholder: "Describe the issue in detail...",
                    rows: 3,
                    style: {
                      width: "100%",
                      padding: "8px 12px",
                      borderRadius: 6,
                      border: `1px solid ${g}`,
                      background: E,
                      color: x,
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
                /* @__PURE__ */ e("label", { style: { display: "block", marginBottom: 4, fontSize: 13, fontWeight: 600, opacity: 0.8 }, children: "Screen Recording" }),
                ye ? /* @__PURE__ */ n("div", { children: [
                  /* @__PURE__ */ e(
                    "input",
                    {
                      type: "file",
                      accept: "video/*",
                      onChange: (t) => {
                        var i;
                        return ie(((i = t.target.files) == null ? void 0 : i[0]) || null);
                      },
                      style: { fontSize: 13 }
                    }
                  ),
                  N && /* @__PURE__ */ e("span", { style: { fontSize: 12, opacity: 0.7, marginLeft: 8 }, children: N.name })
                ] }) : /* @__PURE__ */ n("div", { style: { display: "flex", gap: 8, alignItems: "center" }, children: [
                  !M && !O && /* @__PURE__ */ e(
                    "div",
                    {
                      onClick: ke,
                      style: {
                        ..._,
                        background: `linear-gradient(135deg, ${b[0]}, ${b[1]})`,
                        color: "#fff"
                      },
                      children: "Start Recording"
                    }
                  ),
                  M && /* @__PURE__ */ e(
                    "div",
                    {
                      onClick: ae,
                      style: { ..._, background: "#e53935", color: "#fff" },
                      children: "Stop Recording"
                    }
                  ),
                  O && /* @__PURE__ */ n(P, { children: [
                    /* @__PURE__ */ n("span", { style: { fontSize: 12, opacity: 0.7 }, children: [
                      "Recording captured (",
                      (O.size / 1024 / 1024).toFixed(1),
                      " MB)"
                    ] }),
                    /* @__PURE__ */ e(
                      "div",
                      {
                        onClick: () => L(null),
                        style: { ..._, background: "#666", color: "#fff", padding: "4px 10px", fontSize: 12 },
                        children: "Remove"
                      }
                    )
                  ] }),
                  M && /* @__PURE__ */ e("span", { style: { fontSize: 12, color: "#e53935", fontWeight: 600 }, children: "Recording..." })
                ] })
              ] }),
              U && /* @__PURE__ */ n("div", { style: { marginBottom: 14 }, children: [
                /* @__PURE__ */ e("label", { style: { display: "block", marginBottom: 4, fontSize: 13, fontWeight: 600, opacity: 0.8 }, children: "Voice Transcript" }),
                /* @__PURE__ */ e(
                  "div",
                  {
                    style: {
                      padding: "8px 12px",
                      borderRadius: 6,
                      background: E,
                      border: `1px solid ${g}`,
                      fontSize: 13,
                      maxHeight: 80,
                      overflowY: "auto",
                      opacity: 0.8
                    },
                    children: U
                  }
                )
              ] }),
              (c.current.length > 0 || d.current.length > 0) && /* @__PURE__ */ n("div", { style: {
                marginBottom: 14,
                padding: "6px 12px",
                borderRadius: 6,
                background: w ? "#2a1a1a" : "#fff3f0",
                border: `1px solid ${w ? "#4a2020" : "#ffccc7"}`,
                fontSize: 12,
                opacity: 0.8
              }, children: [
                c.current.length > 0 && /* @__PURE__ */ n("span", { children: [
                  c.current.length,
                  " console error(s) captured"
                ] }),
                c.current.length > 0 && d.current.length > 0 && " | ",
                d.current.length > 0 && /* @__PURE__ */ n("span", { children: [
                  d.current.length,
                  " network error(s) captured"
                ] }),
                /* @__PURE__ */ e("span", { style: { display: "block", marginTop: 2, opacity: 0.7 }, children: "These will be included in your report automatically." })
              ] }),
              ne && /* @__PURE__ */ e("div", { style: { color: "#e53935", fontSize: 13, marginBottom: 10 }, children: ne }),
              /* @__PURE__ */ n("div", { style: { display: "flex", gap: 8, justifyContent: "flex-end" }, children: [
                /* @__PURE__ */ e(
                  "div",
                  {
                    onClick: () => h(!1),
                    style: {
                      ..._,
                      background: "transparent",
                      color: x,
                      border: `1px solid ${g}`
                    },
                    children: "Cancel"
                  }
                ),
                /* @__PURE__ */ e(
                  "div",
                  {
                    onClick: k ? void 0 : Se,
                    style: {
                      ..._,
                      background: k ? "#666" : `linear-gradient(135deg, ${b[0]}, ${b[1]})`,
                      color: "#fff",
                      opacity: k ? 0.6 : 1,
                      cursor: k ? "not-allowed" : "pointer"
                    },
                    children: k ? "Submitting..." : "Submit"
                  }
                )
              ] }),
              /* @__PURE__ */ e("div", { style: { marginTop: 14, fontSize: 11, opacity: 0.4, textAlign: "center" }, children: "Page URL, browser info, screen size, and console errors will be captured automatically." })
            ] })
          }
        )
      }
    ),
    M && /* @__PURE__ */ n(
      "div",
      {
        style: {
          position: "fixed",
          top: C.top,
          left: C.left,
          zIndex: 1000001,
          display: "flex",
          alignItems: "center",
          gap: 10,
          padding: "8px 12px",
          background: se,
          color: x,
          borderRadius: 999,
          border: `1px solid ${g}`,
          boxShadow: "0 8px 24px rgba(0,0,0,0.35)",
          fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
          fontSize: 13,
          userSelect: "none"
        },
        children: [
          /* @__PURE__ */ e(
            "div",
            {
              onMouseDown: (t) => {
                S.current = {
                  x: t.clientX - C.left,
                  y: t.clientY - C.top
                };
                const i = (s) => {
                  S.current && xe({
                    left: Math.max(0, Math.min(window.innerWidth - 240, s.clientX - S.current.x)),
                    top: Math.max(0, Math.min(window.innerHeight - 50, s.clientY - S.current.y))
                  });
                }, a = () => {
                  S.current = null, document.removeEventListener("mousemove", i), document.removeEventListener("mouseup", a);
                };
                document.addEventListener("mousemove", i), document.addEventListener("mouseup", a);
              },
              style: {
                cursor: "grab",
                padding: "2px 4px",
                opacity: 0.6,
                fontSize: 16,
                lineHeight: 1
              },
              title: "Drag to move",
              children: "☰"
            }
          ),
          /* @__PURE__ */ e(
            "span",
            {
              style: {
                display: "inline-block",
                width: 10,
                height: 10,
                borderRadius: "50%",
                background: "#e53935",
                boxShadow: "0 0 0 0 rgba(229,57,53,0.6)",
                animation: "bom-pulse 1.4s ease-out infinite"
              }
            }
          ),
          /* @__PURE__ */ e("span", { style: { fontWeight: 600 }, children: "Recording" }),
          /* @__PURE__ */ e(
            "div",
            {
              onClick: ae,
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
    )
  ] });
};
export {
  Ce as BugOutManagedWidget,
  Ce as BugsManagedWidget
};
