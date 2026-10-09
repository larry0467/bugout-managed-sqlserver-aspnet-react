import { jsxs as u, Fragment as Ne, jsx as t } from "react/jsx-runtime";
import { useState as k, useEffect as fe, useRef as F, useCallback as X } from "react";
function bt(r) {
  return r && r.__esModule && Object.prototype.hasOwnProperty.call(r, "default") ? r.default : r;
}
var ct = { exports: {} };
(function(r) {
  (function(o, n) {
    r.exports ? r.exports = n() : window.ysFixWebmDuration = n();
  })("fix-webm-duration", function() {
    var o = {
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
    function n(i, p) {
      i.prototype = Object.create(p.prototype), i.prototype.constructor = i;
    }
    function s(i, p) {
      this.name = i || "Unknown", this.type = p || "Unknown";
    }
    s.prototype.updateBySource = function() {
    }, s.prototype.setSource = function(i) {
      this.source = i, this.updateBySource();
    }, s.prototype.updateByData = function() {
    }, s.prototype.setData = function(i) {
      this.data = i, this.updateByData();
    };
    function c(i, p) {
      s.call(this, i, p || "Uint");
    }
    n(c, s);
    function f(i) {
      return i.length % 2 === 1 ? "0" + i : i;
    }
    c.prototype.updateBySource = function() {
      this.data = "";
      for (var i = 0; i < this.source.length; i++) {
        var p = this.source[i].toString(16);
        this.data += f(p);
      }
    }, c.prototype.updateByData = function() {
      var i = this.data.length / 2;
      this.source = new Uint8Array(i);
      for (var p = 0; p < i; p++) {
        var d = this.data.substr(p * 2, 2);
        this.source[p] = parseInt(d, 16);
      }
    }, c.prototype.getValue = function() {
      return parseInt(this.data, 16);
    }, c.prototype.setValue = function(i) {
      this.setData(f(i.toString(16)));
    };
    function h(i, p) {
      s.call(this, i, p || "Float");
    }
    n(h, s), h.prototype.getFloatArrayType = function() {
      return this.source && this.source.length === 4 ? Float32Array : Float64Array;
    }, h.prototype.updateBySource = function() {
      var i = this.source.reverse(), p = this.getFloatArrayType(), d = new p(i.buffer);
      this.data = d[0];
    }, h.prototype.updateByData = function() {
      var i = this.getFloatArrayType(), p = new i([this.data]), d = new Uint8Array(p.buffer);
      this.source = d.reverse();
    }, h.prototype.getValue = function() {
      return this.data;
    }, h.prototype.setValue = function(i) {
      this.setData(i);
    };
    function x(i, p) {
      s.call(this, i, p || "Container");
    }
    n(x, s), x.prototype.readByte = function() {
      return this.source[this.offset++];
    }, x.prototype.readUint = function() {
      for (var i = this.readByte(), p = 8 - i.toString(2).length, d = i - (1 << 7 - p), T = 0; T < p; T++)
        d *= 256, d += this.readByte();
      return d;
    }, x.prototype.updateBySource = function() {
      for (this.data = [], this.offset = 0; this.offset < this.source.length; this.offset = d) {
        var i = this.readUint(), p = this.readUint(), d = Math.min(this.offset + p, this.source.length), T = this.source.slice(this.offset, d), m = o[i] || { name: "Unknown", type: "Unknown" }, v = s;
        switch (m.type) {
          case "Container":
            v = x;
            break;
          case "Uint":
            v = c;
            break;
          case "Float":
            v = h;
            break;
        }
        var b = new v(m.name, m.type);
        b.setSource(T), this.data.push({
          id: i,
          idHex: i.toString(16),
          data: b
        });
      }
    }, x.prototype.writeUint = function(i, p) {
      for (var d = 1, T = 128; i >= T && d < 8; d++, T *= 128)
        ;
      if (!p)
        for (var m = T + i, v = d - 1; v >= 0; v--) {
          var b = m % 256;
          this.source[this.offset + v] = b, m = (m - b) / 256;
        }
      this.offset += d;
    }, x.prototype.writeSections = function(i) {
      this.offset = 0;
      for (var p = 0; p < this.data.length; p++) {
        var d = this.data[p], T = d.data.source, m = T.length;
        this.writeUint(d.id, i), this.writeUint(m, i), i || this.source.set(T, this.offset), this.offset += m;
      }
      return this.offset;
    }, x.prototype.updateByData = function() {
      var i = this.writeSections("draft");
      this.source = new Uint8Array(i), this.writeSections();
    }, x.prototype.getSectionById = function(i) {
      for (var p = 0; p < this.data.length; p++) {
        var d = this.data[p];
        if (d.id === i)
          return d.data;
      }
      return null;
    };
    function U(i) {
      x.call(this, "File", "File"), this.setSource(i);
    }
    n(U, x), U.prototype.fixDuration = function(i, p) {
      var d = p && p.logger;
      d === void 0 ? d = function(j) {
        console.log(j);
      } : d || (d = function() {
      });
      var T = this.getSectionById(139690087);
      if (!T)
        return d("[fix-webm-duration] Segment section is missing"), !1;
      var m = T.getSectionById(88713574);
      if (!m)
        return d("[fix-webm-duration] Info section is missing"), !1;
      var v = m.getSectionById(710577);
      if (!v)
        return d("[fix-webm-duration] TimecodeScale section is missing"), !1;
      var b = m.getSectionById(1161);
      if (b)
        if (b.getValue() <= 0)
          d(`[fix-webm-duration] Duration section is present, but the value is ${b.getValue()}`), b.setValue(i);
        else
          return d(`[fix-webm-duration] Duration section is present, and the value is ${b.getValue()}`), !1;
      else
        d("[fix-webm-duration] Duration section is missing"), b = new h("Duration", "Float"), b.setValue(i), m.data.push({
          id: 1161,
          data: b
        });
      return v.setValue(1e6), m.updateByData(), T.updateByData(), this.updateByData(), !0;
    }, U.prototype.toBlob = function(i) {
      return new Blob([this.source.buffer], { type: i || "video/webm" });
    };
    function E(i, p, d, T) {
      if (typeof d == "object" && (T = d, d = void 0), !d)
        return new Promise(function(v) {
          E(i, p, v, T);
        });
      try {
        var m = new FileReader();
        m.onloadend = function() {
          try {
            var v = new U(new Uint8Array(m.result));
            v.fixDuration(p, T) && (i = v.toBlob(i.type));
          } catch {
          }
          d(i);
        }, m.readAsArrayBuffer(i);
      } catch {
        d(i);
      }
    }
    return E.default = E, E;
  });
})(ct);
var xt = ct.exports;
const vt = /* @__PURE__ */ bt(xt);
function ie(r) {
  const o = r.match(/rgba?\(([^)]+)\)/i);
  if (!o) return null;
  const n = o[1].split(",").map((s) => parseFloat(s.trim()));
  return n.length < 3 || n.some((s) => Number.isNaN(s)) ? null : [n[0], n[1], n[2], n[3] ?? 1];
}
function J(r) {
  if (!r || typeof document > "u") return null;
  const o = r.trim();
  if (!o || o === "transparent" || o === "currentColor" || o === "inherit") return null;
  const n = document.createElement("span");
  if (n.style.color = "", n.style.color = o, !n.style.color) return null;
  n.style.display = "none", document.body.appendChild(n);
  const s = getComputedStyle(n).color;
  return document.body.removeChild(n), ie(s);
}
function at([r, o, n]) {
  const s = (c) => {
    const f = c / 255;
    return f <= 0.03928 ? f / 12.92 : Math.pow((f + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * s(r) + 0.7152 * s(o) + 0.0722 * s(n);
}
function Me([r, o, n]) {
  r /= 255, o /= 255, n /= 255;
  const s = Math.max(r, o, n), c = Math.min(r, o, n), f = (s + c) / 2;
  let h = 0, x = 0;
  if (s !== c) {
    const U = s - c;
    x = f > 0.5 ? U / (2 - s - c) : U / (s + c), s === r ? h = (o - n) / U + (o < n ? 6 : 0) : s === o ? h = (n - r) / U + 2 : h = (r - o) / U + 4, h *= 60;
  }
  return [h, x, f];
}
function St(r, o, n) {
  const s = o * Math.min(n, 1 - n), c = (f) => {
    const h = (f + r / 30) % 12, x = n - s * Math.max(-1, Math.min(h - 3, 9 - h, 1));
    return Math.round(255 * x).toString(16).padStart(2, "0");
  };
  return `#${c(0)}${c(8)}${c(4)}`;
}
function je([r, o, n]) {
  return `#${[r, o, n].map((s) => Math.round(s).toString(16).padStart(2, "0")).join("")}`;
}
function kt(r) {
  if (r[3] < 0.35) return !0;
  const [, o, n] = Me(r);
  return o < 0.18 || n > 0.93 || n < 0.07;
}
function Ee(r, o) {
  const n = J(r);
  if (!n) return r;
  const [s, c, f] = Me(n);
  return St(s, c, Math.max(0, Math.min(1, f + o)));
}
function wt(r, o) {
  const n = J(r), s = J(o);
  if (!n || !s) return 0;
  const c = Math.abs(Me(n)[0] - Me(s)[0]);
  return Math.min(c, 360 - c);
}
const Ct = 'button,a,[role="button"],[class*="primary"],[class*="accent"],[class*="brand"],[class*="btn"],header,nav,[class*="navbar"],[class*="sidebar"]', Ut = /(primary|accent|brand|gold|navy|blue|green|teal|indigo|violet|orange|red|color)/i;
function Tt() {
  const r = /* @__PURE__ */ new Map(), o = (c, f) => {
    if (!c || kt(c)) return;
    const h = je(c);
    r.set(h, (r.get(h) ?? 0) + f);
  }, n = document.querySelector('meta[name="theme-color"]');
  o(J(n == null ? void 0 : n.content), 6);
  try {
    const c = getComputedStyle(document.documentElement);
    for (let f = 0; f < c.length; f++) {
      const h = c[f];
      h.startsWith("--") && Ut.test(h) && o(J(c.getPropertyValue(h)), 3);
    }
  } catch {
  }
  const s = Array.from(document.querySelectorAll(Ct)).slice(0, 240);
  for (const c of s) {
    const f = getComputedStyle(c);
    o(ie(f.backgroundColor), 2), o(ie(f.borderTopColor), 1), o(ie(f.color), 1);
  }
  return r;
}
function Bt(r) {
  const o = [...r.entries()].sort((f, h) => h[1] - f[1]);
  if (o.length === 0) return null;
  const n = o[0][0], s = o.slice(1).find(([f]) => wt(f, n) > 35), c = s ? s[0] : Ee(n, 0.16);
  return { accent: n, ring: c };
}
function Rt() {
  var n;
  for (const s of [document.documentElement, document.body].filter(Boolean)) {
    const c = `${s.className} ${s.getAttribute("data-theme") ?? ""} ${s.getAttribute("data-bs-theme") ?? ""} ${s.getAttribute("data-color-mode") ?? ""} ${s.getAttribute("data-mode") ?? ""}`.toLowerCase();
    if (/\bdark\b/.test(c)) return "dark";
    if (/\blight\b/.test(c)) return "light";
  }
  let r = document.body;
  for (; r; ) {
    const s = ie(getComputedStyle(r).backgroundColor);
    if (s && s[3] > 0.5) return at(s) < 0.5 ? "dark" : "light";
    r = r.parentElement;
  }
  const o = J(getComputedStyle(document.body || document.documentElement).color);
  return o ? at(o) < 0.5 ? "light" : "dark" : (n = window.matchMedia) != null && n.call(window, "(prefers-color-scheme: dark)").matches ? "dark" : "light";
}
function Dt() {
  let r = document.body;
  for (; r; ) {
    const o = ie(getComputedStyle(r).backgroundColor);
    if (o && o[3] > 0.5) return o;
    r = r.parentElement;
  }
  return null;
}
function st() {
  if (typeof document > "u")
    return {
      mode: "dark",
      accent: "#6366f1",
      accentRing: "#8b5cf6",
      surface: "#1a1a2e",
      inputBg: "#16213e",
      text: "#e0e0e0",
      border: "#33384f"
    };
  const r = Rt(), o = Bt(Tt()), n = (o == null ? void 0 : o.accent) ?? (r === "dark" ? "#6366f1" : "#4f46e5"), s = (o == null ? void 0 : o.ring) ?? Ee(n, r === "dark" ? 0.16 : -0.12), c = Dt(), f = J(
    getComputedStyle(document.body || document.documentElement).color
  ), h = c ? je(c) : r === "dark" ? "#1a1a2e" : "#ffffff", x = f ? je(f) : r === "dark" ? "#e6e6ea" : "#1f2430", U = Ee(h, r === "dark" ? 0.06 : -0.04), E = Ee(h, r === "dark" ? 0.12 : -0.1);
  return { mode: r, accent: n, accentRing: s, surface: h, inputBg: U, text: x, border: E };
}
function It(r) {
  const [o, n] = k(st);
  return fe(() => {
    var U;
    if (!r || typeof document > "u") return;
    let s = 0;
    const c = () => {
      cancelAnimationFrame(s), s = requestAnimationFrame(() => n(st()));
    }, f = new MutationObserver(c), h = ["class", "style", "data-theme", "data-bs-theme", "data-color-mode", "data-mode"];
    f.observe(document.documentElement, { attributes: !0, attributeFilter: h }), document.body && f.observe(document.body, { attributes: !0, attributeFilter: h });
    const x = (U = window.matchMedia) == null ? void 0 : U.call(window, "(prefers-color-scheme: dark)");
    return x == null || x.addEventListener("change", c), () => {
      cancelAnimationFrame(s), f.disconnect(), x == null || x.removeEventListener("change", c);
    };
  }, [r]), o;
}
const Et = "videos-managed:capture-complete", Mt = "videos-managed:capture-discarded", At = "bugout-videos-managed-recorder", Ft = "popup=yes,width=840,height=660,menubar=no,toolbar=no,location=no,status=no";
function Ot(r) {
  const { apiUrl: o, apiKey: n } = r, [s, c] = k(!1), [f, h] = k(null), x = F(r);
  x.current = r;
  const U = F(null), E = F(null);
  fe(() => () => {
    var m;
    (m = E.current) == null || m.call(E);
  }, []);
  const i = X(async () => {
    if (typeof window > "u") return !1;
    let m = null;
    try {
      m = window.open("", At, Ft);
    } catch {
      m = null;
    }
    if (!m) return !1;
    try {
      m.document.write(
        '<!doctype html><title>Opening the recorder…</title><body style="margin:0;height:100vh;display:flex;align-items:center;justify-content:center;background:#050818;color:#cbd5e1;font:15px system-ui,sans-serif"><p>Opening the Videos Managed recorder…</p></body>'
      );
    } catch {
    }
    let v = null;
    try {
      const R = await fetch(`${o}/tickets/capture-session`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-BOM-API-Key": n },
        body: JSON.stringify({ title: x.current.getTitle() || document.title, pageUrl: window.location.href })
      });
      R.ok && (v = await R.json());
    } catch {
      v = null;
    }
    if (!(v != null && v.captureUrl) || !v.recordingId) {
      try {
        m.close();
      } catch {
      }
      return !1;
    }
    let b;
    try {
      b = new URL(v.captureUrl).origin;
    } catch {
      try {
        m.close();
      } catch {
      }
      return !1;
    }
    try {
      m.location.href = v.captureUrl;
    } catch {
      try {
        m.close();
      } catch {
      }
      return !1;
    }
    U.current = m, c(!0);
    const j = m, ae = v;
    let he = !1, q = () => {
    };
    const z = (R) => {
      var L, H, Z, se;
      he || (he = !0, q(), c(!1), R ? (h(R), (H = (L = x.current).onAttached) == null || H.call(L, R)) : (se = (Z = x.current).onClosed) == null || se.call(Z));
    }, Y = (R) => {
      if (R.origin !== b) return;
      const L = R.data;
      !L || typeof L != "object" || L.recordingId !== ae.recordingId || (L.type === Et ? z({ recordingId: L.recordingId, shareUrl: L.shareUrl || ae.shareUrl, durationSeconds: L.durationSeconds }) : L.type === Mt && z(null));
    };
    window.addEventListener("message", Y);
    const Ae = window.setInterval(() => {
      let R = !1;
      try {
        R = j.closed;
      } catch {
        R = !0;
      }
      R && z(null);
    }, 1e3);
    return q = () => {
      window.removeEventListener("message", Y), window.clearInterval(Ae), E.current = null, U.current = null;
    }, E.current = q, !0;
  }, [o, n]), p = X(() => {
    var m;
    try {
      (m = U.current) == null || m.focus();
    } catch {
    }
  }, []), d = X(() => {
    var m;
    try {
      (m = U.current) == null || m.close();
    } catch {
    }
  }, []), T = X(() => h(null), []);
  return { capturing: s, attached: f, begin: i, focus: p, cancel: d, clear: T };
}
const Lt = "bom-draft", Q = "chunks";
let De = null;
function He() {
  return De || (De = new Promise((r, o) => {
    const n = indexedDB.open(Lt, 1);
    n.onupgradeneeded = () => n.result.createObjectStore(Q, { autoIncrement: !0 }), n.onsuccess = () => r(n.result), n.onerror = () => {
      De = null, o(n.error);
    };
  })), De;
}
function _t(r) {
  He().then((o) => {
    o.transaction(Q, "readwrite").objectStore(Q).add(r);
  }).catch(() => {
  });
}
function Pt() {
  return He().then(
    (r) => new Promise((o) => {
      const n = r.transaction(Q, "readonly").objectStore(Q).getAll();
      n.onsuccess = () => o(n.result), n.onerror = () => o([]);
    })
  ).catch(() => []);
}
function Ie() {
  He().then((r) => {
    r.transaction(Q, "readwrite").objectStore(Q).clear();
  }).catch(() => {
  });
}
const Wt = [
  { value: "BUG", label: "Bug Report" },
  { value: "FEATURE_REQUEST", label: "Feature Request" },
  { value: "QUESTION", label: "Question" }
], zt = [
  { value: "LOW", label: "Low" },
  { value: "MEDIUM", label: "Medium" },
  { value: "HIGH", label: "High" },
  { value: "CRITICAL", label: "Critical" }
], Ht = (r) => {
  const {
    apiKey: o,
    apiUrl: n,
    userEmail: s,
    userName: c,
    position: f = "bottom-right",
    orbSize: h = 24,
    // Tenant context
    tenantId: x,
    tenantName: U,
    databaseName: E,
    appVersion: i,
    environment: p,
    onApiReady: d,
    hideOrb: T = !1
  } = r, m = F(
    `bom-orb-${Math.random().toString(36).slice(2, 9)}`
  ), [v, b] = k(!1), [j, ae] = k(!1), [he, q] = k(!1), [z, Y] = k(null), [Ae, R] = k(!1), [L, H] = k(!1), [Z, se] = k(""), [ge, Ve] = k("BUG"), [Xe, qe] = k("MEDIUM"), [be, Ye] = k(""), [Ke, Ge] = k(""), [ce, Fe] = k(!1), [lt, Oe] = k(!1), [Je, xe] = k(""), [dt, pt] = k(!1), [ve, Qe] = k(null), [Ze, le] = k(null), [Se, et] = k(null), [de, ke] = k(!1), D = Ot({
    apiUrl: n,
    apiKey: o,
    getTitle: () => be.trim(),
    onAttached: () => b(!0),
    onClosed: () => b(!0)
  }), [we, Le] = k([]), [ut, _e] = k([]), Pe = X((e) => {
    e.length !== 0 && (Le((a) => [...a, ...e]), _e((a) => [
      ...a,
      ...e.map((l) => l.type.startsWith("image/") ? URL.createObjectURL(l) : null)
    ]));
  }, []), mt = X((e) => {
    Le((a) => a.filter((l, S) => S !== e)), _e((a) => {
      const l = a[e];
      return l && URL.revokeObjectURL(l), a.filter((S, g) => g !== e);
    });
  }, []), [tt, pe] = k(null), [ee, nt] = k(() => ({
    top: 24,
    left: typeof window < "u" ? Math.max(24, window.innerWidth - 280) : 24
  })), $ = F(null), Ce = F(null), te = F([]), ne = F(null), We = F([]), ze = F(0), $e = F(null), Ue = F(null), ue = F(null), M = F([]), A = F([]);
  fe(() => {
    d == null || d({ open: () => b(!0), close: () => b(!1) });
  }, [d]), fe(() => {
    Pt().then((e) => {
      if (e.length === 0) return;
      const a = new Blob(e, { type: "video/webm" });
      te.current = e, Y(a), pe(URL.createObjectURL(a)), R(!0), H(!0);
    });
  }, []), fe(() => {
    if (pt(/Android|iPhone|iPad|iPod/i.test(navigator.userAgent)), !ue.current) {
      const y = document.createElement("style");
      y.textContent = `
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
      `, document.head.appendChild(y), ue.current = y;
    }
    const e = console.error;
    console.error = (...y) => {
      M.current.push({
        type: "console.error",
        message: y.map((w) => typeof w == "object" ? JSON.stringify(w) : String(w)).join(" "),
        timestamp: (/* @__PURE__ */ new Date()).toISOString()
      }), M.current.length > 50 && M.current.shift(), e.apply(console, y);
    };
    const a = (y) => {
      M.current.push({
        type: "window.onerror",
        message: y.message,
        source: y.filename,
        line: y.lineno,
        col: y.colno,
        timestamp: (/* @__PURE__ */ new Date()).toISOString()
      }), M.current.length > 50 && M.current.shift();
    };
    window.addEventListener("error", a);
    const l = (y) => {
      var w;
      M.current.push({
        type: "unhandledrejection",
        message: ((w = y.reason) == null ? void 0 : w.message) || String(y.reason),
        timestamp: (/* @__PURE__ */ new Date()).toISOString()
      }), M.current.length > 50 && M.current.shift();
    };
    window.addEventListener("unhandledrejection", l);
    const S = window.fetch;
    window.fetch = async (...y) => {
      var C;
      const w = typeof y[0] == "string" ? y[0] : y[0].url, V = (((C = y[1]) == null ? void 0 : C.method) || "GET").toUpperCase();
      try {
        const I = await S.apply(window, y);
        return !I.ok && !w.includes(n) && (A.current.push({
          method: V,
          url: w,
          status: I.status,
          statusText: I.statusText,
          timestamp: (/* @__PURE__ */ new Date()).toISOString()
        }), A.current.length > 30 && A.current.shift()), I;
      } catch (I) {
        throw w.includes(n) || (A.current.push({
          method: V,
          url: w,
          status: 0,
          statusText: I.message || "Network Error",
          timestamp: (/* @__PURE__ */ new Date()).toISOString()
        }), A.current.length > 30 && A.current.shift()), I;
      }
    };
    const g = XMLHttpRequest.prototype.open, B = XMLHttpRequest.prototype.send;
    return XMLHttpRequest.prototype.open = function(y, w, ...V) {
      return this._bomMethod = y, this._bomUrl = String(w), g.apply(this, [y, w, ...V]);
    }, XMLHttpRequest.prototype.send = function(...y) {
      return this.addEventListener("loadend", () => {
        var w;
        this.status >= 400 && !((w = this._bomUrl) != null && w.includes(n)) && (A.current.push({
          method: this._bomMethod || "GET",
          url: this._bomUrl || "",
          status: this.status,
          statusText: this.statusText,
          timestamp: (/* @__PURE__ */ new Date()).toISOString()
        }), A.current.length > 30 && A.current.shift());
      }), B.apply(this, y);
    }, () => {
      ue.current && (document.head.removeChild(ue.current), ue.current = null), console.error = e, window.removeEventListener("error", a), window.removeEventListener("unhandledrejection", l), window.fetch = S, XMLHttpRequest.prototype.open = g, XMLHttpRequest.prototype.send = B;
    };
  }, [n]);
  const G = It(r.orbColors === void 0 || r.theme === void 0), O = r.orbColors ?? [G.accent, G.accentRing], re = (r.theme ?? G.mode) === "dark", Te = r.theme ? re ? "#1a1a2e" : "#ffffff" : G.surface, N = r.theme ? re ? "#e0e0e0" : "#333333" : G.text, _ = r.theme ? re ? "#333" : "#ddd" : G.border, me = r.theme ? re ? "#16213e" : "#f5f5f5" : G.inputBg, yt = f === "bottom-left" ? { bottom: 24, left: 24 } : { bottom: 24, right: 24 }, Be = X(async () => {
    try {
      const e = await navigator.mediaDevices.getDisplayMedia({
        // 'monitor' hints Chrome/Edge to pre-select "Entire Screen" in the picker.
        video: { displaySurface: "monitor" },
        // Passing only systemAudio:'include' — extra constraints alongside it
        // cause Chrome to silently ignore the pre-check.
        audio: { systemAudio: "include" }
      });
      let a = null;
      try {
        a = await navigator.mediaDevices.getUserMedia({ audio: !0, video: !1 });
      } catch {
      }
      $e.current = a;
      const l = ((a == null ? void 0 : a.getAudioTracks().length) ?? 0) > 0, S = e.getAudioTracks().length > 0;
      if (!l && !S) {
        e.getTracks().forEach((C) => C.stop()), a == null || a.getTracks().forEach((C) => C.stop()), q(!0), b(!1);
        return;
      }
      const g = l ? a.getAudioTracks() : e.getAudioTracks(), B = new MediaStream([...e.getVideoTracks(), ...g]), y = new MediaRecorder(B, {
        mimeType: MediaRecorder.isTypeSupported("video/webm;codecs=vp9") ? "video/webm;codecs=vp9" : "video/webm"
      });
      We.current = [], te.current.length === 0 && Ie(), y.ondataavailable = (C) => {
        C.data.size > 0 && (We.current.push(C.data), _t(C.data));
      }, y.onstop = async () => {
        var K;
        const C = [...te.current, ...We.current], I = new Blob(C, { type: "video/webm" });
        let W = I;
        const ye = ze.current > 0 ? Date.now() - ze.current : 0;
        if (ye > 0)
          try {
            W = await vt(I, ye, { logger: !1 });
          } catch {
            W = I;
          }
        te.current = [], Ie(), Y(W), pe((oe) => (oe && URL.revokeObjectURL(oe), URL.createObjectURL(W))), R(!1), H(!1), e.getTracks().forEach((oe) => oe.stop()), (K = $e.current) == null || K.getTracks().forEach((oe) => oe.stop()), $e.current = null;
      }, ze.current = Date.now(), y.start(1e3), ne.current = y;
      const w = () => {
        var C;
        ((C = ne.current) == null ? void 0 : C.state) === "recording" && ne.current.requestData();
      };
      window.addEventListener("beforeunload", w), Ce.current = w, ae(!0), b(!1);
      const V = window.SpeechRecognition || window.webkitSpeechRecognition;
      if (V) {
        const C = new V();
        C.continuous = !0, C.interimResults = !0, C.lang = "en-US";
        let I = "";
        C.onresult = (W) => {
          let ye = "";
          for (let K = W.resultIndex; K < W.results.length; K++)
            W.results[K].isFinal ? I += W.results[K][0].transcript + " " : ye += W.results[K][0].transcript;
          se(I + ye);
        }, C.onerror = () => {
        }, C.start(), Ue.current = C;
      }
    } catch (e) {
      console.error("Failed to start recording:", e);
    }
  }, []), ft = X(async () => {
    if (await D.begin()) {
      b(!1);
      return;
    }
    await Be();
  }, [D, Be]), rt = X(() => {
    Ce.current && (window.removeEventListener("beforeunload", Ce.current), Ce.current = null), ne.current && ne.current.state !== "inactive" && ne.current.stop(), Ue.current && (Ue.current.stop(), Ue.current = null), ae(!1), b(!0);
  }, []), Re = () => {
    Ye(""), Ge(""), Ve("BUG"), qe("MEDIUM"), se(""), Y(null), pe((e) => (e && URL.revokeObjectURL(e), null)), Qe(null), Le([]), _e((e) => (e.forEach((a) => {
      a && URL.revokeObjectURL(a);
    }), [])), xe(""), Oe(!1), le(null), et(null), ke(!1), R(!1), H(!1), q(!1), te.current = [], Ie(), D.clear();
  }, ht = async () => {
    if (!be.trim()) {
      xe("Title is required");
      return;
    }
    Fe(!0), xe("");
    try {
      const e = {
        title: be.trim(),
        description: Ke.trim(),
        ticketType: ge,
        priority: Xe,
        submittedBy: s || c || "Anonymous",
        currentPageUrl: window.location.href,
        currentPageName: document.title,
        browserInfo: navigator.userAgent,
        screenWidth: window.innerWidth,
        screenHeight: window.innerHeight,
        transcript: Z || null,
        consoleErrors: M.current.length > 0 ? JSON.stringify(M.current) : null,
        networkErrors: A.current.length > 0 ? JSON.stringify(A.current) : null
      };
      x && (e.tenantId = x), U && (e.tenantName = U), E && (e.databaseName = E), i && (e.applicationVersion = i), p && (e.environment = p), D.attached && (e.videoUrl = D.attached.shareUrl, e.videosManagedRecordingId = D.attached.recordingId, D.attached.durationSeconds && (e.videoDurationSeconds = D.attached.durationSeconds));
      const a = await fetch(`${n}/tickets`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-BOM-API-Key": o
        },
        body: JSON.stringify(e)
      });
      if (!a.ok) throw new Error("Failed to submit ticket");
      const l = await a.json();
      if (we.length > 0 && l.id)
        for (const g of we)
          try {
            const B = new FormData();
            B.append("file", g, g.name || "screenshot.png");
            const y = await fetch(`${n}/tickets/${l.id}/attachments/widget`, {
              method: "POST",
              headers: { "X-BOM-API-Key": o },
              body: B
            });
            y.ok || console.warn(`[Bug Out] Screenshot upload failed (${y.status}) for ticket ${l.id}`);
          } catch (B) {
            console.warn("[Bug Out] Screenshot upload network error:", B);
          }
      const S = D.attached ? null : z || ve;
      if (et(l.id), S && l.id) {
        const g = await it(l.id, S);
        if (g) {
          le(g), Fe(!1);
          return;
        }
      }
      Oe(!0), setTimeout(() => {
        b(!1), Re();
      }, 2e3);
    } catch (e) {
      xe(e.message || "Failed to submit");
    } finally {
      Fe(!1);
    }
  }, ot = 200 * 1024 * 1024, it = async (e, a) => {
    if (a.size > ot)
      return `Recording is ${(a.size / 1024 / 1024).toFixed(1)} MB — exceeds the ${ot / 1024 / 1024} MB upload limit. Stop the recording sooner next time.`;
    ke(!0);
    let l = null;
    for (let S = 1; S <= 3; S++) {
      try {
        const g = new FormData();
        g.append("file", a, "recording.webm");
        const B = await fetch(`${n}/tickets/${e}/video`, {
          method: "POST",
          headers: { "X-BOM-API-Key": o },
          body: g
        });
        if (B.ok)
          return ke(!1), null;
        if (B.status >= 400 && B.status < 500 && B.status !== 408 && B.status !== 429) {
          const y = await B.text().catch(() => "");
          l = `Server rejected upload (${B.status}): ${y || B.statusText}`;
          break;
        }
        l = `Upload failed (${B.status}). Retrying…`;
      } catch (g) {
        l = g != null && g.message ? `Network error: ${g.message}. Retrying…` : "Network error. Retrying…";
      }
      S < 3 && await new Promise((g) => setTimeout(g, 1e3 * Math.pow(2, S - 1)));
    }
    return ke(!1), l || "Video upload failed after 3 attempts.";
  }, gt = async () => {
    if (!Se) return;
    const e = z || ve;
    if (!e) return;
    le(null);
    const a = await it(Se, e);
    a ? le(a) : (Oe(!0), setTimeout(() => {
      b(!1), Re();
    }, 2e3));
  }, P = {
    padding: "8px 16px",
    border: "none",
    borderRadius: 6,
    cursor: "pointer",
    fontSize: 14,
    fontWeight: 600,
    transition: "opacity 0.2s"
  };
  return /* @__PURE__ */ u(Ne, { children: [
    !T && (() => {
      const e = h * 2, a = O[0], l = O[1], S = `${a}8c`, g = m.current;
      return /* @__PURE__ */ t(
        "button",
        {
          type: "button",
          role: "button",
          "aria-label": "Report a bug",
          title: "Report a bug or request a feature",
          onClick: () => {
            v || Re(), b(!v);
          },
          className: "bom-orb-wrap",
          style: {
            ...yt,
            width: e,
            height: e,
            "--bom-core": a,
            "--bom-ring": l,
            "--bom-halo": S,
            "--bom-spin": "18s",
            "--bom-pulse": "4s"
          },
          children: /* @__PURE__ */ u("span", { className: "bom-orb", children: [
            /* @__PURE__ */ u(
              "svg",
              {
                viewBox: "0 0 100 100",
                width: e,
                height: e,
                "aria-hidden": "true",
                className: "bom-orb__svg",
                children: [
                  /* @__PURE__ */ u("defs", { children: [
                    /* @__PURE__ */ u("radialGradient", { id: `${g}-core`, cx: "50%", cy: "50%", r: "50%", children: [
                      /* @__PURE__ */ t("stop", { offset: "0%", stopColor: a, stopOpacity: "1" }),
                      /* @__PURE__ */ t("stop", { offset: "55%", stopColor: a, stopOpacity: "0.55" }),
                      /* @__PURE__ */ t("stop", { offset: "100%", stopColor: "#1a0f00", stopOpacity: "0" })
                    ] }),
                    /* @__PURE__ */ u("radialGradient", { id: `${g}-iris`, cx: "50%", cy: "50%", r: "50%", children: [
                      /* @__PURE__ */ t("stop", { offset: "0%", stopColor: "#fff7dc", stopOpacity: "0.95" }),
                      /* @__PURE__ */ t("stop", { offset: "40%", stopColor: a, stopOpacity: "0.7" }),
                      /* @__PURE__ */ t("stop", { offset: "100%", stopColor: a, stopOpacity: "0" })
                    ] })
                  ] }),
                  /* @__PURE__ */ t(
                    "circle",
                    {
                      cx: "50",
                      cy: "50",
                      r: "48",
                      fill: `url(#${g}-core)`,
                      className: "bom-orb__halo"
                    }
                  ),
                  /* @__PURE__ */ u("g", { className: "bom-orb__spin-cw", children: [
                    /* @__PURE__ */ t(
                      "circle",
                      {
                        cx: "50",
                        cy: "50",
                        r: "44",
                        fill: "none",
                        stroke: l,
                        strokeOpacity: "0.55",
                        strokeWidth: "0.5"
                      }
                    ),
                    Array.from({ length: 36 }).map((B, y) => {
                      const w = y * 10 * Math.PI / 180, V = 50 + Math.cos(w) * 41, C = 50 + Math.sin(w) * 41, I = 50 + Math.cos(w) * (y % 3 === 0 ? 44 : 43), W = 50 + Math.sin(w) * (y % 3 === 0 ? 44 : 43);
                      return /* @__PURE__ */ t(
                        "line",
                        {
                          x1: V,
                          y1: C,
                          x2: I,
                          y2: W,
                          stroke: l,
                          strokeOpacity: y % 3 === 0 ? 0.8 : 0.35,
                          strokeWidth: "0.8"
                        },
                        y
                      );
                    })
                  ] }),
                  /* @__PURE__ */ u("g", { className: "bom-orb__spin-ccw", children: [
                    /* @__PURE__ */ t(
                      "circle",
                      {
                        cx: "50",
                        cy: "50",
                        r: "36",
                        fill: "none",
                        stroke: l,
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
                        stroke: l,
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
                      stroke: a,
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
                      fill: `url(#${g}-iris)`,
                      className: "bom-orb__core"
                    }
                  ),
                  /* @__PURE__ */ u("g", { stroke: "#1a0f00", strokeOpacity: "0.55", strokeLinecap: "round", children: [
                    /* @__PURE__ */ t("line", { x1: "50", y1: "42", x2: "50", y2: "42", strokeWidth: "3.4" }),
                    /* @__PURE__ */ t("line", { x1: "50", y1: "48", x2: "50", y2: "58", strokeWidth: "2.4" })
                  ] }),
                  /* @__PURE__ */ t("line", { x1: "50", y1: "6", x2: "50", y2: "14", stroke: l, strokeOpacity: "0.7", strokeWidth: "0.6" }),
                  /* @__PURE__ */ t("line", { x1: "50", y1: "86", x2: "50", y2: "94", stroke: l, strokeOpacity: "0.7", strokeWidth: "0.6" }),
                  /* @__PURE__ */ t("line", { x1: "6", y1: "50", x2: "14", y2: "50", stroke: l, strokeOpacity: "0.7", strokeWidth: "0.6" }),
                  /* @__PURE__ */ t("line", { x1: "86", y1: "50", x2: "94", y2: "50", stroke: l, strokeOpacity: "0.7", strokeWidth: "0.6" })
                ]
              }
            ),
            /* @__PURE__ */ t("span", { className: "bom-orb__scan" })
          ] })
        }
      );
    })(),
    he && /* @__PURE__ */ t(
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
        children: /* @__PURE__ */ u("div", { style: {
          background: Te,
          color: N,
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
          /* @__PURE__ */ u("p", { style: { margin: "0 0 18px", fontSize: 14, opacity: 0.75, lineHeight: 1.5 }, children: [
            "Your recording would have no sound. In the screen picker, enable the",
            /* @__PURE__ */ t("strong", { children: ' "Also share system audio"' }),
            " toggle before clicking Share."
          ] }),
          /* @__PURE__ */ u("div", { style: { display: "flex", gap: 10, justifyContent: "center" }, children: [
            /* @__PURE__ */ t(
              "div",
              {
                onClick: () => {
                  q(!1), Be();
                },
                style: {
                  ...P,
                  background: `linear-gradient(135deg, ${O[0]}, ${O[1]})`,
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
                  q(!1), b(!0);
                },
                style: { ...P, background: "transparent", color: N, border: `1px solid ${_}`, cursor: "pointer" },
                children: "Skip audio"
              }
            )
          ] })
        ] })
      }
    ),
    v && /* @__PURE__ */ t(
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
              background: Te,
              color: N,
              borderRadius: 12,
              padding: 24,
              width: "90%",
              maxWidth: 520,
              maxHeight: "85vh",
              overflowY: "auto",
              boxShadow: "0 20px 60px rgba(0,0,0,0.3)",
              fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
            },
            children: lt ? /* @__PURE__ */ u("div", { style: { textAlign: "center", padding: 40 }, children: [
              /* @__PURE__ */ t("div", { style: { fontSize: 48, marginBottom: 16 }, children: "✓" }),
              /* @__PURE__ */ t("h3", { style: { margin: 0, fontSize: 20 }, children: "Submitted!" }),
              /* @__PURE__ */ t("p", { style: { opacity: 0.7, marginTop: 8 }, children: "Thank you for your feedback." })
            ] }) : /* @__PURE__ */ u(Ne, { children: [
              /* @__PURE__ */ u("div", { style: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }, children: [
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
              /* @__PURE__ */ u("div", { style: { marginBottom: 14 }, children: [
                /* @__PURE__ */ t("label", { style: { display: "block", marginBottom: 4, fontSize: 13, fontWeight: 600, opacity: 0.8 }, children: "Type" }),
                /* @__PURE__ */ t("div", { style: { display: "flex", gap: 8 }, children: Wt.map((e) => /* @__PURE__ */ t(
                  "div",
                  {
                    onClick: () => Ve(e.value),
                    style: {
                      flex: 1,
                      padding: "8px 4px",
                      textAlign: "center",
                      borderRadius: 6,
                      border: `2px solid ${ge === e.value ? O[0] : _}`,
                      background: ge === e.value ? `${O[0]}22` : "transparent",
                      cursor: "pointer",
                      fontSize: 12,
                      fontWeight: ge === e.value ? 700 : 400
                    },
                    children: e.label
                  },
                  e.value
                )) })
              ] }),
              /* @__PURE__ */ u("div", { style: { marginBottom: 14 }, children: [
                /* @__PURE__ */ t("label", { style: { display: "block", marginBottom: 4, fontSize: 13, fontWeight: 600, opacity: 0.8 }, children: "Priority" }),
                /* @__PURE__ */ t(
                  "select",
                  {
                    value: Xe,
                    onChange: (e) => qe(e.target.value),
                    style: {
                      width: "100%",
                      padding: "8px 12px",
                      borderRadius: 6,
                      border: `1px solid ${_}`,
                      background: me,
                      color: N,
                      fontSize: 14,
                      outline: "none"
                    },
                    children: zt.map((e) => /* @__PURE__ */ t("option", { value: e.value, children: e.label }, e.value))
                  }
                )
              ] }),
              /* @__PURE__ */ u("div", { style: { marginBottom: 14 }, children: [
                /* @__PURE__ */ u("label", { style: { display: "block", marginBottom: 4, fontSize: 13, fontWeight: 600, opacity: 0.8 }, children: [
                  "Title ",
                  /* @__PURE__ */ t("span", { style: { color: "#e53935" }, children: "*" })
                ] }),
                /* @__PURE__ */ t(
                  "input",
                  {
                    type: "text",
                    value: be,
                    onChange: (e) => Ye(e.target.value),
                    placeholder: "Brief summary of the issue",
                    maxLength: 500,
                    style: {
                      width: "100%",
                      padding: "8px 12px",
                      borderRadius: 6,
                      border: `1px solid ${_}`,
                      background: me,
                      color: N,
                      fontSize: 14,
                      outline: "none",
                      boxSizing: "border-box"
                    }
                  }
                )
              ] }),
              /* @__PURE__ */ u("div", { style: { marginBottom: 14 }, children: [
                /* @__PURE__ */ t("label", { style: { display: "block", marginBottom: 4, fontSize: 13, fontWeight: 600, opacity: 0.8 }, children: "Description" }),
                /* @__PURE__ */ t(
                  "textarea",
                  {
                    value: Ke,
                    onChange: (e) => Ge(e.target.value),
                    onPaste: (e) => {
                      var S;
                      const l = Array.from(((S = e.clipboardData) == null ? void 0 : S.items) || []).filter((g) => g.kind === "file" && g.type.startsWith("image/")).map((g) => g.getAsFile()).filter((g) => g != null);
                      l.length > 0 && (e.preventDefault(), Pe(l));
                    },
                    placeholder: "Describe the issue in detail... (you can paste a screenshot here)",
                    rows: 3,
                    style: {
                      width: "100%",
                      padding: "8px 12px",
                      borderRadius: 6,
                      border: `1px solid ${_}`,
                      background: me,
                      color: N,
                      fontSize: 14,
                      outline: "none",
                      resize: "vertical",
                      boxSizing: "border-box",
                      fontFamily: "inherit"
                    }
                  }
                )
              ] }),
              /* @__PURE__ */ u("div", { style: { marginBottom: 14 }, children: [
                /* @__PURE__ */ t("label", { style: { display: "block", marginBottom: 4, fontSize: 13, fontWeight: 600, opacity: 0.8 }, children: "Files" }),
                /* @__PURE__ */ u(
                  "div",
                  {
                    onDragOver: (e) => {
                      e.preventDefault(), e.stopPropagation();
                    },
                    onDrop: (e) => {
                      var l;
                      e.preventDefault();
                      const a = Array.from(((l = e.dataTransfer) == null ? void 0 : l.files) || []);
                      a.length && Pe(a);
                    },
                    style: {
                      border: `1px dashed ${_}`,
                      borderRadius: 6,
                      padding: 14,
                      background: me,
                      fontSize: 12,
                      opacity: 0.95,
                      textAlign: "center",
                      minHeight: 70
                    },
                    children: [
                      /* @__PURE__ */ u("div", { style: { display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", justifyContent: "center" }, children: [
                        /* @__PURE__ */ u("label", { style: { ...P, background: "#444", color: "#fff", padding: "4px 10px", fontSize: 12, cursor: "pointer" }, children: [
                          "Choose files",
                          /* @__PURE__ */ t(
                            "input",
                            {
                              type: "file",
                              accept: "*/*",
                              multiple: !0,
                              onChange: (e) => {
                                const a = Array.from(e.target.files || []);
                                a.length && Pe(a), e.target.value = "";
                              },
                              style: { display: "none" }
                            }
                          )
                        ] }),
                        /* @__PURE__ */ t("span", { style: { opacity: 0.7 }, children: "or drag & drop / paste images here — any file type" })
                      ] }),
                      we.length > 0 && /* @__PURE__ */ t("div", { style: { display: "flex", gap: 6, marginTop: 10, flexWrap: "wrap", justifyContent: "center" }, children: we.map((e, a) => {
                        const l = ut[a];
                        return /* @__PURE__ */ u("div", { style: { position: "relative" }, children: [
                          l ? /* @__PURE__ */ t(
                            "img",
                            {
                              src: l,
                              alt: e.name || `file-${a + 1}`,
                              title: e.name,
                              style: {
                                width: 64,
                                height: 64,
                                objectFit: "cover",
                                borderRadius: 4,
                                border: `1px solid ${_}`
                              }
                            }
                          ) : /* @__PURE__ */ u(
                            "div",
                            {
                              title: e.name,
                              style: {
                                width: 90,
                                height: 64,
                                borderRadius: 4,
                                border: `1px solid ${_}`,
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
                              onClick: () => mt(a),
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
                        ] }, a);
                      }) })
                    ]
                  }
                )
              ] }),
              /* @__PURE__ */ u("div", { style: { marginBottom: 14 }, children: [
                /* @__PURE__ */ t("label", { style: { display: "block", marginBottom: 4, fontSize: 13, fontWeight: 600, opacity: 0.8 }, children: "Screen Recording" }),
                dt ? /* @__PURE__ */ u("div", { children: [
                  /* @__PURE__ */ t(
                    "input",
                    {
                      type: "file",
                      accept: "video/*",
                      onChange: (e) => {
                        var a;
                        return Qe(((a = e.target.files) == null ? void 0 : a[0]) || null);
                      },
                      style: { fontSize: 13 }
                    }
                  ),
                  ve && /* @__PURE__ */ t("span", { style: { fontSize: 12, opacity: 0.7, marginLeft: 8 }, children: ve.name })
                ] }) : /* @__PURE__ */ u("div", { style: { display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }, children: [
                  D.capturing && /* @__PURE__ */ u(Ne, { children: [
                    /* @__PURE__ */ t("span", { style: { display: "inline-block", width: 8, height: 8, borderRadius: "50%", background: "#e53935", animation: "bom-pulse 1.4s ease-out infinite" } }),
                    /* @__PURE__ */ t("span", { style: { fontSize: 12, color: "#e53935", fontWeight: 600 }, children: "Recording in the recorder window…" }),
                    /* @__PURE__ */ t("div", { onClick: D.focus, style: { ...P, background: "#666", color: "#fff", padding: "4px 10px", fontSize: 12 }, children: "Show window" }),
                    /* @__PURE__ */ t("div", { onClick: D.cancel, style: { ...P, background: "#444", color: "#fff", padding: "4px 10px", fontSize: 12 }, children: "Cancel" })
                  ] }),
                  D.attached && !D.capturing && /* @__PURE__ */ u("div", { style: { display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }, children: [
                    /* @__PURE__ */ t("span", { style: { fontSize: 12, color: "#22c55e", fontWeight: 600 }, children: "✓ Recording attached" }),
                    /* @__PURE__ */ t("a", { href: D.attached.shareUrl, target: "_blank", rel: "noopener noreferrer", style: { fontSize: 12, opacity: 0.8 }, children: "view" }),
                    /* @__PURE__ */ t(
                      "div",
                      {
                        onClick: D.clear,
                        style: { ...P, background: "#666", color: "#fff", padding: "4px 10px", fontSize: 12 },
                        children: "Remove"
                      }
                    )
                  ] }),
                  !j && !z && !D.capturing && !D.attached && /* @__PURE__ */ t(
                    "div",
                    {
                      onClick: ft,
                      style: {
                        ...P,
                        background: `linear-gradient(135deg, ${O[0]}, ${O[1]})`,
                        color: "#fff"
                      },
                      children: "Start Recording"
                    }
                  ),
                  j && /* @__PURE__ */ t(
                    "div",
                    {
                      onClick: rt,
                      style: { ...P, background: "#e53935", color: "#fff" },
                      children: "Stop Recording"
                    }
                  ),
                  Ae && /* @__PURE__ */ t("div", { style: {
                    fontSize: 12,
                    color: "#fb923c",
                    background: "rgba(251,146,60,0.12)",
                    border: "1px solid rgba(251,146,60,0.35)",
                    borderRadius: 6,
                    padding: "5px 10px",
                    marginBottom: 4
                  }, children: "Recording recovered after page reload — your video is intact." }),
                  z && /* @__PURE__ */ u("div", { style: { display: "flex", alignItems: "center", gap: 8 }, children: [
                    /* @__PURE__ */ u("span", { style: { fontSize: 12, opacity: 0.7 }, children: [
                      (z.size / 1024 / 1024).toFixed(1),
                      " MB"
                    ] }),
                    /* @__PURE__ */ t(
                      "div",
                      {
                        onClick: () => {
                          Y(null), pe((e) => (e && URL.revokeObjectURL(e), null));
                        },
                        style: { ...P, background: "#666", color: "#fff", padding: "4px 10px", fontSize: 12 },
                        children: "Remove"
                      }
                    )
                  ] }),
                  j && /* @__PURE__ */ t("span", { style: { fontSize: 12, color: "#e53935", fontWeight: 600 }, children: "Recording..." })
                ] })
              ] }),
              tt && /* @__PURE__ */ u("div", { style: { marginBottom: 14 }, children: [
                /* @__PURE__ */ t("label", { style: { display: "block", marginBottom: 6, fontSize: 13, fontWeight: 600, opacity: 0.8 }, children: "Preview" }),
                /* @__PURE__ */ t(
                  "video",
                  {
                    src: tt,
                    controls: !0,
                    style: {
                      width: "100%",
                      borderRadius: 8,
                      border: `1px solid ${_}`,
                      background: "#000",
                      maxHeight: 220,
                      display: "block"
                    }
                  }
                ),
                /* @__PURE__ */ t("div", { style: { fontSize: 11, opacity: 0.5, marginTop: 4 }, children: "Make sure your audio is audible before submitting." })
              ] }),
              Z && /* @__PURE__ */ u("div", { style: { marginBottom: 14 }, children: [
                /* @__PURE__ */ t("label", { style: { display: "block", marginBottom: 4, fontSize: 13, fontWeight: 600, opacity: 0.8 }, children: "Voice Transcript" }),
                /* @__PURE__ */ t(
                  "div",
                  {
                    style: {
                      padding: "8px 12px",
                      borderRadius: 6,
                      background: me,
                      border: `1px solid ${_}`,
                      fontSize: 13,
                      maxHeight: 80,
                      overflowY: "auto",
                      opacity: 0.8
                    },
                    children: Z
                  }
                )
              ] }),
              (M.current.length > 0 || A.current.length > 0) && /* @__PURE__ */ u("div", { style: {
                marginBottom: 14,
                padding: "6px 12px",
                borderRadius: 6,
                background: re ? "#2a1a1a" : "#fff3f0",
                border: `1px solid ${re ? "#4a2020" : "#ffccc7"}`,
                fontSize: 12,
                opacity: 0.8
              }, children: [
                M.current.length > 0 && /* @__PURE__ */ u("span", { children: [
                  M.current.length,
                  " console error(s) captured"
                ] }),
                M.current.length > 0 && A.current.length > 0 && " | ",
                A.current.length > 0 && /* @__PURE__ */ u("span", { children: [
                  A.current.length,
                  " network error(s) captured"
                ] }),
                /* @__PURE__ */ t("span", { style: { display: "block", marginTop: 2, opacity: 0.7 }, children: "These will be included in your report automatically." })
              ] }),
              Je && /* @__PURE__ */ t("div", { style: { color: "#e53935", fontSize: 13, marginBottom: 10 }, children: Je }),
              Ze && Se && /* @__PURE__ */ u("div", { style: {
                background: "rgba(229, 57, 53, 0.12)",
                border: "1px solid rgba(229, 57, 53, 0.45)",
                color: "#ffb4ad",
                padding: "10px 12px",
                borderRadius: 6,
                fontSize: 13,
                marginBottom: 10
              }, children: [
                /* @__PURE__ */ u("div", { style: { fontWeight: 600, marginBottom: 4, color: "#ff6b66" }, children: [
                  "Ticket #",
                  Se,
                  " was saved — but the video upload failed."
                ] }),
                /* @__PURE__ */ t("div", { style: { marginBottom: 8 }, children: Ze }),
                /* @__PURE__ */ u("div", { style: { display: "flex", gap: 8 }, children: [
                  /* @__PURE__ */ t(
                    "div",
                    {
                      onClick: de ? void 0 : gt,
                      style: {
                        ...P,
                        background: de ? "#666" : `linear-gradient(135deg, ${O[0]}, ${O[1]})`,
                        color: "#fff",
                        padding: "5px 12px",
                        fontSize: 12,
                        opacity: de ? 0.6 : 1,
                        cursor: de ? "not-allowed" : "pointer"
                      },
                      children: de ? "Retrying…" : "Retry video upload"
                    }
                  ),
                  /* @__PURE__ */ t(
                    "div",
                    {
                      onClick: () => {
                        le(null), b(!1), Re();
                      },
                      style: {
                        ...P,
                        background: "transparent",
                        color: N,
                        border: `1px solid ${_}`,
                        padding: "5px 12px",
                        fontSize: 12
                      },
                      children: "Skip & close"
                    }
                  )
                ] })
              ] }),
              /* @__PURE__ */ u("div", { style: { display: "flex", gap: 8, justifyContent: "flex-end" }, children: [
                /* @__PURE__ */ t(
                  "div",
                  {
                    onClick: () => b(!1),
                    style: {
                      ...P,
                      background: "transparent",
                      color: N,
                      border: `1px solid ${_}`
                    },
                    children: "Cancel"
                  }
                ),
                /* @__PURE__ */ t(
                  "div",
                  {
                    onClick: ce ? void 0 : ht,
                    style: {
                      ...P,
                      background: ce ? "#666" : `linear-gradient(135deg, ${O[0]}, ${O[1]})`,
                      color: "#fff",
                      opacity: ce ? 0.6 : 1,
                      cursor: ce ? "not-allowed" : "pointer"
                    },
                    children: ce ? "Submitting..." : "Submit"
                  }
                )
              ] }),
              /* @__PURE__ */ t("div", { style: { marginTop: 14, fontSize: 11, opacity: 0.4, textAlign: "center" }, children: "Page URL, browser info, screen size, and console errors will be captured automatically." })
            ] })
          }
        )
      }
    ),
    j && /* @__PURE__ */ u(
      "div",
      {
        onMouseDown: (e) => {
          if (e.target.closest("[data-bom-stop]")) return;
          e.preventDefault(), $.current = {
            x: e.clientX - ee.left,
            y: e.clientY - ee.top
          };
          const a = (S) => {
            $.current && nt({
              left: Math.max(0, Math.min(window.innerWidth - 240, S.clientX - $.current.x)),
              top: Math.max(0, Math.min(window.innerHeight - 50, S.clientY - $.current.y))
            });
          }, l = () => {
            $.current = null, document.removeEventListener("mousemove", a), document.removeEventListener("mouseup", l);
          };
          document.addEventListener("mousemove", a), document.addEventListener("mouseup", l);
        },
        onTouchStart: (e) => {
          if (e.target.closest("[data-bom-stop]")) return;
          const a = e.touches[0];
          $.current = {
            x: a.clientX - ee.left,
            y: a.clientY - ee.top
          };
          const l = (g) => {
            if (!$.current) return;
            g.preventDefault();
            const B = g.touches[0];
            nt({
              left: Math.max(0, Math.min(window.innerWidth - 240, B.clientX - $.current.x)),
              top: Math.max(0, Math.min(window.innerHeight - 50, B.clientY - $.current.y))
            });
          }, S = () => {
            $.current = null, document.removeEventListener("touchmove", l), document.removeEventListener("touchend", S);
          };
          document.addEventListener("touchmove", l, { passive: !1 }), document.addEventListener("touchend", S);
        },
        style: {
          position: "fixed",
          top: ee.top,
          left: ee.left,
          zIndex: 1000001,
          display: "flex",
          alignItems: "center",
          gap: 10,
          padding: "8px 12px",
          background: Te,
          color: N,
          borderRadius: 999,
          border: `1px solid ${_}`,
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
              onClick: rt,
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
    L && !j && !v && z && /* @__PURE__ */ u("div", { style: {
      position: "fixed",
      bottom: 80,
      right: 24,
      zIndex: 1000001,
      display: "flex",
      alignItems: "center",
      gap: 8,
      padding: "10px 14px",
      background: Te,
      color: N,
      borderRadius: 999,
      border: "1px solid rgba(251,146,60,0.5)",
      boxShadow: "0 8px 24px rgba(0,0,0,0.35)",
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
      fontSize: 13,
      userSelect: "none"
    }, children: [
      /* @__PURE__ */ t("span", { style: { fontSize: 16 }, children: "🎥" }),
      /* @__PURE__ */ u("span", { style: { fontWeight: 600, color: "#fb923c" }, children: [
        "Recovered (",
        (z.size / 1024 / 1024).toFixed(1),
        " MB)"
      ] }),
      /* @__PURE__ */ t(
        "div",
        {
          onClick: () => {
            H(!1), Be();
          },
          style: { cursor: "pointer", background: `linear-gradient(135deg, ${O[0]}, ${O[1]})`, color: "#fff", borderRadius: 999, padding: "5px 12px", fontSize: 12, fontWeight: 700 },
          children: "Continue"
        }
      ),
      /* @__PURE__ */ t(
        "div",
        {
          onClick: () => {
            H(!1), b(!0);
          },
          style: { cursor: "pointer", background: "#22c55e", color: "#fff", borderRadius: 999, padding: "5px 12px", fontSize: 12, fontWeight: 700 },
          children: "Submit"
        }
      ),
      /* @__PURE__ */ t(
        "div",
        {
          onClick: () => {
            H(!1), R(!1), Y(null), pe((e) => (e && URL.revokeObjectURL(e), null)), te.current = [], Ie();
          },
          style: { cursor: "pointer", opacity: 0.5, fontSize: 12, padding: "5px 8px" },
          children: "✕"
        }
      )
    ] })
  ] });
};
export {
  Ht as BugOutManagedWidget,
  Ht as BugsManagedWidget
};
