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
  getScratchedByMapId,
  upsertScratch,
  deleteScratch,
} from '../utils/database.js';

const maxURLLength = 1024;
const validatorURLOptions = {
  require_protocol: true
};
const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// home page — list all named maps
export const getHome = (async (req, res, next) => {
  const maps = await getMaps();

  for (const map of maps) {
    map.mapTypeName = parseTypeName(map.map_type);
    const scratched = await getScratchedByMapId(map.id);
    const allCodes = getMapCodes(map.map_type);

    map.scratchedList = scratched.map(s => ({
      ...s,
      name: allCodes[s.code] || s.code
    }));

    map.unscratchedList = {};
    for (const [code, name] of Object.entries(allCodes)) {
      if (!scratched.find(s => s.code === code)) {
        map.unscratchedList[code] = name;
      }
    }
  }

  res.render('index', {
    title: 'My Maps',
    maps,
    validTypes,
    parseTypeName,
  });
});

// map editor
export const getMap = (async (req, res, next) => {
  const mapId = req.params.mapId;

  if (!uuidRegex.test(mapId)) {
    return res.render('error', { status: '404', message: `${req.originalUrl} Not Found` });
  }

  const map = await getMapById(mapId);
  if (!map) {
    return res.render('error', { status: '404', message: `Map not found` });
  }

  const objectList = getMapCodes(map.map_type);
  const scratchedObjects = await getScratchedByMapId(mapId);

  res.render('map', {
    title: map.name,
    mapId,
    mapType: map.map_type,
    validTypes,
    objectList,
    scratchedObjects,
    enableShare: global.ENABLE_SHARE,
    mapSVG: fs.readFileSync(path.join(global.__rootDir, `/public/images/${map.map_type}.svg`))
  });
});

// read-only share view
export const getView = (async (req, res, next) => {
  const mapId = req.params.mapId;

  if (!uuidRegex.test(mapId)) {
    return res.render('error', { status: '404', message: `${req.originalUrl} Not Found` });
  }

  const map = await getMapById(mapId);
  if (!map) {
    return res.render('error', { status: '404', message: `Map not found` });
  }

  const scratchedObjects = await getScratchedByMapId(mapId);

  res.render('view', {
    title: map.name,
    mapType: map.map_type,
    validTypes,
    scratchedObjects,
    mapSVG: fs.readFileSync(path.join(global.__rootDir, `/public/images/${map.map_type}.svg`))
  });
});

// create a new named map
export const postCreateMap = (async (req, res, next) => {
  const { name, mapType } = req.body;

  if (typeof name !== 'string' || name.trim().length === 0 || name.length > 255) {
    return res.status(422).json({ status: 422, message: 'Invalid map name' });
  }
  if (!validTypes.includes(mapType)) {
    return res.status(422).json({ status: 422, message: 'Invalid map type' });
  }

  const map = await createMap(name.trim(), mapType);
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

  if (Object.keys(req.body).length !== 5) {
    return res.status(422).json({ status: 422, message: 'Invalid attir length' });
  }

  const { mapId, code, scratch, year, url } = req.body;

  if (typeof mapId !== 'string' || typeof code !== 'string' || typeof scratch !== 'boolean' || typeof year !== 'string' || typeof url !== 'string') {
    return res.status(422).json({ status: 422, message: 'Invalid data type' });
  }

  if (!uuidRegex.test(mapId)) {
    return res.status(422).json({ status: 422, message: 'Invalid map ID' });
  }

  const map = await getMapById(mapId);
  if (!map) {
    return res.status(404).json({ status: 404, message: 'Map not found' });
  }

  if (code.length < 1 || code.length > 3) {
    return res.status(422).json({ status: 422, message: 'Invalid code length' });
  } else if (year.length > 6) {
    return res.status(422).json({ status: 422, message: 'Invalid year length' });
  } else if (year.length > 0 && !isValidYear(year)) {
    return res.status(422).json({ status: 422, message: 'Invalid year' });
  } else if (url.length > maxURLLength) {
    return res.status(422).json({ status: 422, message: 'Invalid url length' });
  } else if (url.length > 0 && !validator.isURL(url, validatorURLOptions)) {
    return res.status(422).json({ status: 422, message: 'Invalid url' });
  }

  const codes = getMapCodes(map.map_type);
  if (!(code.toUpperCase() in codes)) {
    return res.status(422).json({ status: 422, message: 'Invalid object code' });
  }

  const sanitizedUrl = sanitizeInput(url);

  if (scratch) {
    await upsertScratch(mapId, code, year, sanitizedUrl);
  } else {
    const deleted = await deleteScratch(mapId, code);
    if (!deleted) {
      return res.status(422).json({ status: 422, message: `Unable to unscratch ${code.toUpperCase()}` });
    }
  }

  const returnedScratched = await getScratchedByMapId(mapId);

  return res.status(200).json({
    status: 200,
    message: `${code.toUpperCase()} successfully ${scratch ? 'scratched' : 'unscratched'}!`,
    scratched: returnedScratched
  });
});

function isValidYear(year) {
  return /^(0|[1-9]\d*)$/.test(year);
}

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
