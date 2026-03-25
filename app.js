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
async function loadMyStudents(page) {
  if (page) myStudentsPage = page;
  const emis = currentProfile?.emis_number;
  if (!emis) return;

  const yearF = document.getElementById('my-students-year-filter').value;
  const classF = document.getElementById('my-students-class-filter').value;
  const sexF = document.getElementById('my-students-sex-filter').value;

  document.getElementById('my-students-body').innerHTML = `<tr><td colspan="8"><div class="empty-state"><div class="loading-spinner loading-spinner-dark"></div></div></td></tr>`;

  let query = db.from('students').select('*', { count: 'exact' }).eq('emis_number', emis);
  if (yearF) query = query.eq('year', yearF);
  if (classF) query = query.eq('class', classF);
  if (sexF) query = query.eq('sex', sexF);

  const from = (myStudentsPage - 1) * PAGE_SIZE;
  query = query.order('student_id', { ascending: false }).range(from, from + PAGE_SIZE - 1);

  const { data, count, error } = await query;
  if (error) { toast('Error loading students: ' + error.message, 'error'); return; }

  const rows = (data || []).map(s => `
    <tr>
      <td style="font-family:monospace;font-size:12px">${s.student_id}</td>
      <td>${s.surname}</td>
      <td>${s.name}</td>
      <td>${s.sex}</td>
      <td>${s.age}</td>
      <td>${s.class}</td>
      <td>${s.year}</td>
      <td>${statusBadge(s.status)}</td>
      <td>${s.parent_phone || '—'}</td>
      <td>${sourceBadge(s.source)}</td>
    </tr>`).join('');

  renderTableRows('my-students-body', rows);
  renderPagination('my-students-pagination', count, myStudentsPage, PAGE_SIZE, 'loadMyStudents');
}

// ============================================================
// SEARCH
// ============================================================
let searchTimeout;
function handleSearchInput() {
  clearTimeout(searchTimeout);
  searchTimeout = setTimeout(performSearch, 400);
}

async function performSearch() {
  const query = document.getElementById('search-query').value.trim();
  const year = document.getElementById('search-year').value;

  if (!query && !year) {
    document.getElementById('search-results-body').innerHTML = `<tr><td colspan="9"><div class="empty-state"><div class="empty-state-icon">🔍</div><div class="empty-state-text">Enter a name or student ID to search</div></div></td></tr>`;
    return;
  }

  document.getElementById('search-results-body').innerHTML = `<tr><td colspan="9"><div class="empty-state"><div class="loading-spinner loading-spinner-dark"></div></div></td></tr>`;

  let dbQuery = db.from('students').select(`*, schools(school_name)`).limit(100);

  // School users: restrict to their EMIS
  if (currentProfile?.role !== 'admin') {
    dbQuery = dbQuery.eq('emis_number', currentProfile.emis_number);
  }

  if (year) dbQuery = dbQuery.eq('year', year);

  if (query) {
    // Try student ID first, then name
    const isId = /^\d+$/.test(query);
    if (isId) {
      dbQuery = dbQuery.ilike('student_id', `%${query}%`);
    } else {
      dbQuery = dbQuery.or(`surname.ilike.%${query}%,name.ilike.%${query}%`);
    }
  }

  dbQuery = dbQuery.order('student_id', { ascending: false });

  const { data, error } = await dbQuery;
  if (error) { toast('Search error: ' + error.message, 'error'); return; }

  const rows = (data || []).map(s => `
    <tr>
      <td style="font-family:monospace;font-size:12px">${s.student_id}</td>
      <td>${s.surname}</td>
      <td>${s.name}</td>
      <td>${s.sex}</td>
      <td>${s.age}</td>
      <td>${s.class}</td>
      <td>${s.year}</td>
      <td>${statusBadge(s.status)}</td>
      <td>${s.parent_phone || '—'}</td>
      <td>${s.schools?.school_name || s.emis_number}</td>
      <td>${sourceBadge(s.source)}</td>
    </tr>`).join('');

  renderTableRows('search-results-body', rows, 'No students match your search');
}

// ============================================================
// ADMIN DASHBOARD
// ============================================================
async function loadAdminDashboard() {
  const [
    { count: total },
    { count: imported_ },
    { count: system_ },
    { data: schools }
  ] = await Promise.all([
    db.from('students').select('*', { count: 'exact', head: true }),
    db.from('students').select('*', { count: 'exact', head: true }).eq('source', 'imported'),
    db.from('students').select('*', { count: 'exact', head: true }).eq('source', 'system'),
    db.from('schools').select('emis_number')
  ]);

  document.getElementById('admin-stat-total').textContent = (total || 0).toLocaleString();
  document.getElementById('admin-stat-schools').textContent = (schools?.length || 0).toLocaleString();
  document.getElementById('admin-stat-imported').textContent = (imported_ || 0).toLocaleString();
  document.getElementById('admin-stat-system').textContent = (system_ || 0).toLocaleString();

  // Zone summary
  const { data: zoneData } = await db.rpc('get_zone_summary').catch(() => ({ data: null }));
  if (!zoneData) {
    // Fallback: direct query
    const { data: students } = await db.from('students').select('zone, emis_number');
    if (students) {
      const zoneMap = {};
      students.forEach(s => {
        if (!zoneMap[s.zone]) zoneMap[s.zone] = { count: 0, emis: new Set() };
        zoneMap[s.zone].count++;
        zoneMap[s.zone].emis.add(s.emis_number);
      });
      const zoneRows = Object.entries(zoneMap).sort((a, b) => b[1].count - a[1].count).map(([zone, v]) =>
        `<tr><td><strong>${zone}</strong></td><td>${v.count.toLocaleString()}</td><td>${v.emis.size}</td></tr>`
      ).join('');
      document.getElementById('admin-zone-summary').innerHTML = zoneRows || '<tr><td colspan="3" style="text-align:center;color:var(--gray-300)">No data</td></tr>';
    }
  }

  // Year summary
  const { data: yearStudents } = await db.from('students').select('year, source');
  if (yearStudents) {
    const yearMap = {};
    yearStudents.forEach(s => {
      if (!yearMap[s.year]) yearMap[s.year] = { count: 0, source: s.source };
      yearMap[s.year].count++;
    });
    const yearRows = Object.entries(yearMap).sort((a, b) => b[0].localeCompare(a[0])).map(([year, v]) =>
      `<tr><td><strong>${year}</strong></td><td>${v.count.toLocaleString()}</td><td>${sourceBadge(v.source)}</td></tr>`
    ).join('');
    document.getElementById('admin-year-summary').innerHTML = yearRows || '<tr><td colspan="3" style="text-align:center;color:var(--gray-300)">No data</td></tr>';
  }
}

// ============================================================
// ADMIN - ALL STUDENTS
// ============================================================
async function loadAllStudents(page) {
  if (page) allStudentsPage = page;

  document.getElementById('all-students-body').innerHTML = `<tr><td colspan="10"><div class="empty-state"><div class="loading-spinner loading-spinner-dark"></div></div></td></tr>`;

  const zoneF = document.getElementById('admin-zone-filter').value;
  const yearF = document.getElementById('admin-year-filter').value;
  const schoolF = document.getElementById('admin-school-filter').value;

  let query = db.from('students').select('*', { count: 'exact' });
  if (zoneF) query = query.eq('zone', zoneF);
  if (yearF) query = query.eq('year', yearF);
  if (schoolF) query = query.eq('emis_number', schoolF);

  const from = (allStudentsPage - 1) * PAGE_SIZE;
  query = query.order('student_id', { ascending: false }).range(from, from + PAGE_SIZE - 1);

  const { data, count, error } = await query;
  if (error) { toast('Error: ' + error.message, 'error'); return; }

  const rows = (data || []).map(s => `
    <tr>
      <td style="font-family:monospace;font-size:12px">${s.student_id}</td>
      <td>${s.surname}</td>
      <td>${s.name}</td>
      <td>${s.sex}</td>
      <td>${s.age}</td>
      <td>${s.class}</td>
      <td>${s.year}</td>
      <td>${statusBadge(s.status)}</td>
      <td>${s.parent_phone || '—'}</td>
      <td style="font-family:monospace;font-size:12px">${s.emis_number}</td>
      <td>${s.zone}</td>
      <td>${sourceBadge(s.source)}</td>
    </tr>`).join('');

  renderTableRows('all-students-body', rows);
  renderPagination('all-students-pagination', count, allStudentsPage, PAGE_SIZE, 'loadAllStudents');
}

// ============================================================
// ADMIN - ALL SCHOOLS
// ============================================================
async function loadAllSchoolsCache() {
  const { data } = await db.from('schools').select('*').order('zone').order('school_name');
  allSchoolsCache = data || [];
}

async function loadAllSchools() {
  const zoneF = document.getElementById('schools-zone-filter')?.value;

  let schools = allSchoolsCache;
  if (zoneF) schools = schools.filter(s => s.zone === zoneF);

  // Get student counts
  const { data: counts } = await db.from('students').select('emis_number');
  const countMap = {};
  (counts || []).forEach(s => { countMap[s.emis_number] = (countMap[s.emis_number] || 0) + 1; });

  const rows = schools.map(s => `
    <tr>
      <td style="font-family:monospace">${s.emis_number}</td>
      <td><strong>${s.school_name}</strong></td>
      <td><span class="badge badge-navy">${s.zone}</span></td>
      <td>${s.district}</td>
      <td>${(countMap[s.emis_number] || 0).toLocaleString()}</td>
    </tr>`).join('');

  renderTableRows('all-schools-body', rows, 'No schools found');
}

async function loadAdminDropdowns() {
  await loadAllSchoolsCache();

  const zones = [...new Set(allSchoolsCache.map(s => s.zone))].sort();

  ['admin-zone-filter','schools-zone-filter','export-zone'].forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    zones.forEach(z => {
      const opt = document.createElement('option');
      opt.value = z; opt.textContent = z;
      el.appendChild(opt);
    });
  });

  ['admin-school-filter','export-school'].forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    allSchoolsCache.forEach(s => {
      const opt = document.createElement('option');
      opt.value = s.emis_number;
      opt.textContent = `${s.school_name} (${s.emis_number})`;
      el.appendChild(opt);
    });
  });
}

function loadExportDropdowns() {
  // Zones already loaded in loadAdminDropdowns
}

// ============================================================
// CSV IMPORT
// ============================================================
function resetImportPanel() {
  // Reset the import panel state when navigating to it
  const statusEl = document.getElementById('csv-upload-status');
  const progressEl = document.getElementById('csv-progress');
  if (statusEl) statusEl.innerHTML = '';
  if (progressEl) progressEl.classList.add('hidden');
}

async function handleCSVUpload(event) {
  const files = Array.from(event.target.files);
  if (!files.length) return;

  const statusEl = document.getElementById('csv-upload-status');
  const progressEl = document.getElementById('csv-progress');
  const progressBar = document.getElementById('csv-progress-bar');
  const progressText = document.getElementById('csv-progress-text');
  const progressPct = document.getElementById('csv-progress-pct');

  progressEl.classList.remove('hidden');
  statusEl.innerHTML = '';

  let totalInserted = 0;
  let totalSkipped = 0;
  let totalErrors = 0;
  const errorDetails = [];

  for (let fi = 0; fi < files.length; fi++) {
    const file = files[fi];
    progressText.textContent = `Processing: ${file.name}`;
    const pct = Math.round((fi / files.length) * 100);
    progressBar.style.width = pct + '%';
    progressPct.textContent = pct + '%';

    try {
      const text = await file.text();
      const rows = parseCSV(text);

      const BATCH = 100;
      for (let i = 0; i < rows.length; i += BATCH) {
        const batch = [];

        for (const r of rows.slice(i, i + BATCH)) {
          const mapped = mapCSVRow(r);
          if (!mapped) { totalSkipped++; continue; }
          batch.push(mapped);
        }

        if (batch.length === 0) continue;

        const { error } = await db.from('students').upsert(batch, {
          onConflict: 'student_id',
          ignoreDuplicates: false  // update if exists
        });

        if (error) {
          totalErrors += batch.length;
          errorDetails.push(error.message);
        } else {
          totalInserted += batch.length;
        }
      }
    } catch (err) {
      totalErrors++;
      errorDetails.push(`${file.name}: ${err.message}`);
      console.error(err);
    }
  }

  progressBar.style.width = '100%';
  progressPct.textContent = '100%';
  progressText.textContent = 'Complete!';

  let msg = `Import complete: <strong>${totalInserted.toLocaleString()} records saved</strong>`;
  if (totalSkipped > 0) msg += `, ${totalSkipped} rows skipped (missing LIN)`;
  if (totalErrors > 0) msg += `, ${totalErrors} errors`;

  const alertType = totalErrors > 0 && totalInserted === 0 ? 'alert-error' : 'alert-success';
  const icon = totalErrors > 0 && totalInserted === 0 ? '⚠' : '✓';
  statusEl.innerHTML = `<div class="alert ${alertType}"><span>${icon}</span><div>${msg}${errorDetails.length ? '<br/><span class="text-sm">' + errorDetails.slice(0,3).join('<br/>') + '</span>' : ''}</div></div>`;
  toast(`Imported ${totalInserted} records`, 'success');

  event.target.value = '';
}

// Maps a CSV row to the students table format.
// Accepts original format: Zone, School, Surname, Name, LIN
// Also accepts old format:  student_id, emis_number, zone, year, surname, name, sex, age, class
function mapCSVRow(r) {
  // Detect format by checking for LIN column
  const lin = (r.lin || r.LIN || r['learner identification number'] || '').toString().trim().replace(/\s/g, '');
  const hasLIN = lin.length === 16 && /^\d{16}$/.test(lin);

  let student_id, emis_number, zone, year, surname, name, sex, age, cls;

  if (hasLIN) {
    // === ORIGINAL FORMAT: Zone, School, Surname, Name, Sex, Age, Class, LIN ===
    student_id  = lin;
    year        = lin.substring(0, 4);          // digits 1-4
    emis_number = lin.substring(6, 12);         // digits 7-12
    zone        = (r.zone || r.Zone || r.ZONE || '').toString().trim().toUpperCase();
    surname     = (r.surname || r.Surname || r.SURNAME || '').toString().trim().toUpperCase();
    name        = (r.name || r.Name || r.NAME || r['first name'] || r['firstname'] || '').toString().trim().toUpperCase();
    sex         = (r.sex || r.Sex || r.SEX || r.gender || r.Gender || '').toString().trim().toUpperCase();
    age         = parseInt(r.age || r.Age || r.AGE || r.AGE) || 0;
    cls         = (r.class || r.Class || r.CLASS || r.grade || r.Grade || r.standard || r.Standard || '').toString().trim();
  } else {
    // === OLD FORMAT: student_id, emis_number, zone, year, surname, name ... ===
    student_id  = (r.student_id || r.studentid || r['student id'] || '').toString().trim();
    emis_number = (r.emis_number || r.emis || r['emis number'] || '').toString().trim();
    zone        = (r.zone || r.Zone || '').toString().trim().toUpperCase();
    year        = (r.year || r.Year || '').toString().trim();
    surname     = (r.surname || r.Surname || '').toString().trim().toUpperCase();
    name        = (r.name || r.Name || '').toString().trim().toUpperCase();
    sex         = (r.sex || r.Sex || '').toString().trim().toUpperCase();
    age         = parseInt(r.age || r.Age) || 0;
    cls         = (r.class || r.Class || '').toString().trim();

    if (!student_id || !emis_number) return null;
  }

  // Final validation — must have student_id and emis_number
  if (!student_id || student_id.length < 6) return null;
  if (!emis_number || emis_number.length !== 6) return null;

  // If zone is blank, try to look it up from the schools cache
  if (!zone && allSchoolsCache.length) {
    const school = allSchoolsCache.find(s => s.emis_number === emis_number);
    if (school) zone = school.zone;
  }

  const status = (r.status || r.Status || r.STATUS || 'Active').toString().trim();
  const phone = (r.parent_phone || r.phone || r.Phone || r['parent phone'] || r['guardian phone'] || '').toString().trim();

  return {
    student_id,
    emis_number,
    zone:         zone || 'UNKNOWN',
    year:         year || student_id.substring(0, 4),
    surname:      surname || '',
    name:         name || '',
    sex:          ['M','F'].includes(sex) ? sex : '',
    age:          isNaN(age) ? 0 : age,
    class:        cls || '',
    status:       status || 'Active',
    parent_phone: phone || '',
    source:       'imported'
  };
}

function parseCSV(text) {
  const lines = text.trim().split('\n');
  if (lines.length < 2) return [];
  const headers = lines[0].split(',').map(h => h.trim().replace(/^["']|["']$/g, '').toLowerCase());
  return lines.slice(1).map(line => {
    const values = line.split(',').map(v => v.trim().replace(/^["']|["']$/g, ''));
    const obj = {};
    headers.forEach((h, i) => { obj[h] = values[i] || ''; });
    return obj;
  });
}

function downloadCSVTemplate() {
  const template = `Zone,School,Surname,Name,LIN,Sex,Age,Class\nCHOWO,Chowo Primary School,BANDA,CHISOMO,2020165004000001,F,8,STD 1\nCHOWO,Chowo Primary School,PHIRI,KONDWANI,2020165004000002,M,9,STD 2\nNKHOMA,Nkhoma Primary School,MWALE,TADALA,2020164564500003,F,10,STD 3`;
  const blob = new Blob([template], { type: 'text/csv' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'llre_emis_csv_template.csv';
  a.click();
}

// ============================================================
// EXPORT
// ============================================================
async function buildExportData(emisFilter, yearFilter, zoneFilter) {
  let query = db.from('students').select(`*, schools(school_name, zone, district)`);
  if (emisFilter) query = query.eq('emis_number', emisFilter);
  if (yearFilter) query = query.eq('year', yearFilter);
  if (zoneFilter) query = query.eq('zone', zoneFilter);
  query = query.order('emis_number').order('year').order('student_id');

  const { data, error } = await query;
  if (error) { toast('Export error: ' + error.message, 'error'); return null; }
  return data;
}

function dataToWorkbook(data) {
  const rows = [['Student ID','Year','EMIS','School Name','Zone','Surname','Name','Sex','Age','Class','Status','Parent Phone','Source']];
  (data || []).forEach(s => {
    rows.push([
      s.student_id,
      s.year,
      s.emis_number,
      s.schools?.school_name || '',
      s.zone,
      s.surname,
      s.name,
      s.sex,
      s.age,
      s.class,
      s.status || '',
      s.parent_phone || '',
      s.source
    ]);
  });
  return rows;
}

async function exportData(format) {
  const zone = document.getElementById('export-zone').value;
  const year = document.getElementById('export-year').value;
  toast('Preparing export...', 'default');
  const data = await buildExportData(null, year, zone);
  if (!data) return;
  downloadExport(data, format, `LLRE_EMIS_Export${zone ? '_' + zone : ''}${year ? '_' + year : ''}`);
}

async function exportSchool(format) {
  const emis = document.getElementById('export-school').value;
  const year = document.getElementById('export-school-year').value;
  if (!emis) { toast('Please select a school', 'error'); return; }
  toast('Preparing school export...', 'default');
  const data = await buildExportData(emis, year, null);
  if (!data) return;
  const school = allSchoolsCache.find(s => s.emis_number === emis);
  downloadExport(data, format, `LLRE_${school?.school_name || emis}${year ? '_' + year : ''}`);
}

async function exportMyStudents() {
  const emis = currentProfile?.emis_number;
  if (!emis) return;
  toast('Preparing export...', 'default');
  const data = await buildExportData(emis, null, null);
  if (!data) return;
  downloadExport(data, 'xlsx', `LLRE_${currentSchool?.school_name || emis}`);
}

async function exportAllStudents() {
  const zone = document.getElementById('admin-zone-filter').value;
  const year = document.getElementById('admin-year-filter').value;
  const emis = document.getElementById('admin-school-filter').value;
  toast('Preparing full export...', 'default');
  const data = await buildExportData(emis || null, year, zone);
  if (!data) return;
  downloadExport(data, 'xlsx', `LLRE_EMIS_AllStudents`);
}

function downloadExport(data, format, filename) {
  const rows = dataToWorkbook(data);
  if (format === 'csv') {
    const csvContent = rows.map(r => r.map(v => `"${String(v || '').replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename + '.csv';
    a.click();
  } else {
    const ws = XLSX.utils.aoa_to_sheet(rows);
    // Style header row
    ws['!cols'] = [20,8,12,30,15,20,20,6,6,10,12].map(w => ({ wch: w }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Students');
    XLSX.writeFile(wb, filename + '.xlsx');
  }
  toast(`Export complete: ${data.length} records`, 'success');
}


// ============================================================
// TEACHERS
// ============================================================
let teachersCache = [];

function toggleTeacherForm() {
  const body = document.getElementById('teacher-form-body');
  if (body) body.style.display = body.style.display === 'none' ? '' : 'none';
}

async function loadTeachers() {
  const emis = currentProfile?.emis_number;
  const isAdmin = currentProfile?.role === 'admin';

  document.getElementById('teachers-subtitle').textContent =
    isAdmin ? 'All teacher records across LLRE' : `Teacher records for your school`;

  let query = db.from('teachers').select('*').order('surname');
  if (!isAdmin && emis) query = query.eq('emis_number', emis);

  const { data, error } = await query;
  if (error) { toast('Error loading teachers: ' + error.message, 'error'); return; }

  teachersCache = data || [];
  renderTeachersTable(teachersCache);
}

function filterTeachers() {
  const q = document.getElementById('teacher-search').value.trim().toUpperCase();
  if (!q) { renderTeachersTable(teachersCache); return; }
  const filtered = teachersCache.filter(t =>
    (t.surname + ' ' + t.name).toUpperCase().includes(q)
  );
  renderTeachersTable(filtered);
}

function renderTeachersTable(data) {
  const tbody = document.getElementById('teachers-body');
  if (!data || data.length === 0) {
    tbody.innerHTML = `<tr><td colspan="10"><div class="empty-state"><div class="empty-state-icon">👨‍🏫</div><div class="empty-state-text">No teachers found. Add the first teacher above.</div></div></td></tr>`;
    return;
  }
  tbody.innerHTML = data.map(t => `
    <tr>
      <td><strong>${t.surname}</strong></td>
      <td>${t.name}</td>
      <td>${t.sex || '—'}</td>
      <td><span class="badge badge-navy">${t.responsibility || '—'}</span></td>
      <td><span class="badge badge-gold">${t.grade || '—'}</span></td>
      <td>${t.qualification || '—'}</td>
      <td style="font-family:monospace;font-size:12px">${t.emp_number || '—'}</td>
      <td>${t.phone || '—'}</td>
      <td>${t.remarks ? `<span class="badge ${t.remarks === 'Available' ? 'badge-green' : 'badge-blue'}">${t.remarks}</span>` : '—'}</td>
      <td>
        <button class="btn btn-ghost btn-sm" onclick="editTeacher('${t.id}')">✏ Edit</button>
        <button class="btn btn-danger btn-sm" onclick="deleteTeacher('${t.id}')">✕</button>
      </td>
    </tr>`).join('');
}

function editTeacher(id) {
  const t = teachersCache.find(t => t.id === id);
  if (!t) return;

  const fields = {
    't-surname': t.surname, 't-name': t.name, 't-sex': t.sex,
    't-national-id': t.national_id, 't-emp-no': t.emp_number,
    't-phone': t.phone, 't-responsibility': t.responsibility,
    't-std-teaching': t.standard_teaching, 't-dev-drop': t.dev_drop,
    't-grade': t.grade, 't-qualification': t.qualification,
    't-marital': t.marital_status, 't-dob': t.dob?.split('T')[0] || '',
    't-intake': t.intake, 't-date-appt': t.date_first_appointment?.split('T')[0] || '',
    't-date-grade': t.date_present_grade?.split('T')[0] || '',
    't-village': t.village, 't-ta': t.traditional_authority,
    't-district': t.district, 't-remarks': t.remarks
  };

  Object.entries(fields).forEach(([id, val]) => {
    const el = document.getElementById(id);
    if (el) el.value = val || '';
  });

  document.getElementById('t-editing-id').value = id;
  document.getElementById('save-teacher-btn').textContent = 'Update Teacher';

  // Show form and scroll to it
  const body = document.getElementById('teacher-form-body');
  if (body) body.style.display = '';
  document.getElementById('add-teacher-card').scrollIntoView({ behavior: 'smooth' });
}

async function deleteTeacher(id) {
  if (!confirm('Delete this teacher record?')) return;
  const { error } = await db.from('teachers').delete().eq('id', id);
  if (error) { toast('Error: ' + error.message, 'error'); return; }
  toast('Teacher deleted', 'success');
  loadTeachers();
}

async function handleSaveTeacher() {
  clearMsg('teacher-form-error');
  clearMsg('teacher-form-success');

  const surname = document.getElementById('t-surname').value.trim().toUpperCase();
  const name    = document.getElementById('t-name').value.trim().toUpperCase();
  const sex     = document.getElementById('t-sex').value;

  if (!surname || !name || !sex) {
    showError('teacher-form-error', 'Surname, Name and Sex are required.');
    return;
  }

  const emis = currentProfile?.emis_number || '';
  const zone = currentSchool?.zone || (allSchoolsCache.find(s => s.emis_number === emis)?.zone) || '';
  const schoolName = currentSchool?.school_name || (allSchoolsCache.find(s => s.emis_number === emis)?.school_name) || '';

  const record = {
    emis_number:            emis,
    zone:                   zone,
    school_name:            schoolName,
    surname,
    name,
    sex,
    national_id:            document.getElementById('t-national-id').value.trim(),
    emp_number:             document.getElementById('t-emp-no').value.trim(),
    phone:                  document.getElementById('t-phone').value.trim(),
    responsibility:         document.getElementById('t-responsibility').value,
    standard_teaching:      document.getElementById('t-std-teaching').value,
    dev_drop:               document.getElementById('t-dev-drop').value,
    grade:                  document.getElementById('t-grade').value,
    qualification:          document.getElementById('t-qualification').value,
    marital_status:         document.getElementById('t-marital').value,
    dob:                    document.getElementById('t-dob').value || null,
    intake:                 document.getElementById('t-intake').value.trim(),
    date_first_appointment: document.getElementById('t-date-appt').value || null,
    date_present_grade:     document.getElementById('t-date-grade').value || null,
    village:                document.getElementById('t-village').value.trim(),
    traditional_authority:  document.getElementById('t-ta').value.trim(),
    district:               document.getElementById('t-district').value,
    remarks:                document.getElementById('t-remarks').value,
    updated_at:             new Date().toISOString()
  };

  setLoading('save-teacher-btn', true);
  const editingId = document.getElementById('t-editing-id').value;
  let error;

  if (editingId) {
    ({ error } = await db.from('teachers').update(record).eq('id', editingId));
  } else {
    ({ error } = await db.from('teachers').insert(record));
  }

  setLoading('save-teacher-btn', false);

  if (error) { showError('teacher-form-error', error.message); return; }

  showSuccess('teacher-form-success', editingId ? '✓ Teacher updated!' : '✓ Teacher saved successfully!');
  toast(editingId ? 'Teacher updated' : 'Teacher saved', 'success');
  resetTeacherForm();
  loadTeachers();
}

function resetTeacherForm() {
  ['t-surname','t-name','t-sex','t-national-id','t-emp-no','t-phone',
   't-responsibility','t-std-teaching','t-dev-drop','t-grade','t-qualification',
   't-marital','t-dob','t-intake','t-date-appt','t-date-grade',
   't-village','t-ta','t-district','t-remarks'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });
  document.getElementById('t-editing-id').value = '';
  document.getElementById('save-teacher-btn').textContent = 'Save Teacher';
  clearMsg('teacher-form-error');
  clearMsg('teacher-form-success');
}

async function exportTeachers() {
  const emis = currentProfile?.emis_number;
  const isAdmin = currentProfile?.role === 'admin';

  let query = db.from('teachers').select('*').order('zone').order('surname');
  if (!isAdmin && emis) query = query.eq('emis_number', emis);

  const { data, error } = await query;
  if (error) { toast('Export error: ' + error.message, 'error'); return; }

  const rows = [['Zone','School','EMIS','Surname','Name','Sex','Responsibility','Std Teaching',
    'Dev Drop','Grade','Qualification','Emp No','National ID','Intake','DOB',
    'Date First Appointment','Date Present Grade','Village','T/A','District',
    'Marital Status','Phone','Remarks']];

  (data || []).forEach(t => {
    rows.push([
      t.zone, t.school_name, t.emis_number,
      t.surname, t.name, t.sex, t.responsibility,
      t.standard_teaching, t.dev_drop, t.grade, t.qualification,
      t.emp_number, t.national_id, t.intake,
      t.dob ? t.dob.split('T')[0] : '',
      t.date_first_appointment ? t.date_first_appointment.split('T')[0] : '',
      t.date_present_grade ? t.date_present_grade.split('T')[0] : '',
      t.village, t.traditional_authority, t.district,
      t.marital_status, t.phone, t.remarks
    ]);
  });

  const ws = XLSX.utils.aoa_to_sheet(rows);
  ws['!cols'] = [10,20,10,15,15,6,16,12,10,8,14,12,16,8,12,20,18,15,15,15,14,14,12].map(w => ({ wch: w }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Teachers');
  XLSX.writeFile(wb, `LLRE_Teachers${isAdmin ? '_All' : '_' + emis}.xlsx`);
  toast(`Exported ${data.length} teachers`, 'success');
}

// ============================================================
// STARTUP
// ============================================================
window.addEventListener('DOMContentLoaded', async () => {
  // Show login page immediately - never block on network calls
  const loginPage = document.getElementById('login-page');
  if (loginPage) loginPage.style.display = 'flex';

  // Attach enter key to password field
  document.getElementById('login-password').addEventListener('keydown', e => {
    if (e.key === 'Enter') handleLogin();
  });

  // Check if already logged in - runs in background, non-blocking
  try {
    const { data: { user } } = await db.auth.getUser();
    if (user) await initApp(user);
  } catch(e) {
    console.log('No active session:', e.message);
  }
});

db.auth.onAuthStateChange((event, session) => {
  if (event === 'SIGNED_OUT') {
    document.getElementById('login-page').classList.remove('hidden');
    document.getElementById('app').classList.remove('active');
    document.getElementById('app').style.display = '';
  }
});