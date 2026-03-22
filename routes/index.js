import express from 'express';
var router = express.Router();

import {
  getHome,
  getMapOverview,
  getMap,
  getView,
  postCreateMap,
  deleteMap,
  postScratch,
  putVisit,
  deleteVisit,
  postDisabled,
  deleteDisabled,
} from '../controllers/index.js';

router.get('/', getHome);
router.post('/maps', postCreateMap);
router.delete('/maps/:mapId', deleteMap);
router.get('/map/:mapId', getMapOverview);
router.get('/map/:mapId/:mapType', getMap);
if (global.ENABLE_SHARE) router.get('/view/:mapId/:mapType', getView);
router.post('/scratch', postScratch);
router.put('/visits/:visitId', putVisit);
router.delete('/visits/:visitId', deleteVisit);
router.post('/disabled', postDisabled);
router.delete('/disabled', deleteDisabled);

export default router;
