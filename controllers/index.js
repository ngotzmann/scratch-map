import fs from 'fs';
import path from "path";
import validator from 'validator';
import bcrypt from 'bcryptjs';

import {
  validTypes,
  getMapCodes,
  getMaps,
  getMapById,
  createMap,
  deleteMap as deleteMapRecord,
  setMapPassword,
  updateMapSettings,
  getScratchedCountsByMapId,
  getScratchedByMapAndType,
  addVisit,
  updateVisit,
  deleteVisit as deleteVisitRecord,
  getDisabledByMapAndType,
  addDisabled,
  removeDisabled,
} from '../utils/database.js';

const maxURLLength = 1024;
const maxDescriptionLength = 5000;
const validatorURLOptions = { require_protocol: true };
const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const dateRegex = /^\d{4}-\d{2}-\d{2}$/;

// ── Auth middleware ────────────────────────────────────────────────────────────

export const requireMapAuth = async (req, res, next) => {
  const { mapId } = req.params;
  if (!uuidRegex.test(mapId)) return next();
  const map = await getMapById(mapId);
  if (!map || !map.password_hash) return next();
  const unlockedMaps = req.session?.unlockedMaps || [];
  if (unlockedMaps.includes(mapId)) return next();
  if (req.method !== 'GET') {
    return res.status(401).json({ status: 401, message: 'Authentication required' });
  }
  return res.redirect(`/lock/${mapId}?redirect=${encodeURIComponent(req.originalUrl)}`);
};

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
    const disabled  = await getDisabledByMapAndType(mapId, type);
    const allCodes  = getMapCodes(type);

    typeData[type] = {
      name: parseTypeName(type),
      count: counts[type] || 0,
      scratchedList: scratched.map(s => ({
        code: s.code,
        name: allCodes[s.code] || s.code,
        visitCount: s.visits.length,
        // summary from first visit
        tripName:    s.visits[0]?.trip_name || '',
        visitPeriod: [s.visits[0]?.visit_start, s.visits[0]?.visit_end].filter(Boolean).map(d => d.split('-').reverse().join('/')).join(' → '),
      })),
      unscratchedList: Object.fromEntries(
        Object.entries(allCodes).filter(([code]) =>
          !scratched.find(s => s.code === code) && !disabled.includes(code)
        )
      ),
    };
  }

  res.render('map_overview', { title: map.name, mapId, validTypes, parseTypeName, typeData, isPasswordProtected: !!map.password_hash });
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

  const objectList      = getMapCodes(mapType);
  const scratchedObjects = await getScratchedByMapAndType(mapId, mapType);
  const disabledCodes    = await getDisabledByMapAndType(mapId, mapType);

  res.render('map', {
    title: map.name,
    mapId,
    mapType,
    validTypes,
    objectList,
    scratchedObjects,
    disabledCodes,
    enableShare: global.ENABLE_SHARE,
    mapColors: parseMapColors(map.settings),
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
    mapColors: parseMapColors(map.settings),
    mapSVG: fs.readFileSync(path.join(global.__rootDir, `/public/images/${mapType}.svg`))
  });
});

// ── Lock / password pages ─────────────────────────────────────────────────────

export const getLockPage = async (req, res, next) => {
  const { mapId } = req.params;
  if (!uuidRegex.test(mapId)) {
    return res.render('error', { status: '404', message: 'Not Found' });
  }
  const map = await getMapById(mapId);
  if (!map) return res.render('error', { status: '404', message: 'Map not found' });
  const redirect = safeRedirectUrl(req.query.redirect, `/map/${mapId}`);
  if (!map.password_hash) return res.redirect(redirect);
  res.render('lock', { title: map.name, mapId, redirect, error: null });
};

export const postMapAuth = async (req, res, next) => {
  const { mapId } = req.params;
  if (!uuidRegex.test(mapId)) {
    return res.render('error', { status: '404', message: 'Not Found' });
  }
  const map = await getMapById(mapId);
  if (!map) return res.render('error', { status: '404', message: 'Map not found' });
  const { password, redirect } = req.body;
  const dest = safeRedirectUrl(redirect, `/map/${mapId}`);
  if (!map.password_hash) return res.redirect(dest);
  const valid = await bcrypt.compare(password || '', map.password_hash);
  if (!valid) {
    return res.render('lock', { title: map.name, mapId, redirect: dest, error: 'Incorrect password' });
  }
  if (!req.session.unlockedMaps) req.session.unlockedMaps = [];
  if (!req.session.unlockedMaps.includes(mapId)) req.session.unlockedMaps.push(mapId);
  return res.redirect(dest);
};

export const postSetPassword = async (req, res, next) => {
  const { mapId } = req.params;
  if (!uuidRegex.test(mapId)) {
    return res.status(422).json({ status: 422, message: 'Invalid map ID' });
  }
  const map = await getMapById(mapId);
  if (!map) return res.status(404).json({ status: 404, message: 'Map not found' });
  if (map.password_hash) {
    const unlockedMaps = req.session?.unlockedMaps || [];
    if (!unlockedMaps.includes(mapId)) {
      return res.status(401).json({ status: 401, message: 'Authentication required' });
    }
  }
  const { newPassword } = req.body;
  let hash = null;
  if (newPassword && typeof newPassword === 'string' && newPassword.length > 0) {
    if (newPassword.length > 72) {
      return res.status(422).json({ status: 422, message: 'Password too long (max 72 characters)' });
    }
    hash = await bcrypt.hash(newPassword, 12);
  }
  await setMapPassword(mapId, hash);
  if (hash) {
    if (!req.session.unlockedMaps) req.session.unlockedMaps = [];
    if (!req.session.unlockedMaps.includes(mapId)) req.session.unlockedMaps.push(mapId);
  } else {
    if (req.session.unlockedMaps) {
      req.session.unlockedMaps = req.session.unlockedMaps.filter(id => id !== mapId);
    }
  }
  return res.status(200).json({ status: 200, passwordSet: !!hash });
};

// ── Map CRUD ──────────────────────────────────────────────────────────────────

export const postCreateMap = (async (req, res, next) => {
  const { name, password } = req.body;
  if (typeof name !== 'string' || name.trim().length === 0 || name.length > 255) {
    return res.status(422).json({ status: 422, message: 'Invalid map name' });
  }
  let passwordHash = null;
  if (password && typeof password === 'string' && password.length > 0) {
    if (password.length > 72) {
      return res.status(422).json({ status: 422, message: 'Password too long (max 72 characters)' });
    }
    passwordHash = await bcrypt.hash(password, 12);
  }
  const map = await createMap(name.trim(), passwordHash);
  if (passwordHash) {
    if (!req.session.unlockedMaps) req.session.unlockedMaps = [];
    req.session.unlockedMaps.push(map.id);
  }
  return res.status(201).json({ status: 201, mapId: map.id });
});

export const deleteMap = (async (req, res, next) => {
  const { mapId } = req.params;
  if (!uuidRegex.test(mapId)) {
    return res.status(422).json({ status: 422, message: 'Invalid map ID' });
  }
  // requireMapAuth middleware already ran; double-check for direct API calls
  const mapForAuth = await getMapById(mapId);
  if (mapForAuth?.password_hash) {
    const unlockedMaps = req.session?.unlockedMaps || [];
    if (!unlockedMaps.includes(mapId)) {
      return res.status(401).json({ status: 401, message: 'Authentication required' });
    }
  }
  const deleted = await deleteMapRecord(mapId);
  if (!deleted) return res.status(404).json({ status: 404, message: 'Map not found' });
  return res.status(200).json({ status: 200, message: 'Map deleted' });
});

// ── Visit CRUD ────────────────────────────────────────────────────────────────

// POST /scratch — add a visit (creates the scratched marker if needed)
export const postScratch = (async (req, res, next) => {
  if (global.LOG_LEVEL === 'DEBUG') console.debug(req.body);

  const { mapId, mapType, code, tripName, description, visitStart, visitEnd, photoUrls, documentsUrl, diaryEntries } = req.body;

  const validationError = validateVisitFields({ mapId, mapType, code, tripName, description, visitStart, visitEnd, photoUrls, documentsUrl, diaryEntries });
  if (validationError) return res.status(422).json({ status: 422, message: validationError });

  const map = await getMapById(mapId);
  if (!map) return res.status(404).json({ status: 404, message: 'Map not found' });

  if (map.password_hash) {
    const unlockedMaps = req.session?.unlockedMaps || [];
    if (!unlockedMaps.includes(mapId)) {
      return res.status(401).json({ status: 401, message: 'Authentication required' });
    }
  }

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
    diaryEntries,
  });

  return res.status(201).json({ status: 201, code: code.toUpperCase(), allScratched });
});

// PUT /visits/:visitId — update a visit
export const putVisit = (async (req, res, next) => {
  const visitId = parseInt(req.params.visitId, 10);
  if (!Number.isFinite(visitId)) {
    return res.status(422).json({ status: 422, message: 'Invalid visit ID' });
  }

  const { mapId, tripName, description, visitStart, visitEnd, photoUrls, documentsUrl, diaryEntries } = req.body;

  const validationError = validateVisitFields({ mapId, mapType: 'world', code: 'XX', tripName, description, visitStart, visitEnd, photoUrls, documentsUrl, diaryEntries });
  if (validationError) return res.status(422).json({ status: 422, message: validationError });

  const allScratched = await updateVisit(visitId, mapId, {
    tripName:     sanitizeInput(tripName),
    description,
    visitStart,
    visitEnd,
    photoUrls,
    documentsUrl,
    diaryEntries,
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

// ── Disabled locations ────────────────────────────────────────────────────────

export const postDisabled = async (req, res, next) => {
  const { mapId, mapType, code } = req.body;
  if (!uuidRegex.test(mapId))        return res.status(422).json({ status: 422, message: 'Invalid map ID' });
  if (!validTypes.includes(mapType)) return res.status(422).json({ status: 422, message: 'Invalid map type' });
  if (typeof code !== 'string' || code.length < 1 || code.length > 10) return res.status(422).json({ status: 422, message: 'Invalid code' });

  const map = await getMapById(mapId);
  if (!map) return res.status(404).json({ status: 404, message: 'Map not found' });

  if (map.password_hash) {
    const unlockedMaps = req.session?.unlockedMaps || [];
    if (!unlockedMaps.includes(mapId)) {
      return res.status(401).json({ status: 401, message: 'Authentication required' });
    }
  }

  const codes = getMapCodes(mapType);
  if (!(code.toUpperCase() in codes)) return res.status(422).json({ status: 422, message: 'Invalid object code' });

  await addDisabled(mapId, mapType, code);
  return res.status(200).json({ status: 200 });
};

export const deleteDisabled = async (req, res, next) => {
  const { mapId, mapType, code } = req.body;
  if (!uuidRegex.test(mapId))        return res.status(422).json({ status: 422, message: 'Invalid map ID' });
  if (!validTypes.includes(mapType)) return res.status(422).json({ status: 422, message: 'Invalid map type' });
  if (typeof code !== 'string' || code.length < 1 || code.length > 10) return res.status(422).json({ status: 422, message: 'Invalid code' });

  const mapForAuth = await getMapById(mapId);
  if (mapForAuth?.password_hash) {
    const unlockedMaps = req.session?.unlockedMaps || [];
    if (!unlockedMaps.includes(mapId)) {
      return res.status(401).json({ status: 401, message: 'Authentication required' });
    }
  }

  await removeDisabled(mapId, mapType, code);
  return res.status(200).json({ status: 200 });
};

// ── Map settings ─────────────────────────────────────────────────────────────

export const putMapSettings = async (req, res, next) => {
  const { mapId } = req.params;
  if (!uuidRegex.test(mapId)) {
    return res.status(422).json({ status: 422, message: 'Invalid map ID' });
  }
  const map = await getMapById(mapId);
  if (!map) return res.status(404).json({ status: 404, message: 'Map not found' });
  if (map.password_hash) {
    const unlockedMaps = req.session?.unlockedMaps || [];
    if (!unlockedMaps.includes(mapId)) {
      return res.status(401).json({ status: 401, message: 'Authentication required' });
    }
  }
  const { unvisitedColor, visitedColor, bgColor } = req.body;
  const settings = {};
  if (unvisitedColor && hexRe.test(unvisitedColor)) settings.unvisitedColor = unvisitedColor;
  if (visitedColor   && hexRe.test(visitedColor))   settings.visitedColor   = visitedColor;
  if (bgColor        && hexRe.test(bgColor))        settings.bgColor        = bgColor;
  await updateMapSettings(mapId, settings);
  return res.status(200).json({ status: 200 });
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function validateVisitFields({ mapId, mapType, code, tripName, description, visitStart, visitEnd, photoUrls, documentsUrl, diaryEntries }) {
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
  if (!Array.isArray(diaryEntries)) return 'Invalid diary entries';
  for (const entry of diaryEntries) {
    if (typeof entry.text !== 'string') return 'Invalid diary entry text';
    if (entry.date && !dateRegex.test(entry.date)) return 'Invalid diary entry date';
  }
  return null;
}

function parseTypeName(name) {
  return name.replaceAll('-', ' ').split(' ').map(w => w[0].toUpperCase() + w.substr(1)).join(' ');
}

function sanitizeInput(string) {
  const map = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#x27;', "/": '&#x2F;' };
  return string.replace(/[&<>"'/]/ig, m => map[m]);
}

const hexRe = /^#[0-9a-f]{6}$/i;

function lightenHex(hex, amount = 0.15) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return '#' + [r, g, b].map(c => Math.min(255, Math.round(c + (255 - c) * amount)).toString(16).padStart(2, '0')).join('');
}

function parseMapColors(settings) {
  const uv = hexRe.test(settings?.unvisitedColor) ? settings.unvisitedColor : '#c9982a';
  const v  = hexRe.test(settings?.visitedColor)   ? settings.visitedColor   : '#3daa6a';
  const bg = hexRe.test(settings?.bgColor)         ? settings.bgColor        : '#0a0a0a';
  return {
    unvisited:      uv,
    unvisitedHover: lightenHex(uv),
    visited:        v,
    visitedHover:   lightenHex(v),
    bg,
    customVisited:  !!settings?.visitedColor,
  };
}

function safeRedirectUrl(url, fallback) {
  if (url && typeof url === 'string' && url.startsWith('/') && !url.startsWith('//')) {
    return url;
  }
  return fallback;
}
