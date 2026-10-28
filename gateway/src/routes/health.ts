import { Router, Request, Response } from 'express';
import { createSuccessResponse } from '@music/shared';
import { checkSystemHealth } from '../services/health-checker.js';

export const healthRouter: Router = Router();

healthRouter.get('/', async (req: Request, res: Response) => {
  try {
    const healthReport = await checkSystemHealth();
    const response = createSuccessResponse(healthReport);
    res.status(200).json(response);
  } catch (err: any) {
    if (req.log) {
      req.log.error({ err }, 'Failed to generate health report');
    }
    res.status(500).json({
      success: false,
      error: {
        code: 'HEALTH_CHECK_FAILED',
        message: err.message || 'Health check execution failed'
      }
    });
  }
});
