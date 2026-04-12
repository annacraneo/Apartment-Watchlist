import { Router, type IRouter } from "express";
import healthRouter from "./health";
import listingsRouter from "./listings.js";
import notificationsRouter from "./notifications.js";
import settingsRouter from "./settings.js";
import browseAiRouter from "./browseai.js";
import dashboardRouter from "./dashboard.js";

const router: IRouter = Router();

router.use(healthRouter);
router.use(listingsRouter);
router.use(notificationsRouter);
router.use(settingsRouter);
router.use(browseAiRouter);
router.use(dashboardRouter);

export default router;
