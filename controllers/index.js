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
  upsertScratch,
  deleteScratch,
} from '../utils/database.js';

const maxURLLength = 1024;
const maxDescriptionLength = 5000;
const validatorURLOptions = { require_protocol: true };
const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const dateRegex = /^\d{4}-\d{2}-\d{2}$/;

// home page
export const getHome = (async (req, res, next) => {
  const maps = await getMaps();
  res.render('index', { title: 'My Maps', maps });
});

// overview for a named map — all map types with counts and detail tables
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
        ...s,
        name: allCodes[s.code] || s.code,
        visitPeriod: [s.visit_start, s.visit_end].filter(Boolean).join(' → '),
      })),
      unscratchedList: Object.fromEntries(
        Object.entries(allCodes).filter(([code]) => !scratched.find(s => s.code === code))
      ),
    };
  }

  res.render('map_overview', {
    title: map.name,
    mapId,
    validTypes,
    parseTypeName,
    typeData,
  });
});

// map editor for a specific type within a named map
export const getMap = (async (req, res, next) => {
  const { mapId, mapType } = req.params;

  if (!uuidRegex.test(mapId)) {
    return res.render('error', { status: '404', message: `${req.originalUrl} Not Found` });
  }
  if (!validTypes.includes(mapType)) {
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

// read-only share view
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
    title: map.name,
    mapType,
    validTypes,
    scratchedObjects,
    mapSVG: fs.readFileSync(path.join(global.__rootDir, `/public/images/${mapType}.svg`))
  });
});

// create a named map
export const postCreateMap = (async (req, res, next) => {
  const { name } = req.body;

  if (typeof name !== 'string' || name.trim().length === 0 || name.length > 255) {
    return res.status(422).json({ status: 422, message: 'Invalid map name' });
  }

  const map = await createMap(name.trim());
  return res.status(201).json({ status: 201, mapId: map.id });
});

// delete a named map
export const deleteMap = (async (req, res, next) => {
  const { mapId } = req.params;

  if (!uuidRegex.test(mapId)) {
    return res.status(422).json({ status: 422, message: 'Invalid map ID' });
  }

  const deleted = await deleteMapRecord(mapId);
  if (!deleted) {
    return res.status(404).json({ status: 404, message: 'Map not found' });
  }

  return res.status(200).json({ status: 200, message: 'Map deleted' });
});

// scratch endpoint
export const postScratch = (async (req, res, next) => {
  if (global.LOG_LEVEL === 'DEBUG') console.debug(req.body);

  const { mapId, mapType, code, scratch, tripName, description, visitStart, visitEnd, photoUrls, documentsUrl } = req.body;

  if (typeof mapId !== 'string' || typeof mapType !== 'string' || typeof code !== 'string' ||
      typeof scratch !== 'boolean' || typeof tripName !== 'string' || typeof description !== 'string' ||
      typeof visitStart !== 'string' || typeof visitEnd !== 'string' ||
      !Array.isArray(photoUrls) || typeof documentsUrl !== 'string') {
    return res.status(422).json({ status: 422, message: 'Invalid data type' });
  }

  if (!uuidRegex.test(mapId)) {
    return res.status(422).json({ status: 422, message: 'Invalid map ID' });
  }
  if (!validTypes.includes(mapType)) {
    return res.status(422).json({ status: 422, message: 'Invalid map type' });
  }

  const map = await getMapById(mapId);
  if (!map) {
    return res.status(404).json({ status: 404, message: 'Map not found' });
  }

  if (code.length < 1 || code.length > 3) {
    return res.status(422).json({ status: 422, message: 'Invalid code length' });
  }
  if (tripName.length > 255) {
    return res.status(422).json({ status: 422, message: 'Trip name too long' });
  }
  if (description.length > maxDescriptionLength) {
    return res.status(422).json({ status: 422, message: 'Description too long' });
  }
  if (visitStart && !dateRegex.test(visitStart)) {
    return res.status(422).json({ status: 422, message: 'Invalid start date' });
  }
  if (visitEnd && !dateRegex.test(visitEnd)) {
    return res.status(422).json({ status: 422, message: 'Invalid end date' });
  }

  for (const url of photoUrls) {
    if (typeof url !== 'string' || url.length > maxURLLength) {
      return res.status(422).json({ status: 422, message: 'Invalid photo URL length' });
    }
    if (!validator.isURL(url, validatorURLOptions)) {
      return res.status(422).json({ status: 422, message: 'Invalid photo URL' });
    }
  }

  if (documentsUrl.length > maxURLLength) {
    return res.status(422).json({ status: 422, message: 'Documents URL too long' });
  }
  if (documentsUrl && !validator.isURL(documentsUrl, validatorURLOptions)) {
    return res.status(422).json({ status: 422, message: 'Invalid documents URL' });
  }

  const codes = getMapCodes(mapType);
  if (!(code.toUpperCase() in codes)) {
    return res.status(422).json({ status: 422, message: 'Invalid object code' });
  }

  const sanitizedPhotoUrls = photoUrls.map(u => sanitizeInput(u));
  const sanitizedDocumentsUrl = sanitizeInput(documentsUrl);
  const sanitizedTripName = sanitizeInput(tripName);

  if (scratch) {
    await upsertScratch(mapId, mapType, code, sanitizedTripName, description, visitStart, visitEnd, sanitizedPhotoUrls, sanitizedDocumentsUrl);
  } else {
    const deleted = await deleteScratch(mapId, mapType, code);
    if (!deleted) {
      return res.status(422).json({ status: 422, message: `Unable to unscratch ${code.toUpperCase()}` });
    }
  }

  const returnedScratched = await getScratchedByMapAndType(mapId, mapType);

  return res.status(200).json({
    status: 200,
    message: `${code.toUpperCase()} successfully ${scratch ? 'scratched' : 'unscratched'}!`,
    scratched: returnedScratched
  });
});

function parseTypeName(name) {
  return name
    .replaceAll('-', ' ')
    .split(' ')
    .map(w => w[0].toUpperCase() + w.substr(1))
    .join(' ');
}

function sanitizeInput(string) {
  const map = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#x27;',
    "/": '&#x2F;',
  };
  const reg = /[&<>"'/]/ig;
  return string.replace(reg, (match) => (map[match]));
}
