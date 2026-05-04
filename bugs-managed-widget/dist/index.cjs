"use strict";Object.defineProperty(exports,Symbol.toStringTag,{value:"Module"});const e=require("react/jsx-runtime"),n=require("react"),ke=[{value:"BUG",label:"Bug Report"},{value:"FEATURE_REQUEST",label:"Feature Request"},{value:"QUESTION",label:"Question"}],je=[{value:"LOW",label:"Low"},{value:"MEDIUM",label:"Medium"},{value:"HIGH",label:"High"},{value:"CRITICAL",label:"Critical"}],se=ae=>{const{apiKey:D,apiUrl:h,userEmail:le,userName:ce,theme:de="dark",position:pe="bottom-right",orbSize:ue=24,orbColors:m=["#fbbf24","#fb923c"],tenantId:N,tenantName:F,databaseName:P,appVersion:H,environment:A}=ae,me=n.useRef(`bom-orb-${Math.random().toString(36).slice(2,9)}`),[I,b]=n.useState(!1),[S,X]=n.useState(!1),[R,E]=n.useState(null),[W,q]=n.useState(""),[_,Y]=n.useState("BUG"),[G,V]=n.useState("MEDIUM"),[$,J]=n.useState(""),[K,Q]=n.useState(""),[w,Z]=n.useState(!1),[be,ee]=n.useState(!1),[te,M]=n.useState(""),[fe,he]=n.useState(!1),[L,oe]=n.useState(null),[O,ge]=n.useState(()=>({top:24,left:typeof window<"u"?Math.max(24,window.innerWidth-280):24})),v=n.useRef(null),T=n.useRef(null),U=n.useRef([]),C=n.useRef(null),k=n.useRef(null),c=n.useRef([]),d=n.useRef([]);n.useEffect(()=>{if(he(/Android|iPhone|iPad|iPod/i.test(navigator.userAgent)),!k.current){const o=document.createElement("style");o.textContent=`
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
      `,document.head.appendChild(o),k.current=o}const t=console.error;console.error=(...o)=>{c.current.push({type:"console.error",message:o.map(r=>typeof r=="object"?JSON.stringify(r):String(r)).join(" "),timestamp:new Date().toISOString()}),c.current.length>50&&c.current.shift(),t.apply(console,o)};const i=o=>{c.current.push({type:"window.onerror",message:o.message,source:o.filename,line:o.lineno,col:o.colno,timestamp:new Date().toISOString()}),c.current.length>50&&c.current.shift()};window.addEventListener("error",i);const a=o=>{var r;c.current.push({type:"unhandledrejection",message:((r=o.reason)==null?void 0:r.message)||String(o.reason),timestamp:new Date().toISOString()}),c.current.length>50&&c.current.shift()};window.addEventListener("unhandledrejection",a);const s=window.fetch;window.fetch=async(...o)=>{var B;const r=typeof o[0]=="string"?o[0]:o[0].url,x=(((B=o[1])==null?void 0:B.method)||"GET").toUpperCase();try{const u=await s.apply(window,o);return!u.ok&&!r.includes(h)&&(d.current.push({method:x,url:r,status:u.status,statusText:u.statusText,timestamp:new Date().toISOString()}),d.current.length>30&&d.current.shift()),u}catch(u){throw r.includes(h)||(d.current.push({method:x,url:r,status:0,statusText:u.message||"Network Error",timestamp:new Date().toISOString()}),d.current.length>30&&d.current.shift()),u}};const l=XMLHttpRequest.prototype.open,p=XMLHttpRequest.prototype.send;return XMLHttpRequest.prototype.open=function(o,r,...x){return this._bomMethod=o,this._bomUrl=String(r),l.apply(this,[o,r,...x])},XMLHttpRequest.prototype.send=function(...o){return this.addEventListener("loadend",()=>{var r;this.status>=400&&!((r=this._bomUrl)!=null&&r.includes(h))&&(d.current.push({method:this._bomMethod||"GET",url:this._bomUrl||"",status:this.status,statusText:this.statusText,timestamp:new Date().toISOString()}),d.current.length>30&&d.current.shift())}),p.apply(this,o)},()=>{k.current&&(document.head.removeChild(k.current),k.current=null),console.error=t,window.removeEventListener("error",i),window.removeEventListener("unhandledrejection",a),window.fetch=s,XMLHttpRequest.prototype.open=l,XMLHttpRequest.prototype.send=p}},[h]);const g=de==="dark",re=g?"#1a1a2e":"#ffffff",y=g?"#e0e0e0":"#333333",f=g?"#333":"#ddd",z=g?"#16213e":"#f5f5f5",ye=pe==="bottom-left"?{bottom:24,left:24}:{bottom:24,right:24},xe=n.useCallback(async()=>{try{const t=await navigator.mediaDevices.getDisplayMedia({video:!0,audio:!0}),i=new MediaRecorder(t,{mimeType:MediaRecorder.isTypeSupported("video/webm;codecs=vp9")?"video/webm;codecs=vp9":"video/webm"});U.current=[],i.ondataavailable=s=>{s.data.size>0&&U.current.push(s.data)},i.onstop=()=>{const s=new Blob(U.current,{type:"video/webm"});E(s),t.getTracks().forEach(l=>l.stop())},i.start(1e3),T.current=i,X(!0),b(!1);const a=window.SpeechRecognition||window.webkitSpeechRecognition;if(a){const s=new a;s.continuous=!0,s.interimResults=!0,s.lang="en-US";let l="";s.onresult=p=>{let o="";for(let r=p.resultIndex;r<p.results.length;r++)p.results[r].isFinal?l+=p.results[r][0].transcript+" ":o+=p.results[r][0].transcript;q(l+o)},s.onerror=()=>{},s.start(),C.current=s}}catch(t){console.error("Failed to start recording:",t)}},[]),ne=n.useCallback(()=>{T.current&&T.current.state!=="inactive"&&T.current.stop(),C.current&&(C.current.stop(),C.current=null),X(!1),b(!0)},[]),ie=()=>{J(""),Q(""),Y("BUG"),V("MEDIUM"),q(""),E(null),oe(null),M(""),ee(!1)},we=async()=>{if(!$.trim()){M("Title is required");return}Z(!0),M("");try{const t={title:$.trim(),description:K.trim(),ticketType:_,priority:G,submittedBy:le||ce||"Anonymous",currentPageUrl:window.location.href,currentPageName:document.title,browserInfo:navigator.userAgent,screenWidth:window.innerWidth,screenHeight:window.innerHeight,transcript:W||null,consoleErrors:c.current.length>0?JSON.stringify(c.current):null,networkErrors:d.current.length>0?JSON.stringify(d.current):null};N&&(t.tenantId=N),F&&(t.tenantName=F),P&&(t.databaseName=P),H&&(t.applicationVersion=H),A&&(t.environment=A);const i=await fetch(`${h}/tickets`,{method:"POST",headers:{"Content-Type":"application/json","X-BOM-API-Key":D},body:JSON.stringify(t)});if(!i.ok)throw new Error("Failed to submit ticket");const a=await i.json(),s=R||L;if(s&&a.id)try{const l=new FormData;l.append("file",s,"recording.webm");const p=await fetch(`${h}/tickets/${a.id}/video`,{method:"POST",headers:{"X-BOM-API-Key":D},body:l});p.ok||console.warn(`[Bug Out] Video upload failed (${p.status}) for ticket ${a.id}`)}catch(l){console.warn("[Bug Out] Video upload network error:",l)}ee(!0),setTimeout(()=>{b(!1),ie()},2e3)}catch(t){M(t.message||"Failed to submit")}finally{Z(!1)}},j={padding:"8px 16px",border:"none",borderRadius:6,cursor:"pointer",fontSize:14,fontWeight:600,transition:"opacity 0.2s"};return e.jsxs(e.Fragment,{children:[(()=>{const t=ue*2,i=m[0],a=m[1],s=`${i}8c`,l=me.current;return e.jsx("button",{type:"button",role:"button","aria-label":"Report a bug",title:"Report a bug or request a feature",onClick:()=>{I||ie(),b(!I)},className:"bom-orb-wrap",style:{...ye,width:t,height:t,"--bom-core":i,"--bom-ring":a,"--bom-halo":s,"--bom-spin":"18s","--bom-pulse":"4s"},children:e.jsxs("span",{className:"bom-orb",children:[e.jsxs("svg",{viewBox:"0 0 100 100",width:t,height:t,"aria-hidden":"true",className:"bom-orb__svg",children:[e.jsxs("defs",{children:[e.jsxs("radialGradient",{id:`${l}-core`,cx:"50%",cy:"50%",r:"50%",children:[e.jsx("stop",{offset:"0%",stopColor:i,stopOpacity:"1"}),e.jsx("stop",{offset:"55%",stopColor:i,stopOpacity:"0.55"}),e.jsx("stop",{offset:"100%",stopColor:"#1a0f00",stopOpacity:"0"})]}),e.jsxs("radialGradient",{id:`${l}-iris`,cx:"50%",cy:"50%",r:"50%",children:[e.jsx("stop",{offset:"0%",stopColor:"#fff7dc",stopOpacity:"0.95"}),e.jsx("stop",{offset:"40%",stopColor:i,stopOpacity:"0.7"}),e.jsx("stop",{offset:"100%",stopColor:i,stopOpacity:"0"})]})]}),e.jsx("circle",{cx:"50",cy:"50",r:"48",fill:`url(#${l}-core)`,className:"bom-orb__halo"}),e.jsxs("g",{className:"bom-orb__spin-cw",children:[e.jsx("circle",{cx:"50",cy:"50",r:"44",fill:"none",stroke:a,strokeOpacity:"0.55",strokeWidth:"0.5"}),Array.from({length:36}).map((p,o)=>{const r=o*10*Math.PI/180,x=50+Math.cos(r)*41,B=50+Math.sin(r)*41,u=50+Math.cos(r)*(o%3===0?44:43),ve=50+Math.sin(r)*(o%3===0?44:43);return e.jsx("line",{x1:x,y1:B,x2:u,y2:ve,stroke:a,strokeOpacity:o%3===0?.8:.35,strokeWidth:"0.8"},o)})]}),e.jsxs("g",{className:"bom-orb__spin-ccw",children:[e.jsx("circle",{cx:"50",cy:"50",r:"36",fill:"none",stroke:a,strokeOpacity:"0.18",strokeWidth:"0.5"}),e.jsx("circle",{cx:"50",cy:"50",r:"36",fill:"none",stroke:a,strokeOpacity:"0.85",strokeWidth:"1.4",strokeDasharray:"42 30 18 36 24 32",strokeLinecap:"round"})]}),e.jsx("g",{className:"bom-orb__spin-cw-fast",children:e.jsx("circle",{cx:"50",cy:"50",r:"28",fill:"none",stroke:i,strokeOpacity:"0.7",strokeWidth:"0.9",strokeDasharray:"2 4"})}),e.jsx("circle",{cx:"50",cy:"50",r:"20",fill:`url(#${l}-iris)`,className:"bom-orb__core"}),e.jsxs("g",{stroke:"#1a0f00",strokeOpacity:"0.55",strokeLinecap:"round",children:[e.jsx("line",{x1:"50",y1:"42",x2:"50",y2:"42",strokeWidth:"3.4"}),e.jsx("line",{x1:"50",y1:"48",x2:"50",y2:"58",strokeWidth:"2.4"})]}),e.jsx("line",{x1:"50",y1:"6",x2:"50",y2:"14",stroke:a,strokeOpacity:"0.7",strokeWidth:"0.6"}),e.jsx("line",{x1:"50",y1:"86",x2:"50",y2:"94",stroke:a,strokeOpacity:"0.7",strokeWidth:"0.6"}),e.jsx("line",{x1:"6",y1:"50",x2:"14",y2:"50",stroke:a,strokeOpacity:"0.7",strokeWidth:"0.6"}),e.jsx("line",{x1:"86",y1:"50",x2:"94",y2:"50",stroke:a,strokeOpacity:"0.7",strokeWidth:"0.6"})]}),e.jsx("span",{className:"bom-orb__scan"})]})})})(),I&&e.jsx("div",{style:{position:"fixed",inset:0,background:"rgba(0,0,0,0.5)",zIndex:1e6,display:"flex",alignItems:"center",justifyContent:"center",animation:"bom-fade-in 0.2s ease-out"},onClick:t=>{t.target===t.currentTarget&&b(!1)},children:e.jsx("div",{style:{background:re,color:y,borderRadius:12,padding:24,width:"90%",maxWidth:520,maxHeight:"85vh",overflowY:"auto",boxShadow:"0 20px 60px rgba(0,0,0,0.3)",fontFamily:'-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'},children:be?e.jsxs("div",{style:{textAlign:"center",padding:40},children:[e.jsx("div",{style:{fontSize:48,marginBottom:16},children:"✓"}),e.jsx("h3",{style:{margin:0,fontSize:20},children:"Submitted!"}),e.jsx("p",{style:{opacity:.7,marginTop:8},children:"Thank you for your feedback."})]}):e.jsxs(e.Fragment,{children:[e.jsxs("div",{style:{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:20},children:[e.jsx("h3",{style:{margin:0,fontSize:18,fontWeight:700},children:"Report an Issue"}),e.jsx("div",{onClick:()=>b(!1),style:{cursor:"pointer",fontSize:20,opacity:.6,padding:"0 4px"},children:"✕"})]}),e.jsxs("div",{style:{marginBottom:14},children:[e.jsx("label",{style:{display:"block",marginBottom:4,fontSize:13,fontWeight:600,opacity:.8},children:"Type"}),e.jsx("div",{style:{display:"flex",gap:8},children:ke.map(t=>e.jsx("div",{onClick:()=>Y(t.value),style:{flex:1,padding:"8px 4px",textAlign:"center",borderRadius:6,border:`2px solid ${_===t.value?m[0]:f}`,background:_===t.value?`${m[0]}22`:"transparent",cursor:"pointer",fontSize:12,fontWeight:_===t.value?700:400},children:t.label},t.value))})]}),e.jsxs("div",{style:{marginBottom:14},children:[e.jsx("label",{style:{display:"block",marginBottom:4,fontSize:13,fontWeight:600,opacity:.8},children:"Priority"}),e.jsx("select",{value:G,onChange:t=>V(t.target.value),style:{width:"100%",padding:"8px 12px",borderRadius:6,border:`1px solid ${f}`,background:z,color:y,fontSize:14,outline:"none"},children:je.map(t=>e.jsx("option",{value:t.value,children:t.label},t.value))})]}),e.jsxs("div",{style:{marginBottom:14},children:[e.jsxs("label",{style:{display:"block",marginBottom:4,fontSize:13,fontWeight:600,opacity:.8},children:["Title ",e.jsx("span",{style:{color:"#e53935"},children:"*"})]}),e.jsx("input",{type:"text",value:$,onChange:t=>J(t.target.value),placeholder:"Brief summary of the issue",maxLength:500,style:{width:"100%",padding:"8px 12px",borderRadius:6,border:`1px solid ${f}`,background:z,color:y,fontSize:14,outline:"none",boxSizing:"border-box"}})]}),e.jsxs("div",{style:{marginBottom:14},children:[e.jsx("label",{style:{display:"block",marginBottom:4,fontSize:13,fontWeight:600,opacity:.8},children:"Description"}),e.jsx("textarea",{value:K,onChange:t=>Q(t.target.value),placeholder:"Describe the issue in detail...",rows:3,style:{width:"100%",padding:"8px 12px",borderRadius:6,border:`1px solid ${f}`,background:z,color:y,fontSize:14,outline:"none",resize:"vertical",boxSizing:"border-box",fontFamily:"inherit"}})]}),e.jsxs("div",{style:{marginBottom:14},children:[e.jsx("label",{style:{display:"block",marginBottom:4,fontSize:13,fontWeight:600,opacity:.8},children:"Screen Recording"}),fe?e.jsxs("div",{children:[e.jsx("input",{type:"file",accept:"video/*",onChange:t=>{var i;return oe(((i=t.target.files)==null?void 0:i[0])||null)},style:{fontSize:13}}),L&&e.jsx("span",{style:{fontSize:12,opacity:.7,marginLeft:8},children:L.name})]}):e.jsxs("div",{style:{display:"flex",gap:8,alignItems:"center"},children:[!S&&!R&&e.jsx("div",{onClick:xe,style:{...j,background:`linear-gradient(135deg, ${m[0]}, ${m[1]})`,color:"#fff"},children:"Start Recording"}),S&&e.jsx("div",{onClick:ne,style:{...j,background:"#e53935",color:"#fff"},children:"Stop Recording"}),R&&e.jsxs(e.Fragment,{children:[e.jsxs("span",{style:{fontSize:12,opacity:.7},children:["Recording captured (",(R.size/1024/1024).toFixed(1)," MB)"]}),e.jsx("div",{onClick:()=>E(null),style:{...j,background:"#666",color:"#fff",padding:"4px 10px",fontSize:12},children:"Remove"})]}),S&&e.jsx("span",{style:{fontSize:12,color:"#e53935",fontWeight:600},children:"Recording..."})]})]}),W&&e.jsxs("div",{style:{marginBottom:14},children:[e.jsx("label",{style:{display:"block",marginBottom:4,fontSize:13,fontWeight:600,opacity:.8},children:"Voice Transcript"}),e.jsx("div",{style:{padding:"8px 12px",borderRadius:6,background:z,border:`1px solid ${f}`,fontSize:13,maxHeight:80,overflowY:"auto",opacity:.8},children:W})]}),(c.current.length>0||d.current.length>0)&&e.jsxs("div",{style:{marginBottom:14,padding:"6px 12px",borderRadius:6,background:g?"#2a1a1a":"#fff3f0",border:`1px solid ${g?"#4a2020":"#ffccc7"}`,fontSize:12,opacity:.8},children:[c.current.length>0&&e.jsxs("span",{children:[c.current.length," console error(s) captured"]}),c.current.length>0&&d.current.length>0&&" | ",d.current.length>0&&e.jsxs("span",{children:[d.current.length," network error(s) captured"]}),e.jsx("span",{style:{display:"block",marginTop:2,opacity:.7},children:"These will be included in your report automatically."})]}),te&&e.jsx("div",{style:{color:"#e53935",fontSize:13,marginBottom:10},children:te}),e.jsxs("div",{style:{display:"flex",gap:8,justifyContent:"flex-end"},children:[e.jsx("div",{onClick:()=>b(!1),style:{...j,background:"transparent",color:y,border:`1px solid ${f}`},children:"Cancel"}),e.jsx("div",{onClick:w?void 0:we,style:{...j,background:w?"#666":`linear-gradient(135deg, ${m[0]}, ${m[1]})`,color:"#fff",opacity:w?.6:1,cursor:w?"not-allowed":"pointer"},children:w?"Submitting...":"Submit"})]}),e.jsx("div",{style:{marginTop:14,fontSize:11,opacity:.4,textAlign:"center"},children:"Page URL, browser info, screen size, and console errors will be captured automatically."})]})})}),S&&e.jsxs("div",{style:{position:"fixed",top:O.top,left:O.left,zIndex:1000001,display:"flex",alignItems:"center",gap:10,padding:"8px 12px",background:re,color:y,borderRadius:999,border:`1px solid ${f}`,boxShadow:"0 8px 24px rgba(0,0,0,0.35)",fontFamily:'-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',fontSize:13,userSelect:"none"},children:[e.jsx("div",{onMouseDown:t=>{v.current={x:t.clientX-O.left,y:t.clientY-O.top};const i=s=>{v.current&&ge({left:Math.max(0,Math.min(window.innerWidth-240,s.clientX-v.current.x)),top:Math.max(0,Math.min(window.innerHeight-50,s.clientY-v.current.y))})},a=()=>{v.current=null,document.removeEventListener("mousemove",i),document.removeEventListener("mouseup",a)};document.addEventListener("mousemove",i),document.addEventListener("mouseup",a)},style:{cursor:"grab",padding:"2px 4px",opacity:.6,fontSize:16,lineHeight:1},title:"Drag to move",children:"☰"}),e.jsx("span",{style:{display:"inline-block",width:10,height:10,borderRadius:"50%",background:"#e53935",boxShadow:"0 0 0 0 rgba(229,57,53,0.6)",animation:"bom-pulse 1.4s ease-out infinite"}}),e.jsx("span",{style:{fontWeight:600},children:"Recording"}),e.jsx("div",{onClick:ne,style:{cursor:"pointer",background:"#e53935",color:"#fff",borderRadius:999,padding:"6px 14px",fontSize:12,fontWeight:700,letterSpacing:.3},children:"STOP"})]})]})};exports.BugOutManagedWidget=se;exports.BugsManagedWidget=se;
