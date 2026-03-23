import express from 'express';
var router = express.Router();

import {
  getHome,
  getMapOverview,
  getExport,
  getMap,
  getView,
  getLockPage,
  postMapAuth,
  postSetPassword,
  putMapSettings,
  requireMapAuth,
  postCreateMap,
  deleteMap,
  postScratch,
  putVisit,
  deleteVisit,
  postDisabled,
  deleteDisabled,
} from '../controllers/index.js';

router.get('/', getHome);
router.get('/lock/:mapId', getLockPage);
router.post('/maps/:mapId/auth', postMapAuth);
router.post('/maps/:mapId/password', postSetPassword);
router.put('/maps/:mapId/settings', requireMapAuth, putMapSettings);
router.post('/maps', postCreateMap);
router.delete('/maps/:mapId', requireMapAuth, deleteMap);
router.get('/map/:mapId', requireMapAuth, getMapOverview);
router.get('/map/:mapId/export', requireMapAuth, getExport);
router.get('/map/:mapId/:mapType', requireMapAuth, getMap);
if (global.ENABLE_SHARE) router.get('/view/:mapId/:mapType', getView);
router.post('/scratch', postScratch);
router.put('/visits/:visitId', putVisit);
router.delete('/visits/:visitId', deleteVisit);
router.post('/disabled', postDisabled);
router.delete('/disabled', deleteDisabled);

export default router;
