import { Router, type IRouter } from "express";
import healthRouter from "./health";
import settingsRouter from "./settings";
import leadsRouter from "./leads";
import policiesRouter from "./policies";
import followUpsRouter from "./follow-ups";
import callLogsRouter from "./call-logs";
import dispositionsRouter from "./dispositions";
import automationsRouter from "./automations";
import agentsRouter from "./agents";
import dashboardRouter from "./dashboard";
import leadSourcesRouter from "./lead-sources";
import teamRouter from "./team";
import miscRouter from "./misc";
import campaignsRouter from "./campaigns";

const router: IRouter = Router();

router.use(healthRouter);
router.use(settingsRouter);
router.use(leadsRouter);
router.use(policiesRouter);
router.use(followUpsRouter);
router.use(callLogsRouter);
router.use(dispositionsRouter);
router.use(automationsRouter);
router.use(agentsRouter);
router.use(dashboardRouter);
router.use(leadSourcesRouter);
router.use(teamRouter);
router.use(miscRouter);
router.use(campaignsRouter);

export default router;
