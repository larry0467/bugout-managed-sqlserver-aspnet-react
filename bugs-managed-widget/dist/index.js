import { jsxs as n, Fragment as J, jsx as e } from "react/jsx-runtime";
import { useRef as x, useState as b, useEffect as K, useCallback as xe } from "react";
const Le = "bom-draft", R = "chunks";
function Q() {
  return new Promise((f, p) => {
    const l = indexedDB.open(Le, 1);
    l.onupgradeneeded = () => l.result.createObjectStore(R, { autoIncrement: !0 }), l.onsuccess = () => f(l.result), l.onerror = () => p(l.error);
  });
}
function De(f) {
  Q().then((p) => {
    const l = p.transaction(R, "readwrite");
    l.objectStore(R).add(f), l.oncomplete = () => p.close(), l.onerror = () => p.close();
  }).catch(() => {
  });
}
function Ue() {
  return Q().then(
    (f) => new Promise((p) => {
      const E = f.transaction(R, "readonly").objectStore(R).getAll();
      E.onsuccess = () => {
        f.close(), p(E.result);
      }, E.onerror = () => {
        f.close(), p([]);
      };
    })
  ).catch(() => []);
}
function F() {
  Q().then((f) => {
    const p = f.transaction(R, "readwrite");
    p.objectStore(R).clear(), p.oncomplete = () => f.close(), p.onerror = () => f.close();
  }).catch(() => {
  });
}
const $e = [
  { value: "BUG", label: "Bug Report" },
  { value: "FEATURE_REQUEST", label: "Feature Request" },
  { value: "QUESTION", label: "Question" }
], Ae = [
  { value: "LOW", label: "Low" },
  { value: "MEDIUM", label: "Medium" },
  { value: "HIGH", label: "High" },
  { value: "CRITICAL", label: "Critical" }
], je = (f) => {
  const {
    apiKey: p,
    apiUrl: l,
    userEmail: E,
    userName: ke,
    theme: Se = "dark",
    position: Re = "bottom-right",
    orbSize: _e = 24,
    // Bug Out's identity is amber/orange ("we caught a bug" — warm, high contrast).
    // Hosts can override; if they do, we treat [0]=core, [1]=ring.
    orbColors: k = ["#fbbf24", "#fb923c"],
    // Tenant context
    tenantId: Z,
    tenantName: ee,
    databaseName: te,
    appVersion: oe,
    environment: re,
    onApiReady: z,
    hideOrb: Te = !1
  } = f, Me = x(
    `bom-orb-${Math.random().toString(36).slice(2, 9)}`
  ), [H, y] = b(!1), [W, ne] = b(!1), [L, D] = b(null), [Ee, ie] = b(!1), [X, se] = b(""), [U, ae] = b("BUG"), [ce, le] = b("MEDIUM"), [Y, de] = b(""), [pe, ue] = b(""), [O, me] = b(!1), [Oe, he] = b(!1), [be, $] = b(""), [Be, Ce] = b(!1), [q, fe] = b(null), [_, ge] = b(() => ({
    top: 24,
    left: typeof window < "u" ? Math.max(24, window.innerWidth - 280) : 24
  })), w = x(null), A = x(null), G = x([]), V = x(null), N = x(null), B = x(null), u = x([]), m = x([]);
  K(() => {
    z == null || z({ open: () => y(!0), close: () => y(!1) });
  }, [z]), K(() => {
    Ue().then((t) => {
      if (t.length === 0) return;
      const r = new Blob(t, { type: "video/webm" });
      F(), D(r), ie(!0), y(!0);
    });
  }, []), K(() => {
    if (Ce(/Android|iPhone|iPad|iPod/i.test(navigator.userAgent)), !B.current) {
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
      `, document.head.appendChild(o), B.current = o;
    }
    const t = console.error;
    console.error = (...o) => {
      u.current.push({
        type: "console.error",
        message: o.map((s) => typeof s == "object" ? JSON.stringify(s) : String(s)).join(" "),
        timestamp: (/* @__PURE__ */ new Date()).toISOString()
      }), u.current.length > 50 && u.current.shift(), t.apply(console, o);
    };
    const r = (o) => {
      u.current.push({
        type: "window.onerror",
        message: o.message,
        source: o.filename,
        line: o.lineno,
        col: o.colno,
        timestamp: (/* @__PURE__ */ new Date()).toISOString()
      }), u.current.length > 50 && u.current.shift();
    };
    window.addEventListener("error", r);
    const i = (o) => {
      var s;
      u.current.push({
        type: "unhandledrejection",
        message: ((s = o.reason) == null ? void 0 : s.message) || String(o.reason),
        timestamp: (/* @__PURE__ */ new Date()).toISOString()
      }), u.current.length > 50 && u.current.shift();
    };
    window.addEventListener("unhandledrejection", i);
    const h = window.fetch;
    window.fetch = async (...o) => {
      var v;
      const s = typeof o[0] == "string" ? o[0] : o[0].url, a = (((v = o[1]) == null ? void 0 : v.method) || "GET").toUpperCase();
      try {
        const c = await h.apply(window, o);
        return !c.ok && !s.includes(l) && (m.current.push({
          method: a,
          url: s,
          status: c.status,
          statusText: c.statusText,
          timestamp: (/* @__PURE__ */ new Date()).toISOString()
        }), m.current.length > 30 && m.current.shift()), c;
      } catch (c) {
        throw s.includes(l) || (m.current.push({
          method: a,
          url: s,
          status: 0,
          statusText: c.message || "Network Error",
          timestamp: (/* @__PURE__ */ new Date()).toISOString()
        }), m.current.length > 30 && m.current.shift()), c;
      }
    };
    const d = XMLHttpRequest.prototype.open, g = XMLHttpRequest.prototype.send;
    return XMLHttpRequest.prototype.open = function(o, s, ...a) {
      return this._bomMethod = o, this._bomUrl = String(s), d.apply(this, [o, s, ...a]);
    }, XMLHttpRequest.prototype.send = function(...o) {
      return this.addEventListener("loadend", () => {
        var s;
        this.status >= 400 && !((s = this._bomUrl) != null && s.includes(l)) && (m.current.push({
          method: this._bomMethod || "GET",
          url: this._bomUrl || "",
          status: this.status,
          statusText: this.statusText,
          timestamp: (/* @__PURE__ */ new Date()).toISOString()
        }), m.current.length > 30 && m.current.shift());
      }), g.apply(this, o);
    }, () => {
      B.current && (document.head.removeChild(B.current), B.current = null), console.error = t, window.removeEventListener("error", r), window.removeEventListener("unhandledrejection", i), window.fetch = h, XMLHttpRequest.prototype.open = d, XMLHttpRequest.prototype.send = g;
    };
  }, [l]);
  const T = Se === "dark", ye = T ? "#1a1a2e" : "#ffffff", M = T ? "#e0e0e0" : "#333333", S = T ? "#333" : "#ddd", P = T ? "#16213e" : "#f5f5f5", Ie = Re === "bottom-left" ? { bottom: 24, left: 24 } : { bottom: 24, right: 24 }, ze = xe(async () => {
    try {
      const t = await navigator.mediaDevices.getDisplayMedia({
        video: !0,
        // systemAudio: 'include' pre-checks the "Also share system audio" toggle in Chrome 105+.
        audio: { systemAudio: "include", suppressLocalAudioPlayback: !1 }
      });
      let r = null;
      try {
        r = await navigator.mediaDevices.getUserMedia({ audio: !0, video: !1 });
      } catch {
      }
      V.current = r;
      const i = ((r == null ? void 0 : r.getAudioTracks().length) ?? 0) > 0, h = t.getAudioTracks().length > 0;
      !i && !h && alert(
        `Your recording will have no audio.

To capture audio, re-start the recording and either:
  • Enable "Also share system audio" in the screen picker (Chrome), or
  • Allow microphone access when prompted.

The recording will continue without audio.`
      );
      const d = i ? r.getAudioTracks() : t.getAudioTracks(), g = new MediaStream([...t.getVideoTracks(), ...d]), o = new MediaRecorder(g, {
        mimeType: MediaRecorder.isTypeSupported("video/webm;codecs=vp9") ? "video/webm;codecs=vp9" : "video/webm"
      });
      G.current = [], F(), o.ondataavailable = (a) => {
        a.data.size > 0 && (G.current.push(a.data), De(a.data));
      }, o.onstop = () => {
        var v;
        const a = new Blob(G.current, { type: "video/webm" });
        F(), D(a), t.getTracks().forEach((c) => c.stop()), (v = V.current) == null || v.getTracks().forEach((c) => c.stop()), V.current = null;
      }, o.start(1e3), A.current = o, ne(!0), y(!1);
      const s = window.SpeechRecognition || window.webkitSpeechRecognition;
      if (s) {
        const a = new s();
        a.continuous = !0, a.interimResults = !0, a.lang = "en-US";
        let v = "";
        a.onresult = (c) => {
          let j = "";
          for (let I = c.resultIndex; I < c.results.length; I++)
            c.results[I].isFinal ? v += c.results[I][0].transcript + " " : j += c.results[I][0].transcript;
          se(v + j);
        }, a.onerror = () => {
        }, a.start(), N.current = a;
      }
    } catch (t) {
      console.error("Failed to start recording:", t);
    }
  }, []), we = xe(() => {
    A.current && A.current.state !== "inactive" && A.current.stop(), N.current && (N.current.stop(), N.current = null), ne(!1), y(!0);
  }, []), ve = () => {
    de(""), ue(""), ae("BUG"), le("MEDIUM"), se(""), D(null), fe(null), $(""), he(!1), ie(!1), F();
  }, We = async () => {
    if (!Y.trim()) {
      $("Title is required");
      return;
    }
    me(!0), $("");
    try {
      const t = {
        title: Y.trim(),
        description: pe.trim(),
        ticketType: U,
        priority: ce,
        submittedBy: E || ke || "Anonymous",
        currentPageUrl: window.location.href,
        currentPageName: document.title,
        browserInfo: navigator.userAgent,
        screenWidth: window.innerWidth,
        screenHeight: window.innerHeight,
        transcript: X || null,
        consoleErrors: u.current.length > 0 ? JSON.stringify(u.current) : null,
        networkErrors: m.current.length > 0 ? JSON.stringify(m.current) : null
      };
      Z && (t.tenantId = Z), ee && (t.tenantName = ee), te && (t.databaseName = te), oe && (t.applicationVersion = oe), re && (t.environment = re);
      const r = await fetch(`${l}/tickets`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-BOM-API-Key": p
        },
        body: JSON.stringify(t)
      });
      if (!r.ok) throw new Error("Failed to submit ticket");
      const i = await r.json(), h = L || q;
      if (h && i.id)
        try {
          const d = new FormData();
          d.append("file", h, "recording.webm");
          const g = await fetch(`${l}/tickets/${i.id}/video`, {
            method: "POST",
            headers: { "X-BOM-API-Key": p },
            body: d
          });
          g.ok || console.warn(`[Bug Out] Video upload failed (${g.status}) for ticket ${i.id}`);
        } catch (d) {
          console.warn("[Bug Out] Video upload network error:", d);
        }
      he(!0), setTimeout(() => {
        y(!1), ve();
      }, 2e3);
    } catch (t) {
      $(t.message || "Failed to submit");
    } finally {
      me(!1);
    }
  }, C = {
    padding: "8px 16px",
    border: "none",
    borderRadius: 6,
    cursor: "pointer",
    fontSize: 14,
    fontWeight: 600,
    transition: "opacity 0.2s"
  };
  return /* @__PURE__ */ n(J, { children: [
    !Te && (() => {
      const t = _e * 2, r = k[0], i = k[1], h = `${r}8c`, d = Me.current;
      return /* @__PURE__ */ e(
        "button",
        {
          type: "button",
          role: "button",
          "aria-label": "Report a bug",
          title: "Report a bug or request a feature",
          onClick: () => {
            H || ve(), y(!H);
          },
          className: "bom-orb-wrap",
          style: {
            ...Ie,
            width: t,
            height: t,
            "--bom-core": r,
            "--bom-ring": i,
            "--bom-halo": h,
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
                    /* @__PURE__ */ n("radialGradient", { id: `${d}-core`, cx: "50%", cy: "50%", r: "50%", children: [
                      /* @__PURE__ */ e("stop", { offset: "0%", stopColor: r, stopOpacity: "1" }),
                      /* @__PURE__ */ e("stop", { offset: "55%", stopColor: r, stopOpacity: "0.55" }),
                      /* @__PURE__ */ e("stop", { offset: "100%", stopColor: "#1a0f00", stopOpacity: "0" })
                    ] }),
                    /* @__PURE__ */ n("radialGradient", { id: `${d}-iris`, cx: "50%", cy: "50%", r: "50%", children: [
                      /* @__PURE__ */ e("stop", { offset: "0%", stopColor: "#fff7dc", stopOpacity: "0.95" }),
                      /* @__PURE__ */ e("stop", { offset: "40%", stopColor: r, stopOpacity: "0.7" }),
                      /* @__PURE__ */ e("stop", { offset: "100%", stopColor: r, stopOpacity: "0" })
                    ] })
                  ] }),
                  /* @__PURE__ */ e(
                    "circle",
                    {
                      cx: "50",
                      cy: "50",
                      r: "48",
                      fill: `url(#${d}-core)`,
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
                        stroke: i,
                        strokeOpacity: "0.55",
                        strokeWidth: "0.5"
                      }
                    ),
                    Array.from({ length: 36 }).map((g, o) => {
                      const s = o * 10 * Math.PI / 180, a = 50 + Math.cos(s) * 41, v = 50 + Math.sin(s) * 41, c = 50 + Math.cos(s) * (o % 3 === 0 ? 44 : 43), j = 50 + Math.sin(s) * (o % 3 === 0 ? 44 : 43);
                      return /* @__PURE__ */ e(
                        "line",
                        {
                          x1: a,
                          y1: v,
                          x2: c,
                          y2: j,
                          stroke: i,
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
                        stroke: i,
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
                        stroke: i,
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
                      stroke: r,
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
                      fill: `url(#${d}-iris)`,
                      className: "bom-orb__core"
                    }
                  ),
                  /* @__PURE__ */ n("g", { stroke: "#1a0f00", strokeOpacity: "0.55", strokeLinecap: "round", children: [
                    /* @__PURE__ */ e("line", { x1: "50", y1: "42", x2: "50", y2: "42", strokeWidth: "3.4" }),
                    /* @__PURE__ */ e("line", { x1: "50", y1: "48", x2: "50", y2: "58", strokeWidth: "2.4" })
                  ] }),
                  /* @__PURE__ */ e("line", { x1: "50", y1: "6", x2: "50", y2: "14", stroke: i, strokeOpacity: "0.7", strokeWidth: "0.6" }),
                  /* @__PURE__ */ e("line", { x1: "50", y1: "86", x2: "50", y2: "94", stroke: i, strokeOpacity: "0.7", strokeWidth: "0.6" }),
                  /* @__PURE__ */ e("line", { x1: "6", y1: "50", x2: "14", y2: "50", stroke: i, strokeOpacity: "0.7", strokeWidth: "0.6" }),
                  /* @__PURE__ */ e("line", { x1: "86", y1: "50", x2: "94", y2: "50", stroke: i, strokeOpacity: "0.7", strokeWidth: "0.6" })
                ]
              }
            ),
            /* @__PURE__ */ e("span", { className: "bom-orb__scan" })
          ] })
        }
      );
    })(),
    H && /* @__PURE__ */ e(
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
          t.target === t.currentTarget && y(!1);
        },
        children: /* @__PURE__ */ e(
          "div",
          {
            style: {
              background: ye,
              color: M,
              borderRadius: 12,
              padding: 24,
              width: "90%",
              maxWidth: 520,
              maxHeight: "85vh",
              overflowY: "auto",
              boxShadow: "0 20px 60px rgba(0,0,0,0.3)",
              fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
            },
            children: Oe ? /* @__PURE__ */ n("div", { style: { textAlign: "center", padding: 40 }, children: [
              /* @__PURE__ */ e("div", { style: { fontSize: 48, marginBottom: 16 }, children: "✓" }),
              /* @__PURE__ */ e("h3", { style: { margin: 0, fontSize: 20 }, children: "Submitted!" }),
              /* @__PURE__ */ e("p", { style: { opacity: 0.7, marginTop: 8 }, children: "Thank you for your feedback." })
            ] }) : /* @__PURE__ */ n(J, { children: [
              /* @__PURE__ */ n("div", { style: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }, children: [
                /* @__PURE__ */ e("h3", { style: { margin: 0, fontSize: 18, fontWeight: 700 }, children: "Report an Issue" }),
                /* @__PURE__ */ e(
                  "div",
                  {
                    onClick: () => y(!1),
                    style: { cursor: "pointer", fontSize: 20, opacity: 0.6, padding: "0 4px" },
                    children: "✕"
                  }
                )
              ] }),
              /* @__PURE__ */ n("div", { style: { marginBottom: 14 }, children: [
                /* @__PURE__ */ e("label", { style: { display: "block", marginBottom: 4, fontSize: 13, fontWeight: 600, opacity: 0.8 }, children: "Type" }),
                /* @__PURE__ */ e("div", { style: { display: "flex", gap: 8 }, children: $e.map((t) => /* @__PURE__ */ e(
                  "div",
                  {
                    onClick: () => ae(t.value),
                    style: {
                      flex: 1,
                      padding: "8px 4px",
                      textAlign: "center",
                      borderRadius: 6,
                      border: `2px solid ${U === t.value ? k[0] : S}`,
                      background: U === t.value ? `${k[0]}22` : "transparent",
                      cursor: "pointer",
                      fontSize: 12,
                      fontWeight: U === t.value ? 700 : 400
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
                    value: ce,
                    onChange: (t) => le(t.target.value),
                    style: {
                      width: "100%",
                      padding: "8px 12px",
                      borderRadius: 6,
                      border: `1px solid ${S}`,
                      background: P,
                      color: M,
                      fontSize: 14,
                      outline: "none"
                    },
                    children: Ae.map((t) => /* @__PURE__ */ e("option", { value: t.value, children: t.label }, t.value))
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
                    value: Y,
                    onChange: (t) => de(t.target.value),
                    placeholder: "Brief summary of the issue",
                    maxLength: 500,
                    style: {
                      width: "100%",
                      padding: "8px 12px",
                      borderRadius: 6,
                      border: `1px solid ${S}`,
                      background: P,
                      color: M,
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
                    value: pe,
                    onChange: (t) => ue(t.target.value),
                    placeholder: "Describe the issue in detail...",
                    rows: 3,
                    style: {
                      width: "100%",
                      padding: "8px 12px",
                      borderRadius: 6,
                      border: `1px solid ${S}`,
                      background: P,
                      color: M,
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
                Be ? /* @__PURE__ */ n("div", { children: [
                  /* @__PURE__ */ e(
                    "input",
                    {
                      type: "file",
                      accept: "video/*",
                      onChange: (t) => {
                        var r;
                        return fe(((r = t.target.files) == null ? void 0 : r[0]) || null);
                      },
                      style: { fontSize: 13 }
                    }
                  ),
                  q && /* @__PURE__ */ e("span", { style: { fontSize: 12, opacity: 0.7, marginLeft: 8 }, children: q.name })
                ] }) : /* @__PURE__ */ n("div", { style: { display: "flex", gap: 8, alignItems: "center" }, children: [
                  !W && !L && /* @__PURE__ */ e(
                    "div",
                    {
                      onClick: ze,
                      style: {
                        ...C,
                        background: `linear-gradient(135deg, ${k[0]}, ${k[1]})`,
                        color: "#fff"
                      },
                      children: "Start Recording"
                    }
                  ),
                  W && /* @__PURE__ */ e(
                    "div",
                    {
                      onClick: we,
                      style: { ...C, background: "#e53935", color: "#fff" },
                      children: "Stop Recording"
                    }
                  ),
                  Ee && /* @__PURE__ */ e("div", { style: {
                    fontSize: 12,
                    color: "#fb923c",
                    background: "rgba(251,146,60,0.12)",
                    border: "1px solid rgba(251,146,60,0.35)",
                    borderRadius: 6,
                    padding: "5px 10px",
                    marginBottom: 4
                  }, children: "Recording recovered after page reload — your video is intact." }),
                  L && /* @__PURE__ */ n(J, { children: [
                    /* @__PURE__ */ n("span", { style: { fontSize: 12, opacity: 0.7 }, children: [
                      "Recording captured (",
                      (L.size / 1024 / 1024).toFixed(1),
                      " MB)"
                    ] }),
                    /* @__PURE__ */ e(
                      "div",
                      {
                        onClick: () => D(null),
                        style: { ...C, background: "#666", color: "#fff", padding: "4px 10px", fontSize: 12 },
                        children: "Remove"
                      }
                    )
                  ] }),
                  W && /* @__PURE__ */ e("span", { style: { fontSize: 12, color: "#e53935", fontWeight: 600 }, children: "Recording..." })
                ] })
              ] }),
              X && /* @__PURE__ */ n("div", { style: { marginBottom: 14 }, children: [
                /* @__PURE__ */ e("label", { style: { display: "block", marginBottom: 4, fontSize: 13, fontWeight: 600, opacity: 0.8 }, children: "Voice Transcript" }),
                /* @__PURE__ */ e(
                  "div",
                  {
                    style: {
                      padding: "8px 12px",
                      borderRadius: 6,
                      background: P,
                      border: `1px solid ${S}`,
                      fontSize: 13,
                      maxHeight: 80,
                      overflowY: "auto",
                      opacity: 0.8
                    },
                    children: X
                  }
                )
              ] }),
              (u.current.length > 0 || m.current.length > 0) && /* @__PURE__ */ n("div", { style: {
                marginBottom: 14,
                padding: "6px 12px",
                borderRadius: 6,
                background: T ? "#2a1a1a" : "#fff3f0",
                border: `1px solid ${T ? "#4a2020" : "#ffccc7"}`,
                fontSize: 12,
                opacity: 0.8
              }, children: [
                u.current.length > 0 && /* @__PURE__ */ n("span", { children: [
                  u.current.length,
                  " console error(s) captured"
                ] }),
                u.current.length > 0 && m.current.length > 0 && " | ",
                m.current.length > 0 && /* @__PURE__ */ n("span", { children: [
                  m.current.length,
                  " network error(s) captured"
                ] }),
                /* @__PURE__ */ e("span", { style: { display: "block", marginTop: 2, opacity: 0.7 }, children: "These will be included in your report automatically." })
              ] }),
              be && /* @__PURE__ */ e("div", { style: { color: "#e53935", fontSize: 13, marginBottom: 10 }, children: be }),
              /* @__PURE__ */ n("div", { style: { display: "flex", gap: 8, justifyContent: "flex-end" }, children: [
                /* @__PURE__ */ e(
                  "div",
                  {
                    onClick: () => y(!1),
                    style: {
                      ...C,
                      background: "transparent",
                      color: M,
                      border: `1px solid ${S}`
                    },
                    children: "Cancel"
                  }
                ),
                /* @__PURE__ */ e(
                  "div",
                  {
                    onClick: O ? void 0 : We,
                    style: {
                      ...C,
                      background: O ? "#666" : `linear-gradient(135deg, ${k[0]}, ${k[1]})`,
                      color: "#fff",
                      opacity: O ? 0.6 : 1,
                      cursor: O ? "not-allowed" : "pointer"
                    },
                    children: O ? "Submitting..." : "Submit"
                  }
                )
              ] }),
              /* @__PURE__ */ e("div", { style: { marginTop: 14, fontSize: 11, opacity: 0.4, textAlign: "center" }, children: "Page URL, browser info, screen size, and console errors will be captured automatically." })
            ] })
          }
        )
      }
    ),
    W && /* @__PURE__ */ n(
      "div",
      {
        onMouseDown: (t) => {
          if (t.target.closest("[data-bom-stop]")) return;
          t.preventDefault(), w.current = {
            x: t.clientX - _.left,
            y: t.clientY - _.top
          };
          const r = (h) => {
            w.current && ge({
              left: Math.max(0, Math.min(window.innerWidth - 240, h.clientX - w.current.x)),
              top: Math.max(0, Math.min(window.innerHeight - 50, h.clientY - w.current.y))
            });
          }, i = () => {
            w.current = null, document.removeEventListener("mousemove", r), document.removeEventListener("mouseup", i);
          };
          document.addEventListener("mousemove", r), document.addEventListener("mouseup", i);
        },
        onTouchStart: (t) => {
          if (t.target.closest("[data-bom-stop]")) return;
          const r = t.touches[0];
          w.current = {
            x: r.clientX - _.left,
            y: r.clientY - _.top
          };
          const i = (d) => {
            if (!w.current) return;
            d.preventDefault();
            const g = d.touches[0];
            ge({
              left: Math.max(0, Math.min(window.innerWidth - 240, g.clientX - w.current.x)),
              top: Math.max(0, Math.min(window.innerHeight - 50, g.clientY - w.current.y))
            });
          }, h = () => {
            w.current = null, document.removeEventListener("touchmove", i), document.removeEventListener("touchend", h);
          };
          document.addEventListener("touchmove", i, { passive: !1 }), document.addEventListener("touchend", h);
        },
        style: {
          position: "fixed",
          top: _.top,
          left: _.left,
          zIndex: 1000001,
          display: "flex",
          alignItems: "center",
          gap: 10,
          padding: "8px 12px",
          background: ye,
          color: M,
          borderRadius: 999,
          border: `1px solid ${S}`,
          boxShadow: "0 8px 24px rgba(0,0,0,0.35)",
          fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
          fontSize: 13,
          userSelect: "none",
          cursor: "grab",
          touchAction: "none"
        },
        children: [
          /* @__PURE__ */ e("span", { style: { opacity: 0.45, fontSize: 14, lineHeight: 1, pointerEvents: "none" }, children: "☰" }),
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
                animation: "bom-pulse 1.4s ease-out infinite",
                pointerEvents: "none"
              }
            }
          ),
          /* @__PURE__ */ e("span", { style: { fontWeight: 600, pointerEvents: "none" }, children: "Recording" }),
          /* @__PURE__ */ e(
            "div",
            {
              "data-bom-stop": "true",
              onClick: we,
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
  je as BugOutManagedWidget,
  je as BugsManagedWidget
};
