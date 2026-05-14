import { jsxs as n, Fragment as H, jsx as e } from "react/jsx-runtime";
import { useRef as f, useState as u, useEffect as Te, useCallback as de } from "react";
const Me = [
  { value: "BUG", label: "Bug Report" },
  { value: "FEATURE_REQUEST", label: "Feature Request" },
  { value: "QUESTION", label: "Question" }
], Oe = [
  { value: "LOW", label: "Low" },
  { value: "MEDIUM", label: "Medium" },
  { value: "HIGH", label: "High" },
  { value: "CRITICAL", label: "Critical" }
], Ee = (pe) => {
  const {
    apiKey: A,
    apiUrl: x,
    userEmail: ue,
    userName: me,
    theme: be = "dark",
    position: fe = "bottom-right",
    orbSize: he = 24,
    // Bug Out's identity is amber/orange ("we caught a bug" — warm, distinct
    // from Jarvis blue/red so users can tell the orbs apart at a glance).
    // Hosts can override; if they do, we treat [0]=core, [1]=ring.
    orbColors: h = ["#fbbf24", "#fb923c"],
    // Tenant context
    tenantId: j,
    tenantName: X,
    databaseName: q,
    appVersion: Y,
    environment: G
  } = pe, ge = f(
    `bom-orb-${Math.random().toString(36).slice(2, 9)}`
  ), [U, g] = u(!1), [M, V] = u(!1), [O, $] = u(null), [D, J] = u(""), [z, K] = u("BUG"), [Q, Z] = u("MEDIUM"), [L, ee] = u(""), [te, oe] = u(""), [S, re] = u(!1), [ye, ne] = u(!1), [ie, C] = u(""), [we, xe] = u(!1), [N, se] = u(null), [E, ve] = u(() => ({
    top: 24,
    left: typeof window < "u" ? Math.max(24, window.innerWidth - 280) : 24
  })), R = f(null), I = f(null), F = f([]), P = f(null), B = f(null), _ = f(null), c = f([]), d = f([]);
  Te(() => {
    if (xe(/Android|iPhone|iPad|iPod/i.test(navigator.userAgent)), !_.current) {
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
      `, document.head.appendChild(o), _.current = o;
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
    const s = (o) => {
      var r;
      c.current.push({
        type: "unhandledrejection",
        message: ((r = o.reason) == null ? void 0 : r.message) || String(o.reason),
        timestamp: (/* @__PURE__ */ new Date()).toISOString()
      }), c.current.length > 50 && c.current.shift();
    };
    window.addEventListener("unhandledrejection", s);
    const m = window.fetch;
    window.fetch = async (...o) => {
      var w;
      const r = typeof o[0] == "string" ? o[0] : o[0].url, l = (((w = o[1]) == null ? void 0 : w.method) || "GET").toUpperCase();
      try {
        const p = await m.apply(window, o);
        return !p.ok && !r.includes(x) && (d.current.push({
          method: l,
          url: r,
          status: p.status,
          statusText: p.statusText,
          timestamp: (/* @__PURE__ */ new Date()).toISOString()
        }), d.current.length > 30 && d.current.shift()), p;
      } catch (p) {
        throw r.includes(x) || (d.current.push({
          method: l,
          url: r,
          status: 0,
          statusText: p.message || "Network Error",
          timestamp: (/* @__PURE__ */ new Date()).toISOString()
        }), d.current.length > 30 && d.current.shift()), p;
      }
    };
    const a = XMLHttpRequest.prototype.open, b = XMLHttpRequest.prototype.send;
    return XMLHttpRequest.prototype.open = function(o, r, ...l) {
      return this._bomMethod = o, this._bomUrl = String(r), a.apply(this, [o, r, ...l]);
    }, XMLHttpRequest.prototype.send = function(...o) {
      return this.addEventListener("loadend", () => {
        var r;
        this.status >= 400 && !((r = this._bomUrl) != null && r.includes(x)) && (d.current.push({
          method: this._bomMethod || "GET",
          url: this._bomUrl || "",
          status: this.status,
          statusText: this.statusText,
          timestamp: (/* @__PURE__ */ new Date()).toISOString()
        }), d.current.length > 30 && d.current.shift());
      }), b.apply(this, o);
    }, () => {
      _.current && (document.head.removeChild(_.current), _.current = null), console.error = t, window.removeEventListener("error", i), window.removeEventListener("unhandledrejection", s), window.fetch = m, XMLHttpRequest.prototype.open = a, XMLHttpRequest.prototype.send = b;
    };
  }, [x]);
  const v = be === "dark", ae = v ? "#1a1a2e" : "#ffffff", k = v ? "#e0e0e0" : "#333333", y = v ? "#333" : "#ddd", W = v ? "#16213e" : "#f5f5f5", ke = fe === "bottom-left" ? { bottom: 24, left: 24 } : { bottom: 24, right: 24 }, Se = de(async () => {
    try {
      const t = await navigator.mediaDevices.getDisplayMedia({
        video: !0,
        audio: !0
      });
      let i = null;
      try {
        i = await navigator.mediaDevices.getUserMedia({ audio: !0, video: !1 });
      } catch {
      }
      P.current = i;
      const s = i != null && i.getAudioTracks().length ? i.getAudioTracks() : t.getAudioTracks(), m = new MediaStream([...t.getVideoTracks(), ...s]), a = new MediaRecorder(m, {
        mimeType: MediaRecorder.isTypeSupported("video/webm;codecs=vp9") ? "video/webm;codecs=vp9" : "video/webm"
      });
      F.current = [], a.ondataavailable = (o) => {
        o.data.size > 0 && F.current.push(o.data);
      }, a.onstop = () => {
        var r;
        const o = new Blob(F.current, { type: "video/webm" });
        $(o), t.getTracks().forEach((l) => l.stop()), (r = P.current) == null || r.getTracks().forEach((l) => l.stop()), P.current = null;
      }, a.start(1e3), I.current = a, V(!0), g(!1);
      const b = window.SpeechRecognition || window.webkitSpeechRecognition;
      if (b) {
        const o = new b();
        o.continuous = !0, o.interimResults = !0, o.lang = "en-US";
        let r = "";
        o.onresult = (l) => {
          let w = "";
          for (let p = l.resultIndex; p < l.results.length; p++)
            l.results[p].isFinal ? r += l.results[p][0].transcript + " " : w += l.results[p][0].transcript;
          J(r + w);
        }, o.onerror = () => {
        }, o.start(), B.current = o;
      }
    } catch (t) {
      console.error("Failed to start recording:", t);
    }
  }, []), le = de(() => {
    I.current && I.current.state !== "inactive" && I.current.stop(), B.current && (B.current.stop(), B.current = null), V(!1), g(!0);
  }, []), ce = () => {
    ee(""), oe(""), K("BUG"), Z("MEDIUM"), J(""), $(null), se(null), C(""), ne(!1);
  }, Re = async () => {
    if (!L.trim()) {
      C("Title is required");
      return;
    }
    re(!0), C("");
    try {
      const t = {
        title: L.trim(),
        description: te.trim(),
        ticketType: z,
        priority: Q,
        submittedBy: ue || me || "Anonymous",
        currentPageUrl: window.location.href,
        currentPageName: document.title,
        browserInfo: navigator.userAgent,
        screenWidth: window.innerWidth,
        screenHeight: window.innerHeight,
        transcript: D || null,
        consoleErrors: c.current.length > 0 ? JSON.stringify(c.current) : null,
        networkErrors: d.current.length > 0 ? JSON.stringify(d.current) : null
      };
      j && (t.tenantId = j), X && (t.tenantName = X), q && (t.databaseName = q), Y && (t.applicationVersion = Y), G && (t.environment = G);
      const i = await fetch(`${x}/tickets`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-BOM-API-Key": A
        },
        body: JSON.stringify(t)
      });
      if (!i.ok) throw new Error("Failed to submit ticket");
      const s = await i.json(), m = O || N;
      if (m && s.id)
        try {
          const a = new FormData();
          a.append("file", m, "recording.webm");
          const b = await fetch(`${x}/tickets/${s.id}/video`, {
            method: "POST",
            headers: { "X-BOM-API-Key": A },
            body: a
          });
          b.ok || console.warn(`[Bug Out] Video upload failed (${b.status}) for ticket ${s.id}`);
        } catch (a) {
          console.warn("[Bug Out] Video upload network error:", a);
        }
      ne(!0), setTimeout(() => {
        g(!1), ce();
      }, 2e3);
    } catch (t) {
      C(t.message || "Failed to submit");
    } finally {
      re(!1);
    }
  }, T = {
    padding: "8px 16px",
    border: "none",
    borderRadius: 6,
    cursor: "pointer",
    fontSize: 14,
    fontWeight: 600,
    transition: "opacity 0.2s"
  };
  return /* @__PURE__ */ n(H, { children: [
    (() => {
      const t = he * 2, i = h[0], s = h[1], m = `${i}8c`, a = ge.current;
      return /* @__PURE__ */ e(
        "button",
        {
          type: "button",
          role: "button",
          "aria-label": "Report a bug",
          title: "Report a bug or request a feature",
          onClick: () => {
            U || ce(), g(!U);
          },
          className: "bom-orb-wrap",
          style: {
            ...ke,
            width: t,
            height: t,
            "--bom-core": i,
            "--bom-ring": s,
            "--bom-halo": m,
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
                    /* @__PURE__ */ n("radialGradient", { id: `${a}-core`, cx: "50%", cy: "50%", r: "50%", children: [
                      /* @__PURE__ */ e("stop", { offset: "0%", stopColor: i, stopOpacity: "1" }),
                      /* @__PURE__ */ e("stop", { offset: "55%", stopColor: i, stopOpacity: "0.55" }),
                      /* @__PURE__ */ e("stop", { offset: "100%", stopColor: "#1a0f00", stopOpacity: "0" })
                    ] }),
                    /* @__PURE__ */ n("radialGradient", { id: `${a}-iris`, cx: "50%", cy: "50%", r: "50%", children: [
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
                      fill: `url(#${a}-core)`,
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
                        stroke: s,
                        strokeOpacity: "0.55",
                        strokeWidth: "0.5"
                      }
                    ),
                    Array.from({ length: 36 }).map((b, o) => {
                      const r = o * 10 * Math.PI / 180, l = 50 + Math.cos(r) * 41, w = 50 + Math.sin(r) * 41, p = 50 + Math.cos(r) * (o % 3 === 0 ? 44 : 43), _e = 50 + Math.sin(r) * (o % 3 === 0 ? 44 : 43);
                      return /* @__PURE__ */ e(
                        "line",
                        {
                          x1: l,
                          y1: w,
                          x2: p,
                          y2: _e,
                          stroke: s,
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
                        stroke: s,
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
                        stroke: s,
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
                      fill: `url(#${a}-iris)`,
                      className: "bom-orb__core"
                    }
                  ),
                  /* @__PURE__ */ n("g", { stroke: "#1a0f00", strokeOpacity: "0.55", strokeLinecap: "round", children: [
                    /* @__PURE__ */ e("line", { x1: "50", y1: "42", x2: "50", y2: "42", strokeWidth: "3.4" }),
                    /* @__PURE__ */ e("line", { x1: "50", y1: "48", x2: "50", y2: "58", strokeWidth: "2.4" })
                  ] }),
                  /* @__PURE__ */ e("line", { x1: "50", y1: "6", x2: "50", y2: "14", stroke: s, strokeOpacity: "0.7", strokeWidth: "0.6" }),
                  /* @__PURE__ */ e("line", { x1: "50", y1: "86", x2: "50", y2: "94", stroke: s, strokeOpacity: "0.7", strokeWidth: "0.6" }),
                  /* @__PURE__ */ e("line", { x1: "6", y1: "50", x2: "14", y2: "50", stroke: s, strokeOpacity: "0.7", strokeWidth: "0.6" }),
                  /* @__PURE__ */ e("line", { x1: "86", y1: "50", x2: "94", y2: "50", stroke: s, strokeOpacity: "0.7", strokeWidth: "0.6" })
                ]
              }
            ),
            /* @__PURE__ */ e("span", { className: "bom-orb__scan" })
          ] })
        }
      );
    })(),
    U && /* @__PURE__ */ e(
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
          t.target === t.currentTarget && g(!1);
        },
        children: /* @__PURE__ */ e(
          "div",
          {
            style: {
              background: ae,
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
            children: ye ? /* @__PURE__ */ n("div", { style: { textAlign: "center", padding: 40 }, children: [
              /* @__PURE__ */ e("div", { style: { fontSize: 48, marginBottom: 16 }, children: "✓" }),
              /* @__PURE__ */ e("h3", { style: { margin: 0, fontSize: 20 }, children: "Submitted!" }),
              /* @__PURE__ */ e("p", { style: { opacity: 0.7, marginTop: 8 }, children: "Thank you for your feedback." })
            ] }) : /* @__PURE__ */ n(H, { children: [
              /* @__PURE__ */ n("div", { style: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }, children: [
                /* @__PURE__ */ e("h3", { style: { margin: 0, fontSize: 18, fontWeight: 700 }, children: "Report an Issue" }),
                /* @__PURE__ */ e(
                  "div",
                  {
                    onClick: () => g(!1),
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
                    onClick: () => K(t.value),
                    style: {
                      flex: 1,
                      padding: "8px 4px",
                      textAlign: "center",
                      borderRadius: 6,
                      border: `2px solid ${z === t.value ? h[0] : y}`,
                      background: z === t.value ? `${h[0]}22` : "transparent",
                      cursor: "pointer",
                      fontSize: 12,
                      fontWeight: z === t.value ? 700 : 400
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
                    value: Q,
                    onChange: (t) => Z(t.target.value),
                    style: {
                      width: "100%",
                      padding: "8px 12px",
                      borderRadius: 6,
                      border: `1px solid ${y}`,
                      background: W,
                      color: k,
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
                    value: L,
                    onChange: (t) => ee(t.target.value),
                    placeholder: "Brief summary of the issue",
                    maxLength: 500,
                    style: {
                      width: "100%",
                      padding: "8px 12px",
                      borderRadius: 6,
                      border: `1px solid ${y}`,
                      background: W,
                      color: k,
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
                    value: te,
                    onChange: (t) => oe(t.target.value),
                    placeholder: "Describe the issue in detail...",
                    rows: 3,
                    style: {
                      width: "100%",
                      padding: "8px 12px",
                      borderRadius: 6,
                      border: `1px solid ${y}`,
                      background: W,
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
                /* @__PURE__ */ e("label", { style: { display: "block", marginBottom: 4, fontSize: 13, fontWeight: 600, opacity: 0.8 }, children: "Screen Recording" }),
                we ? /* @__PURE__ */ n("div", { children: [
                  /* @__PURE__ */ e(
                    "input",
                    {
                      type: "file",
                      accept: "video/*",
                      onChange: (t) => {
                        var i;
                        return se(((i = t.target.files) == null ? void 0 : i[0]) || null);
                      },
                      style: { fontSize: 13 }
                    }
                  ),
                  N && /* @__PURE__ */ e("span", { style: { fontSize: 12, opacity: 0.7, marginLeft: 8 }, children: N.name })
                ] }) : /* @__PURE__ */ n("div", { style: { display: "flex", gap: 8, alignItems: "center" }, children: [
                  !M && !O && /* @__PURE__ */ e(
                    "div",
                    {
                      onClick: Se,
                      style: {
                        ...T,
                        background: `linear-gradient(135deg, ${h[0]}, ${h[1]})`,
                        color: "#fff"
                      },
                      children: "Start Recording"
                    }
                  ),
                  M && /* @__PURE__ */ e(
                    "div",
                    {
                      onClick: le,
                      style: { ...T, background: "#e53935", color: "#fff" },
                      children: "Stop Recording"
                    }
                  ),
                  O && /* @__PURE__ */ n(H, { children: [
                    /* @__PURE__ */ n("span", { style: { fontSize: 12, opacity: 0.7 }, children: [
                      "Recording captured (",
                      (O.size / 1024 / 1024).toFixed(1),
                      " MB)"
                    ] }),
                    /* @__PURE__ */ e(
                      "div",
                      {
                        onClick: () => $(null),
                        style: { ...T, background: "#666", color: "#fff", padding: "4px 10px", fontSize: 12 },
                        children: "Remove"
                      }
                    )
                  ] }),
                  M && /* @__PURE__ */ e("span", { style: { fontSize: 12, color: "#e53935", fontWeight: 600 }, children: "Recording..." })
                ] })
              ] }),
              D && /* @__PURE__ */ n("div", { style: { marginBottom: 14 }, children: [
                /* @__PURE__ */ e("label", { style: { display: "block", marginBottom: 4, fontSize: 13, fontWeight: 600, opacity: 0.8 }, children: "Voice Transcript" }),
                /* @__PURE__ */ e(
                  "div",
                  {
                    style: {
                      padding: "8px 12px",
                      borderRadius: 6,
                      background: W,
                      border: `1px solid ${y}`,
                      fontSize: 13,
                      maxHeight: 80,
                      overflowY: "auto",
                      opacity: 0.8
                    },
                    children: D
                  }
                )
              ] }),
              (c.current.length > 0 || d.current.length > 0) && /* @__PURE__ */ n("div", { style: {
                marginBottom: 14,
                padding: "6px 12px",
                borderRadius: 6,
                background: v ? "#2a1a1a" : "#fff3f0",
                border: `1px solid ${v ? "#4a2020" : "#ffccc7"}`,
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
              ie && /* @__PURE__ */ e("div", { style: { color: "#e53935", fontSize: 13, marginBottom: 10 }, children: ie }),
              /* @__PURE__ */ n("div", { style: { display: "flex", gap: 8, justifyContent: "flex-end" }, children: [
                /* @__PURE__ */ e(
                  "div",
                  {
                    onClick: () => g(!1),
                    style: {
                      ...T,
                      background: "transparent",
                      color: k,
                      border: `1px solid ${y}`
                    },
                    children: "Cancel"
                  }
                ),
                /* @__PURE__ */ e(
                  "div",
                  {
                    onClick: S ? void 0 : Re,
                    style: {
                      ...T,
                      background: S ? "#666" : `linear-gradient(135deg, ${h[0]}, ${h[1]})`,
                      color: "#fff",
                      opacity: S ? 0.6 : 1,
                      cursor: S ? "not-allowed" : "pointer"
                    },
                    children: S ? "Submitting..." : "Submit"
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
          top: E.top,
          left: E.left,
          zIndex: 1000001,
          display: "flex",
          alignItems: "center",
          gap: 10,
          padding: "8px 12px",
          background: ae,
          color: k,
          borderRadius: 999,
          border: `1px solid ${y}`,
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
                R.current = {
                  x: t.clientX - E.left,
                  y: t.clientY - E.top
                };
                const i = (m) => {
                  R.current && ve({
                    left: Math.max(0, Math.min(window.innerWidth - 240, m.clientX - R.current.x)),
                    top: Math.max(0, Math.min(window.innerHeight - 50, m.clientY - R.current.y))
                  });
                }, s = () => {
                  R.current = null, document.removeEventListener("mousemove", i), document.removeEventListener("mouseup", s);
                };
                document.addEventListener("mousemove", i), document.addEventListener("mouseup", s);
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
              onClick: le,
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
  Ee as BugOutManagedWidget,
  Ee as BugsManagedWidget
};
