import type { FirecrawlSettings } from '../trending/settings.js';
import { TrendingService } from '../trending/service.js';
import { type RouteDeps } from './route-helpers.js';
export declare function registerTrendingRoutes(deps: RouteDeps, service: TrendingService, settings?: FirecrawlSettings): void;
