import { jsxs as s, Fragment as Ke, jsx as t } from "react/jsx-runtime";
import { useRef as E, useState as h, useCallback as ge, useEffect as Ee } from "react";
function lt(v) {
  return v && v.__esModule && Object.prototype.hasOwnProperty.call(v, "default") ? v.default : v;
}
var Je = { exports: {} };
(function(v) {
  (function(T, d) {
    v.exports ? v.exports = d() : window.ysFixWebmDuration = d();
  })("fix-webm-duration", function() {
    var T = {
      172351395: { name: "EBML", type: "Container" },
      646: { name: "EBMLVersion", type: "Uint" },
      759: { name: "EBMLReadVersion", type: "Uint" },
      754: { name: "EBMLMaxIDLength", type: "Uint" },
      755: { name: "EBMLMaxSizeLength", type: "Uint" },
      642: { name: "DocType", type: "String" },
      647: { name: "DocTypeVersion", type: "Uint" },
      645: { name: "DocTypeReadVersion", type: "Uint" },
      108: { name: "Void", type: "Binary" },
      63: { name: "CRC-32", type: "Binary" },
      190023271: { name: "SignatureSlot", type: "Container" },
      16010: { name: "SignatureAlgo", type: "Uint" },
      16026: { name: "SignatureHash", type: "Uint" },
      16037: { name: "SignaturePublicKey", type: "Binary" },
      16053: { name: "Signature", type: "Binary" },
      15963: { name: "SignatureElements", type: "Container" },
      15995: { name: "SignatureElementList", type: "Container" },
      9522: { name: "SignedElement", type: "Binary" },
      139690087: { name: "Segment", type: "Container" },
      21863284: { name: "SeekHead", type: "Container" },
      3515: { name: "Seek", type: "Container" },
      5035: { name: "SeekID", type: "Binary" },
      5036: { name: "SeekPosition", type: "Uint" },
      88713574: { name: "Info", type: "Container" },
      13220: { name: "SegmentUID", type: "Binary" },
      13188: { name: "SegmentFilename", type: "String" },
      1882403: { name: "PrevUID", type: "Binary" },
      1868715: { name: "PrevFilename", type: "String" },
      2013475: { name: "NextUID", type: "Binary" },
      1999803: { name: "NextFilename", type: "String" },
      1092: { name: "SegmentFamily", type: "Binary" },
      10532: { name: "ChapterTranslate", type: "Container" },
      10748: { name: "ChapterTranslateEditionUID", type: "Uint" },
      10687: { name: "ChapterTranslateCodec", type: "Uint" },
      10661: { name: "ChapterTranslateID", type: "Binary" },
      710577: { name: "TimecodeScale", type: "Uint" },
      1161: { name: "Duration", type: "Float" },
      1121: { name: "DateUTC", type: "Date" },
      15273: { name: "Title", type: "String" },
      3456: { name: "MuxingApp", type: "String" },
      5953: { name: "WritingApp", type: "String" },
      // 0xf43b675: { name: 'Cluster', type: 'Container' },
      103: { name: "Timecode", type: "Uint" },
      6228: { name: "SilentTracks", type: "Container" },
      6359: { name: "SilentTrackNumber", type: "Uint" },
      39: { name: "Position", type: "Uint" },
      43: { name: "PrevSize", type: "Uint" },
      35: { name: "SimpleBlock", type: "Binary" },
      32: { name: "BlockGroup", type: "Container" },
      33: { name: "Block", type: "Binary" },
      34: { name: "BlockVirtual", type: "Binary" },
      13729: { name: "BlockAdditions", type: "Container" },
      38: { name: "BlockMore", type: "Container" },
      110: { name: "BlockAddID", type: "Uint" },
      37: { name: "BlockAdditional", type: "Binary" },
      27: { name: "BlockDuration", type: "Uint" },
      122: { name: "ReferencePriority", type: "Uint" },
      123: { name: "ReferenceBlock", type: "Int" },
      125: { name: "ReferenceVirtual", type: "Int" },
      36: { name: "CodecState", type: "Binary" },
      13730: { name: "DiscardPadding", type: "Int" },
      14: { name: "Slices", type: "Container" },
      104: { name: "TimeSlice", type: "Container" },
      76: { name: "LaceNumber", type: "Uint" },
      77: { name: "FrameNumber", type: "Uint" },
      75: { name: "BlockAdditionID", type: "Uint" },
      78: { name: "Delay", type: "Uint" },
      79: { name: "SliceDuration", type: "Uint" },
      72: { name: "ReferenceFrame", type: "Container" },
      73: { name: "ReferenceOffset", type: "Uint" },
      74: { name: "ReferenceTimeCode", type: "Uint" },
      47: { name: "EncryptedBlock", type: "Binary" },
      106212971: { name: "Tracks", type: "Container" },
      46: { name: "TrackEntry", type: "Container" },
      87: { name: "TrackNumber", type: "Uint" },
      13253: { name: "TrackUID", type: "Uint" },
      3: { name: "TrackType", type: "Uint" },
      57: { name: "FlagEnabled", type: "Uint" },
      8: { name: "FlagDefault", type: "Uint" },
      5546: { name: "FlagForced", type: "Uint" },
      28: { name: "FlagLacing", type: "Uint" },
      11751: { name: "MinCache", type: "Uint" },
      11768: { name: "MaxCache", type: "Uint" },
      254851: { name: "DefaultDuration", type: "Uint" },
      216698: { name: "DefaultDecodedFieldDuration", type: "Uint" },
      209231: { name: "TrackTimecodeScale", type: "Float" },
      4991: { name: "TrackOffset", type: "Int" },
      5614: { name: "MaxBlockAdditionID", type: "Uint" },
      4974: { name: "Name", type: "String" },
      177564: { name: "Language", type: "String" },
      6: { name: "CodecID", type: "String" },
      9122: { name: "CodecPrivate", type: "Binary" },
      362120: { name: "CodecName", type: "String" },
      13382: { name: "AttachmentLink", type: "Uint" },
      1742487: { name: "CodecSettings", type: "String" },
      1785920: { name: "CodecInfoURL", type: "String" },
      438848: { name: "CodecDownloadURL", type: "String" },
      42: { name: "CodecDecodeAll", type: "Uint" },
      12203: { name: "TrackOverlay", type: "Uint" },
      5802: { name: "CodecDelay", type: "Uint" },
      5819: { name: "SeekPreRoll", type: "Uint" },
      9764: { name: "TrackTranslate", type: "Container" },
      9980: { name: "TrackTranslateEditionUID", type: "Uint" },
      9919: { name: "TrackTranslateCodec", type: "Uint" },
      9893: { name: "TrackTranslateTrackID", type: "Binary" },
      96: { name: "Video", type: "Container" },
      26: { name: "FlagInterlaced", type: "Uint" },
      5048: { name: "StereoMode", type: "Uint" },
      5056: { name: "AlphaMode", type: "Uint" },
      5049: { name: "OldStereoMode", type: "Uint" },
      48: { name: "PixelWidth", type: "Uint" },
      58: { name: "PixelHeight", type: "Uint" },
      5290: { name: "PixelCropBottom", type: "Uint" },
      5307: { name: "PixelCropTop", type: "Uint" },
      5324: { name: "PixelCropLeft", type: "Uint" },
      5341: { name: "PixelCropRight", type: "Uint" },
      5296: { name: "DisplayWidth", type: "Uint" },
      5306: { name: "DisplayHeight", type: "Uint" },
      5298: { name: "DisplayUnit", type: "Uint" },
      5299: { name: "AspectRatioType", type: "Uint" },
      963876: { name: "ColourSpace", type: "Binary" },
      1029411: { name: "GammaValue", type: "Float" },
      230371: { name: "FrameRate", type: "Float" },
      97: { name: "Audio", type: "Container" },
      53: { name: "SamplingFrequency", type: "Float" },
      14517: { name: "OutputSamplingFrequency", type: "Float" },
      31: { name: "Channels", type: "Uint" },
      15739: { name: "ChannelPositions", type: "Binary" },
      8804: { name: "BitDepth", type: "Uint" },
      98: { name: "TrackOperation", type: "Container" },
      99: { name: "TrackCombinePlanes", type: "Container" },
      100: { name: "TrackPlane", type: "Container" },
      101: { name: "TrackPlaneUID", type: "Uint" },
      102: { name: "TrackPlaneType", type: "Uint" },
      105: { name: "TrackJoinBlocks", type: "Container" },
      109: { name: "TrackJoinUID", type: "Uint" },
      64: { name: "TrickTrackUID", type: "Uint" },
      65: { name: "TrickTrackSegmentUID", type: "Binary" },
      70: { name: "TrickTrackFlag", type: "Uint" },
      71: { name: "TrickMasterTrackUID", type: "Uint" },
      68: { name: "TrickMasterTrackSegmentUID", type: "Binary" },
      11648: { name: "ContentEncodings", type: "Container" },
      8768: { name: "ContentEncoding", type: "Container" },
      4145: { name: "ContentEncodingOrder", type: "Uint" },
      4146: { name: "ContentEncodingScope", type: "Uint" },
      4147: { name: "ContentEncodingType", type: "Uint" },
      4148: { name: "ContentCompression", type: "Container" },
      596: { name: "ContentCompAlgo", type: "Uint" },
      597: { name: "ContentCompSettings", type: "Binary" },
      4149: { name: "ContentEncryption", type: "Container" },
      2017: { name: "ContentEncAlgo", type: "Uint" },
      2018: { name: "ContentEncKeyID", type: "Binary" },
      2019: { name: "ContentSignature", type: "Binary" },
      2020: { name: "ContentSigKeyID", type: "Binary" },
      2021: { name: "ContentSigAlgo", type: "Uint" },
      2022: { name: "ContentSigHashAlgo", type: "Uint" },
      206814059: { name: "Cues", type: "Container" },
      59: { name: "CuePoint", type: "Container" },
      51: { name: "CueTime", type: "Uint" },
      55: { name: "CueTrackPositions", type: "Container" },
      119: { name: "CueTrack", type: "Uint" },
      113: { name: "CueClusterPosition", type: "Uint" },
      112: { name: "CueRelativePosition", type: "Uint" },
      50: { name: "CueDuration", type: "Uint" },
      4984: { name: "CueBlockNumber", type: "Uint" },
      106: { name: "CueCodecState", type: "Uint" },
      91: { name: "CueReference", type: "Container" },
      22: { name: "CueRefTime", type: "Uint" },
      23: { name: "CueRefCluster", type: "Uint" },
      4959: { name: "CueRefNumber", type: "Uint" },
      107: { name: "CueRefCodecState", type: "Uint" },
      155296873: { name: "Attachments", type: "Container" },
      8615: { name: "AttachedFile", type: "Container" },
      1662: { name: "FileDescription", type: "String" },
      1646: { name: "FileName", type: "String" },
      1632: { name: "FileMimeType", type: "String" },
      1628: { name: "FileData", type: "Binary" },
      1710: { name: "FileUID", type: "Uint" },
      1653: { name: "FileReferral", type: "Binary" },
      1633: { name: "FileUsedStartTime", type: "Uint" },
      1634: { name: "FileUsedEndTime", type: "Uint" },
      4433776: { name: "Chapters", type: "Container" },
      1465: { name: "EditionEntry", type: "Container" },
      1468: { name: "EditionUID", type: "Uint" },
      1469: { name: "EditionFlagHidden", type: "Uint" },
      1499: { name: "EditionFlagDefault", type: "Uint" },
      1501: { name: "EditionFlagOrdered", type: "Uint" },
      54: { name: "ChapterAtom", type: "Container" },
      13252: { name: "ChapterUID", type: "Uint" },
      5716: { name: "ChapterStringUID", type: "String" },
      17: { name: "ChapterTimeStart", type: "Uint" },
      18: { name: "ChapterTimeEnd", type: "Uint" },
      24: { name: "ChapterFlagHidden", type: "Uint" },
      1432: { name: "ChapterFlagEnabled", type: "Uint" },
      11879: { name: "ChapterSegmentUID", type: "Binary" },
      11964: { name: "ChapterSegmentEditionUID", type: "Uint" },
      9155: { name: "ChapterPhysicalEquiv", type: "Uint" },
      15: { name: "ChapterTrack", type: "Container" },
      9: { name: "ChapterTrackNumber", type: "Uint" },
      0: { name: "ChapterDisplay", type: "Container" },
      5: { name: "ChapString", type: "String" },
      892: { name: "ChapLanguage", type: "String" },
      894: { name: "ChapCountry", type: "String" },
      10564: { name: "ChapProcess", type: "Container" },
      10581: { name: "ChapProcessCodecID", type: "Uint" },
      1293: { name: "ChapProcessPrivate", type: "Binary" },
      10513: { name: "ChapProcessCommand", type: "Container" },
      10530: { name: "ChapProcessTime", type: "Uint" },
      10547: { name: "ChapProcessData", type: "Binary" },
      39109479: { name: "Tags", type: "Container" },
      13171: { name: "Tag", type: "Container" },
      9152: { name: "Targets", type: "Container" },
      10442: { name: "TargetTypeValue", type: "Uint" },
      9162: { name: "TargetType", type: "String" },
      9157: { name: "TagTrackUID", type: "Uint" },
      9161: { name: "TagEditionUID", type: "Uint" },
      9156: { name: "TagChapterUID", type: "Uint" },
      9158: { name: "TagAttachmentUID", type: "Uint" },
      10184: { name: "SimpleTag", type: "Container" },
      1443: { name: "TagName", type: "String" },
      1146: { name: "TagLanguage", type: "String" },
      1156: { name: "TagDefault", type: "Uint" },
      1159: { name: "TagString", type: "String" },
      1157: { name: "TagBinary", type: "Binary" }
    };
    function d(n, i) {
      n.prototype = Object.create(i.prototype), n.prototype.constructor = n;
    }
    function B(n, i) {
      this.name = n || "Unknown", this.type = i || "Unknown";
    }
    B.prototype.updateBySource = function() {
    }, B.prototype.setSource = function(n) {
      this.source = n, this.updateBySource();
    }, B.prototype.updateByData = function() {
    }, B.prototype.setData = function(n) {
      this.data = n, this.updateByData();
    };
    function P(n, i) {
      B.call(this, n, i || "Uint");
    }
    d(P, B);
    function oe(n) {
      return n.length % 2 === 1 ? "0" + n : n;
    }
    P.prototype.updateBySource = function() {
      this.data = "";
      for (var n = 0; n < this.source.length; n++) {
        var i = this.source[n].toString(16);
        this.data += oe(i);
      }
    }, P.prototype.updateByData = function() {
      var n = this.data.length / 2;
      this.source = new Uint8Array(n);
      for (var i = 0; i < n; i++) {
        var a = this.data.substr(i * 2, 2);
        this.source[i] = parseInt(a, 16);
      }
    }, P.prototype.getValue = function() {
      return parseInt(this.data, 16);
    }, P.prototype.setValue = function(n) {
      this.setData(oe(n.toString(16)));
    };
    function F(n, i) {
      B.call(this, n, i || "Float");
    }
    d(F, B), F.prototype.getFloatArrayType = function() {
      return this.source && this.source.length === 4 ? Float32Array : Float64Array;
    }, F.prototype.updateBySource = function() {
      var n = this.source.reverse(), i = this.getFloatArrayType(), a = new i(n.buffer);
      this.data = a[0];
    }, F.prototype.updateByData = function() {
      var n = this.getFloatArrayType(), i = new n([this.data]), a = new Uint8Array(i.buffer);
      this.source = a.reverse();
    }, F.prototype.getValue = function() {
      return this.data;
    }, F.prototype.setValue = function(n) {
      this.setData(n);
    };
    function R(n, i) {
      B.call(this, n, i || "Container");
    }
    d(R, B), R.prototype.readByte = function() {
      return this.source[this.offset++];
    }, R.prototype.readUint = function() {
      for (var n = this.readByte(), i = 8 - n.toString(2).length, a = n - (1 << 7 - i), g = 0; g < i; g++)
        a *= 256, a += this.readByte();
      return a;
    }, R.prototype.updateBySource = function() {
      for (this.data = [], this.offset = 0; this.offset < this.source.length; this.offset = a) {
        var n = this.readUint(), i = this.readUint(), a = Math.min(this.offset + i, this.source.length), g = this.source.slice(this.offset, a), u = T[n] || { name: "Unknown", type: "Unknown" }, x = B;
        switch (u.type) {
          case "Container":
            x = R;
            break;
          case "Uint":
            x = P;
            break;
          case "Float":
            x = F;
            break;
        }
        var S = new x(u.name, u.type);
        S.setSource(g), this.data.push({
          id: n,
          idHex: n.toString(16),
          data: S
        });
      }
    }, R.prototype.writeUint = function(n, i) {
      for (var a = 1, g = 128; n >= g && a < 8; a++, g *= 128)
        ;
      if (!i)
        for (var u = g + n, x = a - 1; x >= 0; x--) {
          var S = u % 256;
          this.source[this.offset + x] = S, u = (u - S) / 256;
        }
      this.offset += a;
    }, R.prototype.writeSections = function(n) {
      this.offset = 0;
      for (var i = 0; i < this.data.length; i++) {
        var a = this.data[i], g = a.data.source, u = g.length;
        this.writeUint(a.id, n), this.writeUint(u, n), n || this.source.set(g, this.offset), this.offset += u;
      }
      return this.offset;
    }, R.prototype.updateByData = function() {
      var n = this.writeSections("draft");
      this.source = new Uint8Array(n), this.writeSections();
    }, R.prototype.getSectionById = function(n) {
      for (var i = 0; i < this.data.length; i++) {
        var a = this.data[i];
        if (a.id === n)
          return a.data;
      }
      return null;
    };
    function b(n) {
      R.call(this, "File", "File"), this.setSource(n);
    }
    d(b, R), b.prototype.fixDuration = function(n, i) {
      var a = i && i.logger;
      a === void 0 ? a = function(N) {
        console.log(N);
      } : a || (a = function() {
      });
      var g = this.getSectionById(139690087);
      if (!g)
        return a("[fix-webm-duration] Segment section is missing"), !1;
      var u = g.getSectionById(88713574);
      if (!u)
        return a("[fix-webm-duration] Info section is missing"), !1;
      var x = u.getSectionById(710577);
      if (!x)
        return a("[fix-webm-duration] TimecodeScale section is missing"), !1;
      var S = u.getSectionById(1161);
      if (S)
        if (S.getValue() <= 0)
          a(`[fix-webm-duration] Duration section is present, but the value is ${S.getValue()}`), S.setValue(n);
        else
          return a(`[fix-webm-duration] Duration section is present, and the value is ${S.getValue()}`), !1;
      else
        a("[fix-webm-duration] Duration section is missing"), S = new F("Duration", "Float"), S.setValue(n), u.data.push({
          id: 1161,
          data: S
        });
      return x.setValue(1e6), u.updateByData(), g.updateByData(), this.updateByData(), !0;
    }, b.prototype.toBlob = function(n) {
      return new Blob([this.source.buffer], { type: n || "video/webm" });
    };
    function L(n, i, a, g) {
      if (typeof a == "object" && (g = a, a = void 0), !a)
        return new Promise(function(x) {
          L(n, i, x, g);
        });
      try {
        var u = new FileReader();
        u.onloadend = function() {
          try {
            var x = new b(new Uint8Array(u.result));
            x.fixDuration(i, g) && (n = x.toBlob(n.type));
          } catch {
          }
          a(n);
        }, u.readAsArrayBuffer(n);
      } catch {
        a(n);
      }
    }
    return L.default = L, L;
  });
})(Je);
var dt = Je.exports;
const pt = /* @__PURE__ */ lt(dt), ut = "bom-draft", $ = "chunks";
let be = null;
function Fe() {
  return be || (be = new Promise((v, T) => {
    const d = indexedDB.open(ut, 1);
    d.onupgradeneeded = () => d.result.createObjectStore($, { autoIncrement: !0 }), d.onsuccess = () => v(d.result), d.onerror = () => {
      be = null, T(d.error);
    };
  })), be;
}
function mt(v) {
  Fe().then((T) => {
    T.transaction($, "readwrite").objectStore($).add(v);
  }).catch(() => {
  });
}
function yt() {
  return Fe().then(
    (v) => new Promise((T) => {
      const d = v.transaction($, "readonly").objectStore($).getAll();
      d.onsuccess = () => T(d.result), d.onerror = () => T([]);
    })
  ).catch(() => []);
}
function xe() {
  Fe().then((v) => {
    v.transaction($, "readwrite").objectStore($).clear();
  }).catch(() => {
  });
}
const ft = [
  { value: "BUG", label: "Bug Report" },
  { value: "FEATURE_REQUEST", label: "Feature Request" },
  { value: "QUESTION", label: "Question" }
], ht = [
  { value: "LOW", label: "Low" },
  { value: "MEDIUM", label: "Medium" },
  { value: "HIGH", label: "High" },
  { value: "CRITICAL", label: "Critical" }
], xt = (v) => {
  const {
    apiKey: T,
    apiUrl: d,
    userEmail: B,
    userName: P,
    theme: oe = "dark",
    position: F = "bottom-right",
    orbSize: R = 24,
    // Bug Out's identity is amber/orange ("we caught a bug" — warm, high contrast).
    // Hosts can override; if they do, we treat [0]=core, [1]=ring.
    orbColors: b = ["#fbbf24", "#fb923c"],
    // Tenant context
    tenantId: L,
    tenantName: n,
    databaseName: i,
    appVersion: a,
    environment: g,
    onApiReady: u,
    hideOrb: x = !1
  } = v, S = E(
    `bom-orb-${Math.random().toString(36).slice(2, 9)}`
  ), [N, C] = h(!1), [G, Me] = h(!1), [Qe, ie] = h(!1), [W, K] = h(null), [Ze, ae] = h(!1), [et, j] = h(!1), [ve, Ae] = h(""), [se, Oe] = h("BUG"), [_e, Pe] = h("MEDIUM"), [Se, ze] = h(""), [Le, We] = h(""), [J, ke] = h(!1), [tt, we] = h(!1), [$e, ce] = h(""), [nt, rt] = h(!1), [le, Ne] = h(null), [je, Q] = h(null), [de, He] = h(null), [Z, pe] = h(!1), [ue, Ue] = h([]), [ot, Ce] = h([]), Te = ge((e) => {
    e.length !== 0 && (Ue((r) => [...r, ...e]), Ce((r) => [
      ...r,
      ...e.map((o) => o.type.startsWith("image/") ? URL.createObjectURL(o) : null)
    ]));
  }, []), it = ge((e) => {
    Ue((r) => r.filter((o, p) => p !== e)), Ce((r) => {
      const o = r[e];
      return o && URL.revokeObjectURL(o), r.filter((p, l) => l !== e);
    });
  }, []), [Ve, ee] = h(null), [H, Xe] = h(() => ({
    top: 24,
    left: typeof window < "u" ? Math.max(24, window.innerWidth - 280) : 24
  })), M = E(null), me = E(null), V = E([]), X = E(null), Be = E([]), Re = E(0), De = E(null), ye = E(null), te = E(null), w = E([]), U = E([]);
  Ee(() => {
    u == null || u({ open: () => C(!0), close: () => C(!1) });
  }, [u]), Ee(() => {
    yt().then((e) => {
      if (e.length === 0) return;
      const r = new Blob(e, { type: "video/webm" });
      V.current = e, K(r), ee(URL.createObjectURL(r)), ae(!0), j(!0);
    });
  }, []), Ee(() => {
    if (rt(/Android|iPhone|iPad|iPod/i.test(navigator.userAgent)), !te.current) {
      const c = document.createElement("style");
      c.textContent = `
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
      `, document.head.appendChild(c), te.current = c;
    }
    const e = console.error;
    console.error = (...c) => {
      w.current.push({
        type: "console.error",
        message: c.map((m) => typeof m == "object" ? JSON.stringify(m) : String(m)).join(" "),
        timestamp: (/* @__PURE__ */ new Date()).toISOString()
      }), w.current.length > 50 && w.current.shift(), e.apply(console, c);
    };
    const r = (c) => {
      w.current.push({
        type: "window.onerror",
        message: c.message,
        source: c.filename,
        line: c.lineno,
        col: c.colno,
        timestamp: (/* @__PURE__ */ new Date()).toISOString()
      }), w.current.length > 50 && w.current.shift();
    };
    window.addEventListener("error", r);
    const o = (c) => {
      var m;
      w.current.push({
        type: "unhandledrejection",
        message: ((m = c.reason) == null ? void 0 : m.message) || String(c.reason),
        timestamp: (/* @__PURE__ */ new Date()).toISOString()
      }), w.current.length > 50 && w.current.shift();
    };
    window.addEventListener("unhandledrejection", o);
    const p = window.fetch;
    window.fetch = async (...c) => {
      var y;
      const m = typeof c[0] == "string" ? c[0] : c[0].url, _ = (((y = c[1]) == null ? void 0 : y.method) || "GET").toUpperCase();
      try {
        const k = await p.apply(window, c);
        return !k.ok && !m.includes(d) && (U.current.push({
          method: _,
          url: m,
          status: k.status,
          statusText: k.statusText,
          timestamp: (/* @__PURE__ */ new Date()).toISOString()
        }), U.current.length > 30 && U.current.shift()), k;
      } catch (k) {
        throw m.includes(d) || (U.current.push({
          method: _,
          url: m,
          status: 0,
          statusText: k.message || "Network Error",
          timestamp: (/* @__PURE__ */ new Date()).toISOString()
        }), U.current.length > 30 && U.current.shift()), k;
      }
    };
    const l = XMLHttpRequest.prototype.open, f = XMLHttpRequest.prototype.send;
    return XMLHttpRequest.prototype.open = function(c, m, ..._) {
      return this._bomMethod = c, this._bomUrl = String(m), l.apply(this, [c, m, ..._]);
    }, XMLHttpRequest.prototype.send = function(...c) {
      return this.addEventListener("loadend", () => {
        var m;
        this.status >= 400 && !((m = this._bomUrl) != null && m.includes(d)) && (U.current.push({
          method: this._bomMethod || "GET",
          url: this._bomUrl || "",
          status: this.status,
          statusText: this.statusText,
          timestamp: (/* @__PURE__ */ new Date()).toISOString()
        }), U.current.length > 30 && U.current.shift());
      }), f.apply(this, c);
    }, () => {
      te.current && (document.head.removeChild(te.current), te.current = null), console.error = e, window.removeEventListener("error", r), window.removeEventListener("unhandledrejection", o), window.fetch = p, XMLHttpRequest.prototype.open = l, XMLHttpRequest.prototype.send = f;
    };
  }, [d]);
  const q = oe === "dark", fe = q ? "#1a1a2e" : "#ffffff", A = q ? "#e0e0e0" : "#333333", D = q ? "#333" : "#ddd", ne = q ? "#16213e" : "#f5f5f5", at = F === "bottom-left" ? { bottom: 24, left: 24 } : { bottom: 24, right: 24 }, Ie = ge(async () => {
    try {
      const e = await navigator.mediaDevices.getDisplayMedia({
        // 'monitor' hints Chrome/Edge to pre-select "Entire Screen" in the picker.
        video: { displaySurface: "monitor" },
        // Passing only systemAudio:'include' — extra constraints alongside it
        // cause Chrome to silently ignore the pre-check.
        audio: { systemAudio: "include" }
      });
      let r = null;
      try {
        r = await navigator.mediaDevices.getUserMedia({ audio: !0, video: !1 });
      } catch {
      }
      De.current = r;
      const o = ((r == null ? void 0 : r.getAudioTracks().length) ?? 0) > 0, p = e.getAudioTracks().length > 0;
      if (!o && !p) {
        e.getTracks().forEach((y) => y.stop()), r == null || r.getTracks().forEach((y) => y.stop()), ie(!0), C(!1);
        return;
      }
      const l = o ? r.getAudioTracks() : e.getAudioTracks(), f = new MediaStream([...e.getVideoTracks(), ...l]), c = new MediaRecorder(f, {
        mimeType: MediaRecorder.isTypeSupported("video/webm;codecs=vp9") ? "video/webm;codecs=vp9" : "video/webm"
      });
      Be.current = [], V.current.length === 0 && xe(), c.ondataavailable = (y) => {
        y.data.size > 0 && (Be.current.push(y.data), mt(y.data));
      }, c.onstop = async () => {
        var z;
        const y = [...V.current, ...Be.current], k = new Blob(y, { type: "video/webm" });
        let I = k;
        const re = Re.current > 0 ? Date.now() - Re.current : 0;
        if (re > 0)
          try {
            I = await pt(k, re, { logger: !1 });
          } catch {
            I = k;
          }
        V.current = [], xe(), K(I), ee((Y) => (Y && URL.revokeObjectURL(Y), URL.createObjectURL(I))), ae(!1), j(!1), e.getTracks().forEach((Y) => Y.stop()), (z = De.current) == null || z.getTracks().forEach((Y) => Y.stop()), De.current = null;
      }, Re.current = Date.now(), c.start(1e3), X.current = c;
      const m = () => {
        var y;
        ((y = X.current) == null ? void 0 : y.state) === "recording" && X.current.requestData();
      };
      window.addEventListener("beforeunload", m), me.current = m, Me(!0), C(!1);
      const _ = window.SpeechRecognition || window.webkitSpeechRecognition;
      if (_) {
        const y = new _();
        y.continuous = !0, y.interimResults = !0, y.lang = "en-US";
        let k = "";
        y.onresult = (I) => {
          let re = "";
          for (let z = I.resultIndex; z < I.results.length; z++)
            I.results[z].isFinal ? k += I.results[z][0].transcript + " " : re += I.results[z][0].transcript;
          Ae(k + re);
        }, y.onerror = () => {
        }, y.start(), ye.current = y;
      }
    } catch (e) {
      console.error("Failed to start recording:", e);
    }
  }, []), qe = ge(() => {
    me.current && (window.removeEventListener("beforeunload", me.current), me.current = null), X.current && X.current.state !== "inactive" && X.current.stop(), ye.current && (ye.current.stop(), ye.current = null), Me(!1), C(!0);
  }, []), he = () => {
    ze(""), We(""), Oe("BUG"), Pe("MEDIUM"), Ae(""), K(null), ee((e) => (e && URL.revokeObjectURL(e), null)), Ne(null), Ue([]), Ce((e) => (e.forEach((r) => {
      r && URL.revokeObjectURL(r);
    }), [])), ce(""), we(!1), Q(null), He(null), pe(!1), ae(!1), j(!1), ie(!1), V.current = [], xe();
  }, st = async () => {
    if (!Se.trim()) {
      ce("Title is required");
      return;
    }
    ke(!0), ce("");
    try {
      const e = {
        title: Se.trim(),
        description: Le.trim(),
        ticketType: se,
        priority: _e,
        submittedBy: B || P || "Anonymous",
        currentPageUrl: window.location.href,
        currentPageName: document.title,
        browserInfo: navigator.userAgent,
        screenWidth: window.innerWidth,
        screenHeight: window.innerHeight,
        transcript: ve || null,
        consoleErrors: w.current.length > 0 ? JSON.stringify(w.current) : null,
        networkErrors: U.current.length > 0 ? JSON.stringify(U.current) : null
      };
      L && (e.tenantId = L), n && (e.tenantName = n), i && (e.databaseName = i), a && (e.applicationVersion = a), g && (e.environment = g);
      const r = await fetch(`${d}/tickets`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-BOM-API-Key": T
        },
        body: JSON.stringify(e)
      });
      if (!r.ok) throw new Error("Failed to submit ticket");
      const o = await r.json();
      if (ue.length > 0 && o.id)
        for (const l of ue)
          try {
            const f = new FormData();
            f.append("file", l, l.name || "screenshot.png");
            const c = await fetch(`${d}/tickets/${o.id}/attachments/widget`, {
              method: "POST",
              headers: { "X-BOM-API-Key": T },
              body: f
            });
            c.ok || console.warn(`[Bug Out] Screenshot upload failed (${c.status}) for ticket ${o.id}`);
          } catch (f) {
            console.warn("[Bug Out] Screenshot upload network error:", f);
          }
      const p = W || le;
      if (He(o.id), p && o.id) {
        const l = await Ge(o.id, p);
        if (l) {
          Q(l), ke(!1);
          return;
        }
      }
      we(!0), setTimeout(() => {
        C(!1), he();
      }, 2e3);
    } catch (e) {
      ce(e.message || "Failed to submit");
    } finally {
      ke(!1);
    }
  }, Ye = 200 * 1024 * 1024, Ge = async (e, r) => {
    if (r.size > Ye)
      return `Recording is ${(r.size / 1024 / 1024).toFixed(1)} MB — exceeds the ${Ye / 1024 / 1024} MB upload limit. Stop the recording sooner next time.`;
    pe(!0);
    let o = null;
    for (let p = 1; p <= 3; p++) {
      try {
        const l = new FormData();
        l.append("file", r, "recording.webm");
        const f = await fetch(`${d}/tickets/${e}/video`, {
          method: "POST",
          headers: { "X-BOM-API-Key": T },
          body: l
        });
        if (f.ok)
          return pe(!1), null;
        if (f.status >= 400 && f.status < 500 && f.status !== 408 && f.status !== 429) {
          const c = await f.text().catch(() => "");
          o = `Server rejected upload (${f.status}): ${c || f.statusText}`;
          break;
        }
        o = `Upload failed (${f.status}). Retrying…`;
      } catch (l) {
        o = l != null && l.message ? `Network error: ${l.message}. Retrying…` : "Network error. Retrying…";
      }
      p < 3 && await new Promise((l) => setTimeout(l, 1e3 * Math.pow(2, p - 1)));
    }
    return pe(!1), o || "Video upload failed after 3 attempts.";
  }, ct = async () => {
    if (!de) return;
    const e = W || le;
    if (!e) return;
    Q(null);
    const r = await Ge(de, e);
    r ? Q(r) : (we(!0), setTimeout(() => {
      C(!1), he();
    }, 2e3));
  }, O = {
    padding: "8px 16px",
    border: "none",
    borderRadius: 6,
    cursor: "pointer",
    fontSize: 14,
    fontWeight: 600,
    transition: "opacity 0.2s"
  };
  return /* @__PURE__ */ s(Ke, { children: [
    !x && (() => {
      const e = R * 2, r = b[0], o = b[1], p = `${r}8c`, l = S.current;
      return /* @__PURE__ */ t(
        "button",
        {
          type: "button",
          role: "button",
          "aria-label": "Report a bug",
          title: "Report a bug or request a feature",
          onClick: () => {
            N || he(), C(!N);
          },
          className: "bom-orb-wrap",
          style: {
            ...at,
            width: e,
            height: e,
            "--bom-core": r,
            "--bom-ring": o,
            "--bom-halo": p,
            "--bom-spin": "18s",
            "--bom-pulse": "4s"
          },
          children: /* @__PURE__ */ s("span", { className: "bom-orb", children: [
            /* @__PURE__ */ s(
              "svg",
              {
                viewBox: "0 0 100 100",
                width: e,
                height: e,
                "aria-hidden": "true",
                className: "bom-orb__svg",
                children: [
                  /* @__PURE__ */ s("defs", { children: [
                    /* @__PURE__ */ s("radialGradient", { id: `${l}-core`, cx: "50%", cy: "50%", r: "50%", children: [
                      /* @__PURE__ */ t("stop", { offset: "0%", stopColor: r, stopOpacity: "1" }),
                      /* @__PURE__ */ t("stop", { offset: "55%", stopColor: r, stopOpacity: "0.55" }),
                      /* @__PURE__ */ t("stop", { offset: "100%", stopColor: "#1a0f00", stopOpacity: "0" })
                    ] }),
                    /* @__PURE__ */ s("radialGradient", { id: `${l}-iris`, cx: "50%", cy: "50%", r: "50%", children: [
                      /* @__PURE__ */ t("stop", { offset: "0%", stopColor: "#fff7dc", stopOpacity: "0.95" }),
                      /* @__PURE__ */ t("stop", { offset: "40%", stopColor: r, stopOpacity: "0.7" }),
                      /* @__PURE__ */ t("stop", { offset: "100%", stopColor: r, stopOpacity: "0" })
                    ] })
                  ] }),
                  /* @__PURE__ */ t(
                    "circle",
                    {
                      cx: "50",
                      cy: "50",
                      r: "48",
                      fill: `url(#${l}-core)`,
                      className: "bom-orb__halo"
                    }
                  ),
                  /* @__PURE__ */ s("g", { className: "bom-orb__spin-cw", children: [
                    /* @__PURE__ */ t(
                      "circle",
                      {
                        cx: "50",
                        cy: "50",
                        r: "44",
                        fill: "none",
                        stroke: o,
                        strokeOpacity: "0.55",
                        strokeWidth: "0.5"
                      }
                    ),
                    Array.from({ length: 36 }).map((f, c) => {
                      const m = c * 10 * Math.PI / 180, _ = 50 + Math.cos(m) * 41, y = 50 + Math.sin(m) * 41, k = 50 + Math.cos(m) * (c % 3 === 0 ? 44 : 43), I = 50 + Math.sin(m) * (c % 3 === 0 ? 44 : 43);
                      return /* @__PURE__ */ t(
                        "line",
                        {
                          x1: _,
                          y1: y,
                          x2: k,
                          y2: I,
                          stroke: o,
                          strokeOpacity: c % 3 === 0 ? 0.8 : 0.35,
                          strokeWidth: "0.8"
                        },
                        c
                      );
                    })
                  ] }),
                  /* @__PURE__ */ s("g", { className: "bom-orb__spin-ccw", children: [
                    /* @__PURE__ */ t(
                      "circle",
                      {
                        cx: "50",
                        cy: "50",
                        r: "36",
                        fill: "none",
                        stroke: o,
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
                        stroke: o,
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
                      stroke: r,
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
                      fill: `url(#${l}-iris)`,
                      className: "bom-orb__core"
                    }
                  ),
                  /* @__PURE__ */ s("g", { stroke: "#1a0f00", strokeOpacity: "0.55", strokeLinecap: "round", children: [
                    /* @__PURE__ */ t("line", { x1: "50", y1: "42", x2: "50", y2: "42", strokeWidth: "3.4" }),
                    /* @__PURE__ */ t("line", { x1: "50", y1: "48", x2: "50", y2: "58", strokeWidth: "2.4" })
                  ] }),
                  /* @__PURE__ */ t("line", { x1: "50", y1: "6", x2: "50", y2: "14", stroke: o, strokeOpacity: "0.7", strokeWidth: "0.6" }),
                  /* @__PURE__ */ t("line", { x1: "50", y1: "86", x2: "50", y2: "94", stroke: o, strokeOpacity: "0.7", strokeWidth: "0.6" }),
                  /* @__PURE__ */ t("line", { x1: "6", y1: "50", x2: "14", y2: "50", stroke: o, strokeOpacity: "0.7", strokeWidth: "0.6" }),
                  /* @__PURE__ */ t("line", { x1: "86", y1: "50", x2: "94", y2: "50", stroke: o, strokeOpacity: "0.7", strokeWidth: "0.6" })
                ]
              }
            ),
            /* @__PURE__ */ t("span", { className: "bom-orb__scan" })
          ] })
        }
      );
    })(),
    Qe && /* @__PURE__ */ t(
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
        children: /* @__PURE__ */ s("div", { style: {
          background: fe,
          color: A,
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
          /* @__PURE__ */ s("p", { style: { margin: "0 0 18px", fontSize: 14, opacity: 0.75, lineHeight: 1.5 }, children: [
            "Your recording would have no sound. In the screen picker, enable the",
            /* @__PURE__ */ t("strong", { children: ' "Also share system audio"' }),
            " toggle before clicking Share."
          ] }),
          /* @__PURE__ */ s("div", { style: { display: "flex", gap: 10, justifyContent: "center" }, children: [
            /* @__PURE__ */ t(
              "div",
              {
                onClick: () => {
                  ie(!1), Ie();
                },
                style: {
                  ...O,
                  background: `linear-gradient(135deg, ${b[0]}, ${b[1]})`,
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
                  ie(!1), C(!0);
                },
                style: { ...O, background: "transparent", color: A, border: `1px solid ${D}`, cursor: "pointer" },
                children: "Skip audio"
              }
            )
          ] })
        ] })
      }
    ),
    N && /* @__PURE__ */ t(
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
          e.target === e.currentTarget && C(!1);
        },
        children: /* @__PURE__ */ t(
          "div",
          {
            style: {
              background: fe,
              color: A,
              borderRadius: 12,
              padding: 24,
              width: "90%",
              maxWidth: 520,
              maxHeight: "85vh",
              overflowY: "auto",
              boxShadow: "0 20px 60px rgba(0,0,0,0.3)",
              fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
            },
            children: tt ? /* @__PURE__ */ s("div", { style: { textAlign: "center", padding: 40 }, children: [
              /* @__PURE__ */ t("div", { style: { fontSize: 48, marginBottom: 16 }, children: "✓" }),
              /* @__PURE__ */ t("h3", { style: { margin: 0, fontSize: 20 }, children: "Submitted!" }),
              /* @__PURE__ */ t("p", { style: { opacity: 0.7, marginTop: 8 }, children: "Thank you for your feedback." })
            ] }) : /* @__PURE__ */ s(Ke, { children: [
              /* @__PURE__ */ s("div", { style: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }, children: [
                /* @__PURE__ */ t("h3", { style: { margin: 0, fontSize: 18, fontWeight: 700 }, children: "Report an Issue" }),
                /* @__PURE__ */ t(
                  "div",
                  {
                    onClick: () => C(!1),
                    style: { cursor: "pointer", fontSize: 20, opacity: 0.6, padding: "0 4px" },
                    children: "✕"
                  }
                )
              ] }),
              /* @__PURE__ */ s("div", { style: { marginBottom: 14 }, children: [
                /* @__PURE__ */ t("label", { style: { display: "block", marginBottom: 4, fontSize: 13, fontWeight: 600, opacity: 0.8 }, children: "Type" }),
                /* @__PURE__ */ t("div", { style: { display: "flex", gap: 8 }, children: ft.map((e) => /* @__PURE__ */ t(
                  "div",
                  {
                    onClick: () => Oe(e.value),
                    style: {
                      flex: 1,
                      padding: "8px 4px",
                      textAlign: "center",
                      borderRadius: 6,
                      border: `2px solid ${se === e.value ? b[0] : D}`,
                      background: se === e.value ? `${b[0]}22` : "transparent",
                      cursor: "pointer",
                      fontSize: 12,
                      fontWeight: se === e.value ? 700 : 400
                    },
                    children: e.label
                  },
                  e.value
                )) })
              ] }),
              /* @__PURE__ */ s("div", { style: { marginBottom: 14 }, children: [
                /* @__PURE__ */ t("label", { style: { display: "block", marginBottom: 4, fontSize: 13, fontWeight: 600, opacity: 0.8 }, children: "Priority" }),
                /* @__PURE__ */ t(
                  "select",
                  {
                    value: _e,
                    onChange: (e) => Pe(e.target.value),
                    style: {
                      width: "100%",
                      padding: "8px 12px",
                      borderRadius: 6,
                      border: `1px solid ${D}`,
                      background: ne,
                      color: A,
                      fontSize: 14,
                      outline: "none"
                    },
                    children: ht.map((e) => /* @__PURE__ */ t("option", { value: e.value, children: e.label }, e.value))
                  }
                )
              ] }),
              /* @__PURE__ */ s("div", { style: { marginBottom: 14 }, children: [
                /* @__PURE__ */ s("label", { style: { display: "block", marginBottom: 4, fontSize: 13, fontWeight: 600, opacity: 0.8 }, children: [
                  "Title ",
                  /* @__PURE__ */ t("span", { style: { color: "#e53935" }, children: "*" })
                ] }),
                /* @__PURE__ */ t(
                  "input",
                  {
                    type: "text",
                    value: Se,
                    onChange: (e) => ze(e.target.value),
                    placeholder: "Brief summary of the issue",
                    maxLength: 500,
                    style: {
                      width: "100%",
                      padding: "8px 12px",
                      borderRadius: 6,
                      border: `1px solid ${D}`,
                      background: ne,
                      color: A,
                      fontSize: 14,
                      outline: "none",
                      boxSizing: "border-box"
                    }
                  }
                )
              ] }),
              /* @__PURE__ */ s("div", { style: { marginBottom: 14 }, children: [
                /* @__PURE__ */ t("label", { style: { display: "block", marginBottom: 4, fontSize: 13, fontWeight: 600, opacity: 0.8 }, children: "Description" }),
                /* @__PURE__ */ t(
                  "textarea",
                  {
                    value: Le,
                    onChange: (e) => We(e.target.value),
                    onPaste: (e) => {
                      var p;
                      const o = Array.from(((p = e.clipboardData) == null ? void 0 : p.items) || []).filter((l) => l.kind === "file" && l.type.startsWith("image/")).map((l) => l.getAsFile()).filter((l) => l != null);
                      o.length > 0 && (e.preventDefault(), Te(o));
                    },
                    placeholder: "Describe the issue in detail... (you can paste a screenshot here)",
                    rows: 3,
                    style: {
                      width: "100%",
                      padding: "8px 12px",
                      borderRadius: 6,
                      border: `1px solid ${D}`,
                      background: ne,
                      color: A,
                      fontSize: 14,
                      outline: "none",
                      resize: "vertical",
                      boxSizing: "border-box",
                      fontFamily: "inherit"
                    }
                  }
                )
              ] }),
              /* @__PURE__ */ s("div", { style: { marginBottom: 14 }, children: [
                /* @__PURE__ */ t("label", { style: { display: "block", marginBottom: 4, fontSize: 13, fontWeight: 600, opacity: 0.8 }, children: "Files" }),
                /* @__PURE__ */ s(
                  "div",
                  {
                    onDragOver: (e) => {
                      e.preventDefault(), e.stopPropagation();
                    },
                    onDrop: (e) => {
                      var o;
                      e.preventDefault();
                      const r = Array.from(((o = e.dataTransfer) == null ? void 0 : o.files) || []);
                      r.length && Te(r);
                    },
                    style: {
                      border: `1px dashed ${D}`,
                      borderRadius: 6,
                      padding: 14,
                      background: ne,
                      fontSize: 12,
                      opacity: 0.95,
                      textAlign: "center",
                      minHeight: 70
                    },
                    children: [
                      /* @__PURE__ */ s("div", { style: { display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", justifyContent: "center" }, children: [
                        /* @__PURE__ */ s("label", { style: { ...O, background: "#444", color: "#fff", padding: "4px 10px", fontSize: 12, cursor: "pointer" }, children: [
                          "Choose files",
                          /* @__PURE__ */ t(
                            "input",
                            {
                              type: "file",
                              accept: "*/*",
                              multiple: !0,
                              onChange: (e) => {
                                const r = Array.from(e.target.files || []);
                                r.length && Te(r), e.target.value = "";
                              },
                              style: { display: "none" }
                            }
                          )
                        ] }),
                        /* @__PURE__ */ t("span", { style: { opacity: 0.7 }, children: "or drag & drop / paste images here — any file type" })
                      ] }),
                      ue.length > 0 && /* @__PURE__ */ t("div", { style: { display: "flex", gap: 6, marginTop: 10, flexWrap: "wrap", justifyContent: "center" }, children: ue.map((e, r) => {
                        const o = ot[r];
                        return /* @__PURE__ */ s("div", { style: { position: "relative" }, children: [
                          o ? /* @__PURE__ */ t(
                            "img",
                            {
                              src: o,
                              alt: e.name || `file-${r + 1}`,
                              title: e.name,
                              style: {
                                width: 64,
                                height: 64,
                                objectFit: "cover",
                                borderRadius: 4,
                                border: `1px solid ${D}`
                              }
                            }
                          ) : /* @__PURE__ */ s(
                            "div",
                            {
                              title: e.name,
                              style: {
                                width: 90,
                                height: 64,
                                borderRadius: 4,
                                border: `1px solid ${D}`,
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
                              onClick: () => it(r),
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
                        ] }, r);
                      }) })
                    ]
                  }
                )
              ] }),
              /* @__PURE__ */ s("div", { style: { marginBottom: 14 }, children: [
                /* @__PURE__ */ t("label", { style: { display: "block", marginBottom: 4, fontSize: 13, fontWeight: 600, opacity: 0.8 }, children: "Screen Recording" }),
                nt ? /* @__PURE__ */ s("div", { children: [
                  /* @__PURE__ */ t(
                    "input",
                    {
                      type: "file",
                      accept: "video/*",
                      onChange: (e) => {
                        var r;
                        return Ne(((r = e.target.files) == null ? void 0 : r[0]) || null);
                      },
                      style: { fontSize: 13 }
                    }
                  ),
                  le && /* @__PURE__ */ t("span", { style: { fontSize: 12, opacity: 0.7, marginLeft: 8 }, children: le.name })
                ] }) : /* @__PURE__ */ s("div", { style: { display: "flex", gap: 8, alignItems: "center" }, children: [
                  !G && !W && /* @__PURE__ */ t(
                    "div",
                    {
                      onClick: Ie,
                      style: {
                        ...O,
                        background: `linear-gradient(135deg, ${b[0]}, ${b[1]})`,
                        color: "#fff"
                      },
                      children: "Start Recording"
                    }
                  ),
                  G && /* @__PURE__ */ t(
                    "div",
                    {
                      onClick: qe,
                      style: { ...O, background: "#e53935", color: "#fff" },
                      children: "Stop Recording"
                    }
                  ),
                  Ze && /* @__PURE__ */ t("div", { style: {
                    fontSize: 12,
                    color: "#fb923c",
                    background: "rgba(251,146,60,0.12)",
                    border: "1px solid rgba(251,146,60,0.35)",
                    borderRadius: 6,
                    padding: "5px 10px",
                    marginBottom: 4
                  }, children: "Recording recovered after page reload — your video is intact." }),
                  W && /* @__PURE__ */ s("div", { style: { display: "flex", alignItems: "center", gap: 8 }, children: [
                    /* @__PURE__ */ s("span", { style: { fontSize: 12, opacity: 0.7 }, children: [
                      (W.size / 1024 / 1024).toFixed(1),
                      " MB"
                    ] }),
                    /* @__PURE__ */ t(
                      "div",
                      {
                        onClick: () => {
                          K(null), ee((e) => (e && URL.revokeObjectURL(e), null));
                        },
                        style: { ...O, background: "#666", color: "#fff", padding: "4px 10px", fontSize: 12 },
                        children: "Remove"
                      }
                    )
                  ] }),
                  G && /* @__PURE__ */ t("span", { style: { fontSize: 12, color: "#e53935", fontWeight: 600 }, children: "Recording..." })
                ] })
              ] }),
              Ve && /* @__PURE__ */ s("div", { style: { marginBottom: 14 }, children: [
                /* @__PURE__ */ t("label", { style: { display: "block", marginBottom: 6, fontSize: 13, fontWeight: 600, opacity: 0.8 }, children: "Preview" }),
                /* @__PURE__ */ t(
                  "video",
                  {
                    src: Ve,
                    controls: !0,
                    style: {
                      width: "100%",
                      borderRadius: 8,
                      border: `1px solid ${D}`,
                      background: "#000",
                      maxHeight: 220,
                      display: "block"
                    }
                  }
                ),
                /* @__PURE__ */ t("div", { style: { fontSize: 11, opacity: 0.5, marginTop: 4 }, children: "Make sure your audio is audible before submitting." })
              ] }),
              ve && /* @__PURE__ */ s("div", { style: { marginBottom: 14 }, children: [
                /* @__PURE__ */ t("label", { style: { display: "block", marginBottom: 4, fontSize: 13, fontWeight: 600, opacity: 0.8 }, children: "Voice Transcript" }),
                /* @__PURE__ */ t(
                  "div",
                  {
                    style: {
                      padding: "8px 12px",
                      borderRadius: 6,
                      background: ne,
                      border: `1px solid ${D}`,
                      fontSize: 13,
                      maxHeight: 80,
                      overflowY: "auto",
                      opacity: 0.8
                    },
                    children: ve
                  }
                )
              ] }),
              (w.current.length > 0 || U.current.length > 0) && /* @__PURE__ */ s("div", { style: {
                marginBottom: 14,
                padding: "6px 12px",
                borderRadius: 6,
                background: q ? "#2a1a1a" : "#fff3f0",
                border: `1px solid ${q ? "#4a2020" : "#ffccc7"}`,
                fontSize: 12,
                opacity: 0.8
              }, children: [
                w.current.length > 0 && /* @__PURE__ */ s("span", { children: [
                  w.current.length,
                  " console error(s) captured"
                ] }),
                w.current.length > 0 && U.current.length > 0 && " | ",
                U.current.length > 0 && /* @__PURE__ */ s("span", { children: [
                  U.current.length,
                  " network error(s) captured"
                ] }),
                /* @__PURE__ */ t("span", { style: { display: "block", marginTop: 2, opacity: 0.7 }, children: "These will be included in your report automatically." })
              ] }),
              $e && /* @__PURE__ */ t("div", { style: { color: "#e53935", fontSize: 13, marginBottom: 10 }, children: $e }),
              je && de && /* @__PURE__ */ s("div", { style: {
                background: "rgba(229, 57, 53, 0.12)",
                border: "1px solid rgba(229, 57, 53, 0.45)",
                color: "#ffb4ad",
                padding: "10px 12px",
                borderRadius: 6,
                fontSize: 13,
                marginBottom: 10
              }, children: [
                /* @__PURE__ */ s("div", { style: { fontWeight: 600, marginBottom: 4, color: "#ff6b66" }, children: [
                  "Ticket #",
                  de,
                  " was saved — but the video upload failed."
                ] }),
                /* @__PURE__ */ t("div", { style: { marginBottom: 8 }, children: je }),
                /* @__PURE__ */ s("div", { style: { display: "flex", gap: 8 }, children: [
                  /* @__PURE__ */ t(
                    "div",
                    {
                      onClick: Z ? void 0 : ct,
                      style: {
                        ...O,
                        background: Z ? "#666" : `linear-gradient(135deg, ${b[0]}, ${b[1]})`,
                        color: "#fff",
                        padding: "5px 12px",
                        fontSize: 12,
                        opacity: Z ? 0.6 : 1,
                        cursor: Z ? "not-allowed" : "pointer"
                      },
                      children: Z ? "Retrying…" : "Retry video upload"
                    }
                  ),
                  /* @__PURE__ */ t(
                    "div",
                    {
                      onClick: () => {
                        Q(null), C(!1), he();
                      },
                      style: {
                        ...O,
                        background: "transparent",
                        color: A,
                        border: `1px solid ${D}`,
                        padding: "5px 12px",
                        fontSize: 12
                      },
                      children: "Skip & close"
                    }
                  )
                ] })
              ] }),
              /* @__PURE__ */ s("div", { style: { display: "flex", gap: 8, justifyContent: "flex-end" }, children: [
                /* @__PURE__ */ t(
                  "div",
                  {
                    onClick: () => C(!1),
                    style: {
                      ...O,
                      background: "transparent",
                      color: A,
                      border: `1px solid ${D}`
                    },
                    children: "Cancel"
                  }
                ),
                /* @__PURE__ */ t(
                  "div",
                  {
                    onClick: J ? void 0 : st,
                    style: {
                      ...O,
                      background: J ? "#666" : `linear-gradient(135deg, ${b[0]}, ${b[1]})`,
                      color: "#fff",
                      opacity: J ? 0.6 : 1,
                      cursor: J ? "not-allowed" : "pointer"
                    },
                    children: J ? "Submitting..." : "Submit"
                  }
                )
              ] }),
              /* @__PURE__ */ t("div", { style: { marginTop: 14, fontSize: 11, opacity: 0.4, textAlign: "center" }, children: "Page URL, browser info, screen size, and console errors will be captured automatically." })
            ] })
          }
        )
      }
    ),
    G && /* @__PURE__ */ s(
      "div",
      {
        onMouseDown: (e) => {
          if (e.target.closest("[data-bom-stop]")) return;
          e.preventDefault(), M.current = {
            x: e.clientX - H.left,
            y: e.clientY - H.top
          };
          const r = (p) => {
            M.current && Xe({
              left: Math.max(0, Math.min(window.innerWidth - 240, p.clientX - M.current.x)),
              top: Math.max(0, Math.min(window.innerHeight - 50, p.clientY - M.current.y))
            });
          }, o = () => {
            M.current = null, document.removeEventListener("mousemove", r), document.removeEventListener("mouseup", o);
          };
          document.addEventListener("mousemove", r), document.addEventListener("mouseup", o);
        },
        onTouchStart: (e) => {
          if (e.target.closest("[data-bom-stop]")) return;
          const r = e.touches[0];
          M.current = {
            x: r.clientX - H.left,
            y: r.clientY - H.top
          };
          const o = (l) => {
            if (!M.current) return;
            l.preventDefault();
            const f = l.touches[0];
            Xe({
              left: Math.max(0, Math.min(window.innerWidth - 240, f.clientX - M.current.x)),
              top: Math.max(0, Math.min(window.innerHeight - 50, f.clientY - M.current.y))
            });
          }, p = () => {
            M.current = null, document.removeEventListener("touchmove", o), document.removeEventListener("touchend", p);
          };
          document.addEventListener("touchmove", o, { passive: !1 }), document.addEventListener("touchend", p);
        },
        style: {
          position: "fixed",
          top: H.top,
          left: H.left,
          zIndex: 1000001,
          display: "flex",
          alignItems: "center",
          gap: 10,
          padding: "8px 12px",
          background: fe,
          color: A,
          borderRadius: 999,
          border: `1px solid ${D}`,
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
              onClick: qe,
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
    et && !G && !N && W && /* @__PURE__ */ s("div", { style: {
      position: "fixed",
      bottom: 80,
      right: 24,
      zIndex: 1000001,
      display: "flex",
      alignItems: "center",
      gap: 8,
      padding: "10px 14px",
      background: fe,
      color: A,
      borderRadius: 999,
      border: "1px solid rgba(251,146,60,0.5)",
      boxShadow: "0 8px 24px rgba(0,0,0,0.35)",
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
      fontSize: 13,
      userSelect: "none"
    }, children: [
      /* @__PURE__ */ t("span", { style: { fontSize: 16 }, children: "🎥" }),
      /* @__PURE__ */ s("span", { style: { fontWeight: 600, color: "#fb923c" }, children: [
        "Recovered (",
        (W.size / 1024 / 1024).toFixed(1),
        " MB)"
      ] }),
      /* @__PURE__ */ t(
        "div",
        {
          onClick: () => {
            j(!1), Ie();
          },
          style: { cursor: "pointer", background: `linear-gradient(135deg, ${b[0]}, ${b[1]})`, color: "#fff", borderRadius: 999, padding: "5px 12px", fontSize: 12, fontWeight: 700 },
          children: "Continue"
        }
      ),
      /* @__PURE__ */ t(
        "div",
        {
          onClick: () => {
            j(!1), C(!0);
          },
          style: { cursor: "pointer", background: "#22c55e", color: "#fff", borderRadius: 999, padding: "5px 12px", fontSize: 12, fontWeight: 700 },
          children: "Submit"
        }
      ),
      /* @__PURE__ */ t(
        "div",
        {
          onClick: () => {
            j(!1), ae(!1), K(null), ee((e) => (e && URL.revokeObjectURL(e), null)), V.current = [], xe();
          },
          style: { cursor: "pointer", opacity: 0.5, fontSize: 12, padding: "5px 8px" },
          children: "✕"
        }
      )
    ] })
  ] });
};
export {
  xt as BugOutManagedWidget,
  xt as BugsManagedWidget
};
