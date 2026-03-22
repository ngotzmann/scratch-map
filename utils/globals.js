import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
global.__rootDir = path.join(__dirname, '..');

global.ADDRESS = process.env.ADDRESS || '0.0.0.0';
global.PORT = process.env.PORT || 3000;

global.SESSION_SECRET = process.env.SESSION_SECRET || 'scratch-map-session-secret-change-me';

global.PG_HOST     = process.env.PG_HOST     || 'localhost';
global.PG_PORT     = parseInt(process.env.PG_PORT || '5432', 10);
global.PG_DATABASE = process.env.PG_DATABASE || 'scratchmap';
global.PG_USER     = process.env.PG_USER     || 'scratchmap';
global.PG_PASSWORD = process.env.PG_PASSWORD || '';

// allow LOG_LEVEL to be any case
if ('LOG_LEVEL' in process.env) {
  // verbosity numbers based on syslog - https://en.wikipedia.org/wiki/Syslog
  let logLevel = process.env.LOG_LEVEL.trim().toUpperCase();
  if (logLevel === 'INFO' || logLevel === '6') {
    global.LOG_LEVEL = 'INFO';
  } else if (logLevel === 'DEBUG' || logLevel === '7') {
    global.LOG_LEVEL = 'DEBUG';
  }else {
    console.error(`Invalid LOG_LEVEL provided [${process.env.LOG_LEVEL}], defaulting to INFO`);
    global.LOG_LEVEL = 'INFO';
  }
} else {
  global.LOG_LEVEL = 'INFO';
}

// allow ENABLE_SHARE to be any case or 1/0
if ('ENABLE_SHARE' in process.env) {
  let enableShare = process.env.ENABLE_SHARE.trim().toLowerCase();
  if (enableShare === 'true' || enableShare === '1') {
    global.ENABLE_SHARE = true;
  } else if (enableShare === 'false' || enableShare === '0') {
    global.ENABLE_SHARE = false;
  } else {
    console.error(`Invalid ENABLE_SHARE provided [${process.env.ENABLE_SHARE}], defaulting to false`);
    global.ENABLE_SHARE = false;
  }
} else {
  global.ENABLE_SHARE = false;
}

// debug output
if (global.LOG_LEVEL == 'DEBUG') {
  console.debug('globals.js:');

  console.debug("  __dirname:", __dirname);
  console.debug("  global.__rootDir:", global.__rootDir, "\n");

  console.debug("  global.ADDRESS:", global.ADDRESS);
  console.debug("  global.PORT:", global.PORT);
  console.debug("  global.PG_HOST:", global.PG_HOST);
  console.debug("  global.PG_PORT:", global.PG_PORT);
  console.debug("  global.PG_DATABASE:", global.PG_DATABASE);
  console.debug("  global.PG_USER:", global.PG_USER);
  console.debug("  global.LOG_LEVEL:", global.LOG_LEVEL);
  console.debug("  global.ENABLE_SHARE:", global.ENABLE_SHARE);

  console.debug("\n");
}
