// The public form's own style sheet. The page is plain HTML with no framework
// script, so its styles travel with it; the editor preview adds the same text.
// Every colour comes from the form's design, set as --lf-* on the root.

export const FORM_CSS = `
.lf,.lf *{box-sizing:border-box}
.lf{position:relative;min-height:100dvh;margin:0;padding:24px 16px 40px;color:var(--lf-text);background:var(--lf-bg);background-size:cover;background-position:center;font-family:var(--lf-font);font-size:16px;line-height:1.45;-webkit-text-size-adjust:100%}
.lf-wrap{max-width:560px;margin:0 auto;display:flex;flex-direction:column;gap:20px}
.lf-top{display:flex;justify-content:flex-end}
.lf-langs{display:flex;gap:4px;padding:4px;border-radius:var(--lf-r-input);background:color-mix(in srgb,var(--lf-text) 10%,transparent)}
.lf-langs a{display:inline-flex;align-items:center;min-height:36px;padding:0 12px;border-radius:var(--lf-r-input);color:inherit;font-size:14px;font-weight:600;text-decoration:none}
.lf-langs a[aria-current]{background:var(--lf-card);color:var(--lf-card-text)}
.lf-head{display:flex;flex-direction:column;gap:12px}
.lf-head.lf-logo-left{flex-direction:row;align-items:center;gap:16px}
.lf-logo{max-height:56px;max-width:180px;width:auto;height:auto;object-fit:contain;align-self:flex-start}
.lf-title{margin:0;font-size:28px;line-height:1.2;font-weight:700;letter-spacing:-.01em;overflow-wrap:anywhere}
.lf-sub{margin:8px 0 0;font-size:16px;opacity:.85}
.lf-card{background:var(--lf-card);color:var(--lf-card-text);border-radius:var(--lf-r-card);padding:20px;box-shadow:0 8px 30px rgba(0,0,0,.08)}
.lf-fields{display:grid;grid-template-columns:1fr;gap:16px}
.lf-field{display:flex;flex-direction:column;gap:6px;min-width:0;border:0;margin:0;padding:0}
.lf-label{font-size:14px;font-weight:600;padding:0}
.lf-req{color:var(--lf-error)}
.lf-help{margin:0;font-size:13px;opacity:.75}
.lf-err{margin:0;font-size:13px;font-weight:600;color:var(--lf-error)}
.lf-input{width:100%;min-height:48px;padding:10px 14px;border:1px solid color-mix(in srgb,var(--lf-card-text) 30%,transparent);border-radius:var(--lf-r-input);background:color-mix(in srgb,var(--lf-card-text) 4%,var(--lf-card));color:inherit;font:inherit}
textarea.lf-input{min-height:112px;resize:vertical;border-radius:var(--lf-r-area)}
.lf-input::placeholder{color:color-mix(in srgb,var(--lf-card-text) 50%,transparent)}
.lf-input[aria-invalid=true]{border-color:var(--lf-error);border-width:2px}
.lf :focus-visible{outline:2px solid var(--lf-card-text);outline-offset:2px}
.lf-top :focus-visible{outline-color:var(--lf-text)}
.lf-opts{display:flex;flex-direction:column}
.lf-opt{display:flex;align-items:center;gap:10px;min-height:44px;cursor:pointer}
.lf-opt input{width:20px;height:20px;margin:0;flex:none;accent-color:var(--lf-button)}
.lf-consent{align-items:flex-start;padding-top:4px;font-size:14px}
.lf-consent input{margin-top:1px}
.lf-heading{margin:8px 0 0;font-size:18px;font-weight:700}
.lf-text{margin:0;white-space:pre-line}
.lf-img{max-width:100%;height:auto;border-radius:var(--lf-r-area)}
.lf-notice{margin:0 0 16px;padding:12px 14px;border:2px solid var(--lf-error);border-radius:var(--lf-r-area);color:var(--lf-error);font-size:14px;font-weight:600}
.lf-button{width:100%;min-height:52px;margin-top:20px;padding:12px 20px;border:0;border-radius:var(--lf-r-input);background:var(--lf-button);color:var(--lf-button-text);font:inherit;font-weight:700;cursor:pointer}
.lf-button[disabled]{opacity:.6;cursor:default}
.lf-button:focus-visible{outline-offset:3px}
.lf-done{display:flex;flex-direction:column;align-items:center;gap:12px;padding:36px 20px;text-align:center}
.lf-done h2{margin:0;font-size:22px;line-height:1.25}
.lf-done p{margin:0;white-space:pre-line}
.lf-done svg{width:56px;height:56px;color:var(--lf-button)}
.lf-hp{position:absolute;left:-9999px;top:auto;width:1px;height:1px;overflow:hidden}
.lf-sr{position:absolute;width:1px;height:1px;overflow:hidden;clip-path:inset(50%);white-space:nowrap}
@media (min-width:560px){
.lf{padding:40px 24px 64px}
.lf-card{padding:28px}
.lf-fields{grid-template-columns:1fr 1fr}
.lf-field{grid-column:span 2}
.lf-field.lf-half{grid-column:span 1}
.lf-title{font-size:34px}
}
@media (min-width:960px){
.lf-split .lf-wrap{max-width:1080px;display:grid;grid-template-columns:1fr 1fr;grid-template-areas:"top top" "head card";column-gap:56px;align-items:start}
.lf-split .lf-top{grid-area:top}
.lf-split .lf-head{grid-area:head;padding-top:48px}
.lf-split .lf-card{grid-area:card}
.lf-split .lf-title{font-size:44px}
.lf-split .lf-sub{font-size:18px}
}
`;

/**
 * Keeps what was typed when the visitor changes language, and stops a second
 * tap on the button from sending twice. The form works without it.
 */
export const FORM_SCRIPT = `(function(){var f=document.querySelector('form.lf-form');if(!f)return;var k='lf:'+location.pathname;try{var s=sessionStorage.getItem(k);if(s){sessionStorage.removeItem(k);JSON.parse(s).forEach(function(p){var e=f.querySelectorAll('[name="'+p[0]+'"]');for(var i=0;i<e.length;i++){var x=e[i];if(x.type==='checkbox'||x.type==='radio'){if(x.value===p[1])x.checked=true}else if(x.type!=='hidden')x.value=p[1]}})}}catch(e){}var l=document.querySelectorAll('.lf-langs a');for(var i=0;i<l.length;i++)l[i].addEventListener('click',function(){try{var d=[];new FormData(f).forEach(function(v,n){if(typeof v==='string'&&n!=='ts'&&n!=='website'&&n!=='lang')d.push([n,v])});sessionStorage.setItem(k,JSON.stringify(d))}catch(e){}});f.addEventListener('submit',function(){var b=f.querySelector('.lf-button');if(b)setTimeout(function(){b.disabled=true},0)})})();`;
