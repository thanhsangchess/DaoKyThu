(function(){
 var done=false;
 function init(){
  if(done)return;
  var btn=document.querySelector('#accountOverlay .vqc-login-submit');
  var idEl=document.getElementById('accountLoginId');
  var pw=document.getElementById('accountLoginPassword');
  var err=document.getElementById('accountLoginError');
  var caps=document.getElementById('vqcLoginCaps');
  var original=window.accountSignIn;
  if(!btn||!idEl||!pw||typeof original!=='function')return;
  done=true;
  var label=btn.querySelector('.vqc-login-submit-label');
  var busy=false;
  function setBusy(on){
   busy=on;btn.disabled=on;btn.classList.toggle('loading',on);
   if(label)label.textContent=on?'Đang đăng nhập…':'Đăng nhập';
   btn.setAttribute('aria-busy',on?'true':'false');
  }
  window.accountSignIn=async function(){
   if(busy)return;
   if(!idEl.value.trim()||!pw.value){
    if(err)err.textContent=!idEl.value.trim()?'Hãy nhập tên đăng nhập.':'Hãy nhập mật khẩu.';
    (!idEl.value.trim()?idEl:pw).focus();
    return;
   }
   setBusy(true);
   try{return await original.apply(this,arguments);}
   finally{setBusy(false);}
  };
  function clearError(){if(err&&err.textContent)err.textContent='';}
  idEl.addEventListener('input',clearError);
  pw.addEventListener('input',clearError);
  function checkCaps(e){
   if(!caps||!e||typeof e.getModifierState!=='function')return;
   caps.hidden=!e.getModifierState('CapsLock');
  }
  pw.addEventListener('keydown',checkCaps);
  pw.addEventListener('keyup',checkCaps);
  pw.addEventListener('blur',function(){if(caps)caps.hidden=true;});
 }
 init();
 if(!done){
  document.addEventListener('DOMContentLoaded',init);
  window.addEventListener('load',init);
 }
})();
