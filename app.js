
const $ = (s) => document.querySelector(s);
const $$ = (s) => document.querySelectorAll(s);
const auth = firebase.auth();
const db = firebase.firestore();

let currentUser = null, currentProfile = null, currentLevel = null, currentData = null, flashIndex = 0, reflectionIndex = 0, exerciseIndex = 0;
let localState = JSON.parse(localStorage.getItem('hsk_app_local_state') || '{}');

$$('.tab').forEach(btn => btn.addEventListener('click', () => {
  $$('.tab').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  $$('.auth-form').forEach(f => f.classList.remove('active'));
  document.getElementById(btn.dataset.tab + 'Form').classList.add('active');
}));

function toast(msg){ const n = $('#notice'); if (n) n.textContent = msg; }
function saveLocal(){ localStorage.setItem('hsk_app_local_state', JSON.stringify(localState)); }

function createPetals(){
  const layer = document.getElementById('sakuraLayer');
  if (!layer) return;
  const count = window.innerWidth < 520 ? 16 : 28;
  for(let i=0;i<count;i++){
    const p = document.createElement('span');
    p.className = 'petal';
    p.style.left = Math.random()*100 + 'vw';
    p.style.animationDuration = (10 + Math.random()*10) + 's';
    p.style.animationDelay = (-Math.random()*8) + 's';
    p.style.opacity = (0.4 + Math.random()*0.45).toFixed(2);
    p.style.transform = 'scale(' + (0.7 + Math.random()*0.8).toFixed(2) + ')';
    layer.appendChild(p);
  }
}
createPetals();

function getChineseVoice(){
  const voices = speechSynthesis.getVoices();
  return voices.find(v => (v.lang || '').toLowerCase().includes('zh')) || voices.find(v => /ting|mei|siri/i.test(v.name || '')) || null;
}
function speak(text){
  if (!text) return;
  const utter = new SpeechSynthesisUtterance(text);
  utter.lang = 'zh-CN'; utter.rate = 0.92; utter.pitch = 1;
  const voice = getChineseVoice(); if (voice) utter.voice = voice;
  speechSynthesis.cancel(); speechSynthesis.speak(utter);
}
speechSynthesis.onvoiceschanged = () => console.log('Voices loaded:', speechSynthesis.getVoices());
document.body.addEventListener('click', () => { speechSynthesis.getVoices(); }, { once: true });

async function ensureUserProfile(user){
  const ref = db.collection('users').doc(user.uid);
  const doc = await ref.get();
  if (doc.exists) return doc.data();
  const adminSnap = await db.collection('users').where('role','==','admin').limit(1).get();
  const role = adminSnap.empty ? 'admin' : 'user';
  const profile = {
    email: user.email,
    role,
    status: 'active',
    vipLevels: role === 'admin' ? ['HSK1','HSK2','HSK3','HSK4','HSK5','HSK6','HSK7','HSK8','HSK9','HSKK'] : ['HSK1'],
    createdAt: firebase.firestore.FieldValue.serverTimestamp()
  };
  await ref.set(profile);
  return profile;
}

$('#registerBtn')?.addEventListener('click', async () => {
  const email = $('#registerEmail')?.value?.trim();
  const password = $('#registerPassword')?.value?.trim();
  if (!email || !password) { toast('Vui lòng nhập email và mật khẩu.'); return; }
  const btn = $('#registerBtn'); btn.disabled = true; btn.textContent = 'Đang đăng ký...';
  try {
    const userCred = await auth.createUserWithEmailAndPassword(email, password);
    const profile = await ensureUserProfile(userCred.user);
    toast(profile.role === 'admin' ? 'Đăng ký thành công. Đây là tài khoản Admin đầu tiên.' : 'Đăng ký thành công.');
  } catch (err) {
    console.error('REGISTER ERROR:', err);
    if (err.code === 'auth/email-already-in-use') {
      toast('Email đã tồn tại. Hãy chuyển sang đăng nhập.');
      document.querySelector('[data-tab="login"]')?.click();
    } else {
      toast(err.message || 'Đăng ký thất bại.');
    }
  } finally {
    btn.disabled = false; btn.textContent = 'Đăng ký';
  }
});

$('#loginBtn')?.addEventListener('click', async () => {
  const email = $('#loginEmail')?.value?.trim();
  const password = $('#loginPassword')?.value?.trim();
  if (!email || !password) { toast('Vui lòng nhập email và mật khẩu.'); return; }
  const btn = $('#loginBtn'); btn.disabled = true; btn.textContent = 'Đang đăng nhập...';
  try {
    const userCred = await auth.signInWithEmailAndPassword(email, password);
    const profile = await ensureUserProfile(userCred.user);
    if (profile && profile.status === 'locked') {
      await auth.signOut(); toast('Tài khoản của bạn đang bị khóa.'); return;
    }
    toast(profile.role === 'admin' ? 'Đăng nhập Admin thành công.' : 'Đăng nhập thành công.');
  } catch (err) {
    console.error('LOGIN ERROR:', err);
    toast(err.message || 'Đăng nhập thất bại.');
  } finally {
    btn.disabled = false; btn.textContent = 'Đăng nhập';
  }
});

$('#logoutBtn')?.addEventListener('click', async () => { await auth.signOut(); });
$('#refreshProfileBtn')?.addEventListener('click', async () => {
  if (!currentUser) return;
  currentProfile = await ensureUserProfile(currentUser);
  renderAppShell();
  if (currentProfile.role === 'admin') loadUsers();
  toast('Đã làm mới quyền tài khoản.');
});

auth.onAuthStateChanged(async (user) => {
  currentUser = user || null;
  if (!user) {
    $('#authView')?.classList.remove('hidden');
    $('#appView')?.classList.add('hidden');
    document.body.classList.remove('learning');
    return;
  }
  try {
    currentProfile = await ensureUserProfile(user);
    $('#authView')?.classList.add('hidden');
    $('#appView')?.classList.remove('hidden');
    renderAppShell();
    if (currentProfile.role === 'admin') loadUsers();
    if (localState.lastLevel) openLevel(localState.lastLevel);
  } catch (err) {
    console.error('AUTH STATE ERROR:', err);
    toast('Không tải được hồ sơ người dùng.');
  }
});

function renderAppShell(){
  $('#userName').textContent = currentUser?.email || '...';
  $('#userRole').textContent = currentProfile?.role === 'admin' ? 'Admin' : 'User';
  $('#adminView').classList.toggle('hidden', currentProfile?.role !== 'admin');
  renderLevelGrid();
}
function userCanAccess(level){
  if (!currentProfile) return false;
  if (currentProfile.role === 'admin') return true;
  return (currentProfile.vipLevels || []).includes(level);
}
function renderLevelGrid(){
  const levels = ['HSK1','HSK2','HSK3','HSK4','HSK5','HSK6','HSK7','HSK8','HSK9','HSKK'];
  $('#levelGrid').innerHTML = levels.map(level => {
    const open = userCanAccess(level);
    return `<div class="level-card ${open ? '' : 'locked'}" data-level="${level}">
      <div class="level-title">${level}</div>
      <div class="level-tag">${open ? ((level === 'HSK1' && currentProfile.role !== 'admin') ? 'Free' : 'Mở') : 'Khóa'}</div>
      <div>${open ? 'Bấm để học ngay' : 'Liên hệ Admin để mở quyền'}</div>
    </div>`;
  }).join('');
  $$('#levelGrid .level-card').forEach(card => card.addEventListener('click', () => {
    const level = card.dataset.level;
    if (!userCanAccess(level)) { toast('Cấp độ này đang khóa. Liên hệ Admin để mua và cấp quyền sử dụng.'); return; }
    openLevel(level);
  }));
}

async function openLevel(level){
  try {
    const res = await fetch(`data/${level.toLowerCase()}.json`);
    currentData = await res.json();
    currentLevel = level;
    localState.lastLevel = level; saveLocal();
    document.body.classList.add('learning');
    $('#learningView').classList.remove('hidden');
    $('#learningTitle').textContent = level;
    renderTyping();
    renderFlashcards(true);
    renderReflection(true);
    renderDialogues();
    renderExercises(true);
    renderHistory();
    selectModule(localState.lastModule || 'typing');
    await logActivity('open_level', { level });
  } catch (err) {
    console.error(err); toast('Không tải được dữ liệu cấp độ.');
  }
}

function selectModule(name){
  $$('.module-tab').forEach(btn => btn.classList.toggle('active', btn.dataset.module === name));
  $$('.module-view').forEach(v => v.classList.remove('active'));
  const el = document.getElementById('module' + name.charAt(0).toUpperCase() + name.slice(1));
  if (el) el.classList.add('active');
  localState.lastModule = name; saveLocal();
}
$$('.module-tab').forEach(btn => btn.addEventListener('click', ()=> selectModule(btn.dataset.module)));

function normalize(s){ return (s || '').trim().toLowerCase(); }

function renderTyping(){
  const items = currentData.typing_practice || [];
  const saved = (localState.typingAnswers || {})[currentLevel] || {};
  $('#moduleTyping').innerHTML = `
    <div class="typing-table-wrap">
      <table class="typing-table">
        <thead><tr><th>STT</th><th>Hán tự</th><th>Pinyin</th><th>Nghĩa tiếng Việt</th><th>Ôn tập</th><th>Kết quả</th></tr></thead>
        <tbody>
          ${items.map((item, idx) => {
            const value = saved[item.id] || '';
            let text = 'Đoán Xem', cls = 'neutral';
            if (value) {
              const ok = [item.hanzi, item.pinyin, item.meaning_vi].map(normalize).includes(normalize(value));
              text = ok ? 'Đúng rồi' : 'Học lại đi';
              cls = ok ? 'ok' : 'bad';
            }
            return `<tr>
              <td>${idx+1}</td>
              <td class="hanzi">${item.hanzi}</td>
              <td class="small-pinyin">${item.pinyin}</td>
              <td>${item.meaning_vi}</td>
              <td><input class="text-input typing-answer" data-id="${item.id}" value="${value}" placeholder="Nhập ôn tập"></td>
              <td><span class="result-chip ${cls}" id="typing-result-${item.id}">${text}</span></td>
            </tr>`;
          }).join('')}
        </tbody>
      </table>
    </div>`;
  $$('.typing-answer').forEach(input => {
    input.addEventListener('input', async () => {
      localState.typingAnswers = localState.typingAnswers || {};
      localState.typingAnswers[currentLevel] = localState.typingAnswers[currentLevel] || {};
      localState.typingAnswers[currentLevel][input.dataset.id] = input.value;
      saveLocal();
      const item = items.find(x => String(x.id) === String(input.dataset.id));
      const ok = input.value && [item.hanzi,item.pinyin,item.meaning_vi].map(normalize).includes(normalize(input.value));
      const result = document.getElementById('typing-result-' + input.dataset.id);
      result.className = 'result-chip ' + (input.value ? (ok ? 'ok' : 'bad') : 'neutral');
      result.textContent = !input.value ? 'Đoán Xem' : ok ? 'Đúng rồi' : 'Học lại đi';
      await saveProgress('typing', { level: currentLevel, itemId: item.id, answer: input.value, correct: !!ok });
    });
  });
}

function shuffledDeck(arr){
  const clone = [...arr];
  for (let i = clone.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [clone[i], clone[j]] = [clone[j], clone[i]];
  }
  return clone;
}
function renderFlashcards(reset=false){
  const items = currentData.flashcards || [];
  if (reset || !localState.flashcards?.[currentLevel]) {
    localState.flashcards = localState.flashcards || {};
    localState.flashcards[currentLevel] = { deck: shuffledDeck(items).map(x => x.id), index: 0 };
    saveLocal();
  }
  const state = localState.flashcards[currentLevel];
  const ordered = state.deck.map(id => items.find(x => x.id === id)).filter(Boolean);
  flashIndex = state.index || 0;
  const item = ordered[flashIndex] || ordered[0];
  if (!item) return;
  $('#moduleFlashcards').innerHTML = `
    <div class="flashcard">
      <div class="hanzi">${item.hanzi}</div>
      <div class="small-pinyin">${item.pinyin}</div>
      <div class="meaning">${item.meaning_vi}</div>
      <div class="controls">
        <button class="btn secondary" id="speakFlashBtn">🔊 Phát âm</button>
        <button class="btn secondary" id="prevFlashBtn">← Trước</button>
        <button class="btn gold" id="nextFlashBtn">Tiếp →</button>
      </div>
    </div>`;
  $('#speakFlashBtn').onclick = () => speak(item.audio_text || item.hanzi);
  $('#prevFlashBtn').onclick = () => { state.index = Math.max(0, flashIndex - 1); saveLocal(); renderFlashcards(); };
  $('#nextFlashBtn').onclick = async () => { state.index = flashIndex + 1 >= ordered.length ? 0 : flashIndex + 1; saveLocal(); await saveProgress('flashcards', { level: currentLevel, itemId: item.id }); renderFlashcards(); };
}

function renderReflection(reset=false){
  const arr = currentData.reflection || [];
  if (!arr.length) return;
  if (reset || !localState.reflection?.[currentLevel]) { localState.reflection = localState.reflection || {}; localState.reflection[currentLevel] = { index: 0 }; saveLocal(); }
  reflectionIndex = localState.reflection[currentLevel].index || 0;
  const item = arr[reflectionIndex % arr.length];
  $('#moduleReflection').innerHTML = `
    <div class="reflection-box">
      <div class="small-label">Câu tiếng Việt</div>
      <div class="meaning">${item.vi}</div>
      <div class="progress-bar"><div id="reflectionBar" style="width:0%"></div></div>
      <div id="reflectionReveal" class="hidden">
        <div class="hanzi">${item.hanzi}</div>
        <div class="small-pinyin">${item.pinyin}</div>
        <div class="controls">
          <button class="btn secondary" id="speakReflectionBtn">🔊 Phát âm</button>
          <button class="btn gold" id="nextReflectionBtn">Câu tiếp</button>
        </div>
      </div>
    </div>`;
  let t = 0;
  const timer = setInterval(() => {
    t += 300; $('#reflectionBar').style.width = Math.min(100, t/30) + '%';
    if (t >= 3000) { clearInterval(timer); $('#reflectionReveal').classList.remove('hidden'); speak(item.audio_text || item.hanzi); }
  }, 300);
  $('#speakReflectionBtn').onclick = ()=> speak(item.audio_text || item.hanzi);
  $('#nextReflectionBtn').onclick = async ()=> {
    localState.reflection[currentLevel].index = (reflectionIndex + 1) % arr.length; saveLocal();
    await saveProgress('reflection', { level: currentLevel, itemId: reflectionIndex });
    renderReflection();
  };
}

function renderDialogues(){
  const items = currentData.dialogues || [];
  $('#moduleDialogues').innerHTML = items.map(d => `
    <div class="dialogue-box">
      <h3>${d.title}</h3>
      ${d.conversation.map(line => `<div class="dialogue-line">
        <strong>${line.speaker}</strong> · <span class="hanzi" style="font-size:22px">${line.hanzi}</span><br>
        <span class="small-pinyin">${line.pinyin}</span><br>
        <span>${line.meaning_vi}</span><br>
        <button class="btn secondary dialogue-speak" data-speak="${line.audio_text || line.hanzi}">🔊 Phát âm</button>
      </div>`).join('')}
    </div>`).join('');
  $$('.dialogue-speak').forEach(btn => btn.onclick = ()=> speak(btn.dataset.speak));
}

function renderExercises(reset=false){
  const arr = currentData.exercises || [];
  if (!arr.length) return;
  if (reset || !localState.exercises?.[currentLevel]) { localState.exercises = localState.exercises || {}; localState.exercises[currentLevel] = { index:0, score:0, answers:{} }; saveLocal(); }
  const state = localState.exercises[currentLevel];
  exerciseIndex = state.index || 0;
  const q = arr[exerciseIndex];
  if (!q) return;
  let body = '';
  if (q.type === 'single_choice') {
    body = q.options.map(opt => `<button class="btn secondary exercise-option" data-opt="${opt}">${opt}</button>`).join('');
  } else {
    body = `<input id="fillAnswer" class="text-input" placeholder="Nhập đáp án"><button class="btn gold" id="submitFillBtn">Nộp</button>`;
  }
  $('#moduleExercises').innerHTML = `<div class="exercise-box">
    <div class="small-label">Câu ${exerciseIndex + 1}/${arr.length}</div>
    <h3>${q.question}</h3>
    ${q.sentence ? `<div class="meaning" style="margin-bottom:12px">${q.sentence}</div>` : ''}
    <div>${body}</div>
    <div id="exerciseFeedback" class="notice hidden"></div>
  </div>`;
  const feedback = (ok) => {
    $('#exerciseFeedback').classList.remove('hidden');
    $('#exerciseFeedback').textContent = (ok ? 'Đúng. ' : 'Sai. ') + q.explanation;
  };
  const nextQ = () => setTimeout(() => { state.index = exerciseIndex + 1 >= arr.length ? 0 : exerciseIndex + 1; saveLocal(); renderExercises(); }, 1200);

  if (q.type === 'single_choice') {
    $$('.exercise-option').forEach(btn => btn.onclick = async () => {
      const ok = btn.dataset.opt === q.answer;
      if (ok) state.score += 1;
      state.answers[exerciseIndex] = btn.dataset.opt;
      feedback(ok);
      await saveProgress('exercises', { level: currentLevel, index: exerciseIndex, answer: btn.dataset.opt, correct: ok });
      nextQ();
    });
  } else {
    $('#submitFillBtn').onclick = async () => {
      const val = $('#fillAnswer').value.trim();
      const ok = (q.accepted_answers || [q.answer]).includes(val);
      if (ok) state.score += 1;
      state.answers[exerciseIndex] = val;
      feedback(ok);
      await saveProgress('exercises', { level: currentLevel, index: exerciseIndex, answer: val, correct: ok });
      nextQ();
    };
  }
}

async function loadHistory(){
  if (!currentUser) return [];
  try {
    const snap = await db.collection('activity').doc(currentUser.uid).collection('items').orderBy('createdAt','desc').limit(20).get();
    return snap.docs.map(d => d.data());
  } catch (err) {
    console.error(err);
    return [];
  }
}
async function renderHistory(){
  const items = await loadHistory();
  $('#moduleHistory').innerHTML = `<div class="history-box">${
    items.length ? items.map(x => `<div class="dialogue-line"><strong>${x.type}</strong> · ${x.level || ''}<br><span class="small-pinyin">${x.message || ''}</span></div>`).join('') : 'Chưa có lịch sử.'
  }</div>`;
}

async function logActivity(type, payload={}){
  if (!currentUser) return;
  try {
    await db.collection('activity').doc(currentUser.uid).collection('items').add({
      type, level: payload.level || currentLevel || '', message: payload.message || '',
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    });
  } catch (err) { console.error(err); }
}
async function saveProgress(module, payload){
  if (!currentUser) return;
  try {
    await db.collection('progress').doc(currentUser.uid).set({
      lastLevel: currentLevel, lastModule: localState.lastModule || module,
      updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
      ['modules.' + module]: payload
    }, { merge: true });
  } catch (err) { console.error(err); }
}

async function loadUsers(){
  const filter = $('#userFilter').value;
  const wrap = $('#userTableWrap');
  wrap.innerHTML = 'Đang tải user...';
  try {
    const snap = await db.collection('users').get();
    let users = snap.docs.map(d => ({ id:d.id, ...d.data() }));
    if (filter === 'admin') users = users.filter(u => u.role === 'admin');
    if (filter === 'user') users = users.filter(u => u.role === 'user');
    if (filter === 'locked') users = users.filter(u => u.status === 'locked');
    if (filter === 'vip') users = users.filter(u => (u.vipLevels || []).length > 1);
    wrap.innerHTML = `<div style="overflow:auto"><table class="user-table">
      <thead><tr><th>Email</th><th>Role</th><th>Trạng thái</th><th>Quyền HSK</th><th>Hành động</th></tr></thead>
      <tbody>
      ${users.map(u => `<tr>
        <td>${u.email || ''}</td>
        <td>${u.role || 'user'}</td>
        <td>${u.status || 'active'}</td>
        <td><div class="vip-grid">
          ${['HSK1','HSK2','HSK3','HSK4','HSK5','HSK6','HSK7','HSK8','HSK9','HSKK'].map(level => `<label><input type="checkbox" class="vip-check" data-uid="${u.id}" data-level="${level}" ${((u.vipLevels || []).includes(level)) ? 'checked' : ''}> ${level}</label>`).join('')}
        </div></td>
        <td><button class="btn secondary toggle-lock" data-uid="${u.id}" data-status="${u.status || 'active'}">${(u.status || 'active') === 'locked' ? 'Mở khóa' : 'Khóa'}</button></td>
      </tr>`).join('')}
      </tbody></table></div>`;
    wrap.querySelectorAll('.toggle-lock').forEach(btn => btn.onclick = async () => {
      const next = btn.dataset.status === 'locked' ? 'active' : 'locked';
      await db.collection('users').doc(btn.dataset.uid).set({ status: next }, { merge: true });
      toast(next === 'locked' ? 'Đã khóa tài khoản.' : 'Đã mở khóa tài khoản.');
      loadUsers();
    });
    wrap.querySelectorAll('.vip-check').forEach(chk => chk.onchange = async () => {
      const uid = chk.dataset.uid;
      const rowChecks = [...wrap.querySelectorAll(`.vip-check[data-uid="${uid}"]`)];
      const vipLevels = rowChecks.filter(x => x.checked).map(x => x.dataset.level);
      await db.collection('users').doc(uid).set({ vipLevels }, { merge: true });
      toast('Đã cập nhật quyền HSK.');
    });
  } catch (err) {
    console.error(err);
    wrap.innerHTML = 'Không tải được danh sách user.';
  }
}
$('#reloadUsersBtn')?.addEventListener('click', loadUsers);
$('#userFilter')?.addEventListener('change', loadUsers);

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(console.error));
}
