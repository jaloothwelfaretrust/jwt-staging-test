const menuButton=document.querySelector('.menu-button');const navigation=document.querySelector('#navigation');menuButton.addEventListener('click',()=>{const open=navigation.classList.toggle('open');menuButton.setAttribute('aria-expanded',String(open));menuButton.textContent=open?'✕':'☰'});navigation.querySelectorAll('a').forEach(link=>link.addEventListener('click',()=>{navigation.classList.remove('open');menuButton.setAttribute('aria-expanded','false');menuButton.textContent='☰'}));document.querySelector('#year').textContent=new Date().getFullYear();document.querySelectorAll('[data-copy]').forEach(button=>button.addEventListener('click',async()=>{try{await navigator.clipboard.writeText(button.dataset.copy);button.textContent='Copied!';setTimeout(()=>button.textContent='Copy',1800)}catch{button.textContent='Select to copy'}}));

// JWT email OTP registration interface. Public access requires a separately reviewed
// server deployment. This frontend does not bypass server-side permissions.
const JWT_REGISTRATION_ENDPOINT = "https://script.google.com/macros/s/AKfycbzfL1gDjqgW0fsRa567AzuCJrBuJD321_6EDB2i-CqtPjcjzbqQG8lKAfRgAfup-tbXzA/exec";
const jwtForm = document.getElementById('membership-form');
if (jwtForm) {
  const submit = document.getElementById('membership-submit');
  const notice = document.getElementById('membership-setup');
  const otpArea = document.getElementById('jwt-otp-area');
  const otpInput = document.getElementById('jwt-otp-code');
  const verifyButton = document.getElementById('jwt-otp-confirm');
  const resendButton = document.getElementById('jwt-otp-resend');
  const status = document.getElementById('jwt-registration-status');
  const frame = document.getElementById('jwt-registration-frame');
  let awaiting = false;
  let busy = false;
  let pendingAction = '';
  let verifiedSnapshot = null;
  let requestTimeout = null;

  function message(text, error) {
    status.textContent = text;
    status.style.color = error ? '#a52b2b' : '#075039';
    status.setAttribute('role', error ? 'alert' : 'status');
  }
  function dataSnapshot() {
    return JSON.stringify(Array.from(new FormData(jwtForm).entries()).filter(([k])=>k!=='otp'));
  }
  function submitToService(action) {
    if (busy) return;
    if (!jwtForm.reportValidity()) return;
    if (!document.getElementById('jwt-phone-full').value) {
      document.getElementById('jwt-phone-national').reportValidity(); return;
    }
    const params = new URLSearchParams(new FormData(jwtForm));
    params.set('action', action);
    if (action === 'confirm') params.set('otp', otpInput.value.trim());
    if (action === 'confirm' && !/^\d{6}$/.test(params.get('otp'))) {
      message('Enter the six-digit verification code.', true); return;
    }
    busy = true; pendingAction = action;
    submit.disabled = true; verifyButton.disabled = true; resendButton.disabled = true;
    message(action === 'request' ? 'Requesting your verification code…' : 'Verifying your code…', false);
    // Form POST to a hidden iframe avoids CORS restrictions on Apps Script web apps.
    // Never use this response to grant access; server must verify OTP and write records.
    const temp = document.createElement('form');
    temp.method = 'POST'; temp.action = JWT_REGISTRATION_ENDPOINT;
    temp.target = frame.name; temp.style.display = 'none';
    for (const [key, value] of params) {
      const input = document.createElement('input');
      input.type = 'hidden'; input.name = key; input.value = value; temp.appendChild(input);
    }
    document.body.appendChild(temp);
    requestTimeout = window.setTimeout(() => {
      if (!busy) return;
      busy = false;
      submit.disabled = false;
      verifyButton.disabled = false;
      resendButton.disabled = false;
      message('No response from the registration service. Please check your connection and try again. If you entered an OTP, check with JWT before submitting again.', true);
    }, 45000);
    try { temp.submit(); } catch (err) {
      window.clearTimeout(requestTimeout); busy = false;
      submit.disabled = false; verifyButton.disabled = false; resendButton.disabled = false;
      message('Unable to contact the registration service.', true);
    } finally { temp.remove(); }
  }
  jwtForm.addEventListener('submit', e => {
    e.preventDefault();
    if (awaiting) { message('Enter the code sent to your email, then select Verify & Complete Registration.', true); return; }
    submitToService('request');
  });
  verifyButton.addEventListener('click', () => {
    if (!awaiting) return;
    if (verifiedSnapshot !== dataSnapshot()) {
      message('Your details changed. Request a new verification code.', true);
      otpArea.hidden = true; awaiting = false; return;
    }
    submitToService('confirm');
  });
  resendButton.addEventListener('click', () => { awaiting = false; submitToService('request'); });
  window.addEventListener('message', event => {
    // Google Apps Script HTMLService runs inside googleusercontent.com iframe.
    if (event.source !== frame.contentWindow ||
        !/^https:\/\/([a-z0-9-]+\.)?googleusercontent\.com$/.test(event.origin)) return;
    const payload = event.data;
    if (!payload || payload.source !== 'jwt-membership-v1' ||
        !['otp_sent', 'registered', 'error'].includes(payload.status) || !busy) return;
    window.clearTimeout(requestTimeout);
    busy = false; submit.disabled = false; verifyButton.disabled = false; resendButton.disabled = false;
    if (payload.status === 'otp_sent' && pendingAction === 'request') {
      awaiting = true; verifiedSnapshot = dataSnapshot(); otpArea.hidden = false;
      message('A verification code has been sent. Check your email (including spam).', false);
      otpInput.focus();
    } else if (payload.status === 'registered' && pendingAction === 'confirm' &&
               /^JWT-[DVS]-2019-\d{4,}$/.test(String(payload.membershipNumber || ''))) {
      awaiting = false; otpArea.hidden = true; jwtForm.reset();
      document.getElementById('jwt-country').dispatchEvent(new Event('change'));
      submit.disabled = true;
      message('Registration successful. Your membership number is ' + payload.membershipNumber + '.', false);
    } else if (payload.status === 'error') {
      message(String(payload.message || 'Registration failed. Please try again.'), true);
    }
  });
  // Frontend ready: the server must still be made accessible and tested before
  // publishing this site. Never treat the UI as proof of backend readiness.
  notice.hidden = true;
  submit.disabled = false;
  verifyButton.disabled = false;
  resendButton.disabled = false;
}

// Country-aware phone formatting. Client-side checks are format checks, not OTP verification.
(function(){
  const form=document.getElementById('membership-form');
  const country=document.getElementById('jwt-country');
  const national=document.getElementById('jwt-phone-national');
  const full=document.getElementById('jwt-phone-full');
  const prefix=document.getElementById('phone-prefix');
  const help=document.getElementById('phone-help');
  if(!form||!country||!national||!full||!prefix||!help)return;
  const rules={
    'Pakistan':{code:'+92',pattern:/^3\d{9}$/,hint:'Enter 10 digits starting with 3, e.g. 3001234567 (omit leading 0).'},
    'Saudi Arabia':{code:'+966',pattern:/^5\d{8}$/,hint:'Enter 9 digits starting with 5, e.g. 501234567 (omit leading 0).'},
    'United Arab Emirates':{code:'+971',pattern:/^5\d{8}$/,hint:'Enter 9 digits starting with 5, e.g. 501234567 (omit leading 0).'},
    'Oman':{code:'+968',pattern:/^[279]\d{7}$/,hint:'Enter an 8-digit Omani number (Muscat uses Oman +968).'},
    'Germany':{code:'+49',pattern:/^\d{6,13}$/,hint:'Enter 6–13 digits without leading 0 or +49.'},
    'Malta':{code:'+356',pattern:/^[279]\d{7}$/,hint:'Enter an 8-digit Maltese number.'},
    'Italy':{code:'+39',pattern:/^\d{6,12}$/,hint:'Enter 6–12 digits. Italian fixed-line numbers may start with 0.'},
    'Japan':{code:'+81',pattern:/^[1-9]\d{8,9}$/,hint:'Enter 9–10 digits without leading 0 or +81.'},
    'United Kingdom':{code:'+44',pattern:/^\d{9,10}$/,hint:'Enter 9–10 digits without leading 0 or +44.'},
    'United States':{code:'+1',pattern:/^[2-9]\d{2}[2-9]\d{6}$/,hint:'Enter a 10-digit US number, e.g. 2025550123.'},
    'Other':{code:'',pattern:/^\+[1-9]\d{6,14}$/,hint:'Enter your full international number starting with +, e.g. +33123456789.'}
  };
  function update(){
    const rule=rules[country.value];
    prefix.textContent=rule&&rule.code?rule.code:'+';
    prefix.style.display=country.value==='Other'?'none':'';
    national.placeholder=country.value==='Other'?'+33123456789':'Phone number';
    help.textContent=rule?rule.hint:'Select your country first.';
    national.value='';full.value='';national.setCustomValidity('');
  }
  function validate(){
    const rule=rules[country.value];
    const raw=national.value.replace(/[\s()-]/g,'');
    if(!rule){national.setCustomValidity('Select your country.');return false;}
    const ok=rule.pattern.test(raw);
    national.setCustomValidity(ok?'':'Please enter a valid number for '+country.value+'. '+rule.hint);
    full.value=ok?(rule.code?rule.code+raw:raw):'';
    national.closest('.phone-field').classList.toggle('invalid',!ok&&raw.length>0);
    return ok;
  }
  country.addEventListener('change',update);
  national.addEventListener('input',validate);
  form.addEventListener('submit',function(event){if(!validate()){event.preventDefault();national.reportValidity();}});
  update();
})();
