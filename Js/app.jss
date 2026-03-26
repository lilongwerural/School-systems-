// ============================================================
// CONFIG — Set your Supabase credentials here
// ============================================================
const SUPABASE_URL = window.ENV_SUPABASE_URL || 'YOUR_SUPABASE_URL';
const SUPABASE_ANON_KEY = window.ENV_SUPABASE_ANON_KEY || 'YOUR_SUPABASE_ANON_KEY';

const { createClient } = supabase;
const db = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ============================================================
// STATE
// ============================================================
let currentUser = null;
let currentProfile = null;
let currentSchool = null;
let allSchoolsCache = [];

const PAGE_SIZE = 50;
let myStudentsPage = 1;
let allStudentsPage = 1;

// ============================================================
// UTILS
// ============================================================
function toast(msg, type = 'default') {
  const el = document.createElement('div');
  el.className = `toast toast-${type}`;
  el.textContent = msg;
  document.getElementById('toast-container').appendChild(el);
  setTimeout(() => el.remove(), 4000);
}

function setLoading(btnId, loading) {
  const btn = document.getElementById(btnId);
  if (!btn) return;
  if (loading) {
    btn.dataset.originalText = btn.innerHTML;
    btn.innerHTML = '<span class="loading-spinner"></span> Please wait...';
    btn.disabled = true;
  } else {
    btn.innerHTML = btn.dataset.originalText || btn.innerHTML;
    btn.disabled = false;
  }
}

function showError(containerId, msg) {
  const el = document.getElementById(containerId);
  if (el) el.innerHTML = `<div class="alert alert-error"><span>⚠</span>${msg}</div>`;
}

function clearMsg(containerId) {
  const el = document.getElementById(containerId);
  if (el) el.innerHTML = '';
}

function showSuccess(containerId, msg) {
  const el = document.getElementById(containerId);
  if (el) el.innerHTML = `<div class="alert alert-success"><span>✓</span>${msg}</div>`;
}

function populateYearDropdowns() {
  const currentYear = new Date().getFullYear();
  const years = [];
  for (let y = 2019; y <= currentYear + 5; y++) years.push(y);

  const futureYears = years.filter(y => y >= 2027);
  const allYears = years;

  // Add student form — only 2027+
  const sYear = document.getElementById('s-year');
  futureYears.forEach(y => {
    const opt = document.createElement('option');
    opt.value = y;
    opt.textContent = y;
    sYear.appendChild(opt);
  });

  // Filters — all years
  ['my-students-year-filter','search-year','admin-year-filter','export-year','export-school-year'].forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    allYears.forEach(y => {
      const opt = document.createElement('option');
      opt.value = y;
      opt.textContent = y;
      el.appendChild(opt);
    });
  });
}

function renderTableRows(tbodyId, rows, emptyMessage = 'No records found') {
  const tbody = document.getElementById(tbodyId);
  if (!tbody) return;
  if (!rows || rows.length === 0) {
    tbody.innerHTML = `<tr><td colspan="20"><div class="empty-state"><div class="empty-state-icon">📭</div><div class="empty-state-text">${emptyMessage}</div></div></td></tr>`;
    return;
  }
  tbody.innerHTML = rows;
}

function sourceBadge(src) {
  if (src === 'imported') return '<span class="badge badge-blue">Imported</span>';
  return '<span class="badge badge-green">System</span>';
}

function statusBadge(status) {
  if (!status || status === 'Active') return '<span class="badge badge-green">Active</span>';
  if (status === 'Transferred') return '<span class="badge badge-blue">Transferred</span>';
  if (status === 'Dropped') return '<span class="badge badge-gold">Dropped</span>';
  if (status === 'Inactive') return '<span class="badge badge-navy">Inactive</span>';
  return `<span class="badge badge-navy">${status}</span>`;
}

function renderPagination(containerId, total, page, pageSize, onPageClick) {
  const container = document.getElementById(containerId);
  if (!container) return;
  const totalPages = Math.ceil(total / pageSize);
  if (totalPages <= 1) { container.innerHTML = ''; return; }

  let html = '';
  html += `<button class="pagination-btn" ${page <= 1 ? 'disabled' : ''} onclick="${onPageClick}(${page - 1})">‹ Prev</button>`;
  const start = Math.max(1, page - 2);
  const end = Math.min(totalPages, page + 2);
  if (start > 1) html += `<button class="pagination-btn" onclick="${onPageClick}(1)">1</button><span style="padding:6px">…</span>`;
  for (let i = start; i <= end; i++) {
    html += `<button class="pagination-btn ${i === page ? 'active' : ''}" onclick="${onPageClick}(${i})">${i}</button>`;
  }
  if (end < totalPages) html += `<span style="padding:6px">…</span><button class="pagination-btn" onclick="${onPageClick}(${totalPages})">${totalPages}</button>`;
  html += `<button class="pagination-btn" ${page >= totalPages ? 'disabled' : ''} onclick="${onPageClick}(${page + 1})">Next ›</button>`;
  container.innerHTML = html;
}

// ============================================================
// AUTH
// ============================================================
async function handleLogin() {
  const email = document.getElementById('login-email').value.trim();
  const password = document.getElementById('login-password').value;
  clearMsg('login-error');

  if (!email || !password) { showError('login-error', 'Please enter email and password.'); return; }

  // Check credentials are configured
  if (!SUPABASE_URL || SUPABASE_URL === 'YOUR_SUPABASE_URL') {
    showError('login-error', 'System not configured. Contact your District Office.');
    return;
  }

  setLoading('login-btn', true);

  try {
    // Add 10 second timeout
    const loginPromise = db.auth.signInWithPassword({ email, password });
    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject(new Error('Connection timed out. Check your internet and try again.')), 10000)
    );

    const { data, error } = await Promise.race([loginPromise, timeoutPromise]);
    setLoading('login-btn', false);

    if (error) { showError('login-error', error.message); return; }
    await initApp(data.user);
  } catch (err) {
    setLoading('login-btn', false);
    showError('login-error', err.message || 'Login failed. Please try again.');
  }
}

async function handleLogout() {
  await db.auth.signOut();
  location.reload();
}

// ============================================================
// INIT
// ============================================================
async function initApp(user) {
  currentUser = user;

  // Fetch profile using maybeSingle to avoid PGRST116 errors
  let currentProfileData = null;
  try {
    const { data: profile } = await db.from('profiles').select('*').eq('id', user.id).maybeSingle();
    currentProfileData = profile;
  } catch(e) {
    console.warn('Profile fetch exception:', e);
  }

  // Fallback: derive role from email if profile missing
  if (!currentProfileData) {
    const isAdmin = user.email === 'admin@llre.emis';
    currentProfileData = {
      id: user.id,
      email: user.email,
      role: isAdmin ? 'admin' : 'school',
      emis_number: isAdmin ? null : user.email.split('@')[0]
    };
  }
  currentProfile = currentProfileData;

  // Show app
  document.getElementById('login-page').classList.add('hidden');
  document.getElementById('app').classList.add('active');

  document.getElementById('topbar-user-name').textContent = user.email;
  document.getElementById('topbar-user-role').textContent = currentProfile?.role === 'admin' ? 'Administrator' : 'School User';

  if (currentProfile?.role === 'admin') {
    document.getElementById('admin-nav').classList.remove('hidden');
    document.getElementById('school-nav').classList.add('hidden');
    await loadAdminDropdowns();
    showPage('admin-dashboard');
  } else {
    document.getElementById('school-nav').classList.remove('hidden');
    await loadSchoolInfo(currentProfile.emis_number);
    showPage('school-dashboard');
  }

  populateYearDropdowns();
  loadAllSchoolsCache();
}

async function loadSchoolInfo(emisNumber) {
  const { data: school } = await db.from('schools').select('*').eq('emis_number', emisNumber).single();
  currentSchool = school;

  if (school) {
    document.getElementById('banner-school-name').textContent = school.school_name;
    document.getElementById('banner-zone').textContent = 'Zone: ' + school.zone;
    document.getElementById('banner-district').textContent = 'District: ' + school.district;
    document.getElementById('banner-emis').textContent = school.emis_number;
    document.getElementById('topbar-user-name').textContent = school.school_name;
  }

  loadSchoolStats();
  populateLINSearchYears();
}

async function loadSchoolStats() {
  if (!currentProfile?.emis_number) return;
  const emis = currentProfile.emis_number;
  const year = new Date().getFullYear().toString();

  const [{ count: total }, { count: currentYearCount }, boys, girls] = await Promise.all([
    db.from('students').select('*', { count: 'exact', head: true }).eq('emis_number', emis),
    db.from('students').select('*', { count: 'exact', head: true }).eq('emis_number', emis).eq('year', year),
    db.from('students').select('*', { count: 'exact', head: true }).eq('emis_number', emis).eq('sex', 'M'),
    db.from('students').select('*', { count: 'exact', head: true }).eq('emis_number', emis).eq('sex', 'F'),
  ]);

  document.getElementById('stat-total').textContent = (total || 0).toLocaleString();
  document.getElementById('stat-current-year').textContent = (currentYearCount || 0).toLocaleString();
  document.getElementById('stat-boys').textContent = (boys.count || 0).toLocaleString();
  document.getElementById('stat-girls').textContent = (girls.count || 0).toLocaleString();
}

// Populate year dropdown on dashboard with available years for this school
async function populateLINSearchYears() {
  if (!currentProfile?.emis_number) return;
  const { data } = await db.from('students')
    .select('year')
    .eq('emis_number', currentProfile.emis_number)
    .order('year', { ascending: false });

  const years = [...new Set((data || []).map(r => r.year))];
  const sel = document.getElementById('lin-search-year');
  if (!sel) return;
  // Clear existing options except first
  while (sel.options.length > 1) sel.remove(1);
  years.forEach(y => {
    const opt = document.createElement('option');
    opt.value = y; opt.textContent = y;
    sel.appendChild(opt);
  });
}

// Debounced input handler
let linSearchTimeout;
function handleLINSearchInput() {
  clearTimeout(linSearchTimeout);
  const q = document.getElementById('lin-search-name').value.trim();
  if (q.length >= 2) {
    linSearchTimeout = setTimeout(performLINSearch, 350);
  } else if (q.length === 0) {
    document.getElementById('lin-results-container').innerHTML = '';
  }
}

async function performLINSearch() {
  const name = document.getElementById('lin-search-name').value.trim().toUpperCase();
  const year = document.getElementById('lin-search-year').value;
  const container = document.getElementById('lin-results-container');

  if (!name && !year) { container.innerHTML = ''; return; }

  container.innerHTML = `<div style="text-align:center;padding:24px"><div class="loading-spinner loading-spinner-dark"></div></div>`;

  let query = db.from('students').select('*')
    .eq('emis_number', currentProfile.emis_number);

  if (year) query = query.eq('year', year);
  if (name) query = query.or(`surname.ilike.%${name}%,name.ilike.%${name}%`);

  query = query.order('year', { ascending: false }).order('surname').limit(50);

  const { data, error } = await query;

  if (error) {
    container.innerHTML = `<div class="alert alert-error"><span>⚠</span>${error.message}</div>`;
    return;
  }

  if (!data || data.length === 0) {
    container.innerHTML = `
      <div class="card">
        <div class="empty-state" style="padding:40px">
          <div class="empty-state-icon">🔍</div>
          <div class="empty-state-text">No learner found for "<strong>${name}</strong>"${year ? ' in ' + year : ''}</div>
          <div class="text-sm text-muted" style="margin-top:8px">Check the spelling or try a different year</div>
        </div>
      </div>`;
    return;
  }

  // Render result cards — large LIN display
  const cards = data.map(s => `
    <div class="lin-result-card" onclick="selectLINResult(this)" style="
      background:var(--white);
      border:2px solid var(--gray-100);
      border-radius:var(--radius);
      padding:16px 20px;
      margin-bottom:10px;
      cursor:pointer;
      transition:all 0.15s;
      display:flex;
      align-items:center;
      justify-content:space-between;
      flex-wrap:wrap;
      gap:12px;
    "
    onmouseover="this.style.borderColor='var(--gold)';this.style.background='rgba(240,165,0,0.03)'"
    onmouseout="this.style.borderColor='var(--gray-100)';this.style.background='var(--white)'">
      <div>
        <div style="font-size:13px;color:var(--gray-500);margin-bottom:2px;">
          ${s.surname} ${s.name} &bull; ${s.sex || '—'} &bull; ${s.class || '—'} &bull; ${s.year}
        </div>
        <div style="font-family:var(--font-heading);font-size:28px;font-weight:800;color:var(--navy);letter-spacing:1px;">
          ${s.student_id}
        </div>
      </div>
      <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;">
        ${sourceBadge(s.source)}
        <button class="btn btn-primary btn-sm" onclick="event.stopPropagation();copyLIN('${s.student_id}', this)">
          📋 Copy LIN
        </button>
      </div>
    </div>`).join('');

  container.innerHTML = `
    <div style="font-size:13px;color:var(--gray-500);margin-bottom:10px;">
      ${data.length} learner${data.length !== 1 ? 's' : ''} found
    </div>
    ${cards}`;
}

function copyLIN(lin, btn) {
  navigator.clipboard.writeText(lin).then(() => {
    const orig = btn.innerHTML;
    btn.innerHTML = '✓ Copied!';
    btn.style.background = 'var(--green)';
    setTimeout(() => { btn.innerHTML = orig; btn.style.background = ''; }, 2000);
  }).catch(() => {
    // Fallback for older browsers
    const ta = document.createElement('textarea');
    ta.value = lin;
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    ta.remove();
    toast('LIN copied: ' + lin, 'success');
  });
}

function selectLINResult(card) {
  // Highlight selected card
  document.querySelectorAll('.lin-result-card').forEach(c => {
    c.style.borderColor = 'var(--gray-100)';
    c.style.background = 'var(--white)';
  });
  card.style.borderColor = 'var(--gold)';
  card.style.background = 'rgba(240,165,0,0.05)';
}

// ============================================================
// NAVIGATION
// ============================================================
function showPage(page) {
  document.querySelectorAll('.page-panel').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));

  const panel = document.getElementById(`panel-${page}`);
  if (panel) panel.classList.add('active');

  const navItem = document.querySelector(`[data-page="${page}"]`);
  if (navItem) navItem.classList.add('active');

  closeSidebar();

  // Lazy-load page data
  if (page === 'school-dashboard') { populateLINSearchYears(); document.getElementById('lin-search-name')?.focus(); }
  if (page === 'teachers') loadTeachers();
  if (page === 'my-students') { myStudentsPage = 1; loadMyStudents(); }
  if (page === 'all-students') { allStudentsPage = 1; loadAllStudents(); }
  if (page === 'all-schools') loadAllSchools();
  if (page === 'admin-dashboard') loadAdminDashboard();
  if (page === 'export') loadExportDropdowns();
  if (page === 'import-csv') resetImportPanel();
}

function toggleSidebar() {
  const sidebar = document.getElementById('sidebar');
  const overlay = document.getElementById('overlay');
  sidebar.classList.toggle('open');
  overlay.classList.toggle('active');
}

function closeSidebar() {
  document.getElementById('sidebar').classList.remove('open');
  document.getElementById('overlay').classList.remove('active');
}

// ============================================================
// ADD STUDENT
// ============================================================
document.addEventListener('input', function(e) {
  if (['s-year','s-surname','s-name','s-sex','s-age','s-class'].includes(e.target.id)) {
    updateIDPreview();
  }
});

async function updateIDPreview() {
  const year = document.getElementById('s-year').value;
  if (!year || !currentProfile?.emis_number) {
    document.getElementById('preview-id').textContent = 'Fill form to preview';
    return;
  }
  const nextSeq = await getNextSequence(currentProfile.emis_number, year);
  const seq = String(nextSeq).padStart(4, '0');
  document.getElementById('preview-id').textContent = `${year}16${currentProfile.emis_number}${seq}`;
}

async function getNextSequence(emisNumber, year) {
  const { data } = await db.from('students')
    .select('student_id')
    .eq('emis_number', emisNumber)
    .eq('year', year)
    .order('student_id', { ascending: false })
    .limit(1);

  if (!data || data.length === 0) return 1;
  const lastId = data[0].student_id;
  const lastSeq = parseInt(lastId.slice(-4)) || 0;
  return lastSeq + 1;
}

async function handleAddStudent() {
  clearMsg('add-student-error');
  clearMsg('add-student-success');

  const year = document.getElementById('s-year').value;
  const surname = document.getElementById('s-surname').value.trim().toUpperCase();
  const name = document.getElementById('s-name').value.trim().toUpperCase();
  const sex = document.getElementById('s-sex').value;
  const age = parseInt(document.getElementById('s-age').value);
  const cls = document.getElementById('s-class').value;
  const status = document.getElementById('s-status').value || 'Active';
  const phone = document.getElementById('s-phone').value.trim();

  // Validate
  if (!year || !surname || !name || !sex || !age || !cls) {
    showError('add-student-error', 'All fields are required.'); return;
  }
  if (isNaN(age) || age < 4 || age > 25) {
    showError('add-student-error', 'Age must be a number between 4 and 25.'); return;
  }

  setLoading('add-student-btn', true);

  const emis = currentProfile.emis_number;
  const zone = currentSchool?.zone || '';
  const seq = await getNextSequence(emis, year);
  const studentId = `${year}16${emis}${String(seq).padStart(4, '0')}`;

  // Check duplicate
  const { data: existing } = await db.from('students').select('id').eq('student_id', studentId).single();
  if (existing) {
    showError('add-student-error', 'A student with this ID already exists. Please try again.');
    setLoading('add-student-btn', false); return;
  }

  const { error } = await db.from('students').insert({
    student_id: studentId,
    emis_number: emis,
    zone: zone,
    year: year,
    surname: surname,
    name: name,
    sex: sex,
    age: age,
    class: cls,
    status: status,
    parent_phone: phone,
    source: 'system'
  });

  setLoading('add-student-btn', false);

  if (error) {
    showError('add-student-error', error.message); return;
  }

  showSuccess('add-student-success', `✓ Student registered successfully! ID: ${studentId}`);
  toast('Student registered: ' + studentId, 'success');
  resetStudentForm();
  loadSchoolStats();
  populateLINSearchYears();
}

function resetStudentForm() {
  ['s-year','s-surname','s-name','s-sex','s-age','s-class','s-status','s-phone'].forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    if (el.tagName === 'SELECT') {
      el.value = id === 's-status' ? 'Active' : '';
    } else {
      el.value = '';
    }
  });
  document.getElementById('preview-id').textContent = 'Fill form to preview';
}

// ============================================================
// MY STUDENTS
// ============================================================
asyn
