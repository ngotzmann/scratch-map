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
    width: 580,
    didOpen: () => {
      // prevent accordion clicks from closing the modal
      document.querySelectorAll('.visit-accordion summary').forEach(s => {
        s.addEventListener('click', e => e.stopPropagation());
      });
    }
  });
}

function buildVisitListHTML(code, visits) {
  const listHTML = visits.length === 1
    ? buildVisitCard(visits[0], code)
    : visits.map((v, i) => `
        <details class="visit-accordion" style="margin-bottom:8px;border:1px solid #ddd;border-radius:6px;text-align:left">
          <summary style="padding:10px 14px;cursor:pointer;font-weight:600;list-style:none;display:flex;justify-content:space-between;align-items:center">
            <span>${escHtml(v.trip_name || formatDateRange(v.visit_start, v.visit_end) || 'Visit ' + (i + 1))}</span>
            <span style="color:#aaa;font-size:12px;font-weight:normal">${formatDateRange(v.visit_start, v.visit_end)}</span>
          </summary>
          <div style="padding:0 14px 12px">
            ${buildVisitContent(v, code)}
          </div>
        </details>
      `).join('');

  return `
    <div style="max-height:420px;overflow-y:auto;padding-right:4px">
      ${listHTML}
    </div>
    <button type="button" onclick="openAddFromList('${escHtml(code)}')"
      style="margin-top:12px;padding:6px 16px;background:#4d9e1b;color:white;border:none;border-radius:6px;cursor:pointer;font-size:14px">
      + Add New Visit
    </button>`;
}

function buildVisitCard(visit, code) {
  return `
    <div style="text-align:left;padding:4px 0">
      ${buildVisitContent(visit, code)}
    </div>`;
}

function buildVisitContent(visit, code) {
  const period = formatDateRange(visit.visit_start, visit.visit_end);
  const photoLinks = (visit.photo_urls || [])
    .map(u => `<a href="${escHtml(u)}" target="_blank" style="display:block;word-break:break-all">${escHtml(u)}</a>`)
    .join('');

  return `
    <div style="display:grid;gap:4px;font-size:14px">
      ${visit.trip_name  ? `<div><span style="color:#888">Trip:</span> ${escHtml(visit.trip_name)}</div>` : ''}
      ${period           ? `<div><span style="color:#888">Period:</span> ${period}</div>` : ''}
      ${visit.description ? `<div><span style="color:#888">Notes:</span> ${escHtml(visit.description)}</div>` : ''}
      ${photoLinks       ? `<div><span style="color:#888">Photos:</span><div style="margin-top:2px">${photoLinks}</div></div>` : ''}
      ${visit.documents_url ? `<div><span style="color:#888">Docs:</span> <a href="${escHtml(visit.documents_url)}" target="_blank">Link</a></div>` : ''}
    </div>
    <div style="margin-top:10px;display:flex;gap:8px">
      <button type="button" onclick="openEditVisit(${visit.id}, '${escHtml(code)}')"
        style="padding:4px 14px;background:#555;color:white;border:none;border-radius:4px;cursor:pointer;font-size:13px">Edit</button>
      <button type="button" onclick="openDeleteVisit(${visit.id}, '${escHtml(code)}')"
        style="padding:4px 14px;background:#f54b38;color:white;border:none;border-radius:4px;cursor:pointer;font-size:13px">Delete</button>
    </div>`;
}

// ── Add visit ─────────────────────────────────────────────────────────────────

async function showAddVisitForm(code, name) {
  const empty = { tripName: '', description: '', visitStart: '', visitEnd: '', photoUrls: [], documentsUrl: '' };

  const result = await Swal.fire({
    title: `Add Visit: ${escHtml(name)}`,
    icon: 'question',
    width: 560,
    html: buildVisitForm(empty),
    showConfirmButton: true,
    showDenyButton: true,
    confirmButtonText: 'Save',
    denyButtonText: 'Cancel',
    confirmButtonColor: '#4d9e1b',
    denyButtonColor: '#f54b38',
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
  };

  const result = await Swal.fire({
    title: `Edit Visit: ${escHtml(name)}`,
    width: 560,
    html: buildVisitForm(initial),
    showConfirmButton: true,
    showDenyButton: true,
    confirmButtonText: 'Save',
    denyButtonText: 'Cancel',
    confirmButtonColor: '#4d9e1b',
    denyButtonColor: '#f54b38',
    preConfirm: collectForm,
  });

  if (!result.isConfirmed) {
    // Return to visit list
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
    // Return to visit list
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

function buildVisitForm(data) {
  const photoRows = data.photoUrls.length > 0
    ? data.photoUrls.map(url => photoUrlRow(url)).join('')
    : photoUrlRow('');

  return `
    <label class="swal2-input-label" for="f-trip-name">Trip Name</label>
    <input id="f-trip-name" class="swal2-input" type="text"
      placeholder="Summer trip to France" value="${escHtml(data.tripName)}" style="margin:4px 1em">

    <label class="swal2-input-label" for="f-description">Notes</label>
    <textarea id="f-description" class="swal2-textarea"
      placeholder="Add notes about this visit..." style="margin:4px 1em;min-height:80px">${escHtml(data.description)}</textarea>

    <label class="swal2-input-label">Visit Period</label>
    <div style="display:flex;gap:8px;margin:4px 1em 0">
      <div style="flex:1">
        <label style="font-size:12px;color:#888;display:block;margin-bottom:2px">Start</label>
        <input id="f-visit-start" class="swal2-input" type="date" value="${data.visitStart}" style="margin:0;width:100%">
      </div>
      <div style="flex:1">
        <label style="font-size:12px;color:#888;display:block;margin-bottom:2px">End</label>
        <input id="f-visit-end" class="swal2-input" type="date" value="${data.visitEnd}" style="margin:0;width:100%">
      </div>
    </div>

    <label class="swal2-input-label" style="margin-top:10px">Photo Albums</label>
    <div id="f-photo-urls">${photoRows}</div>
    <button type="button" onclick="addPhotoUrl()"
      style="margin:6px 1em 0;padding:4px 12px;background:#eee;border:1px solid #ccc;border-radius:4px;cursor:pointer;font-size:13px">
      + Add Link
    </button>

    <details style="margin:12px 1em 0;text-align:left">
      <summary style="cursor:pointer;color:#666;font-size:13px;user-select:none">Documents (optional)</summary>
      <div style="margin-top:6px">
        <label class="swal2-input-label" for="f-documents-url">Documents Link</label>
        <input id="f-documents-url" class="swal2-input" type="url"
          placeholder="https://drive.google.com/..." value="${escHtml(data.documentsUrl)}" style="margin:4px 0 0">
      </div>
    </details>`;
}

function collectForm() {
  const tripName    = document.getElementById('f-trip-name').value.trim();
  const description = document.getElementById('f-description').value;
  const visitStart  = document.getElementById('f-visit-start').value;
  const visitEnd    = document.getElementById('f-visit-end').value;
  const photoUrls   = Array.from(document.querySelectorAll('.photo-url-input'))
                        .map(i => i.value.trim()).filter(u => u.length > 0);
  const documentsUrl = document.getElementById('f-documents-url').value.trim();

  if (tripName.length > 255) { Swal.showValidationMessage('Trip name too long (max 255)'); return false; }
  if (description.length > 5000) { Swal.showValidationMessage('Description too long (max 5000)'); return false; }
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

  return { tripName, description, visitStart, visitEnd, photoUrls, documentsUrl };
}

function photoUrlRow(url) {
  return `
    <div class="photo-url-row" style="display:flex;align-items:center;gap:4px;margin:4px 1em 0">
      <input class="swal2-input photo-url-input" type="url"
        placeholder="https://photos.example.com/my-trip" value="${escHtml(url)}"
        style="margin:0;flex:1">
      <button type="button" onclick="removePhotoUrl(this)"
        style="background:#f54b38;color:white;border:none;border-radius:50%;width:26px;height:26px;cursor:pointer;font-size:16px;flex-shrink:0;line-height:1">×</button>
    </div>`;
}

function addPhotoUrl() {
  document.getElementById('f-photo-urls').insertAdjacentHTML('beforeend', photoUrlRow(''));
}

function removePhotoUrl(btn) {
  btn.closest('.photo-url-row').remove();
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
