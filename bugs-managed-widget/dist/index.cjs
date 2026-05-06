"use strict";Object.defineProperty(exports,Symbol.toStringTag,{value:"Module"});const e=require("react/jsx-runtime"),n=require("react"),Be="bom-draft",k="chunks";function G(){return new Promise((f,u)=>{const l=indexedDB.open(Be,1);l.onupgradeneeded=()=>l.result.createObjectStore(k,{autoIncrement:!0}),l.onsuccess=()=>f(l.result),l.onerror=()=>u(l.error)})}function Ce(f){G().then(u=>{const l=u.transaction(k,"readwrite");l.objectStore(k).add(f),l.oncomplete=()=>u.close(),l.onerror=()=>u.close()}).catch(()=>{})}function Ie(){return G().then(f=>new Promise(u=>{const _=f.transaction(k,"readonly").objectStore(k).getAll();_.onsuccess=()=>{f.close(),u(_.result)},_.onerror=()=>{f.close(),u([])}})).catch(()=>[])}function N(){G().then(f=>{const u=f.transaction(k,"readwrite");u.objectStore(k).clear(),u.oncomplete=()=>f.close(),u.onerror=()=>f.close()}).catch(()=>{})}const ze=[{value:"BUG",label:"Bug Report"},{value:"FEATURE_REQUEST",label:"Feature Request"},{value:"QUESTION",label:"Question"}],We=[{value:"LOW",label:"Low"},{value:"MEDIUM",label:"Medium"},{value:"HIGH",label:"High"},{value:"CRITICAL",label:"Critical"}],ge=f=>{const{apiKey:u,apiUrl:l,userEmail:_,userName:ye,theme:xe="dark",position:we="bottom-right",orbSize:ve=24,orbColors:w=["#fbbf24","#fb923c"],tenantId:V,tenantName:J,databaseName:K,appVersion:Q,environment:Z,onApiReady:B,hideOrb:ke=!1}=f,Se=n.useRef(`bom-orb-${Math.random().toString(36).slice(2,9)}`),[P,g]=n.useState(!1),[C,ee]=n.useState(!1),[I,z]=n.useState(null),[je,te]=n.useState(!1),[F,oe]=n.useState(""),[W,re]=n.useState("BUG"),[ne,ie]=n.useState("MEDIUM"),[H,se]=n.useState(""),[ae,ce]=n.useState(""),[M,le]=n.useState(!1),[Re,de]=n.useState(!1),[ue,L]=n.useState(""),[_e,Me]=n.useState(!1),[X,pe]=n.useState(null),[S,me]=n.useState(()=>({top:24,left:typeof window<"u"?Math.max(24,window.innerWidth-280):24})),y=n.useRef(null),D=n.useRef(null),q=n.useRef([]),Y=n.useRef(null),U=n.useRef(null),T=n.useRef(null),p=n.useRef([]),m=n.useRef([]);n.useEffect(()=>{B==null||B({open:()=>g(!0),close:()=>g(!1)})},[B]),n.useEffect(()=>{Ie().then(t=>{if(t.length===0)return;const r=new Blob(t,{type:"video/webm"});N(),z(r),te(!0),g(!0)})},[]),n.useEffect(()=>{if(Me(/Android|iPhone|iPad|iPod/i.test(navigator.userAgent)),!T.current){const o=document.createElement("style");o.textContent=`
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
      `,document.head.appendChild(o),T.current=o}const t=console.error;console.error=(...o)=>{p.current.push({type:"console.error",message:o.map(s=>typeof s=="object"?JSON.stringify(s):String(s)).join(" "),timestamp:new Date().toISOString()}),p.current.length>50&&p.current.shift(),t.apply(console,o)};const r=o=>{p.current.push({type:"window.onerror",message:o.message,source:o.filename,line:o.lineno,col:o.colno,timestamp:new Date().toISOString()}),p.current.length>50&&p.current.shift()};window.addEventListener("error",r);const i=o=>{var s;p.current.push({type:"unhandledrejection",message:((s=o.reason)==null?void 0:s.message)||String(o.reason),timestamp:new Date().toISOString()}),p.current.length>50&&p.current.shift()};window.addEventListener("unhandledrejection",i);const h=window.fetch;window.fetch=async(...o)=>{var x;const s=typeof o[0]=="string"?o[0]:o[0].url,a=(((x=o[1])==null?void 0:x.method)||"GET").toUpperCase();try{const c=await h.apply(window,o);return!c.ok&&!s.includes(l)&&(m.current.push({method:a,url:s,status:c.status,statusText:c.statusText,timestamp:new Date().toISOString()}),m.current.length>30&&m.current.shift()),c}catch(c){throw s.includes(l)||(m.current.push({method:a,url:s,status:0,statusText:c.message||"Network Error",timestamp:new Date().toISOString()}),m.current.length>30&&m.current.shift()),c}};const d=XMLHttpRequest.prototype.open,b=XMLHttpRequest.prototype.send;return XMLHttpRequest.prototype.open=function(o,s,...a){return this._bomMethod=o,this._bomUrl=String(s),d.apply(this,[o,s,...a])},XMLHttpRequest.prototype.send=function(...o){return this.addEventListener("loadend",()=>{var s;this.status>=400&&!((s=this._bomUrl)!=null&&s.includes(l))&&(m.current.push({method:this._bomMethod||"GET",url:this._bomUrl||"",status:this.status,statusText:this.statusText,timestamp:new Date().toISOString()}),m.current.length>30&&m.current.shift())}),b.apply(this,o)},()=>{T.current&&(document.head.removeChild(T.current),T.current=null),console.error=t,window.removeEventListener("error",r),window.removeEventListener("unhandledrejection",i),window.fetch=h,XMLHttpRequest.prototype.open=d,XMLHttpRequest.prototype.send=b}},[l]);const j=xe==="dark",he=j?"#1a1a2e":"#ffffff",R=j?"#e0e0e0":"#333333",v=j?"#333":"#ddd",$=j?"#16213e":"#f5f5f5",Te=we==="bottom-left"?{bottom:24,left:24}:{bottom:24,right:24},Ee=n.useCallback(async()=>{try{const t=await navigator.mediaDevices.getDisplayMedia({video:!0,audio:{systemAudio:"include",suppressLocalAudioPlayback:!1}});let r=null;try{r=await navigator.mediaDevices.getUserMedia({audio:!0,video:!1})}catch{}Y.current=r;const i=((r==null?void 0:r.getAudioTracks().length)??0)>0,h=t.getAudioTracks().length>0;!i&&!h&&alert(`Your recording will have no audio.

To capture audio, re-start the recording and either:
  • Enable "Also share system audio" in the screen picker (Chrome), or
  • Allow microphone access when prompted.

The recording will continue without audio.`);const d=i?r.getAudioTracks():t.getAudioTracks(),b=new MediaStream([...t.getVideoTracks(),...d]),o=new MediaRecorder(b,{mimeType:MediaRecorder.isTypeSupported("video/webm;codecs=vp9")?"video/webm;codecs=vp9":"video/webm"});q.current=[],N(),o.ondataavailable=a=>{a.data.size>0&&(q.current.push(a.data),Ce(a.data))},o.onstop=()=>{var x;const a=new Blob(q.current,{type:"video/webm"});N(),z(a),t.getTracks().forEach(c=>c.stop()),(x=Y.current)==null||x.getTracks().forEach(c=>c.stop()),Y.current=null},o.start(1e3),D.current=o,ee(!0),g(!1);const s=window.SpeechRecognition||window.webkitSpeechRecognition;if(s){const a=new s;a.continuous=!0,a.interimResults=!0,a.lang="en-US";let x="";a.onresult=c=>{let A="";for(let O=c.resultIndex;O<c.results.length;O++)c.results[O].isFinal?x+=c.results[O][0].transcript+" ":A+=c.results[O][0].transcript;oe(x+A)},a.onerror=()=>{},a.start(),U.current=a}}catch(t){console.error("Failed to start recording:",t)}},[]),fe=n.useCallback(()=>{D.current&&D.current.state!=="inactive"&&D.current.stop(),U.current&&(U.current.stop(),U.current=null),ee(!1),g(!0)},[]),be=()=>{se(""),ce(""),re("BUG"),ie("MEDIUM"),oe(""),z(null),pe(null),L(""),de(!1),te(!1),N()},Oe=async()=>{if(!H.trim()){L("Title is required");return}le(!0),L("");try{const t={title:H.trim(),description:ae.trim(),ticketType:W,priority:ne,submittedBy:_||ye||"Anonymous",currentPageUrl:window.location.href,currentPageName:document.title,browserInfo:navigator.userAgent,screenWidth:window.innerWidth,screenHeight:window.innerHeight,transcript:F||null,consoleErrors:p.current.length>0?JSON.stringify(p.current):null,networkErrors:m.current.length>0?JSON.stringify(m.current):null};V&&(t.tenantId=V),J&&(t.tenantName=J),K&&(t.databaseName=K),Q&&(t.applicationVersion=Q),Z&&(t.environment=Z);const r=await fetch(`${l}/tickets`,{method:"POST",headers:{"Content-Type":"application/json","X-BOM-API-Key":u},body:JSON.stringify(t)});if(!r.ok)throw new Error("Failed to submit ticket");const i=await r.json(),h=I||X;if(h&&i.id)try{const d=new FormData;d.append("file",h,"recording.webm");const b=await fetch(`${l}/tickets/${i.id}/video`,{method:"POST",headers:{"X-BOM-API-Key":u},body:d});b.ok||console.warn(`[Bug Out] Video upload failed (${b.status}) for ticket ${i.id}`)}catch(d){console.warn("[Bug Out] Video upload network error:",d)}de(!0),setTimeout(()=>{g(!1),be()},2e3)}catch(t){L(t.message||"Failed to submit")}finally{le(!1)}},E={padding:"8px 16px",border:"none",borderRadius:6,cursor:"pointer",fontSize:14,fontWeight:600,transition:"opacity 0.2s"};return e.jsxs(e.Fragment,{children:[!ke&&(()=>{const t=ve*2,r=w[0],i=w[1],h=`${r}8c`,d=Se.current;return e.jsx("button",{type:"button",role:"button","aria-label":"Report a bug",title:"Report a bug or request a feature",onClick:()=>{P||be(),g(!P)},className:"bom-orb-wrap",style:{...Te,width:t,height:t,"--bom-core":r,"--bom-ring":i,"--bom-halo":h,"--bom-spin":"18s","--bom-pulse":"4s"},children:e.jsxs("span",{className:"bom-orb",children:[e.jsxs("svg",{viewBox:"0 0 100 100",width:t,height:t,"aria-hidden":"true",className:"bom-orb__svg",children:[e.jsxs("defs",{children:[e.jsxs("radialGradient",{id:`${d}-core`,cx:"50%",cy:"50%",r:"50%",children:[e.jsx("stop",{offset:"0%",stopColor:r,stopOpacity:"1"}),e.jsx("stop",{offset:"55%",stopColor:r,stopOpacity:"0.55"}),e.jsx("stop",{offset:"100%",stopColor:"#1a0f00",stopOpacity:"0"})]}),e.jsxs("radialGradient",{id:`${d}-iris`,cx:"50%",cy:"50%",r:"50%",children:[e.jsx("stop",{offset:"0%",stopColor:"#fff7dc",stopOpacity:"0.95"}),e.jsx("stop",{offset:"40%",stopColor:r,stopOpacity:"0.7"}),e.jsx("stop",{offset:"100%",stopColor:r,stopOpacity:"0"})]})]}),e.jsx("circle",{cx:"50",cy:"50",r:"48",fill:`url(#${d}-core)`,className:"bom-orb__halo"}),e.jsxs("g",{className:"bom-orb__spin-cw",children:[e.jsx("circle",{cx:"50",cy:"50",r:"44",fill:"none",stroke:i,strokeOpacity:"0.55",strokeWidth:"0.5"}),Array.from({length:36}).map((b,o)=>{const s=o*10*Math.PI/180,a=50+Math.cos(s)*41,x=50+Math.sin(s)*41,c=50+Math.cos(s)*(o%3===0?44:43),A=50+Math.sin(s)*(o%3===0?44:43);return e.jsx("line",{x1:a,y1:x,x2:c,y2:A,stroke:i,strokeOpacity:o%3===0?.8:.35,strokeWidth:"0.8"},o)})]}),e.jsxs("g",{className:"bom-orb__spin-ccw",children:[e.jsx("circle",{cx:"50",cy:"50",r:"36",fill:"none",stroke:i,strokeOpacity:"0.18",strokeWidth:"0.5"}),e.jsx("circle",{cx:"50",cy:"50",r:"36",fill:"none",stroke:i,strokeOpacity:"0.85",strokeWidth:"1.4",strokeDasharray:"42 30 18 36 24 32",strokeLinecap:"round"})]}),e.jsx("g",{className:"bom-orb__spin-cw-fast",children:e.jsx("circle",{cx:"50",cy:"50",r:"28",fill:"none",stroke:r,strokeOpacity:"0.7",strokeWidth:"0.9",strokeDasharray:"2 4"})}),e.jsx("circle",{cx:"50",cy:"50",r:"20",fill:`url(#${d}-iris)`,className:"bom-orb__core"}),e.jsxs("g",{stroke:"#1a0f00",strokeOpacity:"0.55",strokeLinecap:"round",children:[e.jsx("line",{x1:"50",y1:"42",x2:"50",y2:"42",strokeWidth:"3.4"}),e.jsx("line",{x1:"50",y1:"48",x2:"50",y2:"58",strokeWidth:"2.4"})]}),e.jsx("line",{x1:"50",y1:"6",x2:"50",y2:"14",stroke:i,strokeOpacity:"0.7",strokeWidth:"0.6"}),e.jsx("line",{x1:"50",y1:"86",x2:"50",y2:"94",stroke:i,strokeOpacity:"0.7",strokeWidth:"0.6"}),e.jsx("line",{x1:"6",y1:"50",x2:"14",y2:"50",stroke:i,strokeOpacity:"0.7",strokeWidth:"0.6"}),e.jsx("line",{x1:"86",y1:"50",x2:"94",y2:"50",stroke:i,strokeOpacity:"0.7",strokeWidth:"0.6"})]}),e.jsx("span",{className:"bom-orb__scan"})]})})})(),P&&e.jsx("div",{style:{position:"fixed",inset:0,background:"rgba(0,0,0,0.5)",zIndex:1e6,display:"flex",alignItems:"center",justifyContent:"center",animation:"bom-fade-in 0.2s ease-out"},onClick:t=>{t.target===t.currentTarget&&g(!1)},children:e.jsx("div",{style:{background:he,color:R,borderRadius:12,padding:24,width:"90%",maxWidth:520,maxHeight:"85vh",overflowY:"auto",boxShadow:"0 20px 60px rgba(0,0,0,0.3)",fontFamily:'-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'},children:Re?e.jsxs("div",{style:{textAlign:"center",padding:40},children:[e.jsx("div",{style:{fontSize:48,marginBottom:16},children:"✓"}),e.jsx("h3",{style:{margin:0,fontSize:20},children:"Submitted!"}),e.jsx("p",{style:{opacity:.7,marginTop:8},children:"Thank you for your feedback."})]}):e.jsxs(e.Fragment,{children:[e.jsxs("div",{style:{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:20},children:[e.jsx("h3",{style:{margin:0,fontSize:18,fontWeight:700},children:"Report an Issue"}),e.jsx("div",{onClick:()=>g(!1),style:{cursor:"pointer",fontSize:20,opacity:.6,padding:"0 4px"},children:"✕"})]}),e.jsxs("div",{style:{marginBottom:14},children:[e.jsx("label",{style:{display:"block",marginBottom:4,fontSize:13,fontWeight:600,opacity:.8},children:"Type"}),e.jsx("div",{style:{display:"flex",gap:8},children:ze.map(t=>e.jsx("div",{onClick:()=>re(t.value),style:{flex:1,padding:"8px 4px",textAlign:"center",borderRadius:6,border:`2px solid ${W===t.value?w[0]:v}`,background:W===t.value?`${w[0]}22`:"transparent",cursor:"pointer",fontSize:12,fontWeight:W===t.value?700:400},children:t.label},t.value))})]}),e.jsxs("div",{style:{marginBottom:14},children:[e.jsx("label",{style:{display:"block",marginBottom:4,fontSize:13,fontWeight:600,opacity:.8},children:"Priority"}),e.jsx("select",{value:ne,onChange:t=>ie(t.target.value),style:{width:"100%",padding:"8px 12px",borderRadius:6,border:`1px solid ${v}`,background:$,color:R,fontSize:14,outline:"none"},children:We.map(t=>e.jsx("option",{value:t.value,children:t.label},t.value))})]}),e.jsxs("div",{style:{marginBottom:14},children:[e.jsxs("label",{style:{display:"block",marginBottom:4,fontSize:13,fontWeight:600,opacity:.8},children:["Title ",e.jsx("span",{style:{color:"#e53935"},children:"*"})]}),e.jsx("input",{type:"text",value:H,onChange:t=>se(t.target.value),placeholder:"Brief summary of the issue",maxLength:500,style:{width:"100%",padding:"8px 12px",borderRadius:6,border:`1px solid ${v}`,background:$,color:R,fontSize:14,outline:"none",boxSizing:"border-box"}})]}),e.jsxs("div",{style:{marginBottom:14},children:[e.jsx("label",{style:{display:"block",marginBottom:4,fontSize:13,fontWeight:600,opacity:.8},children:"Description"}),e.jsx("textarea",{value:ae,onChange:t=>ce(t.target.value),placeholder:"Describe the issue in detail...",rows:3,style:{width:"100%",padding:"8px 12px",borderRadius:6,border:`1px solid ${v}`,background:$,color:R,fontSize:14,outline:"none",resize:"vertical",boxSizing:"border-box",fontFamily:"inherit"}})]}),e.jsxs("div",{style:{marginBottom:14},children:[e.jsx("label",{style:{display:"block",marginBottom:4,fontSize:13,fontWeight:600,opacity:.8},children:"Screen Recording"}),_e?e.jsxs("div",{children:[e.jsx("input",{type:"file",accept:"video/*",onChange:t=>{var r;return pe(((r=t.target.files)==null?void 0:r[0])||null)},style:{fontSize:13}}),X&&e.jsx("span",{style:{fontSize:12,opacity:.7,marginLeft:8},children:X.name})]}):e.jsxs("div",{style:{display:"flex",gap:8,alignItems:"center"},children:[!C&&!I&&e.jsx("div",{onClick:Ee,style:{...E,background:`linear-gradient(135deg, ${w[0]}, ${w[1]})`,color:"#fff"},children:"Start Recording"}),C&&e.jsx("div",{onClick:fe,style:{...E,background:"#e53935",color:"#fff"},children:"Stop Recording"}),je&&e.jsx("div",{style:{fontSize:12,color:"#fb923c",background:"rgba(251,146,60,0.12)",border:"1px solid rgba(251,146,60,0.35)",borderRadius:6,padding:"5px 10px",marginBottom:4},children:"Recording recovered after page reload — your video is intact."}),I&&e.jsxs(e.Fragment,{children:[e.jsxs("span",{style:{fontSize:12,opacity:.7},children:["Recording captured (",(I.size/1024/1024).toFixed(1)," MB)"]}),e.jsx("div",{onClick:()=>z(null),style:{...E,background:"#666",color:"#fff",padding:"4px 10px",fontSize:12},children:"Remove"})]}),C&&e.jsx("span",{style:{fontSize:12,color:"#e53935",fontWeight:600},children:"Recording..."})]})]}),F&&e.jsxs("div",{style:{marginBottom:14},children:[e.jsx("label",{style:{display:"block",marginBottom:4,fontSize:13,fontWeight:600,opacity:.8},children:"Voice Transcript"}),e.jsx("div",{style:{padding:"8px 12px",borderRadius:6,background:$,border:`1px solid ${v}`,fontSize:13,maxHeight:80,overflowY:"auto",opacity:.8},children:F})]}),(p.current.length>0||m.current.length>0)&&e.jsxs("div",{style:{marginBottom:14,padding:"6px 12px",borderRadius:6,background:j?"#2a1a1a":"#fff3f0",border:`1px solid ${j?"#4a2020":"#ffccc7"}`,fontSize:12,opacity:.8},children:[p.current.length>0&&e.jsxs("span",{children:[p.current.length," console error(s) captured"]}),p.current.length>0&&m.current.length>0&&" | ",m.current.length>0&&e.jsxs("span",{children:[m.current.length," network error(s) captured"]}),e.jsx("span",{style:{display:"block",marginTop:2,opacity:.7},children:"These will be included in your report automatically."})]}),ue&&e.jsx("div",{style:{color:"#e53935",fontSize:13,marginBottom:10},children:ue}),e.jsxs("div",{style:{display:"flex",gap:8,justifyContent:"flex-end"},children:[e.jsx("div",{onClick:()=>g(!1),style:{...E,background:"transparent",color:R,border:`1px solid ${v}`},children:"Cancel"}),e.jsx("div",{onClick:M?void 0:Oe,style:{...E,background:M?"#666":`linear-gradient(135deg, ${w[0]}, ${w[1]})`,color:"#fff",opacity:M?.6:1,cursor:M?"not-allowed":"pointer"},children:M?"Submitting...":"Submit"})]}),e.jsx("div",{style:{marginTop:14,fontSize:11,opacity:.4,textAlign:"center"},children:"Page URL, browser info, screen size, and console errors will be captured automatically."})]})})}),C&&e.jsxs("div",{onMouseDown:t=>{if(t.target.closest("[data-bom-stop]"))return;t.preventDefault(),y.current={x:t.clientX-S.left,y:t.clientY-S.top};const r=h=>{y.current&&me({left:Math.max(0,Math.min(window.innerWidth-240,h.clientX-y.current.x)),top:Math.max(0,Math.min(window.innerHeight-50,h.clientY-y.current.y))})},i=()=>{y.current=null,document.removeEventListener("mousemove",r),document.removeEventListener("mouseup",i)};document.addEventListener("mousemove",r),document.addEventListener("mouseup",i)},onTouchStart:t=>{if(t.target.closest("[data-bom-stop]"))return;const r=t.touches[0];y.current={x:r.clientX-S.left,y:r.clientY-S.top};const i=d=>{if(!y.current)return;d.preventDefault();const b=d.touches[0];me({left:Math.max(0,Math.min(window.innerWidth-240,b.clientX-y.current.x)),top:Math.max(0,Math.min(window.innerHeight-50,b.clientY-y.current.y))})},h=()=>{y.current=null,document.removeEventListener("touchmove",i),document.removeEventListener("touchend",h)};document.addEventListener("touchmove",i,{passive:!1}),document.addEventListener("touchend",h)},style:{position:"fixed",top:S.top,left:S.left,zIndex:1000001,display:"flex",alignItems:"center",gap:10,padding:"8px 12px",background:he,color:R,borderRadius:999,border:`1px solid ${v}`,boxShadow:"0 8px 24px rgba(0,0,0,0.35)",fontFamily:'-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',fontSize:13,userSelect:"none",cursor:"grab",touchAction:"none"},children:[e.jsx("span",{style:{opacity:.45,fontSize:14,lineHeight:1,pointerEvents:"none"},children:"☰"}),e.jsx("span",{style:{display:"inline-block",width:10,height:10,borderRadius:"50%",background:"#e53935",boxShadow:"0 0 0 0 rgba(229,57,53,0.6)",animation:"bom-pulse 1.4s ease-out infinite",pointerEvents:"none"}}),e.jsx("span",{style:{fontWeight:600,pointerEvents:"none"},children:"Recording"}),e.jsx("div",{"data-bom-stop":"true",onClick:fe,style:{cursor:"pointer",background:"#e53935",color:"#fff",borderRadius:999,padding:"6px 14px",fontSize:12,fontWeight:700,letterSpacing:.3},children:"STOP"})]})]})};exports.BugOutManagedWidget=ge;exports.BugsManagedWidget=ge;
