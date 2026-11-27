/* LeitDim – animierter Startbildschirm */
(function () {
  const B = window.LD_BRAND;
  const mark = document.getElementById('mark');
  mark.style.setProperty('--len', B.arcLen);
  mark.innerHTML = `<defs>${B.coreDefs}</defs>
    <circle class="track" cx="128" cy="128" r="92" stroke-dasharray="${B.arcLen} ${B.circ}" transform="rotate(135 128 128)"/>
    ${B.markInnerDark}
    <circle class="sweep" cx="128" cy="128" r="92" stroke-dasharray="34 ${B.circ}" transform="rotate(135 128 128)"/>`;
  const wm = document.getElementById('wm');
  wm.setAttribute('viewBox', `0 0 ${B.wordmarkDark.w} 50`);
  wm.setAttribute('preserveAspectRatio', 'xMinYMid meet');
  wm.setAttribute('width', Math.round((B.wordmarkDark.w * 52) / 50));
  wm.innerHTML = B.wordmarkDark.svg;

  const params = new URLSearchParams(location.search);
  document.getElementById('ver').textContent = 'Version ' + (params.get('v') || '');

  const steps = ['Strombelastbarkeit · NIN 5.2.3 Tab. 4–15', 'Umrechnungsfaktoren Temperatur & Häufung', 'Kennlinien Schmelzsicherungen gG / LS', 'Oberfläche wird vorbereitet …'];
  const st = document.getElementById('status');
  const bar = document.getElementById('bar');
  let i = 0;
  function next() {
    if (i >= steps.length) return;
    st.classList.add('fade');
    setTimeout(() => { st.textContent = steps[i]; st.classList.remove('fade'); bar.style.width = 18 + i * 22 + '%'; i++; }, 180);
  }
  setTimeout(next, 250);
  const timer = setInterval(() => { if (i < steps.length) next(); else clearInterval(timer); }, 420);
  // vom Hauptprozess aufgerufen, sobald das Hauptfenster bereit ist
  window.ldSplashDone = function () {
    clearInterval(timer);
    st.textContent = 'Bereit';
    bar.style.width = '100%';
    setTimeout(() => document.getElementById('card').classList.add('out'), 260);
    return true;
  };
})();
