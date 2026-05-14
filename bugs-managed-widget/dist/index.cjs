"use strict";Object.defineProperty(exports,Symbol.toStringTag,{value:"Module"});const e=require("react/jsx-runtime"),i=require("react"),Se=[{value:"BUG",label:"Bug Report"},{value:"FEATURE_REQUEST",label:"Feature Request"},{value:"QUESTION",label:"Question"}],je=[{value:"LOW",label:"Low"},{value:"MEDIUM",label:"Medium"},{value:"HIGH",label:"High"},{value:"CRITICAL",label:"Critical"}],ae=le=>{const{apiKey:N,apiUrl:y,userEmail:ce,userName:de,theme:pe="dark",position:ue="bottom-right",orbSize:me=24,orbColors:b=["#fbbf24","#fb923c"],tenantId:F,tenantName:P,databaseName:H,appVersion:A,environment:X}=le,be=i.useRef(`bom-orb-${Math.random().toString(36).slice(2,9)}`),[E,f]=i.useState(!1),[R,q]=i.useState(!1),[_,I]=i.useState(null),[W,Y]=i.useState(""),[T,G]=i.useState("BUG"),[V,J]=i.useState("MEDIUM"),[U,K]=i.useState(""),[Q,Z]=i.useState(""),[v,ee]=i.useState(!1),[fe,te]=i.useState(!1),[oe,M]=i.useState(""),[he,ge]=i.useState(!1),[$,re]=i.useState(null),[O,ye]=i.useState(()=>({top:24,left:typeof window<"u"?Math.max(24,window.innerWidth-280):24})),k=i.useRef(null),C=i.useRef(null),D=i.useRef([]),L=i.useRef(null),z=i.useRef(null),S=i.useRef(null),c=i.useRef([]),d=i.useRef([]);i.useEffect(()=>{if(ge(/Android|iPhone|iPad|iPod/i.test(navigator.userAgent)),!S.current){const o=document.createElement("style");o.textContent=`
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
      `,document.head.appendChild(o),S.current=o}const t=console.error;console.error=(...o)=>{c.current.push({type:"console.error",message:o.map(r=>typeof r=="object"?JSON.stringify(r):String(r)).join(" "),timestamp:new Date().toISOString()}),c.current.length>50&&c.current.shift(),t.apply(console,o)};const n=o=>{c.current.push({type:"window.onerror",message:o.message,source:o.filename,line:o.lineno,col:o.colno,timestamp:new Date().toISOString()}),c.current.length>50&&c.current.shift()};window.addEventListener("error",n);const s=o=>{var r;c.current.push({type:"unhandledrejection",message:((r=o.reason)==null?void 0:r.message)||String(o.reason),timestamp:new Date().toISOString()}),c.current.length>50&&c.current.shift()};window.addEventListener("unhandledrejection",s);const u=window.fetch;window.fetch=async(...o)=>{var g;const r=typeof o[0]=="string"?o[0]:o[0].url,l=(((g=o[1])==null?void 0:g.method)||"GET").toUpperCase();try{const p=await u.apply(window,o);return!p.ok&&!r.includes(y)&&(d.current.push({method:l,url:r,status:p.status,statusText:p.statusText,timestamp:new Date().toISOString()}),d.current.length>30&&d.current.shift()),p}catch(p){throw r.includes(y)||(d.current.push({method:l,url:r,status:0,statusText:p.message||"Network Error",timestamp:new Date().toISOString()}),d.current.length>30&&d.current.shift()),p}};const a=XMLHttpRequest.prototype.open,m=XMLHttpRequest.prototype.send;return XMLHttpRequest.prototype.open=function(o,r,...l){return this._bomMethod=o,this._bomUrl=String(r),a.apply(this,[o,r,...l])},XMLHttpRequest.prototype.send=function(...o){return this.addEventListener("loadend",()=>{var r;this.status>=400&&!((r=this._bomUrl)!=null&&r.includes(y))&&(d.current.push({method:this._bomMethod||"GET",url:this._bomUrl||"",status:this.status,statusText:this.statusText,timestamp:new Date().toISOString()}),d.current.length>30&&d.current.shift())}),m.apply(this,o)},()=>{S.current&&(document.head.removeChild(S.current),S.current=null),console.error=t,window.removeEventListener("error",n),window.removeEventListener("unhandledrejection",s),window.fetch=u,XMLHttpRequest.prototype.open=a,XMLHttpRequest.prototype.send=m}},[y]);const x=pe==="dark",ne=x?"#1a1a2e":"#ffffff",w=x?"#e0e0e0":"#333333",h=x?"#333":"#ddd",B=x?"#16213e":"#f5f5f5",xe=ue==="bottom-left"?{bottom:24,left:24}:{bottom:24,right:24},we=i.useCallback(async()=>{try{const t=await navigator.mediaDevices.getDisplayMedia({video:!0,audio:!0});let n=null;try{n=await navigator.mediaDevices.getUserMedia({audio:!0,video:!1})}catch{}L.current=n;const s=n!=null&&n.getAudioTracks().length?n.getAudioTracks():t.getAudioTracks(),u=new MediaStream([...t.getVideoTracks(),...s]),a=new MediaRecorder(u,{mimeType:MediaRecorder.isTypeSupported("video/webm;codecs=vp9")?"video/webm;codecs=vp9":"video/webm"});D.current=[],a.ondataavailable=o=>{o.data.size>0&&D.current.push(o.data)},a.onstop=()=>{var r;const o=new Blob(D.current,{type:"video/webm"});I(o),t.getTracks().forEach(l=>l.stop()),(r=L.current)==null||r.getTracks().forEach(l=>l.stop()),L.current=null},a.start(1e3),C.current=a,q(!0),f(!1);const m=window.SpeechRecognition||window.webkitSpeechRecognition;if(m){const o=new m;o.continuous=!0,o.interimResults=!0,o.lang="en-US";let r="";o.onresult=l=>{let g="";for(let p=l.resultIndex;p<l.results.length;p++)l.results[p].isFinal?r+=l.results[p][0].transcript+" ":g+=l.results[p][0].transcript;Y(r+g)},o.onerror=()=>{},o.start(),z.current=o}}catch(t){console.error("Failed to start recording:",t)}},[]),ie=i.useCallback(()=>{C.current&&C.current.state!=="inactive"&&C.current.stop(),z.current&&(z.current.stop(),z.current=null),q(!1),f(!0)},[]),se=()=>{K(""),Z(""),G("BUG"),J("MEDIUM"),Y(""),I(null),re(null),M(""),te(!1)},ve=async()=>{if(!U.trim()){M("Title is required");return}ee(!0),M("");try{const t={title:U.trim(),description:Q.trim(),ticketType:T,priority:V,submittedBy:ce||de||"Anonymous",currentPageUrl:window.location.href,currentPageName:document.title,browserInfo:navigator.userAgent,screenWidth:window.innerWidth,screenHeight:window.innerHeight,transcript:W||null,consoleErrors:c.current.length>0?JSON.stringify(c.current):null,networkErrors:d.current.length>0?JSON.stringify(d.current):null};F&&(t.tenantId=F),P&&(t.tenantName=P),H&&(t.databaseName=H),A&&(t.applicationVersion=A),X&&(t.environment=X);const n=await fetch(`${y}/tickets`,{method:"POST",headers:{"Content-Type":"application/json","X-BOM-API-Key":N},body:JSON.stringify(t)});if(!n.ok)throw new Error("Failed to submit ticket");const s=await n.json(),u=_||$;if(u&&s.id)try{const a=new FormData;a.append("file",u,"recording.webm");const m=await fetch(`${y}/tickets/${s.id}/video`,{method:"POST",headers:{"X-BOM-API-Key":N},body:a});m.ok||console.warn(`[Bug Out] Video upload failed (${m.status}) for ticket ${s.id}`)}catch(a){console.warn("[Bug Out] Video upload network error:",a)}te(!0),setTimeout(()=>{f(!1),se()},2e3)}catch(t){M(t.message||"Failed to submit")}finally{ee(!1)}},j={padding:"8px 16px",border:"none",borderRadius:6,cursor:"pointer",fontSize:14,fontWeight:600,transition:"opacity 0.2s"};return e.jsxs(e.Fragment,{children:[(()=>{const t=me*2,n=b[0],s=b[1],u=`${n}8c`,a=be.current;return e.jsx("button",{type:"button",role:"button","aria-label":"Report a bug",title:"Report a bug or request a feature",onClick:()=>{E||se(),f(!E)},className:"bom-orb-wrap",style:{...xe,width:t,height:t,"--bom-core":n,"--bom-ring":s,"--bom-halo":u,"--bom-spin":"18s","--bom-pulse":"4s"},children:e.jsxs("span",{className:"bom-orb",children:[e.jsxs("svg",{viewBox:"0 0 100 100",width:t,height:t,"aria-hidden":"true",className:"bom-orb__svg",children:[e.jsxs("defs",{children:[e.jsxs("radialGradient",{id:`${a}-core`,cx:"50%",cy:"50%",r:"50%",children:[e.jsx("stop",{offset:"0%",stopColor:n,stopOpacity:"1"}),e.jsx("stop",{offset:"55%",stopColor:n,stopOpacity:"0.55"}),e.jsx("stop",{offset:"100%",stopColor:"#1a0f00",stopOpacity:"0"})]}),e.jsxs("radialGradient",{id:`${a}-iris`,cx:"50%",cy:"50%",r:"50%",children:[e.jsx("stop",{offset:"0%",stopColor:"#fff7dc",stopOpacity:"0.95"}),e.jsx("stop",{offset:"40%",stopColor:n,stopOpacity:"0.7"}),e.jsx("stop",{offset:"100%",stopColor:n,stopOpacity:"0"})]})]}),e.jsx("circle",{cx:"50",cy:"50",r:"48",fill:`url(#${a}-core)`,className:"bom-orb__halo"}),e.jsxs("g",{className:"bom-orb__spin-cw",children:[e.jsx("circle",{cx:"50",cy:"50",r:"44",fill:"none",stroke:s,strokeOpacity:"0.55",strokeWidth:"0.5"}),Array.from({length:36}).map((m,o)=>{const r=o*10*Math.PI/180,l=50+Math.cos(r)*41,g=50+Math.sin(r)*41,p=50+Math.cos(r)*(o%3===0?44:43),ke=50+Math.sin(r)*(o%3===0?44:43);return e.jsx("line",{x1:l,y1:g,x2:p,y2:ke,stroke:s,strokeOpacity:o%3===0?.8:.35,strokeWidth:"0.8"},o)})]}),e.jsxs("g",{className:"bom-orb__spin-ccw",children:[e.jsx("circle",{cx:"50",cy:"50",r:"36",fill:"none",stroke:s,strokeOpacity:"0.18",strokeWidth:"0.5"}),e.jsx("circle",{cx:"50",cy:"50",r:"36",fill:"none",stroke:s,strokeOpacity:"0.85",strokeWidth:"1.4",strokeDasharray:"42 30 18 36 24 32",strokeLinecap:"round"})]}),e.jsx("g",{className:"bom-orb__spin-cw-fast",children:e.jsx("circle",{cx:"50",cy:"50",r:"28",fill:"none",stroke:n,strokeOpacity:"0.7",strokeWidth:"0.9",strokeDasharray:"2 4"})}),e.jsx("circle",{cx:"50",cy:"50",r:"20",fill:`url(#${a}-iris)`,className:"bom-orb__core"}),e.jsxs("g",{stroke:"#1a0f00",strokeOpacity:"0.55",strokeLinecap:"round",children:[e.jsx("line",{x1:"50",y1:"42",x2:"50",y2:"42",strokeWidth:"3.4"}),e.jsx("line",{x1:"50",y1:"48",x2:"50",y2:"58",strokeWidth:"2.4"})]}),e.jsx("line",{x1:"50",y1:"6",x2:"50",y2:"14",stroke:s,strokeOpacity:"0.7",strokeWidth:"0.6"}),e.jsx("line",{x1:"50",y1:"86",x2:"50",y2:"94",stroke:s,strokeOpacity:"0.7",strokeWidth:"0.6"}),e.jsx("line",{x1:"6",y1:"50",x2:"14",y2:"50",stroke:s,strokeOpacity:"0.7",strokeWidth:"0.6"}),e.jsx("line",{x1:"86",y1:"50",x2:"94",y2:"50",stroke:s,strokeOpacity:"0.7",strokeWidth:"0.6"})]}),e.jsx("span",{className:"bom-orb__scan"})]})})})(),E&&e.jsx("div",{style:{position:"fixed",inset:0,background:"rgba(0,0,0,0.5)",zIndex:1e6,display:"flex",alignItems:"center",justifyContent:"center",animation:"bom-fade-in 0.2s ease-out"},onClick:t=>{t.target===t.currentTarget&&f(!1)},children:e.jsx("div",{style:{background:ne,color:w,borderRadius:12,padding:24,width:"90%",maxWidth:520,maxHeight:"85vh",overflowY:"auto",boxShadow:"0 20px 60px rgba(0,0,0,0.3)",fontFamily:'-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'},children:fe?e.jsxs("div",{style:{textAlign:"center",padding:40},children:[e.jsx("div",{style:{fontSize:48,marginBottom:16},children:"✓"}),e.jsx("h3",{style:{margin:0,fontSize:20},children:"Submitted!"}),e.jsx("p",{style:{opacity:.7,marginTop:8},children:"Thank you for your feedback."})]}):e.jsxs(e.Fragment,{children:[e.jsxs("div",{style:{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:20},children:[e.jsx("h3",{style:{margin:0,fontSize:18,fontWeight:700},children:"Report an Issue"}),e.jsx("div",{onClick:()=>f(!1),style:{cursor:"pointer",fontSize:20,opacity:.6,padding:"0 4px"},children:"✕"})]}),e.jsxs("div",{style:{marginBottom:14},children:[e.jsx("label",{style:{display:"block",marginBottom:4,fontSize:13,fontWeight:600,opacity:.8},children:"Type"}),e.jsx("div",{style:{display:"flex",gap:8},children:Se.map(t=>e.jsx("div",{onClick:()=>G(t.value),style:{flex:1,padding:"8px 4px",textAlign:"center",borderRadius:6,border:`2px solid ${T===t.value?b[0]:h}`,background:T===t.value?`${b[0]}22`:"transparent",cursor:"pointer",fontSize:12,fontWeight:T===t.value?700:400},children:t.label},t.value))})]}),e.jsxs("div",{style:{marginBottom:14},children:[e.jsx("label",{style:{display:"block",marginBottom:4,fontSize:13,fontWeight:600,opacity:.8},children:"Priority"}),e.jsx("select",{value:V,onChange:t=>J(t.target.value),style:{width:"100%",padding:"8px 12px",borderRadius:6,border:`1px solid ${h}`,background:B,color:w,fontSize:14,outline:"none"},children:je.map(t=>e.jsx("option",{value:t.value,children:t.label},t.value))})]}),e.jsxs("div",{style:{marginBottom:14},children:[e.jsxs("label",{style:{display:"block",marginBottom:4,fontSize:13,fontWeight:600,opacity:.8},children:["Title ",e.jsx("span",{style:{color:"#e53935"},children:"*"})]}),e.jsx("input",{type:"text",value:U,onChange:t=>K(t.target.value),placeholder:"Brief summary of the issue",maxLength:500,style:{width:"100%",padding:"8px 12px",borderRadius:6,border:`1px solid ${h}`,background:B,color:w,fontSize:14,outline:"none",boxSizing:"border-box"}})]}),e.jsxs("div",{style:{marginBottom:14},children:[e.jsx("label",{style:{display:"block",marginBottom:4,fontSize:13,fontWeight:600,opacity:.8},children:"Description"}),e.jsx("textarea",{value:Q,onChange:t=>Z(t.target.value),placeholder:"Describe the issue in detail...",rows:3,style:{width:"100%",padding:"8px 12px",borderRadius:6,border:`1px solid ${h}`,background:B,color:w,fontSize:14,outline:"none",resize:"vertical",boxSizing:"border-box",fontFamily:"inherit"}})]}),e.jsxs("div",{style:{marginBottom:14},children:[e.jsx("label",{style:{display:"block",marginBottom:4,fontSize:13,fontWeight:600,opacity:.8},children:"Screen Recording"}),he?e.jsxs("div",{children:[e.jsx("input",{type:"file",accept:"video/*",onChange:t=>{var n;return re(((n=t.target.files)==null?void 0:n[0])||null)},style:{fontSize:13}}),$&&e.jsx("span",{style:{fontSize:12,opacity:.7,marginLeft:8},children:$.name})]}):e.jsxs("div",{style:{display:"flex",gap:8,alignItems:"center"},children:[!R&&!_&&e.jsx("div",{onClick:we,style:{...j,background:`linear-gradient(135deg, ${b[0]}, ${b[1]})`,color:"#fff"},children:"Start Recording"}),R&&e.jsx("div",{onClick:ie,style:{...j,background:"#e53935",color:"#fff"},children:"Stop Recording"}),_&&e.jsxs(e.Fragment,{children:[e.jsxs("span",{style:{fontSize:12,opacity:.7},children:["Recording captured (",(_.size/1024/1024).toFixed(1)," MB)"]}),e.jsx("div",{onClick:()=>I(null),style:{...j,background:"#666",color:"#fff",padding:"4px 10px",fontSize:12},children:"Remove"})]}),R&&e.jsx("span",{style:{fontSize:12,color:"#e53935",fontWeight:600},children:"Recording..."})]})]}),W&&e.jsxs("div",{style:{marginBottom:14},children:[e.jsx("label",{style:{display:"block",marginBottom:4,fontSize:13,fontWeight:600,opacity:.8},children:"Voice Transcript"}),e.jsx("div",{style:{padding:"8px 12px",borderRadius:6,background:B,border:`1px solid ${h}`,fontSize:13,maxHeight:80,overflowY:"auto",opacity:.8},children:W})]}),(c.current.length>0||d.current.length>0)&&e.jsxs("div",{style:{marginBottom:14,padding:"6px 12px",borderRadius:6,background:x?"#2a1a1a":"#fff3f0",border:`1px solid ${x?"#4a2020":"#ffccc7"}`,fontSize:12,opacity:.8},children:[c.current.length>0&&e.jsxs("span",{children:[c.current.length," console error(s) captured"]}),c.current.length>0&&d.current.length>0&&" | ",d.current.length>0&&e.jsxs("span",{children:[d.current.length," network error(s) captured"]}),e.jsx("span",{style:{display:"block",marginTop:2,opacity:.7},children:"These will be included in your report automatically."})]}),oe&&e.jsx("div",{style:{color:"#e53935",fontSize:13,marginBottom:10},children:oe}),e.jsxs("div",{style:{display:"flex",gap:8,justifyContent:"flex-end"},children:[e.jsx("div",{onClick:()=>f(!1),style:{...j,background:"transparent",color:w,border:`1px solid ${h}`},children:"Cancel"}),e.jsx("div",{onClick:v?void 0:ve,style:{...j,background:v?"#666":`linear-gradient(135deg, ${b[0]}, ${b[1]})`,color:"#fff",opacity:v?.6:1,cursor:v?"not-allowed":"pointer"},children:v?"Submitting...":"Submit"})]}),e.jsx("div",{style:{marginTop:14,fontSize:11,opacity:.4,textAlign:"center"},children:"Page URL, browser info, screen size, and console errors will be captured automatically."})]})})}),R&&e.jsxs("div",{style:{position:"fixed",top:O.top,left:O.left,zIndex:1000001,display:"flex",alignItems:"center",gap:10,padding:"8px 12px",background:ne,color:w,borderRadius:999,border:`1px solid ${h}`,boxShadow:"0 8px 24px rgba(0,0,0,0.35)",fontFamily:'-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',fontSize:13,userSelect:"none"},children:[e.jsx("div",{onMouseDown:t=>{k.current={x:t.clientX-O.left,y:t.clientY-O.top};const n=u=>{k.current&&ye({left:Math.max(0,Math.min(window.innerWidth-240,u.clientX-k.current.x)),top:Math.max(0,Math.min(window.innerHeight-50,u.clientY-k.current.y))})},s=()=>{k.current=null,document.removeEventListener("mousemove",n),document.removeEventListener("mouseup",s)};document.addEventListener("mousemove",n),document.addEventListener("mouseup",s)},style:{cursor:"grab",padding:"2px 4px",opacity:.6,fontSize:16,lineHeight:1},title:"Drag to move",children:"☰"}),e.jsx("span",{style:{display:"inline-block",width:10,height:10,borderRadius:"50%",background:"#e53935",boxShadow:"0 0 0 0 rgba(229,57,53,0.6)",animation:"bom-pulse 1.4s ease-out infinite"}}),e.jsx("span",{style:{fontWeight:600},children:"Recording"}),e.jsx("div",{onClick:ie,style:{cursor:"pointer",background:"#e53935",color:"#fff",borderRadius:999,padding:"6px 14px",fontSize:12,fontWeight:700,letterSpacing:.3},children:"STOP"})]})]})};exports.BugOutManagedWidget=ae;exports.BugsManagedWidget=ae;
