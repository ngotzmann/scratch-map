import fs from 'fs';
import path from "path";
import validator from 'validator';

import {
  validTypes,
  getMapCodes,
  getMaps,
  getMapById,
  createMap,
  deleteMap as deleteMapRecord,
  getScratchedCountsByMapId,
  getScratchedByMapAndType,
  addVisit,
  updateVisit,
  deleteVisit as deleteVisitRecord,
} from '../utils/database.js';

const maxURLLength = 1024;
const maxDescriptionLength = 5000;
const validatorURLOptions = { require_protocol: true };
const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const dateRegex = /^\d{4}-\d{2}-\d{2}$/;

// ── Pages ─────────────────────────────────────────────────────────────────────

export const getHome = (async (req, res, next) => {
  const maps = await getMaps();
  res.render('index', { title: 'My Maps', maps });
});

export const getMapOverview = (async (req, res, next) => {
  const { mapId } = req.params;

  if (!uuidRegex.test(mapId)) {
    return res.render('error', { status: '404', message: `${req.originalUrl} Not Found` });
  }

  const map = await getMapById(mapId);
  if (!map) {
    return res.render('error', { status: '404', message: `Map not found` });
  }

  const counts = await getScratchedCountsByMapId(mapId);

  const typeData = {};
  for (const type of validTypes) {
    const scratched = await getScratchedByMapAndType(mapId, type);
    const allCodes = getMapCodes(type);

    typeData[type] = {
      name: parseTypeName(type),
      count: counts[type] || 0,
      scratchedList: scratched.map(s => ({
        code: s.code,
        name: allCodes[s.code] || s.code,
        visitCount: s.visits.length,
        // summary from first visit
        tripName:    s.visits[0]?.trip_name || '',
        visitPeriod: [s.visits[0]?.visit_start, s.visits[0]?.visit_end].filter(Boolean).join(' → '),
      })),
      unscratchedList: Object.fromEntries(
        Object.entries(allCodes).filter(([code]) => !scratched.find(s => s.code === code))
      ),
    };
  }

  res.render('map_overview', { title: map.name, mapId, validTypes, parseTypeName, typeData });
});

export const getMap = (async (req, res, next) => {
  const { mapId, mapType } = req.params;

  if (!uuidRegex.test(mapId) || !validTypes.includes(mapType)) {
    return res.render('error', { status: '404', message: `${req.originalUrl} Not Found` });
  }

  const map = await getMapById(mapId);
  if (!map) {
    return res.render('error', { status: '404', message: `Map not found` });
  }

  const objectList = getMapCodes(mapType);
  const scratchedObjects = await getScratchedByMapAndType(mapId, mapType);

  res.render('map', {
    title: map.name,
    mapId,
    mapType,
    validTypes,
    objectList,
    scratchedObjects,
    enableShare: global.ENABLE_SHARE,
    mapSVG: fs.readFileSync(path.join(global.__rootDir, `/public/images/${mapType}.svg`))
  });
});

export const getView = (async (req, res, next) => {
  const { mapId, mapType } = req.params;

  if (!uuidRegex.test(mapId) || !validTypes.includes(mapType)) {
    return res.render('error', { status: '404', message: `${req.originalUrl} Not Found` });
  }

  const map = await getMapById(mapId);
  if (!map) {
    return res.render('error', { status: '404', message: `Map not found` });
  }

  const scratchedObjects = await getScratchedByMapAndType(mapId, mapType);
  res.render('view', {
    title: map.name, mapType, validTypes, scratchedObjects,
    mapSVG: fs.readFileSync(path.join(global.__rootDir, `/public/images/${mapType}.svg`))
  });
});

// ── Map CRUD ──────────────────────────────────────────────────────────────────

export const postCreateMap = (async (req, res, next) => {
  const { name } = req.body;
  if (typeof name !== 'string' || name.trim().length === 0 || name.length > 255) {
    return res.status(422).json({ status: 422, message: 'Invalid map name' });
  }
  const map = await createMap(name.trim());
  return res.status(201).json({ status: 201, mapId: map.id });
});

export const deleteMap = (async (req, res, next) => {
  const { mapId } = req.params;
  if (!uuidRegex.test(mapId)) {
    return res.status(422).json({ status: 422, message: 'Invalid map ID' });
  }
  const deleted = await deleteMapRecord(mapId);
  if (!deleted) return res.status(404).json({ status: 404, message: 'Map not found' });
  return res.status(200).json({ status: 200, message: 'Map deleted' });
});

// ── Visit CRUD ────────────────────────────────────────────────────────────────

// POST /scratch — add a visit (creates the scratched marker if needed)
export const postScratch = (async (req, res, next) => {
  if (global.LOG_LEVEL === 'DEBUG') console.debug(req.body);

  const { mapId, mapType, code, tripName, description, visitStart, visitEnd, photoUrls, documentsUrl } = req.body;

  const validationError = validateVisitFields({ mapId, mapType, code, tripName, description, visitStart, visitEnd, photoUrls, documentsUrl });
  if (validationError) return res.status(422).json({ status: 422, message: validationError });

  const map = await getMapById(mapId);
  if (!map) return res.status(404).json({ status: 404, message: 'Map not found' });

  const codes = getMapCodes(mapType);
  if (!(code.toUpperCase() in codes)) {
    return res.status(422).json({ status: 422, message: 'Invalid object code' });
  }

  const allScratched = await addVisit(mapId, mapType, code, {
    tripName:     sanitizeInput(tripName),
    description,
    visitStart,
    visitEnd,
    photoUrls,
    documentsUrl,
  });

  return res.status(201).json({ status: 201, code: code.toUpperCase(), allScratched });
});

// PUT /visits/:visitId — update a visit
export const putVisit = (async (req, res, next) => {
  const visitId = parseInt(req.params.visitId, 10);
  if (!Number.isFinite(visitId)) {
    return res.status(422).json({ status: 422, message: 'Invalid visit ID' });
  }

  const { mapId, tripName, description, visitStart, visitEnd, photoUrls, documentsUrl } = req.body;

  const validationError = validateVisitFields({ mapId, mapType: 'world', code: 'XX', tripName, description, visitStart, visitEnd, photoUrls, documentsUrl });
  if (validationError) return res.status(422).json({ status: 422, message: validationError });

  const allScratched = await updateVisit(visitId, mapId, {
    tripName:     sanitizeInput(tripName),
    description,
    visitStart,
    visitEnd,
    photoUrls,
    documentsUrl,
  });

  if (!allScratched) return res.status(404).json({ status: 404, message: 'Visit not found' });

  return res.status(200).json({ status: 200, allScratched });
});

// DELETE /visits/:visitId — delete a visit (removes scratched marker if last)
export const deleteVisit = (async (req, res, next) => {
  const visitId = parseInt(req.params.visitId, 10);
  if (!Number.isFinite(visitId)) {
    return res.status(422).json({ status: 422, message: 'Invalid visit ID' });
  }

  const { mapId } = req.body;
  if (!uuidRegex.test(mapId)) {
    return res.status(422).json({ status: 422, message: 'Invalid map ID' });
  }

  const result = await deleteVisitRecord(visitId, mapId);
  if (!result) return res.status(404).json({ status: 404, message: 'Visit not found' });

  return res.status(200).json({ status: 200, ...result });
});

// ── Helpers ───────────────────────────────────────────────────────────────────

function validateVisitFields({ mapId, mapType, code, tripName, description, visitStart, visitEnd, photoUrls, documentsUrl }) {
  if (!uuidRegex.test(mapId))             return 'Invalid map ID';
  if (!validTypes.includes(mapType))      return 'Invalid map type';
  if (typeof code !== 'string' || code.length < 1 || code.length > 3) return 'Invalid code';
  if (typeof tripName !== 'string' || tripName.length > 255)    return 'Trip name too long';
  if (typeof description !== 'string' || description.length > maxDescriptionLength) return 'Description too long';
  if (typeof visitStart !== 'string' || (visitStart && !dateRegex.test(visitStart))) return 'Invalid start date';
  if (typeof visitEnd !== 'string'   || (visitEnd   && !dateRegex.test(visitEnd)))   return 'Invalid end date';
  if (!Array.isArray(photoUrls)) return 'Invalid photo URLs';
  for (const url of photoUrls) {
    if (typeof url !== 'string' || url.length > maxURLLength) return 'Photo URL too long';
    if (!validator.isURL(url, validatorURLOptions))            return `Invalid photo URL: ${url}`;
  }
  if (typeof documentsUrl !== 'string' || documentsUrl.length > maxURLLength) return 'Documents URL too long';
  if (documentsUrl && !validator.isURL(documentsUrl, validatorURLOptions))    return 'Invalid documents URL';
  return null;
}

function parseTypeName(name) {
  return name.replaceAll('-', ' ').split(' ').map(w => w[0].toUpperCase() + w.substr(1)).join(' ');
}

function sanitizeInput(string) {
  const map = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#x27;', "/": '&#x2F;' };
  return string.replace(/[&<>"'/]/ig, m => map[m]);
}
