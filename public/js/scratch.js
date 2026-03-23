var objectClass = null, objectGroups = null;
var clickingObject = false, draggingObject = false;

const maxURLLength = 1024;
const validatorURLOptions = { require_protocol: true };

// ── Continent classification (world map only) ─────────────────────────────────

const CONTINENTS = {
  eu: ['AL','AD','AT','BY','BE','BA','BG','HR','CY','CZ','DK','EE','FI','FR','DE','GR','HU','IS','IE','IT','XK','LV','LI','LT','LU','MK','MT','MD','MC','ME','NL','NO','PL','PT','RO','SM','RS','SK','SI','ES','SE','CH','UA','GB','VA'],
  as: ['AF','AM','AZ','BH','BD','BT','BN','KH','CN','GE','IN','ID','IR','IQ','IL','JP','JO','KZ','KW','KG','LA','LB','MY','MV','MN','MM','NP','KP','OM','PK','PS','PH','QA','SA','SG','KR','LK','SY','TW','TJ','TH','TL','TR','TM','AE','UZ','VN','YE'],
  af: ['DZ','AO','BJ','BW','BF','BI','CM','CV','CF','TD','KM','CD','CG','CI','DJ','EG','GQ','ER','ET','GA','GM','GH','GN','GW','KE','LS','LR','LY','MG','MW','ML','MR','MU','MA','MZ','NA','NE','NG','RW','ST','SN','SL','SO','ZA','SS','SD','SZ','TZ','TG','TN','UG','EH','ZM','ZW'],
  na: ['AG','BS','BB','BZ','CA','CR','CU','DM','DO','SV','GD','GT','HT','HN','JM','MX','NI','PA','KN','LC','VC','TT','US','GL'],
  sa: ['AR','BO','BR','CL','CO','EC','GY','PY','PE','SR','UY','VE'],
  oc: ['AU','FJ','KI','MH','FM','NR','NZ','PW','PG','WS','SB','TO','TV','VU'],
};

const CODE_TO_CONTINENT = {};
for (const [continent, codes] of Object.entries(CONTINENTS)) {
  for (const code of codes) CODE_TO_CONTINENT[code] = continent;
}

function applyContinentClasses(objects) {
  for (const obj of objects) {
    const continent = CODE_TO_CONTINENT[obj.id.toUpperCase()];
    if (continent) obj.classList.add('continent-' + continent);
  }
}

if (validTypes.includes(mapType)) {
  objectClass = document.querySelector('.entities');
  objectGroups = objectClass.querySelectorAll(':scope > g');
}

if (mapType === 'world') applyContinentClasses(objectGroups);
renderScratched(objectGroups);

for (let i = 0; i < objectGroups.length; i++) {
  objectGroups[i].addEventListener('click', clickObject);
  objectGroups[i].addEventListener('mousedown', () => { clickingObject = true; });
  objectGroups[i].addEventListener('mousemove', () => { if (clickingObject) draggingObject = true; });
  objectGroups[i].addEventListener('mouseup', () => {
    clickingObject = false;
    setTimeout(() => draggingObject = false, 10);
  });
}

// ── Click handler ─────────────────────────────────────────────────────────────

async function clickObject(e) {
  if (draggingObject) { e.preventDefault(); e.stopPropagation(); return; }
  e.stopPropagation();
  e.preventDefault();

  const code = e.target.closest('.entities > g').id;
  const name = objectList[code.toUpperCase()] || code;
  const entry = scratchedObjects.find(s => s.code.toUpperCase() === code.toUpperCase());
  const isDisabled = disabledCodes.some(c => c.toUpperCase() === code.toUpperCase());

  if (isDisabled) {
    await showDisabledModal(code, name);
  } else if (!entry) {
    await showAddVisitForm(code, name);
  } else {
    await showVisitList(code, name, entry.visits);
  }
}

// ── Visit list overlay ────────────────────────────────────────────────────────

function showVisitList(code, name, visits) {
  closeVisitListModal();

  const overlay = document.createElement('div');
  overlay.id = 'visit-list-overlay';
  overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.55);z-index:9999;display:flex;align-items:center;justify-content:center;padding:16px';

  overlay.innerHTML = `
    <div id="visit-modal-panel" style="background:#fff;border-radius:16px;max-width:620px;width:100%;max-height:88vh;display:flex;flex-direction:column;box-shadow:0 24px 80px rgba(0,0,0,0.25);overflow:hidden">
      <div style="padding:18px 22px;border-bottom:1px solid #efefef;display:flex;justify-content:space-between;align-items:center;flex-shrink:0;background:#fafafa">
        <div style="min-width:0">
          <div style="font-size:19px;font-weight:700;color:#1a1a1a;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${escHtml(name)}</div>
        </div>
        <button onclick="closeVisitListModal()"
          style="width:32px;height:32px;background:#eee;border:none;border-radius:50%;cursor:pointer;font-size:17px;color:#666;line-height:1;padding:0;flex-shrink:0;margin-left:12px">✕</button>
      </div>
      <div id="visit-modal-body" style="overflow-y:auto;flex:1"></div>
    </div>`;

  overlay.addEventListener('click', e => { if (e.target === overlay) closeVisitListModal(); });
  document.body.appendChild(overlay);

  if (visits.length === 1) {
    renderVisitDetailView(code, 0);
  } else {
    renderVisitListView(code, visits);
  }
}

function closeVisitListModal() {
  const el = document.getElementById('visit-list-overlay');
  if (el) el.remove();
}

async function showDisabledModal(code, name) {
  const result = await Swal.fire({
    title: escHtml(name),
    html: `<p style="color:#888;font-size:14px;margin-top:6px">Marked as <strong style="color:#555">Never Visit</strong>.</p>`,
    icon: 'info',
    showConfirmButton: true,
    showDenyButton: true,
    confirmButtonText: 'Remove mark',
    denyButtonText: 'Close',
    confirmButtonColor: '#555',
    denyButtonColor: '#aaa',
  });

  if (!result.isConfirmed) return;

  const resp = await fetch('/disabled', {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ mapId, mapType, code }),
  });
  const data = await resp.json();
  if (data.status === 200) {
    disabledCodes = disabledCodes.filter(c => c.toUpperCase() !== code.toUpperCase());
    renderScratched(objectGroups);
    Toast.fire({ icon: 'success', title: 'Mark removed' });
  } else {
    Toast.fire({ icon: 'error', title: data.message });
  }
}

function renderVisitListView(code, visits) {
  if (!visits) {
    const entry = scratchedObjects.find(s => s.code.toUpperCase() === code.toUpperCase());
    visits = entry ? entry.visits : [];
  }
  const body = document.getElementById('visit-modal-body');
  if (!body) return;

  const rows = visits.map((v, i) => {
    const period = formatDateRange(v.visit_start, v.visit_end);
    const label  = v.trip_name || `Visit ${i + 1}`;
    const sub    = period || (v.description ? v.description.slice(0, 60) + (v.description.length > 60 ? '…' : '') : '');
    return `
      <div onclick="renderVisitDetailView('${escHtml(code)}', ${i})"
        style="display:flex;align-items:center;padding:14px 20px;border-bottom:1px solid #f0f0f0;cursor:pointer;transition:background .15s"
        onmouseover="this.style.background='#f6faf3'" onmouseout="this.style.background=''">
        <div style="width:32px;height:32px;border-radius:50%;background:#e8f4e0;color:#4d9e1b;font-size:12px;font-weight:700;display:flex;align-items:center;justify-content:center;flex-shrink:0;margin-right:14px">${i + 1}</div>
        <div style="min-width:0;flex:1">
          <div style="font-size:14px;font-weight:600;color:#1a1a1a;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${escHtml(label)}</div>
          ${sub ? `<div style="font-size:12px;color:#aaa;margin-top:2px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${escHtml(sub)}</div>` : ''}
        </div>
        <span style="color:#ccc;font-size:18px;margin-left:12px;flex-shrink:0">›</span>
      </div>`;
  }).join('');

  body.innerHTML = `
    <div>${rows}</div>
    <div style="padding:16px 20px;border-top:1px solid #f0f0f0">
      <button onclick="openAddFromList('${escHtml(code)}')"
        style="width:100%;padding:10px;background:#4d9e1b;color:#fff;border:none;border-radius:8px;cursor:pointer;font-size:14px;font-weight:600">
        + Add New Visit
      </button>
    </div>`;
}

function renderVisitDetailView(code, index) {
  const entry = scratchedObjects.find(s => s.code.toUpperCase() === code.toUpperCase());
  if (!entry) return;
  const visit = entry.visits[index];
  if (!visit) return;

  const body   = document.getElementById('visit-modal-body');
  if (!body) return;

  const period       = formatDateRange(visit.visit_start, visit.visit_end);
  const photoHTML    = (visit.photo_urls || []).map(u =>
    `<a href="${escHtml(u)}" target="_blank" style="display:block;word-break:break-all;color:#4d9e1b;font-size:13px;margin-bottom:3px">${escHtml(u)}</a>`
  ).join('');
  const diaryEntries = visit.diary_entries || [];
  const diaryHTML    = diaryEntries.length > 0 ? `
    <details>
      <summary style="cursor:pointer;font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:.4px;color:#aaa;list-style:none;user-select:none">
        Diary <span style="font-weight:400;text-transform:none;letter-spacing:0">(${diaryEntries.length} ${diaryEntries.length === 1 ? 'entry' : 'entries'})</span>
      </summary>
      <div style="margin-top:10px;display:grid;gap:8px">
        ${diaryEntries.map(e => `
          <div style="padding:10px 14px;background:#f9f9f9;border-left:3px solid #d8ead0;border-radius:0 6px 6px 0">
            ${e.date ? `<div style="font-size:11px;color:#aaa;margin-bottom:4px;font-weight:700">${formatDate(e.date)}</div>` : ''}
            <div style="font-size:13px;line-height:1.6;white-space:pre-wrap;color:#333">${escHtml(e.text)}</div>
          </div>`).join('')}
      </div>
    </details>` : '';

  const backBtn = entry.visits.length > 1
    ? `<button onclick="renderVisitListView('${escHtml(code)}', null)"
         style="background:none;border:none;cursor:pointer;color:#4d9e1b;font-size:13px;font-weight:600;padding:0;display:flex;align-items:center;gap:4px">‹ All visits</button>`
    : '';

  body.innerHTML = `
    <div style="padding:16px 20px;border-bottom:1px solid #f0f0f0;display:flex;align-items:center;justify-content:space-between;background:#fafafa">
      ${backBtn}
      <div style="display:flex;gap:8px;margin-left:auto">
        <button onclick="openAddFromList('${escHtml(code)}')"
          style="padding:6px 16px;background:#4d9e1b;color:#fff;border:none;border-radius:6px;cursor:pointer;font-size:13px;font-weight:500">+ Add Visit</button>
        <button onclick="openEditVisit(${visit.id}, '${escHtml(code)}')"
          style="padding:6px 16px;background:#555;color:#fff;border:none;border-radius:6px;cursor:pointer;font-size:13px;font-weight:500">Edit</button>
        <button onclick="openDeleteVisit(${visit.id}, '${escHtml(code)}')"
          style="padding:6px 16px;background:#f54b38;color:#fff;border:none;border-radius:6px;cursor:pointer;font-size:13px;font-weight:500">Delete</button>
      </div>
    </div>
    <div style="padding:20px;display:grid;gap:16px">
      <div>
        <div style="font-size:18px;font-weight:700;color:#1a1a1a">${visit.trip_name ? escHtml(visit.trip_name) : `Visit ${index + 1}`}</div>
        ${period ? `<div style="font-size:13px;color:#7a9e6a;margin-top:4px;font-weight:500">${period}</div>` : ''}
      </div>
      ${visit.description ? detailField('Notes', `<div style="color:#444;white-space:pre-wrap;font-size:14px;line-height:1.7">${escHtml(visit.description)}</div>`) : ''}
      ${photoHTML         ? detailField('Photos', photoHTML) : ''}
      ${visit.documents_url ? detailField('Documents', `<a href="${escHtml(visit.documents_url)}" target="_blank" style="color:#4d9e1b;font-size:13px;font-weight:500">Open Link ↗</a>`) : ''}
      ${diaryHTML ? `<div>${diaryHTML}</div>` : ''}
    </div>`;
}

function detailField(label, content) {
  return `<div>
    <div style="font-size:11px;color:#aaa;font-weight:700;text-transform:uppercase;letter-spacing:.4px;margin-bottom:6px">${label}</div>
    ${content}
  </div>`;
}

// ── Add visit ─────────────────────────────────────────────────────────────────

async function showAddVisitForm(code, name) {
  const empty = { tripName: '', description: '', visitStart: '', visitEnd: '', photoUrls: [], documentsUrl: '', diaryEntries: [] };

  const result = await Swal.fire({
    title: `<span style="font-size:18px">Add Visit</span><br><span style="font-size:14px;color:#888;font-weight:400">${escHtml(name)}</span>`,
    html: buildVisitForm(empty, true),
    showConfirmButton: true,
    showDenyButton: true,
    confirmButtonText: 'Save',
    denyButtonText: 'Cancel',
    confirmButtonColor: '#4d9e1b',
    denyButtonColor: '#aaa',
    width: 640,
    preConfirm: async () => {
      Swal.getConfirmButton().disabled = true;
      const formData = collectForm();
      if (!formData) { Swal.getConfirmButton().disabled = false; return false; }

      if (formData.neverVisit) {
        const resp = await fetch('/disabled', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ mapId, mapType, code }),
        });
        const data = await resp.json();
        if (data.status !== 200) { Swal.showValidationMessage(data.message || 'Request failed'); return false; }
        return { neverVisit: true };
      }

      const resp = await fetch('/scratch', {
        method: 'POST',
        headers: { 'Accept': 'application/json', 'Content-Type': 'application/json' },
        body: JSON.stringify({ mapId, mapType, code, ...formData }),
      });
      const data = await resp.json();
      if (data.status !== 201) { Swal.showValidationMessage(data.message || 'Request failed'); return false; }
      return data;
    },
  });

  if (!result.isConfirmed) return;

  if (result.value.neverVisit) {
    disabledCodes.push(code.toUpperCase());
    renderScratched(objectGroups);
    Toast.fire({ icon: 'success', title: 'Marked as never visit' });
  } else {
    scratchedObjects = result.value.allScratched;
    renderScratched(objectGroups);
    Toast.fire({ icon: 'success', title: 'Visit added!' });
  }
}

function openAddFromList(code) {
  const name = objectList[code.toUpperCase()] || code;
  closeVisitListModal();
  setTimeout(() => showAddVisitForm(code, name), 80);
}

// ── Edit visit ────────────────────────────────────────────────────────────────

function openEditVisit(visitId, code) {
  const entry = scratchedObjects.find(s => s.code.toUpperCase() === code.toUpperCase());
  const visit = entry?.visits.find(v => v.id === visitId);
  if (!visit) { Toast.fire({ icon: 'error', title: 'Visit not found' }); return; }
  const name = objectList[code.toUpperCase()] || code;
  closeVisitListModal();
  setTimeout(() => showEditVisitForm(visitId, code, name, visit), 80);
}

async function showEditVisitForm(visitId, code, name, visit) {
  const initial = {
    tripName:     visit.trip_name     || '',
    description:  visit.description   || '',
    visitStart:   visit.visit_start   || '',
    visitEnd:     visit.visit_end     || '',
    photoUrls:    visit.photo_urls    || [],
    documentsUrl: visit.documents_url || '',
    diaryEntries: visit.diary_entries || [],
  };

  const result = await Swal.fire({
    title: `<span style="font-size:18px">Edit Visit</span><br><span style="font-size:14px;color:#888;font-weight:400">${escHtml(name)}</span>`,
    html: buildVisitForm(initial),
    showConfirmButton: true,
    showDenyButton: true,
    confirmButtonText: 'Save',
    denyButtonText: 'Cancel',
    confirmButtonColor: '#4d9e1b',
    denyButtonColor: '#aaa',
    width: 640,
    preConfirm: async () => {
      Swal.getConfirmButton().disabled = true;
      const formData = collectForm();
      if (!formData) { Swal.getConfirmButton().disabled = false; return false; }

      const resp = await fetch(`/visits/${visitId}`, {
        method: 'PUT',
        headers: { 'Accept': 'application/json', 'Content-Type': 'application/json' },
        body: JSON.stringify({ mapId, ...formData }),
      });
      const data = await resp.json();
      if (data.status !== 200) { Swal.showValidationMessage(data.message || 'Request failed'); return false; }
      return data;
    },
  });

  if (!result.isConfirmed) {
    const entry = scratchedObjects.find(s => s.code.toUpperCase() === code.toUpperCase());
    if (entry) await showVisitList(code, name, entry.visits);
    return;
  }

  scratchedObjects = result.value.allScratched;
  renderScratched(objectGroups);
  Toast.fire({ icon: 'success', title: 'Visit updated!' });
  const entry = scratchedObjects.find(s => s.code.toUpperCase() === code.toUpperCase());
  if (entry) await showVisitList(code, name, entry.visits);
}

// ── Delete visit ──────────────────────────────────────────────────────────────

function openDeleteVisit(visitId, code) {
  const name = objectList[code.toUpperCase()] || code;
  closeVisitListModal();
  setTimeout(() => showDeleteConfirm(visitId, code, name), 80);
}

async function showDeleteConfirm(visitId, code, name) {
  const result = await Swal.fire({
    title: 'Delete this visit?',
    text: 'This cannot be undone.',
    icon: 'warning',
    showConfirmButton: true,
    showDenyButton: true,
    confirmButtonText: 'Delete',
    denyButtonText: 'Cancel',
    confirmButtonColor: '#f54b38',
    denyButtonColor: '#777',
  });

  if (!result.isConfirmed) {
    const entry = scratchedObjects.find(s => s.code.toUpperCase() === code.toUpperCase());
    if (entry) await showVisitList(code, name, entry.visits);
    return;
  }

  const resp = await fetch(`/visits/${visitId}`, {
    method: 'DELETE',
    headers: { 'Accept': 'application/json', 'Content-Type': 'application/json' },
    body: JSON.stringify({ mapId }),
  });
  const data = await resp.json();

  if (data.status === 200) {
    if (data.unscratched) {
      scratchedObjects = scratchedObjects.filter(s => s.code.toUpperCase() !== code.toUpperCase());
      renderScratched(objectGroups);
      Toast.fire({ icon: 'success', title: 'Visit deleted' });
    } else {
      scratchedObjects = data.allScratched;
      renderScratched(objectGroups);
      Toast.fire({ icon: 'success', title: 'Visit deleted' });
      const entry = scratchedObjects.find(s => s.code.toUpperCase() === code.toUpperCase());
      if (entry) await showVisitList(code, name, entry.visits);
    }
  } else {
    Toast.fire({ icon: 'error', title: data.message });
  }
}

// ── Form builder ──────────────────────────────────────────────────────────────

const S = {
  label:   'display:block;font-size:11px;color:#aaa;font-weight:700;text-transform:uppercase;letter-spacing:.5px;margin-bottom:4px',
  details: 'border:1px solid #ebebeb;border-radius:8px;margin-bottom:8px;overflow:hidden',
  summary: 'padding:11px 14px;cursor:pointer;background:#f9f9f9;font-weight:600;font-size:13px;color:#555;list-style:none;display:flex;justify-content:space-between;align-items:center;user-select:none',
  input:   'margin:0;width:100%;box-sizing:border-box',
};

function buildVisitForm(data, allowNeverVisit = false) {
  const photoRows   = data.photoUrls.length > 0 ? data.photoUrls.map(photoUrlRow).join('') : photoUrlRow('');
  const diaryRows   = (data.diaryEntries || []).map(diaryEntryRow).join('');
  const hasNotes    = data.description.length > 0;
  const hasPhotos   = data.photoUrls.length > 0;
  const hasDocs     = data.documentsUrl.length > 0;
  const hasDiary    = (data.diaryEntries || []).length > 0;

  return `<div style="text-align:left;padding:0 2px">

    <div style="margin-bottom:14px">
      <label style="${S.label}">Trip Name</label>
      <input id="f-trip-name" class="swal2-input" type="text"
        placeholder="e.g. Summer Road Trip 2024"
        value="${escHtml(data.tripName)}" style="${S.input}">
    </div>

    <div style="margin-bottom:14px">
      <label style="${S.label}">Visit Period</label>
      <div style="display:flex;gap:10px;align-items:center">
        <div style="flex:1">
          <label style="font-size:11px;color:#bbb;display:block;margin-bottom:3px">Start</label>
          <input id="f-visit-start" class="swal2-input" type="date" value="${data.visitStart}" style="${S.input}">
        </div>
        <div style="color:#ccc;padding-top:14px;font-size:18px">→</div>
        <div style="flex:1">
          <label style="font-size:11px;color:#bbb;display:block;margin-bottom:3px">End</label>
          <input id="f-visit-end" class="swal2-input" type="date" value="${data.visitEnd}" style="${S.input}">
        </div>
      </div>
    </div>

    <details id="d-notes" style="${S.details}" ${hasNotes ? 'open' : ''}>
      <summary style="${S.summary}">Notes <span style="color:#ccc;font-size:11px;font-weight:400">observations, memories…</span></summary>
      <div style="padding:12px">
        <textarea id="f-description" class="swal2-textarea"
          placeholder="Write your memories, observations, highlights…"
          style="margin:0;width:100%;min-height:100px;box-sizing:border-box;resize:vertical">${escHtml(data.description)}</textarea>
      </div>
    </details>

    <details id="d-photos" style="${S.details}" ${hasPhotos ? 'open' : ''}>
      <summary style="${S.summary}">Photo Albums</summary>
      <div style="padding:12px">
        <div id="f-photo-urls">${photoRows}</div>
        <button type="button" onclick="addPhotoUrl()"
          style="margin-top:8px;padding:4px 12px;background:#f0f0f0;border:1px solid #ddd;border-radius:5px;cursor:pointer;font-size:13px;color:#555">
          + Add Link
        </button>
      </div>
    </details>

    <details id="d-documents" style="${S.details}" ${hasDocs ? 'open' : ''}>
      <summary style="${S.summary}">Documents <span style="color:#ccc;font-size:11px;font-weight:400">optional</span></summary>
      <div style="padding:12px">
        <input id="f-documents-url" class="swal2-input" type="url"
          placeholder="https://drive.google.com/…"
          value="${escHtml(data.documentsUrl)}" style="${S.input}">
      </div>
    </details>

    <details id="d-diary" style="${S.details}" ${hasDiary ? 'open' : ''}>
      <summary style="${S.summary}">Diary</summary>
      <div style="padding:12px">
        <div id="f-diary-entries">${diaryRows}</div>
        <button type="button" onclick="addDiaryEntry()"
          style="margin-top:8px;padding:4px 12px;background:#f0f0f0;border:1px solid #ddd;border-radius:5px;cursor:pointer;font-size:13px;color:#555">
          + Add Entry
        </button>
      </div>
    </details>

    ${allowNeverVisit ? `
    <details id="d-never-visit" style="${S.details}">
      <summary style="${S.summary}">Never Visit <span style="color:#ccc;font-size:11px;font-weight:400">optional</span></summary>
      <div style="padding:12px">
        <label style="display:flex;align-items:center;gap:10px;cursor:pointer;font-size:14px;color:#555;user-select:none">
          <input type="checkbox" id="f-never-visit" style="width:16px;height:16px;cursor:pointer;accent-color:#c0392b">
          I'll never visit this place
        </label>
        <p style="margin-top:8px;font-size:12px;color:#aaa">Marks it on the map as never visit. Other fields will be ignored.</p>
      </div>
    </details>` : ''}

  </div>`;
}

function photoUrlRow(url) {
  return `
    <div class="photo-url-row" style="display:flex;align-items:center;gap:6px;margin-bottom:6px">
      <input class="swal2-input photo-url-input" type="url"
        placeholder="https://photos.example.com/my-trip"
        value="${escHtml(url)}" style="margin:0;flex:1">
      <button type="button" onclick="removePhotoUrl(this)"
        style="background:#f54b38;color:#fff;border:none;border-radius:50%;width:26px;height:26px;cursor:pointer;font-size:16px;flex-shrink:0;line-height:1">×</button>
    </div>`;
}

function diaryEntryRow(entry) {
  return `
    <div class="diary-row" style="display:grid;grid-template-columns:150px 1fr 28px;gap:8px;margin-bottom:10px;align-items:start">
      <input class="swal2-input diary-date" type="date"
        value="${escHtml(entry?.date || '')}"
        style="margin:0;width:100%;font-size:13px">
      <textarea class="swal2-textarea diary-text"
        placeholder="What happened today…"
        style="margin:0;min-height:70px;font-size:13px;resize:vertical">${escHtml(entry?.text || '')}</textarea>
      <button type="button" onclick="removeDiaryEntry(this)"
        style="background:#f54b38;color:#fff;border:none;border-radius:50%;width:26px;height:26px;cursor:pointer;font-size:16px;line-height:1;margin-top:2px">×</button>
    </div>`;
}

function addPhotoUrl() {
  document.getElementById('f-photo-urls').insertAdjacentHTML('beforeend', photoUrlRow(''));
}
function removePhotoUrl(btn) { btn.closest('.photo-url-row').remove(); }

function addDiaryEntry() {
  document.getElementById('f-diary-entries').insertAdjacentHTML('beforeend', diaryEntryRow(null));
}
function removeDiaryEntry(btn) { btn.closest('.diary-row').remove(); }

function collectForm() {
  const tripName     = document.getElementById('f-trip-name').value.trim();
  const description  = document.getElementById('f-description').value;
  const visitStart   = document.getElementById('f-visit-start').value;
  const visitEnd     = document.getElementById('f-visit-end').value;
  const photoUrls    = Array.from(document.querySelectorAll('.photo-url-input'))
                         .map(i => i.value.trim()).filter(u => u.length > 0);
  const documentsUrl = document.getElementById('f-documents-url').value.trim();
  const diaryEntries = Array.from(document.querySelectorAll('.diary-row'))
                         .map(r => ({
                           date: r.querySelector('.diary-date').value || null,
                           text: r.querySelector('.diary-text').value.trim(),
                         }))
                         .filter(e => e.text.length > 0);

  if (tripName.length > 255)    { Swal.showValidationMessage('Trip name too long (max 255)'); return false; }
  if (description.length > 5000){ Swal.showValidationMessage('Description too long (max 5000)'); return false; }
  for (const entry of diaryEntries) {
    if (entry.text.length > 5000) { Swal.showValidationMessage('Diary entry too long (max 5000 chars)'); return false; }
  }
  if (visitStart && !/^\d{4}-\d{2}-\d{2}$/.test(visitStart)) { Swal.showValidationMessage('Invalid start date'); return false; }
  if (visitEnd   && !/^\d{4}-\d{2}-\d{2}$/.test(visitEnd))   { Swal.showValidationMessage('Invalid end date');   return false; }
  for (const url of photoUrls) {
    if (url.length > maxURLLength || !validator.isURL(url, validatorURLOptions)) {
      Swal.showValidationMessage(`Invalid photo URL: ${url}`); return false;
    }
  }
  if (documentsUrl && (documentsUrl.length > maxURLLength || !validator.isURL(documentsUrl, validatorURLOptions))) {
    Swal.showValidationMessage('Invalid documents URL'); return false;
  }

  const neverVisit = document.getElementById('f-never-visit')?.checked || false;
  return { tripName, description, visitStart, visitEnd, photoUrls, documentsUrl, diaryEntries, neverVisit };
}

// ── Render ────────────────────────────────────────────────────────────────────

function renderScratched(objects) {
  for (let i = 0; i < objects.length; i++) objects[i].classList.remove('scratched', 'disabled-location');
  for (const s of scratchedObjects) {
    for (const obj of objects) {
      if (s.code.toUpperCase() === obj.id.toUpperCase()) obj.classList.add('scratched');
    }
  }
  for (const code of disabledCodes) {
    for (const obj of objects) {
      if (code.toUpperCase() === obj.id.toUpperCase()) obj.classList.add('disabled-location');
    }
  }
}

// ── Utilities ─────────────────────────────────────────────────────────────────

function formatDate(isoStr) {
  if (!isoStr) return '';
  return new Date(isoStr + 'T00:00:00').toLocaleDateString();
}

function formatDateRange(start, end) {
  if (start && end) return `${formatDate(start)} → ${formatDate(end)}`;
  if (start) return `from ${formatDate(start)}`;
  if (end)   return `until ${formatDate(end)}`;
  return '';
}

function escHtml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#x27;');
}

const Toast = Swal.mixin({
  toast: true,
  position: 'top-end',
  showConfirmButton: false,
  timer: 3000,
  timerProgressBar: true,
  didOpen: (toast) => {
    toast.addEventListener('mouseenter', Swal.stopTimer);
    toast.addEventListener('mouseleave', Swal.resumeTimer);
  }
});
