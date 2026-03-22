import express from 'express';
var router = express.Router();

// import controllers
import {
  getHome,
  getMap,
  getView,
  postCreateMap,
  deleteMap,
  postScratch
} from '../controllers/index.js';

router.get('/', getHome);
router.post('/maps', postCreateMap);
router.delete('/maps/:mapId', deleteMap);
router.get('/map/:mapId', getMap);
if (global.ENABLE_SHARE) router.get('/view/:mapId', getView);
router.post('/scratch', postScratch);

export default router;
