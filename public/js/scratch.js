var objectClass = null, objectGroups = null;
var clickingObject = false, draggingObject = false;

const maxURLLength = 1024;
const validatorURLOptions = { require_protocol: true };

if (validTypes.includes(mapType)) {
  objectClass = document.querySelector(`.entities`);
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

async function clickObject(e) {
  if (draggingObject) {
    e.preventDefault();
    e.stopPropagation();
    return;
  }
  e.stopPropagation();
  e.preventDefault();

  let object = { code: '', name: '', tripName: '', description: '', visitStart: '', visitEnd: '', photoUrls: [], documentsUrl: '' };

  object.code = e.target.closest(`.entities > g`).id;

  for (var key of Object.keys(objectList)) {
    if (object.code.toUpperCase() == key.toUpperCase()) {
      object.name = objectList[key];
    }
  }

  let scratched = false;
  for (let i = 0; i < scratchedObjects.length; i++) {
    if (scratchedObjects[i].code.toUpperCase() == object.code.toUpperCase()) {
      scratched = true;
      object.tripName    = scratchedObjects[i].trip_name    || '';
      object.description = scratchedObjects[i].description  || '';
      object.visitStart  = scratchedObjects[i].visit_start  || '';
      object.visitEnd    = scratchedObjects[i].visit_end    || '';
      object.photoUrls   = scratchedObjects[i].photo_urls   || [];
      object.documentsUrl = scratchedObjects[i].documents_url || '';
    }
  }

  const scratchedCheckbox = scratched
    ? `<label for="f-scratched" class="swal2-checkbox" style="display:flex;margin:0 1em 8px">
         <input type="checkbox" id="f-scratched" checked>
         <span class="swal2-label">Keep as visited</span>
       </label>`
    : '';

  const saResponse = await Swal.fire({
    title: scratched ? `Update ${object.name}` : `Scratch ${object.name}?`,
    icon: 'question',
    width: 560,
    html: scratchedCheckbox + buildScratchForm(object),
    showConfirmButton: true,
    showDenyButton: true,
    confirmButtonText: 'Save',
    denyButtonText: 'Cancel',
    confirmButtonColor: '#4d9e1b',
    denyButtonColor: '#f54b38',
    preConfirm: () => {
      const tripName    = document.getElementById('f-trip-name').value.trim();
      const description = document.getElementById('f-description').value;
      const visitStart  = document.getElementById('f-visit-start').value;
      const visitEnd    = document.getElementById('f-visit-end').value;
      const photoUrls   = Array.from(document.querySelectorAll('.photo-url-input'))
                            .map(i => i.value.trim()).filter(u => u.length > 0);
      const documentsUrl = document.getElementById('f-documents-url').value.trim();
      const keepScratched = scratched ? document.getElementById('f-scratched').checked : true;

      if (tripName.length > 255) {
        Swal.showValidationMessage('Trip name is too long (max 255 characters)');
        return false;
      }
      if (description.length > 5000) {
        Swal.showValidationMessage('Description is too long (max 5000 characters)');
        return false;
      }
      if (visitStart && !/^\d{4}-\d{2}-\d{2}$/.test(visitStart)) {
        Swal.showValidationMessage('Invalid start date');
        return false;
      }
      if (visitEnd && !/^\d{4}-\d{2}-\d{2}$/.test(visitEnd)) {
        Swal.showValidationMessage('Invalid end date');
        return false;
      }
      for (const url of photoUrls) {
        if (url.length > maxURLLength || !validator.isURL(url, validatorURLOptions)) {
          Swal.showValidationMessage(`Invalid photo URL: ${url}`);
          return false;
        }
      }
      if (documentsUrl && (documentsUrl.length > maxURLLength || !validator.isURL(documentsUrl, validatorURLOptions))) {
        Swal.showValidationMessage('Invalid documents URL');
        return false;
      }

      return { tripName, description, visitStart, visitEnd, photoUrls, documentsUrl, keepScratched };
    }
  });

  if (saResponse == null) {
    Toast.fire({ icon: 'error', title: 'An unknown error has occurred' });
    return;
  }

  if (!saResponse.isConfirmed) return;

  const doScratch = !scratched ? true : saResponse.value.keepScratched;

  const rawResponse = await fetch('/scratch', {
    method: 'POST',
    headers: { 'Accept': 'application/json', 'Content-Type': 'application/json' },
    body: JSON.stringify({
      mapId,
      mapType,
      code:         object.code,
      scratch:      doScratch,
      tripName:     saResponse.value.tripName,
      description:  saResponse.value.description,
      visitStart:   saResponse.value.visitStart,
      visitEnd:     saResponse.value.visitEnd,
      photoUrls:    saResponse.value.photoUrls,
      documentsUrl: saResponse.value.documentsUrl,
    })
  });

  const jsonResponse = await rawResponse.json();

  if (jsonResponse.status == 200) {
    scratchedObjects = jsonResponse.scratched;
    if (validTypes.includes(mapType)) {
      objectClass = document.querySelector(`.entities`);
      objectGroups = objectClass.querySelectorAll(':scope > g');
    }
    renderScratched(objectGroups);
    Toast.fire({ icon: 'success', title: jsonResponse.message });
  } else {
    Toast.fire({ icon: 'error', title: jsonResponse.message });
  }
}

function buildScratchForm(object) {
  const photoRows = object.photoUrls.length > 0
    ? object.photoUrls.map(url => photoUrlRow(url)).join('')
    : photoUrlRow('');

  return `
    <label class="swal2-input-label" for="f-trip-name">Trip Name</label>
    <input id="f-trip-name" class="swal2-input" type="text" placeholder="Summer trip to France" value="${escHtml(object.tripName)}" style="margin:4px 1em">

    <label class="swal2-input-label" for="f-description">Notes</label>
    <textarea id="f-description" class="swal2-textarea" placeholder="Add notes about this visit..." style="margin:4px 1em;min-height:80px">${escHtml(object.description)}</textarea>

    <label class="swal2-input-label">Visit Period</label>
    <div style="display:flex;gap:8px;margin:4px 1em 0">
      <div style="flex:1">
        <label style="font-size:12px;color:#888;display:block;margin-bottom:2px">Start</label>
        <input id="f-visit-start" class="swal2-input" type="date" value="${object.visitStart}" style="margin:0;width:100%">
      </div>
      <div style="flex:1">
        <label style="font-size:12px;color:#888;display:block;margin-bottom:2px">End</label>
        <input id="f-visit-end" class="swal2-input" type="date" value="${object.visitEnd}" style="margin:0;width:100%">
      </div>
    </div>

    <label class="swal2-input-label" style="margin-top:10px">Photo Albums</label>
    <div id="f-photo-urls">${photoRows}</div>
    <button type="button" onclick="addPhotoUrl()" style="margin:6px 1em 0;padding:4px 12px;background:#eee;border:1px solid #ccc;border-radius:4px;cursor:pointer;font-size:13px">+ Add Link</button>

    <details style="margin:12px 1em 0;text-align:left">
      <summary style="cursor:pointer;color:#666;font-size:13px;user-select:none">Documents (optional)</summary>
      <div style="margin-top:6px">
        <label class="swal2-input-label" for="f-documents-url">Documents Link</label>
        <input id="f-documents-url" class="swal2-input" type="url" placeholder="https://drive.google.com/..." value="${escHtml(object.documentsUrl)}" style="margin:4px 0 0">
      </div>
    </details>
  `;
}

function photoUrlRow(url) {
  return `
    <div class="photo-url-row" style="display:flex;align-items:center;gap:4px;margin:4px 1em 0">
      <input class="swal2-input photo-url-input" type="url" placeholder="https://photos.example.com/my-trip" value="${escHtml(url)}" style="margin:0;flex:1">
      <button type="button" onclick="removePhotoUrl(this)" style="background:#f54b38;color:white;border:none;border-radius:50%;width:26px;height:26px;cursor:pointer;font-size:16px;flex-shrink:0;line-height:1">×</button>
    </div>`;
}

function addPhotoUrl() {
  document.getElementById('f-photo-urls').insertAdjacentHTML('beforeend', photoUrlRow(''));
}

function removePhotoUrl(btn) {
  btn.closest('.photo-url-row').remove();
}

function escHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;');
}

function renderScratched(objects) {
  for (let i = 0; i < objects.length; i++) {
    objects[i].classList.remove('scratched');
  }
  for (let i = 0; i < scratchedObjects.length; i++) {
    for (let j = 0; j < objects.length; j++) {
      if (scratchedObjects[i].code.toUpperCase() == objects[j].id.toUpperCase()) {
        objects[j].classList.add('scratched');
      }
    }
  }
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
