import fs from 'fs';
import path from "path";
import validator from 'validator';

import {
  validTypes,
  getMapCodes,
  getAllScratched,
  getScratchedByType,
  upsertScratch,
  deleteScratch,
} from '../utils/database.js';

const maxURLLength = 1024;
const validatorURLOptions = {
  require_protocol: true
};

// home page
export const getHome = (async (req, res, next) => {
  const scratched = await getAllScratched();

  let unscratchedLists = {};
  for (const type of validTypes) {
    const codes = getMapCodes(type);
    unscratchedLists[type] = {};

    for (const [key, value] of Object.entries(codes)) {
      if (!scratched[type].find(x => x.code === key)) {
        unscratchedLists[type][key] = value;
      }
    }

    // attach display names to scratched entries
    for (const entry of scratched[type]) {
      entry.name = codes[entry.code] || entry.code;
    }
  }

  res.render('index', {
    title: 'Home',
    validTypes,
    parseTypeName,
    unscratchedLists,
    scratchedLists: scratched
  });
});

// map
export const getMap = (async (req, res, next) => {
  const mapType = req.params.mapType;

  if (!validTypes.includes(mapType)) {
    return res.render('error', { status: '404', message: `${req.originalUrl} Not Found` });
  }

  const objectList = getMapCodes(mapType);
  const scratchedObjects = await getScratchedByType(mapType);

  res.render('map', {
    title: parseTypeName(mapType),
    mapType,
    validTypes,
    objectList,
    scratchedObjects,
    enableShare: global.ENABLE_SHARE,
    mapSVG: fs.readFileSync(path.join(global.__rootDir, `/public/images/${mapType}.svg`))
  });
});

// view
export const getView = (async (req, res, next) => {
  const mapType = req.params.mapType;

  if (!validTypes.includes(mapType)) {
    return res.render('error', { status: '404', message: `${req.originalUrl} Not Found` });
  }

  const scratchedObjects = await getScratchedByType(mapType);

  res.render('view', {
    title: parseTypeName(mapType),
    mapType,
    validTypes,
    scratchedObjects,
    mapSVG: fs.readFileSync(path.join(global.__rootDir, `/public/images/${mapType}.svg`))
  });
});

// scratch endpoint
export const postScratch = (async (req, res, next) => {
  if (global.LOG_LEVEL === 'DEBUG') console.debug(req.body);

  if (Object.keys(req.body).length !== 5) {
    return res.status(422).json({ status: 422, message: 'Invalid attir length' });
  } else if (typeof req.body.type !== 'string' || typeof req.body.code !== 'string' || typeof req.body.scratch !== 'boolean' || typeof req.body.year !== 'string' || typeof req.body.url !== 'string') {
    return res.status(422).json({ status: 422, message: 'Invalid data type' });
  } else if (req.body.type.length < 0 || req.body.type.length > 30) {
    return res.status(422).json({ status: 422, message: 'Invalid object length' });
  } else if (!validTypes.includes(req.body.type)) {
    return res.status(422).json({ status: 422, message: 'Invalid object type' });
  } else if (req.body.code.length < 1 || req.body.code.length > 3) {
    return res.status(422).json({ status: 422, message: 'Invalid code length' });
  } else if (req.body.year.length < 0 || req.body.year.length > 6) {
    return res.status(422).json({ status: 422, message: 'Invalid year length' });
  } else if (req.body.year.length > 0 && !isValidYear(req.body.year)) {
    return res.status(422).json({ status: 422, message: 'Invalid year' });
  } else if (req.body.url.length < 0 || req.body.url.length > maxURLLength) {
    return res.status(422).json({ status: 422, message: 'Invalid url length' });
  } else if (req.body.url.length > 0 && !validator.isURL(req.body.url, validatorURLOptions)) {
    return res.status(422).json({ status: 422, message: 'Invalid url' });
  }

  const codes = getMapCodes(req.body.type);
  if (!(req.body.code.toUpperCase() in codes)) {
    return res.status(422).json({ status: 422, message: 'Invalid object code' });
  }

  const sanitizedUrl = sanitizeInput(req.body.url);
  const { type, code, scratch, year } = req.body;

  if (scratch) {
    await upsertScratch(type, code, year, sanitizedUrl);
  } else {
    const deleted = await deleteScratch(type, code);
    if (!deleted) {
      return res.status(422).json({ status: 422, message: `Unable to unscratch ${code.toUpperCase()}` });
    }
  }

  const returnedScratched = await getScratchedByType(type);

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
