import { jsxs as i, Fragment as U, jsx as t } from "react/jsx-runtime";
import { useState as n, useRef as z, useEffect as de, useCallback as _ } from "react";
const ue = [
  { value: "BUG", label: "Bug Report" },
  { value: "FEATURE_REQUEST", label: "Feature Request" },
  { value: "QUESTION", label: "Question" }
], pe = [
  { value: "LOW", label: "Low" },
  { value: "MEDIUM", label: "Medium" },
  { value: "HIGH", label: "High" },
  { value: "CRITICAL", label: "Critical" }
], me = (J) => {
  const {
    apiKey: V,
    apiUrl: W,
    userEmail: X,
    userName: Z,
    theme: ee = "dark",
    position: te = "bottom-right",
    orbSize: y = 24,
    orbColors: l = ["#4caf50", "#ff9800"]
  } = J, [B, c] = n(!1), [T, F] = n(!1), [b, C] = n(null), [I, P] = n(""), [v, D] = n("BUG"), [A, j] = n("MEDIUM"), [E, O] = n(""), [H, L] = n(""), [d, Y] = n(!1), [ie, G] = n(!1), [N, x] = n(""), [oe, ne] = n(!1), [M, q] = n(null), S = z(null), $ = z([]), k = z(null), u = z(null);
  de(() => {
    if (ne(/Android|iPhone|iPad|iPod/i.test(navigator.userAgent)), !u.current) {
      const e = document.createElement("style");
      e.textContent = `
        @keyframes bm-orb-pulse {
          0%, 100% { transform: scale(1); opacity: 0.9; }
          50% { transform: scale(1.15); opacity: 1; }
        }
        @keyframes bm-fade-in {
          from { opacity: 0; transform: translateY(10px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `, document.head.appendChild(e), u.current = e;
    }
    return () => {
      u.current && (document.head.removeChild(u.current), u.current = null);
    };
  }, []);
  const w = ee === "dark", re = w ? "#1a1a2e" : "#ffffff", p = w ? "#e0e0e0" : "#333333", s = w ? "#333" : "#ddd", R = w ? "#16213e" : "#f5f5f5", le = te === "bottom-left" ? { bottom: 24, left: 24 } : { bottom: 24, right: 24 }, ae = _(async () => {
    try {
      const e = await navigator.mediaDevices.getDisplayMedia({
        video: !0,
        audio: !0
      }), r = new MediaRecorder(e, {
        mimeType: MediaRecorder.isTypeSupported("video/webm;codecs=vp9") ? "video/webm;codecs=vp9" : "video/webm"
      });
      $.current = [], r.ondataavailable = (o) => {
        o.data.size > 0 && $.current.push(o.data);
      }, r.onstop = () => {
        const o = new Blob($.current, { type: "video/webm" });
        C(o), e.getTracks().forEach((a) => a.stop());
      }, r.start(1e3), S.current = r, F(!0);
      const g = window.SpeechRecognition || window.webkitSpeechRecognition;
      if (g) {
        const o = new g();
        o.continuous = !0, o.interimResults = !0, o.lang = "en-US";
        let a = "";
        o.onresult = (m) => {
          let Q = "";
          for (let h = m.resultIndex; h < m.results.length; h++)
            m.results[h].isFinal ? a += m.results[h][0].transcript + " " : Q += m.results[h][0].transcript;
          P(a + Q);
        }, o.onerror = () => {
        }, o.start(), k.current = o;
      }
    } catch (e) {
      console.error("Failed to start recording:", e);
    }
  }, []), se = _(() => {
    S.current && S.current.state !== "inactive" && S.current.stop(), k.current && (k.current.stop(), k.current = null), F(!1);
  }, []), K = () => {
    O(""), L(""), D("BUG"), j("MEDIUM"), P(""), C(null), q(null), x(""), G(!1);
  }, ce = async () => {
    if (!E.trim()) {
      x("Title is required");
      return;
    }
    Y(!0), x("");
    try {
      const e = {
        title: E.trim(),
        description: H.trim(),
        ticketType: v,
        priority: A,
        submittedBy: X || Z || "Anonymous",
        currentPageUrl: window.location.href,
        currentPageName: document.title,
        browserInfo: navigator.userAgent,
        screenWidth: window.innerWidth,
        screenHeight: window.innerHeight,
        transcript: I || null,
        consoleErrors: null,
        networkErrors: null
      }, r = await fetch(`${W}/tickets`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-BM-API-Key": V
        },
        body: JSON.stringify(e)
      });
      if (!r.ok) throw new Error("Failed to submit ticket");
      const g = await r.json(), o = b || M;
      if (o && g.id) {
        const a = new FormData();
        a.append("file", o, "recording.webm"), await fetch(`${W}/tickets/${g.id}/video`, {
          method: "POST",
          body: a
        });
      }
      G(!0), setTimeout(() => {
        c(!1), K();
      }, 2e3);
    } catch (e) {
      x(e.message || "Failed to submit");
    } finally {
      Y(!1);
    }
  }, f = {
    padding: "8px 16px",
    border: "none",
    borderRadius: 6,
    cursor: "pointer",
    fontSize: 14,
    fontWeight: 600,
    transition: "opacity 0.2s"
  };
  return /* @__PURE__ */ i(U, { children: [
    /* @__PURE__ */ t(
      "div",
      {
        onClick: () => {
          B || K(), c(!B);
        },
        style: {
          position: "fixed",
          ...le,
          width: y * 2,
          height: y * 2,
          borderRadius: "50%",
          background: `linear-gradient(135deg, ${l[0]}, ${l[1]})`,
          cursor: "pointer",
          zIndex: 999999,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          boxShadow: `0 4px 20px ${l[0]}66`,
          animation: "bm-orb-pulse 3s ease-in-out infinite"
        },
        title: "Report a bug or request a feature",
        children: /* @__PURE__ */ i("svg", { width: y, height: y, viewBox: "0 0 24 24", fill: "none", stroke: "#fff", strokeWidth: "2", children: [
          /* @__PURE__ */ t("circle", { cx: "12", cy: "12", r: "10" }),
          /* @__PURE__ */ t("path", { d: "M12 8v4M12 16h.01" })
        ] })
      }
    ),
    B && /* @__PURE__ */ t(
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
          animation: "bm-fade-in 0.2s ease-out"
        },
        onClick: (e) => {
          e.target === e.currentTarget && c(!1);
        },
        children: /* @__PURE__ */ t(
          "div",
          {
            style: {
              background: re,
              color: p,
              borderRadius: 12,
              padding: 24,
              width: "90%",
              maxWidth: 520,
              maxHeight: "85vh",
              overflowY: "auto",
              boxShadow: "0 20px 60px rgba(0,0,0,0.3)",
              fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
            },
            children: ie ? /* @__PURE__ */ i("div", { style: { textAlign: "center", padding: 40 }, children: [
              /* @__PURE__ */ t("div", { style: { fontSize: 48, marginBottom: 16 }, children: "✓" }),
              /* @__PURE__ */ t("h3", { style: { margin: 0, fontSize: 20 }, children: "Submitted!" }),
              /* @__PURE__ */ t("p", { style: { opacity: 0.7, marginTop: 8 }, children: "Thank you for your feedback." })
            ] }) : /* @__PURE__ */ i(U, { children: [
              /* @__PURE__ */ i("div", { style: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }, children: [
                /* @__PURE__ */ t("h3", { style: { margin: 0, fontSize: 18, fontWeight: 700 }, children: "Report an Issue" }),
                /* @__PURE__ */ t(
                  "div",
                  {
                    onClick: () => c(!1),
                    style: { cursor: "pointer", fontSize: 20, opacity: 0.6, padding: "0 4px" },
                    children: "✕"
                  }
                )
              ] }),
              /* @__PURE__ */ i("div", { style: { marginBottom: 14 }, children: [
                /* @__PURE__ */ t("label", { style: { display: "block", marginBottom: 4, fontSize: 13, fontWeight: 600, opacity: 0.8 }, children: "Type" }),
                /* @__PURE__ */ t("div", { style: { display: "flex", gap: 8 }, children: ue.map((e) => /* @__PURE__ */ t(
                  "div",
                  {
                    onClick: () => D(e.value),
                    style: {
                      flex: 1,
                      padding: "8px 4px",
                      textAlign: "center",
                      borderRadius: 6,
                      border: `2px solid ${v === e.value ? l[0] : s}`,
                      background: v === e.value ? `${l[0]}22` : "transparent",
                      cursor: "pointer",
                      fontSize: 12,
                      fontWeight: v === e.value ? 700 : 400
                    },
                    children: e.label
                  },
                  e.value
                )) })
              ] }),
              /* @__PURE__ */ i("div", { style: { marginBottom: 14 }, children: [
                /* @__PURE__ */ t("label", { style: { display: "block", marginBottom: 4, fontSize: 13, fontWeight: 600, opacity: 0.8 }, children: "Priority" }),
                /* @__PURE__ */ t(
                  "select",
                  {
                    value: A,
                    onChange: (e) => j(e.target.value),
                    style: {
                      width: "100%",
                      padding: "8px 12px",
                      borderRadius: 6,
                      border: `1px solid ${s}`,
                      background: R,
                      color: p,
                      fontSize: 14,
                      outline: "none"
                    },
                    children: pe.map((e) => /* @__PURE__ */ t("option", { value: e.value, children: e.label }, e.value))
                  }
                )
              ] }),
              /* @__PURE__ */ i("div", { style: { marginBottom: 14 }, children: [
                /* @__PURE__ */ i("label", { style: { display: "block", marginBottom: 4, fontSize: 13, fontWeight: 600, opacity: 0.8 }, children: [
                  "Title ",
                  /* @__PURE__ */ t("span", { style: { color: "#e53935" }, children: "*" })
                ] }),
                /* @__PURE__ */ t(
                  "input",
                  {
                    type: "text",
                    value: E,
                    onChange: (e) => O(e.target.value),
                    placeholder: "Brief summary of the issue",
                    maxLength: 500,
                    style: {
                      width: "100%",
                      padding: "8px 12px",
                      borderRadius: 6,
                      border: `1px solid ${s}`,
                      background: R,
                      color: p,
                      fontSize: 14,
                      outline: "none",
                      boxSizing: "border-box"
                    }
                  }
                )
              ] }),
              /* @__PURE__ */ i("div", { style: { marginBottom: 14 }, children: [
                /* @__PURE__ */ t("label", { style: { display: "block", marginBottom: 4, fontSize: 13, fontWeight: 600, opacity: 0.8 }, children: "Description" }),
                /* @__PURE__ */ t(
                  "textarea",
                  {
                    value: H,
                    onChange: (e) => L(e.target.value),
                    placeholder: "Describe the issue in detail...",
                    rows: 3,
                    style: {
                      width: "100%",
                      padding: "8px 12px",
                      borderRadius: 6,
                      border: `1px solid ${s}`,
                      background: R,
                      color: p,
                      fontSize: 14,
                      outline: "none",
                      resize: "vertical",
                      boxSizing: "border-box",
                      fontFamily: "inherit"
                    }
                  }
                )
              ] }),
              /* @__PURE__ */ i("div", { style: { marginBottom: 14 }, children: [
                /* @__PURE__ */ t("label", { style: { display: "block", marginBottom: 4, fontSize: 13, fontWeight: 600, opacity: 0.8 }, children: "Screen Recording" }),
                oe ? /* @__PURE__ */ i("div", { children: [
                  /* @__PURE__ */ t(
                    "input",
                    {
                      type: "file",
                      accept: "video/*",
                      onChange: (e) => {
                        var r;
                        return q(((r = e.target.files) == null ? void 0 : r[0]) || null);
                      },
                      style: { fontSize: 13 }
                    }
                  ),
                  M && /* @__PURE__ */ t("span", { style: { fontSize: 12, opacity: 0.7, marginLeft: 8 }, children: M.name })
                ] }) : /* @__PURE__ */ i("div", { style: { display: "flex", gap: 8, alignItems: "center" }, children: [
                  !T && !b && /* @__PURE__ */ t(
                    "div",
                    {
                      onClick: ae,
                      style: {
                        ...f,
                        background: `linear-gradient(135deg, ${l[0]}, ${l[1]})`,
                        color: "#fff"
                      },
                      children: "Start Recording"
                    }
                  ),
                  T && /* @__PURE__ */ t(
                    "div",
                    {
                      onClick: se,
                      style: { ...f, background: "#e53935", color: "#fff" },
                      children: "Stop Recording"
                    }
                  ),
                  b && /* @__PURE__ */ i(U, { children: [
                    /* @__PURE__ */ i("span", { style: { fontSize: 12, opacity: 0.7 }, children: [
                      "Recording captured (",
                      (b.size / 1024 / 1024).toFixed(1),
                      " MB)"
                    ] }),
                    /* @__PURE__ */ t(
                      "div",
                      {
                        onClick: () => C(null),
                        style: { ...f, background: "#666", color: "#fff", padding: "4px 10px", fontSize: 12 },
                        children: "Remove"
                      }
                    )
                  ] }),
                  T && /* @__PURE__ */ t("span", { style: { fontSize: 12, color: "#e53935", fontWeight: 600 }, children: "Recording..." })
                ] })
              ] }),
              I && /* @__PURE__ */ i("div", { style: { marginBottom: 14 }, children: [
                /* @__PURE__ */ t("label", { style: { display: "block", marginBottom: 4, fontSize: 13, fontWeight: 600, opacity: 0.8 }, children: "Voice Transcript" }),
                /* @__PURE__ */ t(
                  "div",
                  {
                    style: {
                      padding: "8px 12px",
                      borderRadius: 6,
                      background: R,
                      border: `1px solid ${s}`,
                      fontSize: 13,
                      maxHeight: 80,
                      overflowY: "auto",
                      opacity: 0.8
                    },
                    children: I
                  }
                )
              ] }),
              N && /* @__PURE__ */ t("div", { style: { color: "#e53935", fontSize: 13, marginBottom: 10 }, children: N }),
              /* @__PURE__ */ i("div", { style: { display: "flex", gap: 8, justifyContent: "flex-end" }, children: [
                /* @__PURE__ */ t(
                  "div",
                  {
                    onClick: () => c(!1),
                    style: {
                      ...f,
                      background: "transparent",
                      color: p,
                      border: `1px solid ${s}`
                    },
                    children: "Cancel"
                  }
                ),
                /* @__PURE__ */ t(
                  "div",
                  {
                    onClick: d ? void 0 : ce,
                    style: {
                      ...f,
                      background: d ? "#666" : `linear-gradient(135deg, ${l[0]}, ${l[1]})`,
                      color: "#fff",
                      opacity: d ? 0.6 : 1,
                      cursor: d ? "not-allowed" : "pointer"
                    },
                    children: d ? "Submitting..." : "Submit"
                  }
                )
              ] }),
              /* @__PURE__ */ t("div", { style: { marginTop: 14, fontSize: 11, opacity: 0.4, textAlign: "center" }, children: "Page URL, browser info, and screen size will be captured automatically." })
            ] })
          }
        )
      }
    )
  ] });
};
export {
  me as BugsManagedWidget
};
