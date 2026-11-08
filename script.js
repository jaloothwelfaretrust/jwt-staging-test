
const menuButton = document.querySelector('.menu-button');
const navigation = document.querySelector('#navigation');

if (menuButton && navigation) {
  menuButton.addEventListener('click', () => {
    const open = navigation.classList.toggle('open');
    menuButton.setAttribute('aria-expanded', String(open));
    menuButton.textContent = open ? '✕' : '☰';
  });

  navigation.querySelectorAll('a').forEach(link =>
    link.addEventListener('click', () => {
      navigation.classList.remove('open');
      menuButton.setAttribute('aria-expanded', 'false');
      menuButton.textContent = '☰';
    })
  );
}

const yearElement = document.querySelector('#year');
if (yearElement) {
  yearElement.textContent = new Date().getFullYear();
}

document.querySelectorAll('[data-copy]').forEach(button =>
  button.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(button.dataset.copy);
      button.textContent = 'Copied!';
      setTimeout(() => button.textContent = 'Copy', 1800);
    } catch {
      button.textContent = 'Select to copy';
    }
  })
);

// JWT STAGING MEMBERSHIP REGISTRATION — Cloudflare Worker API
// The Worker holds the bridge secret. Never put secrets in browser code.
const JWT_REGISTRATION_ENDPOINT =
  'https://jwt-staging-registration-api.jaloothwelfaretrust.workers.dev/';

const jwtForm = document.getElementById('membership-form');

if (jwtForm) {
  const submit = document.getElementById('membership-submit');
  const notice = document.getElementById('membership-setup');
  const otpArea = document.getElementById('jwt-otp-area');
  const otpInput = document.getElementById('jwt-otp-code');
  const verifyButton = document.getElementById('jwt-otp-confirm');
  const resendButton = document.getElementById('jwt-otp-resend');
  const status = document.getElementById('jwt-registration-status');

  let awaiting = false;
  let busy = false;
  let verifiedSnapshot = null;
  let registrationComplete = false;

  function message(text, error = false) {
    status.textContent = text;
    status.style.color = error ? '#a52b2b' : '#075039';
    status.setAttribute('role', error ? 'alert' : 'status');
  }

  function dataSnapshot() {
    return JSON.stringify(
      Array.from(new FormData(jwtForm).entries())
        .filter(([key]) => key !== 'otp' && key !== 'cf-turnstile-response')
    );
  }

  function unlockButtons() {
    busy = false;
    submit.disabled = registrationComplete;
    verifyButton.disabled = registrationComplete;
    resendButton.disabled = registrationComplete;
  }

  function resetTurnstile() {
    if (window.turnstile && typeof window.turnstile.reset === 'function') {
      try {
        window.turnstile.reset();
      } catch (err) {
        console.warn('Turnstile reset unavailable.');
      }
    }
  }

  async function submitToService(action) {
    if (busy || registrationComplete) return;
    if (!jwtForm.reportValidity()) return;

    const phoneFull = document.getElementById('jwt-phone-full');
    const phoneNational = document.getElementById('jwt-phone-national');

    if (!phoneFull.value) {
      phoneNational.reportValidity();
      return;
    }

    const params = new URLSearchParams(new FormData(jwtForm));
    params.set('action', action);

    if (action === 'request' && !params.get('cf-turnstile-response')) {
      message(
        'Complete the security check before requesting an email code.',
        true
      );
      return;
    }

    if (action === 'confirm') {
      params.set('otp', otpInput.value.trim());

      if (!/^\d{6}$/.test(params.get('otp'))) {
        message('Enter the six-digit verification code.', true);
        return;
      }
    }

    busy = true;
    submit.disabled = true;
    verifyButton.disabled = true;
    resendButton.disabled = true;

    message(
      action === 'request'
        ? 'Requesting your verification code…'
        : 'Verifying your code…'
    );

    const controller = new AbortController();
    const timeout = window.setTimeout(
      () => controller.abort(),
      40000
    );

    try {
      const response = await fetch(JWT_REGISTRATION_ENDPOINT, {
        method: 'POST',
        mode: 'cors',
        headers: {
          'Content-Type':
            'application/x-www-form-urlencoded;charset=UTF-8'
        },
        body: params.toString(),
        signal: controller.signal,
        cache: 'no-store'
      });

      const payload = await response.json();

      if (
        !payload ||
        payload.source !== 'jwt-membership-v1' ||
        !['otp_sent', 'registered', 'error'].includes(payload.status)
      ) {
        throw new Error(
          'Unexpected response from registration service.'
        );
      }

      if (action === 'request') {
        resetTurnstile();
      }

      if (
        payload.status === 'otp_sent' &&
        action === 'request'
      ) {
        awaiting = true;
        verifiedSnapshot = dataSnapshot();
        otpArea.hidden = false;

        message(
          'A verification code has been sent. ' +
          'Check your email (including spam).'
        );

        otpInput.focus();

      } else if (
        payload.status === 'registered' &&
        action === 'confirm' &&
        /^JWT-[DVS]-2019-\d{4,}$/.test(
          String(payload.membershipNumber || '')
        )
      ) {
        awaiting = false;
        registrationComplete = true;
        otpArea.hidden = true;
        jwtForm.reset();

        document.getElementById('jwt-country')
          .dispatchEvent(new Event('change'));

        message(
          'Registration successful. Your membership number is ' +
          payload.membershipNumber + '.'
        );

      } else if (payload.status === 'error') {
        message(
          String(
            payload.message ||
            'Registration failed. Please try again.'
          ),
          true
        );

      } else {
        throw new Error(
          'Unexpected registration response. ' +
          'Contact JWT before trying again.'
        );
      }

    } catch (err) {
      console.error(
        'JWT registration request failed:',
        err.name
      );

      if (action === 'request') {
        resetTurnstile();
      }

      message(
        err.name === 'AbortError'
          ? 'The registration request timed out. ' +
            'Check your email before requesting another code.'
          : 'Could not complete the registration request. ' +
            'Check your connection. If you were verifying an OTP, ' +
            'contact JWT before trying again.',
        true
      );

    } finally {
      window.clearTimeout(timeout);
      unlockButtons();
    }
  }

  jwtForm.addEventListener('submit', event => {
    event.preventDefault();

    if (awaiting) {
      message(
        'Enter the code sent to your email, ' +
        'then select Verify & Complete Registration.',
        true
      );
      return;
    }

    submitToService('request');
  });

  verifyButton.addEventListener('click', () => {
    if (!awaiting) return;

    if (verifiedSnapshot !== dataSnapshot()) {
      message(
        'Your details changed. ' +
        'Request a new verification code.',
        true
      );

      otpArea.hidden = true;
      awaiting = false;
      return;
    }

    submitToService('confirm');
  });

  resendButton.addEventListener('click', () => {
    if (busy || registrationComplete) return;

    // Keep the verification panel open until a replacement code is sent.
    submitToService('request');
  });

  notice.hidden = true;
  submit.disabled = false;
  verifyButton.disabled = false;
  resendButton.disabled = false;
}

// COUNTRY-AWARE PHONE VALIDATION
(function () {
  const form = document.getElementById('membership-form');
  const country = document.getElementById('jwt-country');
  const national = document.getElementById('jwt-phone-national');
  const full = document.getElementById('jwt-phone-full');
  const prefix = document.getElementById('phone-prefix');
  const help = document.getElementById('phone-help');

  if (!form || !country || !national || !full || !prefix || !help) {
    return;
  }

  const rules = {
    'Pakistan': {
      code: '+92',
      pattern: /^3\d{9}$/,
      hint: 'Enter 10 digits starting with 3, e.g. 3001234567 (omit leading 0).'
    },
    'Saudi Arabia': {
      code: '+966',
      pattern: /^5\d{8}$/,
      hint: 'Enter 9 digits starting with 5, e.g. 501234567 (omit leading 0).'
    },
    'United Arab Emirates': {
      code: '+971',
      pattern: /^5\d{8}$/,
      hint: 'Enter 9 digits starting with 5, e.g. 501234567 (omit leading 0).'
    },
    'Oman': {
      code: '+968',
      pattern: /^[279]\d{7}$/,
      hint: 'Enter an 8-digit Omani number (Muscat uses Oman +968).'
    },
    'Germany': {
      code: '+49',
      pattern: /^\d{6,13}$/,
      hint: 'Enter 6–13 digits without leading 0 or +49.'
    },
    'Malta': {
      code: '+356',
      pattern: /^[279]\d{7}$/,
      hint: 'Enter an 8-digit Maltese number.'
    },
    'Italy': {
      code: '+39',
      pattern: /^\d{6,12}$/,
      hint: 'Enter 6–12 digits. Italian fixed-line numbers may start with 0.'
    },
    'Japan': {
      code: '+81',
      pattern: /^[1-9]\d{8,9}$/,
      hint: 'Enter 9–10 digits without leading 0 or +81.'
    },
    'United Kingdom': {
      code: '+44',
      pattern: /^\d{9,10}$/,
      hint: 'Enter 9–10 digits without leading 0 or +44.'
    },
    'United States': {
      code: '+1',
      pattern: /^[2-9]\d{2}[2-9]\d{6}$/,
      hint: 'Enter a 10-digit US number, e.g. 2025550123.'
    },
    'Other': {
      code: '',
      pattern: /^\+[1-9]\d{6,14}$/,
      hint: 'Enter your full international number starting with +, e.g. +33123456789.'
    }
  };

  function update() {
    const rule = rules[country.value];

    prefix.textContent = rule && rule.code ? rule.code : '+';
    prefix.style.display = country.value === 'Other' ? 'none' : '';

    national.placeholder =
      country.value === 'Other'
        ? '+33123456789'
        : 'Phone number';

    help.textContent = rule
      ? rule.hint
      : 'Select your country first.';

    national.value = '';
    full.value = '';
    national.setCustomValidity('');
  }

  function validate() {
    const rule = rules[country.value];
    const raw = national.value.replace(/[\s()-]/g, '');

    if (!rule) {
      national.setCustomValidity('Select your country.');
      return false;
    }

    const ok = rule.pattern.test(raw);

    national.setCustomValidity(
      ok
        ? ''
        : 'Please enter a valid number for ' +
          country.value + '. ' + rule.hint
    );

    full.value = ok
      ? (rule.code ? rule.code + raw : raw)
      : '';

    national.closest('.phone-field')
      .classList.toggle('invalid', !ok && raw.length > 0);

    return ok;
  }

  country.addEventListener('change', update);
  national.addEventListener('input', validate);

  form.addEventListener('submit', function (event) {
    if (!validate()) {
      event.preventDefault();
      national.reportValidity();
    }
  });

  update();
})();
