var objectClass = null, objectGroups = null;
var clickingObject = false, draggingObject = false;

const maxURLLength = 1024;
const validatorURLOptions = { require_protocol: true };

if (validTypes.includes(mapType)) {
  objectClass = document.querySelector('.entities');
  objectGroups = objectClass.querySelectorAll(':scope > g');
}

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

  if (!entry) {
    await showAddVisitForm(code, name);
  } else {
    await showVisitList(code, name, entry.visits);
  }
}

// ── Visit list modal ──────────────────────────────────────────────────────────

async function showVisitList(code, name, visits) {
  await Swal.fire({
    title: escHtml(name),
    html: buildVisitListHTML(code, visits),
    showConfirmButton: false,
    showDenyButton: true,
    denyButtonText: 'Close',
    denyButtonColor: '#777',
    width: 600,
  });
}

function buildVisitListHTML(code, visits) {
  const cards = visits.length === 1
    ? buildVisitCard(visits[0], code)
    : visits.map((v, i) => `
        <details class="visit-accordion" style="margin-bottom:8px;border:1px solid #e0e0e0;border-radius:8px;overflow:hidden">
          <summary style="padding:12px 16px;cursor:pointer;background:#f8f8f8;display:flex;justify-content:space-between;align-items:center;list-style:none;user-select:none">
            <span style="font-weight:600;font-size:14px">${escHtml(v.trip_name || formatDateRange(v.visit_start, v.visit_end) || 'Visit ' + (i + 1))}</span>
            <span style="color:#aaa;font-size:12px">${formatDateRange(v.visit_start, v.visit_end)}</span>
          </summary>
          <div style="padding:14px 16px;background:#fff">
            ${buildVisitCard(v, code)}
          </div>
        </details>`
      ).join('');

  return `
    <div style="max-height:450px;overflow-y:auto;padding-right:2px;text-align:left">
      ${cards}
    </div>
    <div style="margin-top:14px">
      <button type="button" onclick="openAddFromList('${escHtml(code)}')"
        style="padding:7px 18px;background:#4d9e1b;color:#fff;border:none;border-radius:6px;cursor:pointer;font-size:14px;font-weight:600">
        + Add New Visit
      </button>
    </div>`;
}

function buildVisitCard(visit, code) {
  const period    = formatDateRange(visit.visit_start, visit.visit_end);
  const photoHTML = (visit.photo_urls || []).map(u =>
    `<a href="${escHtml(u)}" target="_blank" style="display:block;word-break:break-all;color:#4d9e1b;font-size:13px">${escHtml(u)}</a>`
  ).join('');
  const diaryEntries = visit.diary_entries || [];
  const diaryHTML = diaryEntries.length > 0 ? `
    <details style="margin-top:4px">
      <summary style="cursor:pointer;color:#888;font-size:13px;user-select:none;list-style:none">
        Diary (${diaryEntries.length} ${diaryEntries.length === 1 ? 'entry' : 'entries'})
      </summary>
      <div style="margin-top:8px;display:grid;gap:6px">
        ${diaryEntries.map(e => `
          <div style="padding:8px 12px;background:#fafafa;border-left:3px solid #ddd;border-radius:0 4px 4px 0">
            ${e.date ? `<div style="font-size:11px;color:#aaa;margin-bottom:3px;font-weight:600">${e.date}</div>` : ''}
            <div style="font-size:13px;white-space:pre-wrap;color:#333">${escHtml(e.text)}</div>
          </div>`).join('')}
      </div>
    </details>` : '';

  return `
    <div style="display:grid;gap:8px;font-size:14px">
      ${visit.trip_name   ? row('Trip',      escHtml(visit.trip_name)) : ''}
      ${period            ? row('Period',    period) : ''}
      ${visit.description ? row('Notes',     `<span style="white-space:pre-wrap">${escHtml(visit.description)}</span>`) : ''}
      ${photoHTML         ? row('Photos',    photoHTML) : ''}
      ${visit.documents_url ? row('Docs',   `<a href="${escHtml(visit.documents_url)}" target="_blank" style="color:#4d9e1b">Link</a>`) : ''}
      ${diaryHTML         ? row('',          diaryHTML) : ''}
    </div>
    <div style="margin-top:12px;display:flex;gap:8px">
      <button type="button" onclick="openEditVisit(${visit.id}, '${escHtml(code)}')"
        style="padding:5px 16px;background:#555;color:#fff;border:none;border-radius:5px;cursor:pointer;font-size:13px">Edit</button>
      <button type="button" onclick="openDeleteVisit(${visit.id}, '${escHtml(code)}')"
        style="padding:5px 16px;background:#f54b38;color:#fff;border:none;border-radius:5px;cursor:pointer;font-size:13px">Delete</button>
    </div>`;
}

function row(label, content) {
  return label
    ? `<div><span style="color:#aaa;font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:.4px">${label}</span><div style="margin-top:2px">${content}</div></div>`
    : `<div>${content}</div>`;
}

// ── Add visit ─────────────────────────────────────────────────────────────────

async function showAddVisitForm(code, name) {
  const empty = { tripName: '', description: '', visitStart: '', visitEnd: '', photoUrls: [], documentsUrl: '', diaryEntries: [] };

  const result = await Swal.fire({
    title: `<span style="font-size:18px">Add Visit</span><br><span style="font-size:14px;color:#888;font-weight:400">${escHtml(name)}</span>`,
    html: buildVisitForm(empty),
    showConfirmButton: true,
    showDenyButton: true,
    confirmButtonText: 'Save',
    denyButtonText: 'Cancel',
    confirmButtonColor: '#4d9e1b',
    denyButtonColor: '#aaa',
    width: 640,
    preConfirm: collectForm,
  });

  if (!result.isConfirmed) return;

  const resp = await fetch('/scratch', {
    method: 'POST',
    headers: { 'Accept': 'application/json', 'Content-Type': 'application/json' },
    body: JSON.stringify({ mapId, mapType, code, ...result.value }),
  });
  const data = await resp.json();

  if (data.status === 201) {
    scratchedObjects = data.allScratched;
    renderScratched(objectGroups);
    Toast.fire({ icon: 'success', title: 'Visit added!' });
  } else {
    Toast.fire({ icon: 'error', title: data.message });
  }
}

function openAddFromList(code) {
  const name = objectList[code.toUpperCase()] || code;
  Swal.close();
  setTimeout(() => showAddVisitForm(code, name), 80);
}

// ── Edit visit ────────────────────────────────────────────────────────────────

function openEditVisit(visitId, code) {
  const entry = scratchedObjects.find(s => s.code.toUpperCase() === code.toUpperCase());
  const visit = entry?.visits.find(v => v.id === visitId);
  if (!visit) return;
  const name = objectList[code.toUpperCase()] || code;
  Swal.close();
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
    preConfirm: collectForm,
  });

  if (!result.isConfirmed) {
    const entry = scratchedObjects.find(s => s.code.toUpperCase() === code.toUpperCase());
    if (entry) await showVisitList(code, name, entry.visits);
    return;
  }

  const resp = await fetch(`/visits/${visitId}`, {
    method: 'PUT',
    headers: { 'Accept': 'application/json', 'Content-Type': 'application/json' },
    body: JSON.stringify({ mapId, ...result.value }),
  });
  const data = await resp.json();

  if (data.status === 200) {
    scratchedObjects = data.allScratched;
    renderScratched(objectGroups);
    Toast.fire({ icon: 'success', title: 'Visit updated!' });
    const entry = scratchedObjects.find(s => s.code.toUpperCase() === code.toUpperCase());
    if (entry) await showVisitList(code, name, entry.visits);
  } else {
    Toast.fire({ icon: 'error', title: data.message });
  }
}

// ── Delete visit ──────────────────────────────────────────────────────────────

function openDeleteVisit(visitId, code) {
  const name = objectList[code.toUpperCase()] || code;
  Swal.close();
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

function buildVisitForm(data) {
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

  return { tripName, description, visitStart, visitEnd, photoUrls, documentsUrl, diaryEntries };
}

// ── Render ────────────────────────────────────────────────────────────────────

function renderScratched(objects) {
  for (let i = 0; i < objects.length; i++) objects[i].classList.remove('scratched');
  for (let i = 0; i < scratchedObjects.length; i++) {
    for (let j = 0; j < objects.length; j++) {
      if (scratchedObjects[i].code.toUpperCase() === objects[j].id.toUpperCase()) {
        objects[j].classList.add('scratched');
      }
    }
  }
}

// ── Utilities ─────────────────────────────────────────────────────────────────

function formatDateRange(start, end) {
  if (start && end) return `${start} → ${end}`;
  if (start) return `from ${start}`;
  if (end)   return `until ${end}`;
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
